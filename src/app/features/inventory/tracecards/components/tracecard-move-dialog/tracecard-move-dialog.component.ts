import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core'
import { DecimalPipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { AutoCompleteCompleteEvent, AutoCompleteModule, AutoCompleteSelectEvent } from 'primeng/autocomplete'
import { InputNumberModule } from 'primeng/inputnumber'
import { MessageModule } from 'primeng/message'
import { TextareaModule } from 'primeng/textarea'
import { finalize } from 'rxjs'

import { BaseDialog } from '@/app/shared/components/dialog/dialog/base-dialog.component'
import { TracecardsService } from '../../warehouse.service'
import {
  AppErrorBody,
  ContainerOption,
  LocationOption,
  MoveInput,
  MoveResult,
  TracecardItem,
} from '../../types/warehouse.types'

/** Error codes the backend ties to the destination location field. */
const LOCATION_ERRORS = new Set(['MOVE_TARGET_LOCATION_NOT_FOUND', 'MOVE_TARGET_FACILITY_MISMATCH'])
/** Error codes the backend ties to the destination container field. */
const CONTAINER_ERRORS = new Set([
  'MOVE_CONTAINER_NOT_FOUND',
  'MOVE_CONTAINER_TYPE_RESTRICTED',
  'MOVE_CONTAINER_LOCATION_MISMATCH',
  'MOVE_CONTAINER_NO_LOCATION',
])

/** Mirrors maxNotesLength in logic-back move.repository.go. */
export const MAX_NOTES_LENGTH = 500

/**
 * Moves part or all of a tracecard's available stock to another location
 * and/or container of the same facility. POST /v2/inventory/move.
 *
 * Destination rules (backend): location only → loose stock; container only →
 * the container's own location; both → the container must be at that location.
 */
@Component({
  selector: 'app-tracecard-move-dialog',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    TranslateModule,
    AutoCompleteModule,
    InputNumberModule,
    MessageModule,
    TextareaModule,
    BaseDialog,
  ],
  templateUrl: './tracecard-move-dialog.component.html',
})
export class TracecardMoveDialogComponent {
  private readonly svc = inject(TracecardsService)
  private readonly translate = inject(TranslateService)

  visible = input(false)
  item = input<TracecardItem | null>(null)

  hide = output<void>()
  done = output<MoveResult>()

  qty = signal<number | null>(null)
  /** An option once picked, a string while typing/scanning. */
  destination = signal<LocationOption | string | null>(null)
  locationSuggestions = signal<LocationOption[]>([])
  container = signal<ContainerOption | string | null>(null)
  locationContainers = signal<ContainerOption[]>([])
  containerSuggestions = signal<ContainerOption[]>([])
  private containersLocationId: string | null = null
  notes = signal('')
  readonly maxNotes = MAX_NOTES_LENGTH

  saving = signal(false)
  notesError = signal<string | null>(null)
  qtyError = signal<string | null>(null)
  locationError = signal<string | null>(null)
  containerError = signal<string | null>(null)
  formError = signal<string | null>(null)

  /** Movable units: reserved stock stays with its allocations. */
  available = computed(() => {
    const it = this.item()
    return it ? Math.max(0, it.qty_on_hand - it.qty_reserved) : 0
  })

  locationCode = computed(() => {
    const v = this.destination()
    return (typeof v === 'string' ? v : v?.location_code ?? '').trim()
  })

  containerCode = computed(() => {
    const v = this.container()
    return (typeof v === 'string' ? v : v?.lpn_code ?? '').trim()
  })

  canSave = computed(() => {
    const q = this.qty()
    return !!q && q > 0 && q <= this.available() && (!!this.locationCode() || !!this.containerCode())
  })

  constructor() {
    // Each opening starts clean, with the whole available stock pre-filled.
    effect(() => {
      if (!this.visible()) return
      const avail = this.available()
      untracked(() => this.reset(avail))
    })
  }

  private reset(avail: number): void {
    this.qty.set(avail > 0 ? avail : null)
    this.destination.set(null)
    this.container.set(null)
    this.locationSuggestions.set([])
    this.locationContainers.set([])
    this.containerSuggestions.set([])
    this.containersLocationId = null
    this.notes.set('')
    this.clearErrors()
    this.saving.set(false)
  }

  private clearErrors(): void {
    this.qtyError.set(null)
    this.locationError.set(null)
    this.containerError.set(null)
    this.notesError.set(null)
    this.formError.set(null)
  }

  // ── Destination location ──────────────────────────────────

  searchLocations(event: AutoCompleteCompleteEvent): void {
    const facilityId = this.item()?.facility_id
    if (!facilityId) return
    this.svc.searchLocations(facilityId, (event.query ?? '').trim()).subscribe({
      next: (list) => this.locationSuggestions.set(list),
      error: () => this.locationSuggestions.set([]),
    })
  }

