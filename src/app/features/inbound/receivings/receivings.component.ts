import { facilityDayFilters } from '@/app/shared/utils/time-zone.util'
import { FacilityDatePipe } from '@/app/shared/pipes/facility-date.pipe'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
  ViewChild
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { map } from 'rxjs'
import { CommonModule } from '@angular/common'
import { DisplayDatePipe } from '@/app/shared/pipes/display-date.pipe'
import { Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ConfirmationService, MessageService, MenuItem } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { ChipModule } from 'primeng/chip'
import { ToastModule } from 'primeng/toast'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { MenuModule, Menu } from 'primeng/menu'
import { TooltipModule } from 'primeng/tooltip'
import { MultiSelectModule, MultiSelect } from 'primeng/multiselect'
import { ProgressBarModule } from 'primeng/progressbar'
import { FormsModule } from '@angular/forms'
import { FilterMultiselectPanelComponent } from '../../../shared/components/filter-multiselect-panel/filter-multiselect-panel.component'
import { FilterTextInputComponent } from '../../../shared/components/filter-text-input/filter-text-input.component'
import { FilterDateInputComponent } from '../../../shared/components/filter-date-input/filter-date-input.component'

import { TranslateLanService } from '../../../core/services/translate-lan.service'
import { DateTimeSeparatePipe } from '../../../shared/pipes/datetime-separate.pipe'
import { CapitalizePipe } from '../../../shared/pipes/capitalize.pipe'
import { BaseDataTable } from '../../../shared/components/datatable/data-table/base-data-table.component'
import { BaseStatusBadge } from '../../../shared/components/status/status-badge/base-status-badge.component'
import {
  ShColumnDef,
  ShPaginationConfig,
  ShTableEvent,
  ActiveFilterChip,
} from '../../../shared/types/table.types'
import { ShActionItem } from '../../../shared/types/api.types'
import { toApiFilter, toListConfig } from './receivings-filter.util'
import { ReceivingService } from './receivings.service'
import { SupplierService } from '../suppliers/suppliers.service'
import {
  ArchiveReceivingResult,
  FacilityItem,
  ReceivingListItem,
  ReceivingListRequest,
  ReceivingListResponse,
  ReceivingResult,
  ReceivingStatus,
  CompanyItem,
} from './receivings.types'
import { TableStateService } from '../../../shared/services/table-state.service'
import { FilterPresetService } from '@/app/shared/services/filter-preset.service'
import { FilterPreset, buildFiltersFromConditions, presetCombinator } from '@/app/shared/types/filter-preset.types'
import { FilterPresetManagerComponent } from '@/app/shared/components/filter-preset-manager/filter-preset-manager.component'
import {
  BaseImportExportMenu,
  ExportPageFetcher,
} from '../../../shared/components/import-export-menu/base-import-export-menu.component'
import { BaseImportDialog } from '../../../shared/components/import-dialog/base-import-dialog.component'
import { ImportFileFormat, ImportLog } from '../../../shared/types/import.types'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { scopeApiFilter, dropFacilityFilters, FACILITY_SCOPE_FIELD } from '@/app/shared/utils/facility-scope.util'
import { provideTableColumns } from '@/app/shared/services/table-columns.bus'
import { ReceivingFormDialogComponent } from './components/receiving-form-dialog/receiving-form-dialog.component'

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_DTO: ReceivingListRequest = {
  config: { populate_data: true, page: 1, rows: 15, sort_field: [] },
  filter: {},
}

const RECEIVING_STATUS_MAP: Record<
  string,
  'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'
