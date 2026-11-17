import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core'
import { Location } from '@angular/common'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { ToastModule } from 'primeng/toast'
import { MultiSelectModule, MultiSelect } from 'primeng/multiselect'
import { ChipModule } from 'primeng/chip'
import { FormsModule } from '@angular/forms'
import { ProgressBarModule } from 'primeng/progressbar'

import { FilterMultiselectPanelComponent } from '../../../../../shared/components/filter-multiselect-panel/filter-multiselect-panel.component'
import { FilterTextInputComponent } from '../../../../../shared/components/filter-text-input/filter-text-input.component'

import { TranslateLanService } from '../../../../../core/services/translate-lan.service'
import { DateTimeSeparatePipe } from '../../../../../shared/pipes/datetime-separate.pipe'
import { BaseDataTable } from '../../../../../shared/components/datatable/data-table/base-data-table.component'
import { BaseStatusBadge } from '../../../../../shared/components/status/status-badge/base-status-badge.component'
import {
  ShColumnDef,
  ShPaginationConfig,
  ShTableEvent,
  ActiveFilterChip,
} from '../../../../../shared/types/table.types'
import { ReceivingService } from '../../receivings.service'
import { toApiFilter, toListConfig } from '../../receivings-filter.util'
import {
  ReceivingLineDetail,
  ReceivingLineFilter,
  ReceivingLineListRequest,
  ReceivingListRequest,
  MetaData,
} from '../../receivings.types'

// ── State ────────────────────────────────────────────────────────────────────

interface DetailsState {
  data: ReceivingLineDetail[]
  meta_data: MetaData
  loading: boolean
  loaded: boolean
  error: unknown
}

const DEFAULT_STATE: DetailsState = {
  data: [],
  meta_data: { page: 1, rows: 15, total_records: 0 },
  loading: true,
  loaded: false,
  error: null,
}

const LINE_STATUS_MAP: Record<
  string,
  'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'
> = {
  open: 'info',
  partial: 'warn',
  complete: 'success',
  closed: 'secondary',
}

@Component({
  selector: 'app-receiving-details',
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    ButtonModule,
    MultiSelectModule,
    ProgressBarModule,
    ToastModule,
    ChipModule,
    DateTimeSeparatePipe,
    BaseDataTable,
    BaseStatusBadge,
    FilterMultiselectPanelComponent,
    FilterTextInputComponent,
  ],
  providers: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './details.html',
  styleUrl: './details.scss',
})
export default class ReceivingDetailsComponent implements OnInit {

  @ViewChild('colMs') private readonly colMs?: MultiSelect

  private readonly svc = inject(ReceivingService)
  private readonly translate = inject(TranslateService)
  private readonly translateLan = inject(TranslateLanService)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly location = inject(Location)
  private readonly route = inject(ActivatedRoute)

  readonly id = this.route.snapshot.paramMap.get('id') ?? ''
  readonly lineStatusMap = LINE_STATUS_MAP

  /** Doc number fetched from receiving header — shown in the page title */
  docNumber = signal<string>('')
  /** Header status — decides whether the "Receive" button is offered. */
  receivingStatus = signal<string | null>(null)
  canReceive = computed(() => ['IN-WAREHOUSE', 'PROCESSING'].includes(this.receivingStatus() ?? ''))
  private readonly router = inject(Router)

  goReceive(): void {
    this.router.navigate(['app/inbound/processing', this.id])
  }

  // ── State ─────────────────────────────────────────────────────────────────
  state = signal<DetailsState>({ ...DEFAULT_STATE })
  dto = signal<ReceivingLineListRequest>({
    config: { populate_data: true, page: 1, rows: 15 },
    filter: { receiving_id: { match_mode: 'equals', value: this.id } },
  })

  pagination = computed<ShPaginationConfig>(() => ({
    page: this.state().meta_data.page ?? 1,
    limit: this.state().meta_data.rows ?? 15,
    total: this.state().meta_data.total_records ?? 0,
    rows_per_page: [15, 30, 50],
  }))

