import { BreadcrumbService } from '@/app/layout/service/breadcrumb.service'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  OnDestroy,
  inject,
  signal,
} from '@angular/core'
import { DecimalPipe, Location, NgClass, NgTemplateOutlet } from '@angular/common'
import { IconFieldModule } from 'primeng/iconfield'
import { InputIconModule } from 'primeng/inputicon'
import { ActivatedRoute, Router } from '@angular/router'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ConfirmationService, MessageService } from 'primeng/api'
import { AutoCompleteCompleteEvent, AutoCompleteModule, AutoCompleteSelectEvent } from 'primeng/autocomplete'
import { ButtonModule } from 'primeng/button'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { DatePickerModule } from 'primeng/datepicker'
import { BaseDialog } from '@/app/shared/components'
import { InputNumberModule } from 'primeng/inputnumber'
import { InputTextModule } from 'primeng/inputtext'
import { MessageModule } from 'primeng/message'
import { ProgressBarModule } from 'primeng/progressbar'
import { TagModule } from 'primeng/tag'
import { TextareaModule } from 'primeng/textarea'
import { ToastModule } from 'primeng/toast'
import { TooltipModule } from 'primeng/tooltip'
import { finalize } from 'rxjs'
import { CanLeave } from '@/app/core/guards/unsaved-changes.guard'

import { TranslateLanService } from '../../../../../core/services/translate-lan.service'
import { BaseStatusBadge } from '../../../../../shared/components/status/status-badge/base-status-badge.component'
import { ReceivingService } from '../../receivings.service'
import {
  MakeReceivingInput,
  MakeReceivingItem,
  MakeReceivingResult,
  ReceivingLineDetail,
  ReceivingListItem,
  ReceivingLocationOption,
  ReceivingContainerOption,
  ReceivingStatus,
} from '../../receivings.types'
import { AuthService } from '@/app/core/services/auth.service'
import {
  CostingSettings,
  costVariancePct,
  currencyOf,
  currencyPrefix,
  isCostingEnabled,
  isOwnerRole,
} from '@/app/shared/utils/costing.util'

// ── Constants ─────────────────────────────────────────────────────────────────

const LINE_STATUS_MAP: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary'> = {
  open: 'info',
  partial: 'warn',
  complete: 'success',
  closed: 'secondary',
}

const RECEIVING_STATUS_MAP: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'> = {
  'in-transit': 'secondary',
  'in-warehouse': 'info',
  processing: 'warn',
  complete: 'success',
  discrepancy: 'contrast',
  cancelled: 'danger',
}

/** Statuses the backend accepts on POST /v2/inbound/receiving/make. */
const RECEIVABLE: ReceivingStatus[] = ['IN-WAREHOUSE', 'PROCESSING']

/** Mirrors maxQtyPerLine in logic-back receiving.service.go. */
const MAX_QTY = 1_000_000

/** Serial control modes that require one serial per received unit. */
const SERIAL_MODES = new Set(['IN', 'IN/OUT'])

// ── Models ────────────────────────────────────────────────────────────────────

/** One receiving line plus what the operator is about to receive against it. */
interface ProcessingLine extends ReceivingLineDetail {
  qty_to_receive: number
  batch_lot: string
  expiry: Date | null
  serials: string[]
  /** Unit cost of this ingress (OWNER, costing facility). Pre-filled with the line cost, then the catalog cost. */
  receive_cost: number | null
  /** Line-level error coming from the backend (serials, lot, …). */
  error: string | null
}

interface ServerErrorBody {
  code?: string
  message?: string
  user_msg?: string
  http_status?: number
  errors?: Array<{ field: string; rule: string; context?: Record<string, unknown> }>
}

/**
 * ReceivingProcessingComponent — registers the physical receipt of goods of an
 * IN-WAREHOUSE / PROCESSING receiving into a location (and optionally a
 * container/LPN). Equivalent of inv-frontend's FormReceive, on the v2 API:
 * POST /v2/inbound/receiving/make.
 *
 * - The destination is a location of the receiving's facility (searchable by code).
 * - Each line defaults to its pending quantity; 0 skips it.
 * - Lot, expiry date and serials per line (serials only for serial-controlled SKUs).
 * - Over-receiving is refused by the backend first; the operator confirms and
 *   the request is resent with allow_over_receiving.
 */