> = {
  'in-transit':   'secondary',
  'in-warehouse': 'info',
  processing:     'warn',
  complete:       'success',
  discrepancy:    'contrast',
  cancelled:      'danger',
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-receivings',
  standalone: true,
  imports: [
    FacilityDatePipe,
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    ChipModule,
    ToastModule,
    ConfirmDialogModule,
    MenuModule,
    TooltipModule,
    MultiSelectModule,
    ProgressBarModule,
    DateTimeSeparatePipe,
    CapitalizePipe,
    DisplayDatePipe,
    BaseDataTable,
    BaseStatusBadge,
    BaseImportExportMenu,
    BaseImportDialog,
    FilterMultiselectPanelComponent,
    FilterTextInputComponent,
    FilterDateInputComponent,
    FilterPresetManagerComponent,
    ReceivingFormDialogComponent,
  ],
  providers: [ConfirmationService, MessageService, provideTableColumns()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './receivings.component.html',
})
export class Receivings implements OnInit {
  /** Expected date already passed while the goods have not arrived (still in transit). */
  isOverdue(row: { expected_arrival?: string | null; status?: string | null }): boolean {
    if (!row.expected_arrival || String(row.status ?? '').toLowerCase() !== 'in-transit') return false
    const d = new Date(row.expected_arrival)
    if (Number.isNaN(d.getTime())) return false
    // expected_arrival is date-only: compare calendar days in UTC, like it is displayed
    const now = new Date()
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) < today
  }

  /** Received share of the expected quantity, 0–100. */
  receivedPct(row: { qty_expected_sum?: number | null; qty_received_sum?: number | null }): number {
    const expected = Number(row.qty_expected_sum ?? 0)
    if (expected <= 0) return 0
    return Math.min(100, Math.round((Number(row.qty_received_sum ?? 0) / expected) * 100))
  }

  /** Global facility scope from the topbar selector. */
  private readonly facilityScope = inject(FacilityScopeService)
  private readonly svc               = inject(ReceivingService)
  private readonly translate         = inject(TranslateService)
  private readonly translateLan      = inject(TranslateLanService)
  private readonly cdr               = inject(ChangeDetectorRef)
  private readonly router            = inject(Router)
  private readonly confirmationSvc   = inject(ConfirmationService)
  private readonly messageSvc        = inject(MessageService)
  private readonly tableState        = inject(TableStateService)
  private readonly filterPresetService = inject(FilterPresetService)
  private readonly destroyRef        = inject(DestroyRef)
  private readonly STATE_KEY         = 'logic:receivings'
  readonly PRESET_PAGE_KEY           = 'receivings'

  activePresetColor = signal<string | null>(null)
  activePresetName  = signal<string | null>(null)

  /** Resets the sort icon on Clear */
  @ViewChild(BaseDataTable) private readonly baseTable!: BaseDataTable
  /** Shared popup menu — one instance reused across all rows (same pattern as Facilities) */
  @ViewChild('rowMenu') rowMenu!: Menu
  /** Column selector multiSelect — called .hide() on any selection change */
  @ViewChild('colMs') colMs?: MultiSelect
  /** Items currently bound to the shared popup menu */
  rowMenuItems: MenuItem[] = []
  /** Pre-translated tooltip for the row actions button — set after translations load */
  actionsTooltip = 'buttons.actions'

  // ── State (granular signals) ──────────────────────────────────────────────
  receivings  = signal<ReceivingListItem[]>([])
  loading     = signal(true)
  error       = signal<unknown>(null)
  selected    = signal<ReceivingListItem[]>([])

  dto = signal<ReceivingListRequest>({ ...DEFAULT_DTO, config: { ...DEFAULT_DTO.config } })

  pagination = signal<ShPaginationConfig>({
    page: 1,
    limit: 15,
    total: 0,
    rows_per_page: [15, 30, 50, 100],
  })

  readonly statusMap = RECEIVING_STATUS_MAP

  // ── Filter chips ──────────────────────────────────────────────────────────
  activeFilters = signal<ActiveFilterChip[]>([])
  protected activeRawFilters: Record<string, any> = {}
  /** Staged values for text inputs — committed to the API only on Enter */
  protected filterBuffer: Record<string, string> = {}

  // ── Facility lookup ───────────────────────────────────────────────────────
  facilities = signal<FacilityItem[]>([])
  /**
   * Options offered by the facility column filter.
   *
   * Sourced from the global topbar scope rather than from `facilities()`, so a
   * user can never filter this column for a facility the global selector has
   * excluded. `inScope()` falls back to every facility when the scope is
   * "all", which is the pre-selector behaviour.
   *
   * `facilities()` is deliberately left alone: it still backs name lookups and
   * the dialogs, which must resolve/offer facilities regardless of scope.
   */
  facilityFilterOptions = computed(() => this.facilityScope.inScope())
  facilityMap = computed(() => {
    const map = new Map<string, string>()
    for (const f of this.facilities()) map.set(f.id, f.name)
    return map
  })
  // ── Supplier lookup (column filter + chips) ─────────────────────────────────
  private readonly supplierSvc = inject(SupplierService)
  /** Every supplier of the operator (active or not) — options of the supplier column filter. */
  supplierFilterOptions = signal<Array<{ id: string; name: string }>>([])
  private supplierMap = computed(() => new Map(this.supplierFilterOptions().map(s => [s.id, s.name])))

  /** Committed selected facility IDs for the multiselect panel */
  facilityFilter = signal<string[]>([])

  /** Companies of the operator — the CSV import needs one, a receiving belongs to it. */
  companies = signal<CompanyItem[]>([])

  private readonly fieldLabelMap: Record<string, string> = {
    status:           'labels.status',
    facility_id:      'labels.facility',
    supplier_id:      'labels.supplier',
    doc_number:       'labels.doc_number',
    doc_type:         'labels.doc_type',
    created_at:       'labels.created_at',
    expected_arrival: 'labels.expected_arrival',
    finished_at:      'labels.delivery_date',
  }

  // ── Column definitions ────────────────────────────────────────────────────
  columnDefs: ShColumnDef[] = [
    {
      // API filter: status (multiselect) | API sort: status
      field: 'status',
      header: 'labels.status',
      width: '10rem',
      template: 'status',
      sortable: true,
      filterable: true,
      filterType: 'multiselect',
      filterOptions: [
        { label: 'inbound.status_in_transit',   value: 'IN-TRANSIT' },
        { label: 'inbound.status_in_warehouse', value: 'IN-WAREHOUSE' },
        { label: 'inbound.status_processing',   value: 'PROCESSING' },
        { label: 'inbound.status_complete',     value: 'COMPLETE' },
        { label: 'inbound.status_discrepancy',  value: 'DISCREPANCY' },
        { label: 'inbound.status_cancelled',    value: 'CANCELLED' },
      ],
      exportValue: (row: ReceivingListItem) => this.statusLabel(row.status),
    },
    // API filter: facility_id (text) | API sort: facility_id
    { field: 'facility_id',     header: 'labels.facility',          width: '12rem', sortable: true, filterable: true, filterType: 'text', template: 'facility', exportValue: (row: ReceivingListItem) => this.facilityName(row.facility_id) },
    // API filter: supplier_id (multiselect "in") | not sortable (the API sorts by uuid)
    { field: 'supplier_id',     header: 'labels.supplier',          width: '14rem', sortable: false, filterable: true, filterType: 'multiselect', template: 'supplier', exportValue: (row: ReceivingListItem) => row.supplier_name ?? '' },
    // API filter: doc_number (text) | API sort: doc_number
    { field: 'doc_number',      header: 'labels.doc_number',        width: '14rem', sortable: true, filterable: true, filterType: 'text', template: 'doc_number' },
    // tracking / expected arrival / delivery / qty
    { field: 'external_ref',    header: 'labels.tracking_number',   width: '12rem', sortable: true, filterable: true, filterType: 'text', template: 'tracking' },
    { field: 'expected_arrival',header: 'labels.expected_arrival',  width: '13rem', sortable: true, filterable: true, filterType: 'date', template: 'expected_arrival' },
    // delivery_date uses 'finished_at' as field so the backend sort hits r.finished_at (in columnMap)
    { field: 'finished_at',     header: 'labels.delivery_date',     width: '13rem', sortable: true, filterable: true, filterType: 'date', template: 'delivery_date' },
    { field: 'qty_expected_sum', header: 'labels.expected_qty',     width: '10rem', sortable: true, filterable: true, filterType: 'text', template: 'expected_qty' },
    { field: 'qty_received_sum', header: 'labels.received_qty',     width: '10rem', sortable: true, filterable: true, filterType: 'text', template: 'received_qty' },
    // API sort-only fields (not rendered as columns, just available for sorting)
    { field: 'operator_id',     header: 'labels.operator',          width: '0',     sortable: true, visible: false },
    { field: 'created_at',      header: 'labels.created_at',        width: '0',     sortable: true, visible: false },
  ]

  selectedCols: ShColumnDef[] = this.columnDefs.filter(c => c.visible !== false)

  /** Column defs with pre-translated label — used by multiSelect so search works in any language */
  translatedColumnDefs: (ShColumnDef & { translatedHeader: string })[] = []

  /** filterOptions with pre-translated labels — used by status multiselect so search works in any language */
  translatedFilterOptionsMap: Record<string, { label: string; value: any }[]> = {}

  private buildTranslatedColumns(): void {
    this.translatedColumnDefs = this.columnDefs
      .filter(col => col.visible !== false)
      .map(col => ({
        ...col,
        translatedHeader: this.translate.instant(col.header),
      }))
    this.selectedCols = this.translatedColumnDefs.filter(def =>
      this.selectedCols.some(s => s.field === def.field)
    )
    // Pre-translate filterOptions so p-multiSelect search works in any language
    this.translatedFilterOptionsMap = {}
    for (const col of this.columnDefs) {
      if (col.filterOptions?.length) {
        this.translatedFilterOptionsMap[col.field] = col.filterOptions.map((opt: any) => ({
          ...opt,
          label: this.translate.instant(opt.label),
        }))
      }
    }
    this.cdr.markForCheck()
  }

  onColumnSelectionChange(cols: (ShColumnDef & { translatedHeader?: string })[]): void {
    const prevFields = new Set(this.selectedCols.map(c => c.field))
    this.selectedCols = this.translatedColumnDefs.filter(def =>
      cols.some(c => c.field === def.field)
    )
    const newFields = new Set(this.selectedCols.map(c => c.field))
    const removedFields = [...prevFields].filter(f => !newFields.has(f))
    if (removedFields.length > 0) this.clearFiltersForHiddenColumns(removedFields)
    this.colMs?.hide()
  }

  /** Clears filter state for columns that were just hidden by the user. */
  private clearFiltersForHiddenColumns(removedFields: string[]): void {
    let changed = false
    const filters = { ...this.activeRawFilters }
    for (const field of removedFields) {
      if (field in filters) { delete filters[field]; changed = true }
      delete this.filterBuffer[field]
      if (field === 'facility_id') this.facilityFilter.set([])
    }
    if (!changed) return
    this.activeRawFilters = filters
    this.buildFilterChips(filters)
    this.baseTable?.clearFiltersForFields(removedFields)
    const filter: Record<string, any> = Object.create(null)
    for (const [f, val] of Object.entries(filters)) {
      const v = val?.value
      const empty = v === null || v === undefined || v === '' ||
                    (Array.isArray(v) && v.length === 0)
      if (!empty) filter[f] = { value: v, match_mode: val.matchMode ?? 'contains', ...presetCombinator(val) }
    }
    this.dto.update(d => ({ ...d, config: { ...d.config, page: 1 }, filter }))
    this.saveState()
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────
  bulkActions: ShActionItem[] = [
    {
      label: this.translate.instant('buttons.archive'),
      icon: 'pi pi-inbox',
      command: () => this.archiveSelected(),
    },
  ]

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor() {
    effect(() => {
      this.translate.use(this.translateLan.changeLanguage())
    })

    // Restore persisted state BEFORE the first effect run triggers load()
    this.restoreSavedState()
  
    // Reactively reload whenever dto changes (filter / sort / page)
    effect(() => {
      this.dto()  // track signal
      untracked(() => this.load())
    })

    // Restore active preset color when navigating back to this page
    effect(() => {
      const presets = this.filterPresetService.presets()
      const lastId = this.filterPresetService.lastAppliedPresetId()
      if (presets.length > 0 && lastId) {
        const active = presets.find(p => p.id === lastId)
        if (active) {
          this.activePresetColor.set(active.color ?? null)
          this.activePresetName.set(active.name)
        }
      }
    })
  }

  /** Restores persisted filters, sort and page from table state storage. */
  private restoreSavedState(): void {
    const saved = this.tableState.load(this.STATE_KEY)
    if (!saved?.filters || Object.keys(saved.filters).length === 0) return

    // ── Security: only restore fields that are known column fields.
    // This prevents localStorage tampering from injecting arbitrary filter keys.
    const knownFields = new Set(this.columnDefs.map(c => c.field))
    const rawFilters = saved.filters as Record<string, any>
    this.activeRawFilters = Object.fromEntries(
      Object.entries(rawFilters).filter(([field]) => knownFields.has(field))
    )

    const filter = this.buildRestoredApiFilter(this.activeRawFilters)
    this.dto.update(d => ({
      ...d,
      filter,
      config: {
        ...d.config,
        ...(saved.page ? { page: saved.page } : {}),
        ...(saved.sort ? { sort_field: [{ field: saved.sort.field, order: saved.sort.order === 'asc' ? 1 : -1 }] } : {}),
      },
    }))
    if (saved.page) this.pagination.update(p => ({ ...p, page: saved.page! }))
    // Seed the text-input buffer so inputs display the restored values.
    // Only seed fields that are known columns (extra safety after the filter above).
    this.seedFilterBuffer(this.activeRawFilters)
    // Restore multiselect signals so filter panels show the correct selection
    const facilityVal = this.activeRawFilters['facility_id']?.value
    if (Array.isArray(facilityVal) && facilityVal.length > 0) {
      this.facilityFilter.set(facilityVal)
    }
  }

  private buildRestoredApiFilter(rawFilters: Record<string, any>): Record<string, any> {
    const filter: Record<string, any> = Object.create(null)
    for (const [field, val] of Object.entries(rawFilters)) {
      const v = val?.value
      if (v !== null && v !== undefined && v !== '') {
        filter[field] = { value: v, match_mode: val.matchMode ?? 'contains', ...presetCombinator(val) }
      }
    }
    return filter
  }

  private seedFilterBuffer(rawFilters: Record<string, any>): void {
    for (const [field, val] of Object.entries(rawFilters)) {
      const v = val?.value
      if (v !== null && v !== undefined && v !== '' && !Array.isArray(v)) {
        this.filterBuffer[field] = String(v)
      }
    }
  }

  ngOnInit(): void {
    // Build translated column labels once translations are loaded on startup.
    // takeUntilDestroyed ensures the subscription is cleaned up when the component
    // is destroyed (avoids callback firing on a dead component instance).
    this.translate.get(this.columnDefs.map(c => c.header))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.buildTranslatedColumns()
        this.actionsTooltip = this.translate.instant('buttons.actions')
      })
    // Rebuild whenever the language changes — cleaned up automatically on destroy.
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.buildTranslatedColumns()
        this.actionsTooltip = this.translate.instant('buttons.actions')
      })
    // Build filter chips for visual state after restore
    if (Object.keys(this.activeRawFilters).length > 0) {
      this.buildFilterChips(this.activeRawFilters)
    }
    this.filterPresetService.loadPresets(this.PRESET_PAGE_KEY)
    this.loadSupplierOptions()
  }

  /** Suppliers for the column filter. A user without access to suppliers just gets no options. */
  private loadSupplierOptions(): void {
    this.supplierSvc
      .list({ filter: {}, config: { page: 1, rows: 200, sort_field: [{ field: 'name', order: 1 }] } })
      .subscribe({
        next: res => {
          const many = new Set((res.data ?? []).map(s => s.company_id)).size > 1
          this.supplierFilterOptions.set(
            (res.data ?? []).map(s => ({ id: s.id, name: many && s.company_name ? `${s.name} · ${s.company_name}` : s.name }))
          )
          this.buildFilterChips(this.activeRawFilters)
        },
        error: () => this.supplierFilterOptions.set([]),
      })
  }

  private saveState(): void {
    const cfg = this.dto().config
    const sf  = cfg.sort_field?.[0]
    const sortOrder: 'asc' | 'desc' = sf?.order === 1 ? 'asc' : 'desc'
    const stateToSave = {
      filters: this.activeRawFilters as Record<string, unknown>,
      page:    cfg.page,
      sort:    sf ? { field: sf.field, order: sortOrder } : undefined,
    }
    console.log('%c[Receivings] saveState() called', 'color:#10b981;font-weight:bold', stateToSave)
    this.tableState.save(this.STATE_KEY, stateToSave)
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  load(): void {
    this.loading.set(true)
    this.svc
      .listReceivings({
        ...this.dto(),
        filter: scopeApiFilter(facilityDayFilters(this.dto().filter ?? {}), this.facilityScope.apiValue(), { scopeField: FACILITY_SCOPE_FIELD }),
      })
      .subscribe({
      next: (resp: ReceivingListResponse) => {
        this.receivings.set(resp.data ?? [])
        // Capture the embedded facilities array for name resolution
        if (resp.facilities?.length) {
          this.facilities.set(resp.facilities)
          // Re-build chips now that facilityMap() has data — fixes the timing issue
          // where chips built in ngOnInit() show IDs because facilities weren't loaded yet
          this.buildFilterChips(this.activeRawFilters)
        }
        this.pagination.set({
          page:          resp.meta_data.page,
          limit:         resp.meta_data.rows,
          total:         resp.meta_data.total_records,
          rows_per_page: [15, 30, 50, 100],
        })
        this.loading.set(false)
        this.error.set(null)
      },
      error: (err: unknown) => {
        this.error.set(err)
        this.loading.set(false)
      },
    })
  }

  // ── Table state change ────────────────────────────────────────────────────

  onTableStateChange(event: ShTableEvent): void {
    // The global facility selector moved: drop our own copy of the facility
    // filter too, or it survives here and re-enters the request once the scope
    // is released — with no column filter left to reveal it.
    if (event.facilityScopeChanged) {
      this.activeRawFilters = dropFacilityFilters(this.activeRawFilters)
    }

    const rawFilters = event.filters ?? {}
    this.activeRawFilters = rawFilters
    // Keep facilityFilter signal in sync when BaseDataTable emits a sort/page event
    const fVal = rawFilters['facility_id']?.value
    if (Array.isArray(fVal)) {
      this.facilityFilter.set(fVal)
    } else if (!fVal) {
      this.facilityFilter.set([])
    }
    this.buildFilterChips(rawFilters)

    const filter: Record<string, any> = toApiFilter(rawFilters, Object.create(null))

    this.dto.set({ config: toListConfig(event), filter })
    this.saveState()
  }

  clearFilters(): void {
    this.tableState.clear(this.STATE_KEY)
    this.activeRawFilters = {}
    this.filterBuffer = {}
    this.facilityFilter.set([])
    this.activeFilters.set([])
    this.activePresetColor.set(null)
    this.activePresetName.set(null)
    this.filterPresetService.clearLastApplied()
    this.baseTable?.clearSort()
    this.dto.set({ ...DEFAULT_DTO, config: { ...DEFAULT_DTO.config } })
  }

  onPresetSelected(preset: FilterPreset): void {
    this.activePresetColor.set(preset.color ?? null)
    this.activePresetName.set(preset.name)
    this.activeRawFilters = buildFiltersFromConditions(preset.conditions ?? [])
    this.facilityFilter.set(this.activeRawFilters['facility_id']?.value ?? [])
    // The table re-emits its own column filters on page/sort changes and they
    // replace activeRawFilters: give it the preset's, or paging drops them.
    this.baseTable?.columnFilters.set({ ...this.activeRawFilters })
    this.buildFilterChips(this.activeRawFilters)
    // Build API filter from conditions
    this.applyActiveFiltersFromFirstPage()
  }

  removeFilterChip(field: string): void {
    delete this.activeRawFilters[field]
    // Also clear the text-input buffer so the input visually empties
    delete this.filterBuffer[field]
    // Keep multiselect signals in sync
    if (field === 'facility_id') this.facilityFilter.set([])
    this.baseTable?.columnFilters.set({ ...this.activeRawFilters })
    this.buildFilterChips(this.activeRawFilters)
    this.applyActiveFiltersFromFirstPage()
    this.saveState()
  }

  /** Pushes the active raw filters to the request and goes back to page 1. */
  private applyActiveFiltersFromFirstPage(): void {
    const filter: Record<string, any> = toApiFilter(this.activeRawFilters)
    this.dto.update(d => ({
      ...d,
      config: { ...d.config, page: 1 },
      filter,
    }))
  }

  /**
   * Apply handler for the facility FilterMultiselectPanelComponent.
   * Commits values and triggers API filter.
   */
  onMultiselectApply(field: string, values: any[]): void {
    if (field === 'facility_id') this.facilityFilter.set(values)
    this.onColumnFilterChange(field, values?.length ? values : null)
  }

  /**
   * Clear handler for the facility FilterMultiselectPanelComponent.
   */
  onMultiselectClear(field: string): void {
    if (field === 'facility_id') this.facilityFilter.set([])
    this.onColumnFilterChange(field, null)
  }

  getActiveFilterValue(field: string): any {
    return this.activeRawFilters[field]?.value ?? null
  }

  getActiveFilterMatchMode(field: string): string | null {
    return this.activeRawFilters[field]?.matchMode ?? null
  }

  /**
   * Buffers the current text-input value locally.
   * Fires immediately if the value is cleared so the filter is removed without requiring Enter.
   */
  onTextFilterBuffer(field: string, value: string): void {
    // Security: only accept writes for known column fields to prevent
    // an attacker-controlled input from polluting the filterBuffer object.
    const knownFields = new Set(this.columnDefs.map(c => c.field))
    if (!knownFields.has(field)) return

    this.filterBuffer[field] = value
    // Auto-clear the filter when the user empties the input
    if (!value || value.trim() === '') {
      this.onColumnFilterChange(field, null)
    }
  }

  /**
   * Commits the buffered text value and fires the API filter.
   * Bound to (keydown.enter) on text filter inputs.
   */
  applyTextFilter(field: string): void {
    const value = this.filterBuffer[field] ?? ''
    this.onColumnFilterChange(field, value || null)
  }

  onColumnFilterChange(field: string, value: any): void {
    // Security: reject unknown fields to prevent prototype pollution via field name
    const knownFields = new Set(this.columnDefs.map(c => c.field))
    if (!knownFields.has(field)) {
      console.warn('[Receivings] Rejected unknown filter field:', field)
      return
    }

    console.log('%c[Receivings] onColumnFilterChange()', 'color:#6366f1', field, '=', value)
    const filters = { ...this.activeRawFilters }
    const isEmpty = value === null || value === undefined || value === '' ||
                    (Array.isArray(value) && value.length === 0)
    if (isEmpty) {
      delete filters[field]
    } else {
      // Date filter emits { value, matchMode } — extract if present
      let matchMode: string
      let filterValue = value
      if (value && typeof value === 'object' && 'matchMode' in value) {
        matchMode = value.matchMode
        filterValue = value.value
      } else {
        matchMode = Array.isArray(value) ? 'in' : 'contains'
      }
      filters[field] = { value: filterValue, matchMode }
    }
    this.activeRawFilters = filters
    this.baseTable?.columnFilters.set(filters)
    this.buildFilterChips(filters)

    const filter: Record<string, any> = Object.create(null)
    for (const [f, val] of Object.entries(filters)) {
      const v = val?.value
      const empty = v === null || v === undefined || v === '' ||
                    (Array.isArray(v) && v.length === 0)
      if (!empty) {
        filter[f] = { value: v, match_mode: val.matchMode ?? 'contains', ...presetCombinator(val) }
      }
    }
    this.dto.update(d => ({
      ...d,
      config: { ...d.config, page: 1 },
      filter,
    }))
    this.saveState()
  }

  private buildFilterChips(filters: Record<string, any>): void {
    const chips: ActiveFilterChip[] = []
    for (const field of Object.keys(filters)) {
      const f = filters[field]
      if (f?.value === null || f?.value === undefined || f?.value === '') continue
      const labelKey = this.fieldLabelMap[field] || field
      const label    = this.translate.instant(labelKey)
      const raw      = f.value
      let displayValue: string
      if (Array.isArray(raw)) {
        if (field === 'facility_id') {
          // Resolve UUIDs to facility names — falls back to first-8 chars if not yet loaded
          displayValue = (raw as string[])
            .map(id => this.facilityMap().get(id) ?? id.substring(0, 8))
            .join(', ')
        } else if (field === 'supplier_id') {
          displayValue = (raw as string[])
            .map(id => this.supplierMap().get(id) ?? id.substring(0, 8))
            .join(', ')
        } else {
          const colDef = this.columnDefs.find(c => c.field === field)
          displayValue = raw
            .map(v => {
              const opt = colDef?.filterOptions?.find((o: any) => o.value === v)
              return opt ? this.translate.instant(opt.label) : String(v)
            })
            .join(', ')
        }
      } else {
        displayValue = String(raw)
      }
      chips.push({ field, label, displayValue })
    }
    this.activeFilters.set(chips)
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  /** Only COMPLETE and DISCREPANCY receivings can be selected */
  readonly isRowSelectable = (row: ReceivingListItem): boolean => {
    const s = (row.status || '').toLowerCase();
    return s === 'complete' || s === 'discrepancy' || s === 'cancelled';
  };

  onSelectionChange(rows: ReceivingListItem[]): void {
    this.selected.set(rows)
  }

  // ── Row actions ───────────────────────────────────────────────────────────

  /** Opens the shared popup menu for a row — same pattern as Facilities */
  openRowMenu(event: Event, row: ReceivingListItem): void {
    this.rowMenuItems = []
    const actions = this.getRowActions(row)
    for (const a of actions) {
      if (a.separator) {
        this.rowMenuItems.push({ separator: true })
      }
      this.rowMenuItems.push({
        label:      this.translate.instant(a.label),
        icon:       a.icon,
        disabled:   a.disabled,
        command:    a.command,
        styleClass: a.severity === 'danger' ? 'text-red-500' : '',
      })
    }
    this.rowMenu?.toggle(event)
  }

  getRowActions(row: ReceivingListItem): ShActionItem[] {
    const actions: ShActionItem[] = [
      {
        label: this.translate.instant('buttons.details'),
        icon: 'pi pi-eye',
        command: () => this.goDetails(row),
      },
    ]
    // Receive goods into a location — only once the receiving is on site
    if (row.status === 'IN-WAREHOUSE' || row.status === 'PROCESSING') {
      actions.push({
        label: this.translate.instant('inbound.receive'),
        icon: 'pi pi-download',
        command: () => this.goReceive(row),
      })
    }
    // Edit, Start (IN-TRANSIT → IN-WAREHOUSE) and Cancel — only for IN-TRANSIT receivings
    if (row.status === 'IN-TRANSIT') {
      actions.push({
        label: this.translate.instant('buttons.edit'),
        icon: 'pi pi-pencil',
        command: () => this.openEdit(row),
      })
      actions.push({
        label: this.translate.instant('inbound.start'),
        icon: 'pi pi-play',
        command: () => this.confirmStart(row),
      })
      actions.push({
        label: this.translate.instant('buttons.cancel'),
        icon: 'pi pi-times',
        severity: 'danger',
        separator: true,
        command: () => this.confirmCancel(row),
      })
    }
    if (row.status === 'COMPLETE' || row.status === 'DISCREPANCY' || row.status === 'CANCELLED') {
      actions.push({
        label: this.translate.instant('buttons.archive'),
        icon: 'pi pi-inbox',
        separator: true,
        command: () => this.confirmArchive([row]),
      })
    }
    return actions
  }

  goReceive(row: ReceivingListItem): void {
    this.router.navigate(['app/inbound/processing', row.id])
  }

  goDetails(row: ReceivingListItem): void {
    this.router.navigate(['app/inbound/details', row.id])
  }

  // ── Create ────────────────────────────────────────────────────────────────

  showCreateDialog = signal(false)
  /** Row being edited — null while the dialog is in create mode. */
  editingReceiving = signal<ReceivingListItem | null>(null)
  /** Facilities offered by the create dialog — same set the topbar scope allows. */
  createFacilities = computed(() => this.facilityScope.inScope())

  openCreate(): void {
    this.ensureCompanies()
    this.editingReceiving.set(null)
    this.showCreateDialog.set(true)
  }

  openEdit(row: ReceivingListItem): void {
    this.ensureCompanies()
    this.editingReceiving.set(row)
    this.showCreateDialog.set(true)
  }

  closeFormDialog(): void {
    this.showCreateDialog.set(false)
    this.editingReceiving.set(null)
  }

  onSaved(res: ReceivingResult): void {
    const wasEditing = !!this.editingReceiving()
    this.closeFormDialog()
    this.load()
    // A new receiving opens its detail; an edit stays on the list.
    if (!wasEditing) this.router.navigate(['app/inbound/details', res.receiving_id])
  }

  // ── Start ─────────────────────────────────────────────────────────────────

  confirmStart(row: ReceivingListItem): void {
    this.confirmationSvc.confirm({
      message: this.translate.instant('inbound.confirm_start_msg', { doc: row.doc_number }),
      header: this.translate.instant('inbound.confirm_start'),
      icon: 'pi pi-play',
      accept: () => {
        this.loading.set(true)
        this.svc.startReceiving(row.id).subscribe({
          next: () => {
            this.messageSvc.add({
              severity: 'success',
              summary: this.translate.instant('inbound.start_success'),
              life: 3000,
            })
            // On site → the next step is receiving the goods.
            this.goReceive(row)
          },
          error: () => {
            this.messageSvc.add({
              severity: 'error',
              summary: this.translate.instant('inbound.start_error'),
              life: 3000,
            })
            this.loading.set(false)
          },
        })
      },
    })
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

  confirmCancel(row: ReceivingListItem): void {
    this.confirmationSvc.confirm({
      message: this.translate.instant('inbound.confirm_cancel_msg'),
      header: this.translate.instant('inbound.confirm_cancel'),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger p-button-text',
      rejectButtonStyleClass: 'p-button-text',
      accept: () => {
        this.loading.set(true)
        this.svc.cancelReceiving(row.id).subscribe({
          next: () => {
            this.messageSvc.add({
              severity: 'success',
              summary: this.translate.instant('inbound.cancel_success'),
              life: 3000,
            })
            this.load()
          },
          error: () => {
            this.messageSvc.add({
              severity: 'error',
              summary: this.translate.instant('inbound.cancel_error'),
              life: 3000,
            })
            this.loading.set(false)
          },
        })
      },
    })
  }

  // ── Archive ───────────────────────────────────────────────────────────────

  /** Statuses that the backend allows to be archived */
  private readonly ARCHIVABLE_STATUSES: ReceivingStatus[] = ['COMPLETE', 'DISCREPANCY', 'CANCELLED']

  archiveSelected(): void {
    const archivable = this.selected().filter(
      r => this.ARCHIVABLE_STATUSES.includes(r.status)
    )
    if (archivable.length > 0) this.confirmArchive(archivable)
  }

  confirmArchive(rows: ReceivingListItem[]): void {
    this.confirmationSvc.confirm({
      message: this.translate.instant('inbound.confirm_archive_msg') + ' ' + rows.map(r => r.doc_number).join(', '),
      header:  this.translate.instant('inbound.confirm_archive'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.loading.set(true)
        const ids = rows.map(r => r.id)
        this.svc.archiveReceivings(ids).subscribe({
          next: (result: ArchiveReceivingResult) => {
            this.messageSvc.add({
              severity: 'success',
              summary: this.translate.instant('messages.success'),
              detail: `${result.archived} ${this.translate.instant('inbound.archived_success')}`,
              life: 3000,
            })
            this.selected.set([])
            this.baseTable?.clearSelection()
            this.load()
          },
          error: () => {
            this.messageSvc.add({
              severity: 'error',
              summary: this.translate.instant('messages.error'),
              detail: this.translate.instant('inbound.archive_error'),
              life: 3000,
            })
            this.loading.set(false)
          },
        })
      },
    })
  }

  /** Opens the bulk actions popup menu — triggered from the "Selected" button */
  onBulkActionsClick(event: Event): void {
    this.rowMenuItems = [
      {
        label: this.translate.instant('buttons.archive'),
        icon: 'pi pi-inbox',
        command: () => this.archiveSelected(),
      },
    ]
    this.rowMenu.toggle(event)
  }

  // ── Export ────────────────────────────────────────────────────────────────

  /**
   * Feeds the header's export menu: pages the receiving list with the dto the
   * table is using, so the file carries the active filters and sort — and every
   * matching record, not just the page on screen.
   */
  readonly fetchExportPage: ExportPageFetcher = (page, rows) => {
    const dto = this.dto()
    return this.svc
      .listReceivings({ ...dto, config: { ...dto.config, page, rows } })
      .pipe(
        map(resp => ({
          data:  resp.data ?? [],
          total: resp.meta_data.total_records,
        }))
      )
  }

  // ── Import ────────────────────────────────────────────────────────────────

  showImportDialog = signal(false)
  /** File type the dialog was opened for — By .csv or By .xlsx. */
  importFormat = signal<ImportFileFormat>('csv')

  /** Loads the company list the import dialog needs, once, on first open. */
  openImport(format: ImportFileFormat = 'csv'): void {
    this.importFormat.set(format)
    this.ensureCompanies()
    this.showImportDialog.set(true)
  }

  /** Loads the operator's companies once — shared by the import and create dialogs. */
  private ensureCompanies(): void {
    if (this.companies().length > 0) return
    this.svc.listCompanies().subscribe({
      next: resp => this.companies.set(resp.data ?? []),
      error: () => this.companies.set([]),
    })
  }

  /** New receivings landed, so the table has to catch up. */
  onImported(log: ImportLog): void {
    if (log.success_count > 0) this.load()
  }

  /** Opens the Upload Logs view on the log the user just produced. */
  goToUploadLogs(log?: ImportLog): void {
    this.router.navigate(['app/inbound/receivings/upload-logs'], {
      queryParams: log ? { log: log.id } : undefined,
    })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Translated status label — matches the badge text shown in the table */
  statusLabel(status: ReceivingStatus): string {
    const opt = this.columnDefs
      .find(c => c.field === 'status')
      ?.filterOptions?.find(o => o.value === status)
    return opt ? this.translate.instant(opt.label) : status
  }

  /** Resolve a facility UUID to its display name */
  facilityName(id: string | undefined | null): string {
    if (!id) return '—'
    return this.facilityMap().get(id) ?? id.substring(0, 8)
  }

  getProgress(row: ReceivingListItem): number {
    if (!row.products || row.products.length === 0) return 0
    const total    = row.products.reduce((s, p) => s + p.qty_expected, 0)
    const received = row.products.reduce((s, p) => s + p.qty_received, 0)
    if (total === 0) return 0
    return Math.round((received / total) * 100)
  }

  getStatusSeverity(status: ReceivingStatus): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    return (RECEIVING_STATUS_MAP[status.toLowerCase()] as any) ?? 'info'
  }

  getTotalExpected(row: ReceivingListItem): number {
    if (!row.products || row.products.length === 0) return 0
    return row.products.reduce((s, p) => s + (p.qty_expected ?? 0), 0)
  }

  getTotalReceived(row: ReceivingListItem): number {
    if (!row.products || row.products.length === 0) return 0
    return row.products.reduce((s, p) => s + (p.qty_received ?? 0), 0)
  }
}