  // ── Column definitions ────────────────────────────────────────────────────
  columnDefs: ShColumnDef[] = [
    {
      field: 'images',
      header: 'labels.image',
      width: '6rem',
      template: 'image',
    },
    {
      field: 'sku_code',
      header: 'labels.sku',
      width: '14rem',
      sortable: true,
      filterable: true,
      filterType: 'text',
      template: 'sku',
    },
    {
      field: 'barcode',
      header: 'labels.barcode',
      width: '12rem',
    },
    {
      field: 'product_description',
      header: 'labels.description',
      width: '16rem',
    },
    {
      field: 'qty_expected',
      header: 'labels.quantities',
      width: '14rem',
      template: 'qty',
    },
    {
      field: 'status',
      header: 'labels.status',
      width: '9rem',
      template: 'status',
      filterable: true,
      filterType: 'multiselect',
      filterOptions: [
        { label: 'status.open',     value: 'OPEN' },
        { label: 'status.partial',  value: 'PARTIAL' },
        { label: 'status.complete', value: 'COMPLETE' },
        { label: 'status.closed',   value: 'CLOSED' },
      ],
    },
    {
      field: 'line_number',
      header: 'labels.line',
      width: '6rem',
      sortable: true,
    },
    {
      field: 'created_at',
      header: 'labels.created_at',
      width: '10rem',
      sortable: true,
      template: 'date',
    },
  ]

  selectedCols: ShColumnDef[] = [...this.columnDefs]

  /** Column defs with pre-translated label — used by the multiSelect so search works in any language */
  translatedColumnDefs: (ShColumnDef & { translatedHeader: string })[] = []

  private buildTranslatedColumns(): void {
    this.translatedColumnDefs = this.columnDefs.map(col => ({
      ...col,
      translatedHeader: this.translate.instant(col.header),
    }))
    // Keep selectedCols in sync with the newly translated objects
    this.selectedCols = this.translatedColumnDefs.filter(def =>
      this.selectedCols.some(s => s.field === def.field)
    )
    this.cdr.markForCheck()
  }

  /** Close the column-selector dropdown after each selection change */
  onColumnSelectionChange(cols: (ShColumnDef & { translatedHeader?: string })[]): void {
    this.selectedCols = this.translatedColumnDefs.filter(def =>
      cols.some(c => c.field === def.field)
    )
    this.colMs?.hide()
  }

  // ── Filter state ───────────────────────────────────────────────────────
  /** Active values for each filter field — sourced from commits via the filter components */
  private activeFilters: Record<string, { value: any; matchMode: string }> = {}

  /** Selected status filter values (bound to shipedge-filter-multiselect-panel) */
  statusFilter: string[] = []

  /** Chips shown above the table for each active filter */
  activeFilterChips = signal<ActiveFilterChip[]>([])

  /** Translated status options — rebuilt on every language change */
  statusOptions = signal<{ label: string; value: string }[]>([])

  constructor() {
    effect(() => {
      this.translate.use(this.translateLan.changeLanguage())
      this.buildStatusOptions()
    })
    // Auto-reload when dto signal changes
    effect(() => this.load())
  }

  ngOnInit(): void {
    // Build translated column labels once translations are loaded on startup
    this.translate.get(this.columnDefs.map(c => c.header)).subscribe(() => {
      this.buildTranslatedColumns()
    })
    // Rebuild whenever the language changes (onLangChange fires AFTER translations are loaded)
    this.translate.onLangChange.subscribe(() => {
      this.buildTranslatedColumns()
    })

    // Fetch receiving header to get doc_number for the title
    this.loadDocNumber()
  }

  /** Load the doc_number from the receiving header (list endpoint with id filter) */
  private loadDocNumber(): void {
    const req: ReceivingListRequest = {
      config: { populate_data: false, page: 1, rows: 1, sort_field: [] },
      filter: { id: { match_mode: 'equals', value: this.id } },
    }
    this.svc.listReceivings(req).subscribe({
      next: (res) => {
        if (res.data?.length > 0) {
          this.docNumber.set(res.data[0].doc_number ?? '')
          this.receivingStatus.set(res.data[0].status ?? null)
        }
      },
    })
  }

  // ── Status options ─────────────────────────────────────────────────────────

  private static readonly RAW_STATUS_OPTIONS = [
    { label: 'status.open',     value: 'OPEN' },
    { label: 'status.partial',  value: 'PARTIAL' },
    { label: 'status.complete', value: 'COMPLETE' },
    { label: 'status.closed',   value: 'CLOSED' },
  ]