@Component({
  selector: 'app-receiving-processing',
  standalone: true,
  imports: [
    NgClass,
    NgTemplateOutlet,
    IconFieldModule,
    InputIconModule,
    DecimalPipe,
    FormsModule,
    TranslateModule,
    AutoCompleteModule,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    BaseDialog,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    ProgressBarModule,
    TagModule,
    TextareaModule,
    ToastModule,
    TooltipModule,
    BaseStatusBadge,
  ],
  providers: [MessageService, ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './processing.html',
})
export default class ReceivingProcessingComponent implements OnDestroy, CanLeave {
  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.beforeUnload)
    if (this.scanFlashTimer) clearTimeout(this.scanFlashTimer)
    this.breadcrumb.titleDetail.set(null)
  }

  private readonly svc = inject(ReceivingService)
  private readonly translate = inject(TranslateService)
  private readonly translateLan = inject(TranslateLanService)
  private readonly location = inject(Location)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  private readonly messageSvc = inject(MessageService)
  private readonly confirmSvc = inject(ConfirmationService)
  private readonly auth = inject(AuthService)

  readonly id = this.route.snapshot.paramMap.get('id') ?? ''
  private readonly breadcrumb = inject(BreadcrumbService)
  // Document number in the topbar title; the page has no title of its own.
  private readonly syncTitle = effect(() => this.breadcrumb.titleDetail.set(this.receiving()?.doc_number || this.id || null))
  readonly lineStatusMap = LINE_STATUS_MAP
  readonly statusMap = RECEIVING_STATUS_MAP
  readonly maxQty = MAX_QTY

  // ── State ─────────────────────────────────────────────────────────────────
  receiving = signal<ReceivingListItem | null>(null)
  facilityName = signal('')
  lines = signal<ProcessingLine[]>([])
  loading = signal(true)
  processing = signal(false)
  starting = signal(false)
  /** Show lines that are already fully received. */
  showCompleted = signal(false)

  // Destination
  /** Bound to the autocomplete: an option once picked, a string while typing. */
  destination = signal<ReceivingLocationOption | string | null>(null)
  locationSuggestions = signal<ReceivingLocationOption[]>([])
  locationError = signal<string | null>(null)
  /** Bound to the container autocomplete: an option once picked, a string while typing/scanning. */
  container = signal<ReceivingContainerOption | string | null>(null)
  /** Containers (bins) of the selected location; empty until a location is picked. */
  locationContainers = signal<ReceivingContainerOption[]>([])
  containerSuggestions = signal<ReceivingContainerOption[]>([])
  containersLoading = signal(false)
  /** Id of the location whose containers are loaded (avoids reloading on each keystroke). */
  private containersLocationId: string | null = null
  containerError = signal<string | null>(null)
  /** Capacity / guardrail errors of the destination (LOCATION_/CONTAINER_VALIDATION_ERROR). */
  destinationErrors = signal<string[]>([])
  submitted = signal(false)

  // Costing (OWNER only, facility with costing ≠ NONE)
  readonly isOwner = isOwnerRole(this.auth.getAuthUserInfo()?.role)
  costing = signal<CostingSettings | null>(null)
  showCost = computed(() => this.isOwner && isCostingEnabled(this.costing()))
  currency = computed(() => currencyOf(this.costing()))
  costPrefix = computed(() => currencyPrefix(this.currency()))

  // Serials dialog
  serialsLineId = signal<string | null>(null)
  serialsDraft = ''

  // ── Derived ───────────────────────────────────────────────────────────────
  status = computed(() => this.receiving()?.status ?? null)
  canReceive = computed(() => {
    const s = this.status()
    return !!s && RECEIVABLE.includes(s)
  })

  visibleLines = computed(() =>
    this.showCompleted() ? this.lines() : this.lines().filter(l => l.qty_pending > 0 || l.qty_to_receive > 0)
  )
  completedCount = computed(() => this.lines().filter(l => l.qty_pending <= 0).length)

  toReceive = computed(() => this.lines().filter(l => l.qty_to_receive > 0))
  totalToReceive = computed(() => this.toReceive().reduce((s, l) => s + l.qty_to_receive, 0))
  totalExpected = computed(() => this.lines().reduce((s, l) => s + l.qty_expected, 0))
  totalReceived = computed(() => this.lines().reduce((s, l) => s + l.qty_received, 0))
  progress = computed(() => {
    const exp = this.totalExpected()
    return exp ? Math.min(100, Math.round((this.totalReceived() / exp) * 100)) : 0
  })

  locationCode = computed(() => {
    const v = this.destination()
    return (typeof v === 'string' ? v : v?.location_code ?? '').trim()
  })

  containerCode = computed(() => {
    const v = this.container()
    return (typeof v === 'string' ? v : v?.lpn_code ?? '').trim()
  })

  /** Lines whose serial count does not match the quantity to receive. */
  serialIssues = computed(() =>
    this.toReceive().filter(l => this.requiresSerials(l) && l.serials.length !== l.qty_to_receive)
  )

  serialsLine = computed(() => this.lines().find(l => l.id === this.serialsLineId()) ?? null)

  /** Set right before a navigation the page itself starts after a successful receive. */
  private leavingOnPurpose = false

  /** Line just hit by a scan: highlighted for a moment. */
  readonly scannedLineId = signal<string | null>(null)
  private scanFlashTimer: ReturnType<typeof setTimeout> | null = null
  scanCode = ''

  /** Lots expiring within this many days are flagged while receiving. */
  readonly EXPIRY_WARN_DAYS = 30

  /** Unsaved work: quantities typed but not received yet. */
  hasUnsavedChanges(): boolean {
    return !this.leavingOnPurpose && this.toReceive().length > 0
  }

  /** CanLeave (route guard): ask before throwing away typed quantities. */
  canLeave(): boolean | Promise<boolean> {
    if (!this.hasUnsavedChanges()) return true
    return new Promise(resolve =>
      this.confirmSvc.confirm({
        header: this.translate.instant('inbound.unsaved_title'),
        message: this.translate.instant('inbound.unsaved_message'),
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: this.translate.instant('inbound.unsaved_leave'),
        rejectLabel: this.translate.instant('buttons.cancel'),
        acceptButtonStyleClass: 'p-button-danger',
        rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
        accept: () => resolve(true),
        reject: () => resolve(false),
      })
    )
  }

  /** Closing or reloading the tab: the browser's own "leave site?" prompt. */
  private readonly beforeUnload = (e: BeforeUnloadEvent) => {
    if (this.hasUnsavedChanges()) e.preventDefault()
  }

  /**
   * A scan (barcode or SKU code + Enter): adds 1 to that line, highlights it
   * and brings it into view. Serial-controlled SKUs open their serial list.
   */
  onScan(): void {
    const code = this.scanCode.trim()
    this.scanCode = ''
    if (!code || !this.canReceive()) return
    const norm = code.toUpperCase()
    const line =
      this.lines().find(l => (l.barcode ?? '').toUpperCase() === norm) ??
      this.lines().find(l => (l.sku_code ?? '').toUpperCase() === norm)
    if (!line) {
      this.messageSvc.add({ severity: 'warn', summary: this.translate.instant('inbound.scan_not_found', { code }), life: 3000 })
      return
    }
    if (this.requiresSerials(line)) {
      this.messageSvc.add({ severity: 'info', summary: this.translate.instant('inbound.scan_serials', { sku: line.sku_code }), life: 3000 })
      this.openSerials(line)
      return
    }
    // A completed line hidden from the list comes back into view
    if (line.qty_pending <= 0 && !this.showCompleted()) this.showCompleted.set(true)
    this.updateLine(line.id, { qty_to_receive: Math.min(this.maxQty, line.qty_to_receive + 1) })
    this.scannedLineId.set(line.id)
    if (this.scanFlashTimer) clearTimeout(this.scanFlashTimer)
    this.scanFlashTimer = setTimeout(() => this.scannedLineId.set(null), 1500)
    setTimeout(() =>
      document.querySelectorAll(`[data-line-id="${line.id}"]`).forEach(el => {
        if ((el as HTMLElement).offsetParent) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
    )
  }

  /** Days until a picked expiry date (negative once past), on local calendar days. */
  expiryDays(expiry: Date | null): number | null {
    if (!expiry) return null
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const day = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate()).getTime()
    return Math.round((day - today) / 86_400_000)
  }

  constructor() {
    window.addEventListener('beforeunload', this.beforeUnload)
    effect(() => this.translate.use(this.translateLan.changeLanguage()))
    this.load()
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  load(): void {
    this.loading.set(true)
    this.svc
      .listReceivings({
        config: { populate_data: true, page: 1, rows: 1 },
        filter: { id: { value: this.id, match_mode: 'equals' } },
      })
      .subscribe({
        next: resp => {
          const rec = resp.data?.[0] ?? null
          this.receiving.set(rec)
          const fac = resp.facilities?.find(f => f.id === rec?.facility_id)
          this.facilityName.set(fac ? fac.name : '')
          if (rec) {
            this.loadLines()
            this.loadCosting(rec.facility_id)
          } else this.loading.set(false)
        },
        error: () => this.loading.set(false),
      })
  }

  /** Only owners see costs, so other roles skip the call. */
  private loadCosting(facilityId: string): void {
    if (!this.isOwner || !facilityId) return
    this.svc.getFacilityCosting(facilityId).subscribe({
      next: s => this.costing.set(s),
      error: () => this.costing.set(null),
    })
  }

  /** ▲/▼ % of the ingress cost against the catalog cost; null when not comparable. */
  variancePct(line: ProcessingLine): number | null {
    return costVariancePct(line.receive_cost, line.sku_cost)
  }

  private loadLines(): void {
    this.svc
      .listReceivingLines({
        config: { populate_data: true, page: 1, rows: 1000, sort_field: [{ field: 'line_number', order: 1 }] },
        filter: { receiving_id: { match_mode: 'equals', value: this.id } },
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: resp => {
          this.lines.set(
            (resp.data ?? []).map(line => {
              const pending = Math.max(0, line.qty_pending ?? line.qty_expected - line.qty_received)
              return {
                ...line,
                qty_pending: pending,
                qty_to_receive: pending,
                batch_lot: '',
                expiry: null,
                serials: [],
                receive_cost: line.unit_cost ?? line.sku_cost ?? null,
                error: null,
              }
            })
          )
        },
        error: () =>
          this.messageSvc.add({
            severity: 'error',
            summary: this.translate.instant('inbound.lines_load_error'),
            life: 4000,
          }),
      })
  }

  // ── Start (IN-TRANSIT → IN-WAREHOUSE) from this screen ────────────────────

  start(): void {
    this.starting.set(true)
    this.svc
      .startReceiving(this.id)
      .pipe(finalize(() => this.starting.set(false)))
      .subscribe({
        next: () => {
          this.messageSvc.add({ severity: 'success', summary: this.translate.instant('inbound.start_success'), life: 3000 })
          this.load()
        },
      })
  }

  // ── Destination ───────────────────────────────────────────────────────────

  searchLocations(event: AutoCompleteCompleteEvent): void {
    const facilityId = this.receiving()?.facility_id
    if (!facilityId) return
    this.svc.searchLocations(facilityId, (event.query ?? '').trim()).subscribe({
      next: list => this.locationSuggestions.set(list),
      error: () => this.locationSuggestions.set([]),
    })
  }

  onLocationChange(value: ReceivingLocationOption | string | null): void {
    this.destination.set(value)
    this.locationError.set(null)
    this.destinationErrors.set([])
    // A typed code that exactly matches a suggestion counts as picking it.
    const loc =
      typeof value === 'string'
        ? this.locationSuggestions().find(l => l.location_code.toLowerCase() === value.trim().toLowerCase()) ?? null
        : value
    this.loadContainers(loc?.id ?? null)
  }

  onLocationSelect(event: AutoCompleteSelectEvent): void {
    this.onLocationChange(event.value as ReceivingLocationOption)
  }

  /** Loads the bins of the chosen location; clears them (and the picked bin) when the location changes. */
  private loadContainers(locationId: string | null): void {
    if (locationId === this.containersLocationId) return
    this.containersLocationId = locationId
    this.locationContainers.set([])
    this.containerSuggestions.set([])
    // A bin picked from the previous location no longer applies.
    if (this.container() && typeof this.container() !== 'string') this.container.set(null)
    if (!locationId) return
    this.containersLoading.set(true)
    this.svc
      .listLocationContainers(locationId)
      .pipe(finalize(() => this.containersLoading.set(false)))
      .subscribe({
        next: list => {
          if (this.containersLocationId === locationId) this.locationContainers.set(list)
        },
        error: () => this.locationContainers.set([]),
      })
  }

  searchContainers(event: AutoCompleteCompleteEvent): void {
    const q = (event.query ?? '').trim().toLowerCase()
    const all = this.locationContainers()
    this.containerSuggestions.set(q ? all.filter(c => c.lpn_code.toLowerCase().includes(q)) : [...all])
  }

  onContainerChange(value: ReceivingContainerOption | string | null): void {
    this.container.set(value)
    this.containerError.set(null)
    this.destinationErrors.set([])
  }

  onContainerSelect(event: AutoCompleteSelectEvent): void {
    this.onContainerChange(event.value as ReceivingContainerOption)
  }

  // ── Line edits ────────────────────────────────────────────────────────────

  updateLine(id: string, patch: Partial<ProcessingLine>): void {
    this.lines.update(list => list.map(l => (l.id === id ? { ...l, ...patch, error: null } : l)))
  }

  /** Fill every line with its pending quantity. */
  receiveAllPending(): void {
    this.lines.update(list => list.map(l => ({ ...l, qty_to_receive: l.qty_pending, error: null })))
  }

  clearQuantities(): void {
    this.lines.update(list => list.map(l => ({ ...l, qty_to_receive: 0, error: null })))
  }

  requiresSerials(line: ReceivingLineDetail): boolean {
    return SERIAL_MODES.has((line.serial_control_mode ?? '').toUpperCase())
  }

  lineProgress(line: ProcessingLine): number {
    if (!line.qty_expected) return 0
    return Math.min(100, Math.round((line.qty_received / line.qty_expected) * 100))
  }

  isOver(line: ProcessingLine): boolean {
    return line.qty_to_receive > line.qty_pending
  }

  // ── Serials dialog ────────────────────────────────────────────────────────

  openSerials(line: ProcessingLine): void {
    this.serialsDraft = line.serials.join('\n')
    this.serialsLineId.set(line.id)
  }

  closeSerials(): void {
    this.serialsLineId.set(null)
  }

  /** Parsed draft: one serial per line or separated by commas/spaces, trimmed. */
  parseSerials(text: string): string[] {
    return text
      .split(/[\n,;\t ]+/)
      .map(s => s.trim())
      .filter(Boolean)
  }

  draftDuplicates(text: string): string[] {
    const seen = new Set<string>()
    const dup = new Set<string>()
    for (const s of this.parseSerials(text)) {
      if (seen.has(s)) dup.add(s)
      seen.add(s)
    }
    return [...dup]
  }

  saveSerials(): void {
    const line = this.serialsLine()
    if (!line) return
    const serials = [...new Set(this.parseSerials(this.serialsDraft))]
    // Serials define the quantity of a serial-controlled line.
    this.updateLine(line.id, { serials, qty_to_receive: serials.length })
    this.closeSerials()
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  submit(allowOver = false): void {
    this.submitted.set(true)
    if (!this.canReceive()) return

    let invalid = false
    if (!this.locationCode()) {
      this.locationError.set(this.translate.instant('forms_validation.required'))
      invalid = true
    }
    if (this.toReceive().length === 0) {
      this.messageSvc.add({ severity: 'warn', summary: this.translate.instant('inbound.nothing_to_receive'), life: 3000 })
      invalid = true
    }
    if (this.serialIssues().length > 0) invalid = true
    if (invalid) return

    // Payload index → line id, to route items[i].* errors back to their row.
    const order: string[] = []
    const items: MakeReceivingItem[] = this.toReceive().map(l => {
      order.push(l.id)
      const item: MakeReceivingItem = { sku_code: l.sku_code, qty_received: l.qty_to_receive }
      const lot = l.batch_lot.trim()
      if (lot) item.batch_lot = lot
      if (l.expiry) item.expiry_date = toIsoDate(l.expiry)
      if (l.serials.length) item.serials = l.serials
      // One price per submit: a SKU arriving at several prices is received in
      // several passes, each with its own cost (docs/costing-design.md).
      if (this.showCost() && l.receive_cost != null) item.unit_cost = l.receive_cost
      return item
    })

    const container = this.containerCode()
    const payload: MakeReceivingInput = {
      receiving_id: this.id,
      location: this.locationCode(),
      container: container || null,
      allow_over_receiving: allowOver,
      items,
    }

    this.processing.set(true)
    this.svc
      .makeReceiving(payload)
      .pipe(finalize(() => this.processing.set(false)))
      .subscribe({
        next: res => this.onMade(res),
        error: err => this.applyServerError(err, order),
      })
  }

  private onMade(res: MakeReceivingResult): void {
    if (res.qty_exceeded) {
      this.confirmOverReceiving(res)
      return
    }
    this.submitted.set(false)
    this.messageSvc.add({
      severity: 'success',
      summary: this.translate.instant('inbound.receive_success'),
      detail: this.translate.instant('inbound.receive_success_detail', {
        lines: res.lines_received,
        location: this.locationCode(),
      }),
      life: 4000,
    })
    if (res.status === 'COMPLETE') {
      this.leavingOnPurpose = true
      this.router.navigate(['app/inbound/details', this.id])
      return
    }
    // Keep the destination: the next batch usually goes to the same place.
    this.load()
  }

  private confirmOverReceiving(res: MakeReceivingResult): void {
    const rows = (res.exceeded_skus ?? [])
      .map(
        s =>
          `<li><b>${escapeHtml(s.sku_code)}</b>: ${this.translate.instant('inbound.over_row', {
            requested: s.qty_requested,
            remaining: s.qty_remaining,
          })}</li>`
      )
      .join('')
    this.confirmSvc.confirm({
      header: this.translate.instant('inbound.over_receiving_title'),
      message: `${this.translate.instant('inbound.over_receiving_msg')}<ul class="mt-2 pl-4 list-disc">${rows}</ul>`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('inbound.over_receiving_accept'),
      rejectLabel: this.translate.instant('buttons.cancel'),
      acceptButtonStyleClass: 'p-button-warn',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => this.submit(true),
    })
  }

  private applyServerError(err: unknown, order: string[]): void {
    const e = err as { error?: ServerErrorBody } & ServerErrorBody
    const body: ServerErrorBody = e?.error ?? e
    const code = body?.code ?? ''

    switch (code) {
      case 'RECEIVING_LOCATION_NOT_FOUND':
        this.locationError.set(this.translate.instant('errors.RECEIVING_LOCATION_NOT_FOUND'))
        return
      case 'RECEIVING_CONTAINER_NOT_FOUND':
        this.containerError.set(this.translate.instant('errors.RECEIVING_CONTAINER_NOT_FOUND'))
        return
      case 'LOCATION_VALIDATION_ERROR':
      case 'CONTAINER_VALIDATION_ERROR':
        this.destinationErrors.set(
          (body.errors ?? []).map(d => this.translate.instant(`validation.${d.rule}`, flattenContext(d.context)))
        )
        return
    }

    // items[i].<field> → attach to the row that produced it.
    const lineErrors = new Map<string, string>()
    for (const d of body?.errors ?? []) {
      const m = /^items\[(\d+)\]/.exec(d.field)
      const lineId = m ? order[Number(m[1])] : undefined
      const msg = this.translate.instant(`forms_validation.${d.rule}`)
      if (lineId) lineErrors.set(lineId, msg)
      else if (d.field === 'location') this.locationError.set(msg)
    }
    if (lineErrors.size) {
      this.lines.update(list => list.map(l => (lineErrors.has(l.id) ? { ...l, error: lineErrors.get(l.id)! } : l)))
      return
    }

    // Non-422 v2 errors are already toasted by the error interceptor.
    if (body?.http_status && body.http_status !== 422) return
    const key = `errors.${code}`
    const translated = code ? this.translate.instant(key) : ''
    this.messageSvc.add({
      severity: 'error',
      summary: this.translate.instant('inbound.receive_error'),
      detail: translated && translated !== key ? translated : body?.message ?? body?.user_msg,
      life: 5000,
    })
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  goDetails(): void {
    this.router.navigate(['app/inbound/details', this.id])
  }

  back(): void {
    this.location.back()
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Local calendar date as yyyy-MM-dd (no UTC shift). */
function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ngx-translate params: arrays become comma-separated text. */
function flattenContext(ctx?: Record<string, unknown>): Record<string, unknown> {
  if (!ctx) return {}
  return Object.fromEntries(Object.entries(ctx).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v]))
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