  onLocationChange(value: LocationOption | string | null): void {
    this.destination.set(value)
    this.locationError.set(null)
    this.formError.set(null)
    // A typed/scanned code that matches a suggestion resolves to it, so its containers load.
    const loc =
      typeof value === 'string'
        ? this.locationSuggestions().find((l) => l.location_code.toLowerCase() === value.trim().toLowerCase()) ?? null
        : value
    this.loadContainers(loc?.id ?? null)
  }

  onLocationSelect(event: AutoCompleteSelectEvent): void {
    this.onLocationChange(event.value as LocationOption)
  }

  private loadContainers(locationId: string | null): void {
    if (locationId === this.containersLocationId) return
    this.containersLocationId = locationId
    this.locationContainers.set([])
    this.containerSuggestions.set([])
    // A container picked in the previous location no longer applies.
    if (this.container() && typeof this.container() !== 'string') this.container.set(null)
    if (!locationId) return
    this.svc.listLocationContainers(locationId).subscribe({
      next: (list) => {
        if (this.containersLocationId === locationId) this.locationContainers.set(list)
      },
      error: () => this.locationContainers.set([]),
    })
  }

  // ── Destination container ─────────────────────────────────

  searchContainers(event: AutoCompleteCompleteEvent): void {
    const q = (event.query ?? '').trim().toLowerCase()
    const all = this.locationContainers()
    this.containerSuggestions.set(q ? all.filter((c) => c.lpn_code.toLowerCase().includes(q)) : [...all])
  }

  onContainerChange(value: ContainerOption | string | null): void {
    this.container.set(value)
    this.containerError.set(null)
    this.formError.set(null)
  }

  onContainerSelect(event: AutoCompleteSelectEvent): void {
    this.onContainerChange(event.value as ContainerOption)
  }

  // ── Submit ────────────────────────────────────────────────

  save(): void {
    const item = this.item()
    if (!item || this.saving()) return
    this.clearErrors()

    const qty = this.qty() ?? 0
    const location = this.locationCode()
    const container = this.containerCode()

    if (qty <= 0 || qty > this.available()) {
      this.qtyError.set(this.translate.instant('tracecard_ops.qty_range', { max: this.available() }))
      return
    }
    if (!location && !container) {
      this.locationError.set(this.translate.instant('tracecard_ops.destination_required'))
      return
    }
    if (this.isSamePlace(item, location, container)) {
      this.formError.set(this.translate.instant('tracecard_ops.same_destination'))
      return
    }

    const payload: MoveInput = { source_kardex_id: item.id, qty }
    if (location) payload.target_location_code = location
    if (container) payload.target_container_lpn = container
    const notes = this.notes().trim()
    if (notes) payload.notes = notes

    this.saving.set(true)
    this.svc
      .move(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (res) => this.done.emit(res),
        error: (err) => this.applyServerError(err),
      })
  }

  /** The destination is where the stock already is (same location and same container, or both loose). */
  private isSamePlace(item: TracecardItem, location: string, container: string): boolean {
    const sameContainer = (item.container_lpn ?? '').toLowerCase() === container.toLowerCase()
    if (!location) return !!container && sameContainer
    return location.toLowerCase() === (item.location_code ?? '').toLowerCase() && sameContainer
  }

  private applyServerError(err: unknown): void {
    const body = ((err as { error?: AppErrorBody })?.error ?? err) as AppErrorBody
    const code = body?.code ?? ''
    const msg = this.errorText(code, body?.message)

    if (LOCATION_ERRORS.has(code)) return this.locationError.set(msg)
    if (CONTAINER_ERRORS.has(code)) return this.containerError.set(msg)
    if (code === 'MOVE_INSUFFICIENT_STOCK') return this.qtyError.set(msg)
    if (code === 'MOVE_VALIDATION_ERROR' && body.errors?.length) {
      for (const d of body.errors) {
        const text = this.translate.instant(`forms_validation.${d.rule}`)
        if (d.field === 'qty') this.qtyError.set(text)
        else if (d.field === 'notes')
          this.notesError.set(this.translate.instant('tracecard_ops.notes_too_long', { max: MAX_NOTES_LENGTH }))
        else if (d.field.startsWith('target_')) this.locationError.set(this.translate.instant('tracecard_ops.destination_required'))
        else this.formError.set(text)
      }
      return
    }
    this.formError.set(msg)
  }

  private errorText(code: string, fallback?: string): string {
    const key = `errors.${code}`
    const t = code ? this.translate.instant(key) : ''
    return t && t !== key ? t : fallback || this.translate.instant('messages.save_error')
  }
}