  /** Rebuilds the translated status options — called on init and language change */
  private buildStatusOptions(): void {
    this.statusOptions.set(
      ReceivingDetailsComponent.RAW_STATUS_OPTIONS.map(opt => ({
        label: this.translate.instant(opt.label),
        value: opt.value,
      }))
    )
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  load(): void {
    this.state.update((s) => ({ ...s, loading: true }))
    this.svc.listReceivingLines(this.dto()).subscribe({
      next: (resp) => {
        this.state.set({
          data: resp.data ?? [],
          meta_data: resp.meta_data,
          loading: false,
          loaded: true,
          error: null,
        })
      },
      error: (err) => {
        this.state.set({ ...DEFAULT_STATE, loading: false, error: err })
      },
    })
  }

  // ── Table events ──────────────────────────────────────────────────────────

  onTableStateChange(event: ShTableEvent): void {
    const filter: ReceivingLineFilter = {
      // Always keep the receiving_id anchor filter
      receiving_id: { match_mode: 'equals', value: this.id },
    }

    toApiFilter(event.filters ?? {}, filter)

    this.dto.set({ config: toListConfig(event), filter })
  }

  clearFilters(): void {
    this.activeFilters = {}
    this.statusFilter  = []
    this.activeFilterChips.set([])
    this.dto.set({
      config: { populate_data: true, page: 1, rows: 15 },
      filter: { receiving_id: { match_mode: 'equals', value: this.id } },
    })
  }

  // ── Filter helpers ────────────────────────────────────────────────────

  /** Returns the current committed value for a given filter field */
  getActiveFilterValue(field: string): any {
    return this.activeFilters[field]?.value ?? null
  }

  /** Apply a multiselect status filter */
  onStatusFilterApply(values: string[]): void {
    this.statusFilter = values
    this.applyFilters()
  }

  /** Clear the status filter */
  onStatusFilterClear(): void {
    this.statusFilter = []
    delete this.activeFilters['status']
    this.applyFilters()
  }

  /** Remove a single filter chip — clears the corresponding filter */
  removeFilterChip(field: string): void {
    if (field === 'status') {
      this.statusFilter = []
    } else {
      delete this.activeFilters[field]
    }
    this.applyFilters()
  }

  /** Apply a text/numeric filter from shipedge-filter-text-input */
  onColumnFilterChange(field: string, event: { value: any; matchMode: string } | null): void {
    if (event === null || event.value === null || event.value === '') {
      delete this.activeFilters[field]
    } else {
      this.activeFilters[field] = event
    }
    this.applyFilters()
  }

  /** Rebuild dto.filter from activeFilters + statusFilter and update chips */
  private applyFilters(): void {
    const filter: ReceivingLineFilter = {
      receiving_id: { match_mode: 'equals', value: this.id },
    }
    const chips: ActiveFilterChip[] = []

    if (this.statusFilter.length > 0) {
      ;(filter as any)['status'] = { value: this.statusFilter, match_mode: 'in' }
      // Build chip: labels are already translated in the signal
      const statusLabels = this.statusFilter.map(v => {
        const opt = this.statusOptions().find(o => o.value === v)
        return opt ? opt.label : v
      })
      chips.push({
        field:        'status',
        label:        this.translate.instant('labels.status'),
        displayValue: statusLabels.join(', '),
      })
    }

    for (const [field, cfg] of Object.entries(this.activeFilters)) {
      if (cfg.value !== null && cfg.value !== undefined && cfg.value !== '') {
        ;(filter as any)[field] = { value: cfg.value, match_mode: cfg.matchMode }
        const colDef = this.columnDefs.find(c => c.field === field)
        chips.push({
          field,
          label:        this.translate.instant(colDef?.header ?? field),
          displayValue: String(cfg.value),
        })
      }
    }

    this.activeFilterChips.set(chips)
    this.dto.update(d => ({ ...d, config: { ...d.config, page: 1 }, filter }))
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  back(): void {
    this.location.back()
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getProgress(row: ReceivingLineDetail): number {
    if (!row.qty_expected) return 0
    return Math.min(Math.round((row.qty_received / row.qty_expected) * 100), 100)
  }

  /** Returns the first image URL from the row's images array, or null */
  getFirstImage(row: ReceivingLineDetail): string | null {
    return row.images?.[0] ?? null
  }

  /** Hides a broken image and shows the placeholder sibling */
  onImgError(event: Event): void {
    const img = event.target as HTMLElement
    img.style.display = 'none'
    const sibling = img.nextElementSibling as HTMLElement | null
    if (sibling) sibling.style.display = 'flex'
  }
}
