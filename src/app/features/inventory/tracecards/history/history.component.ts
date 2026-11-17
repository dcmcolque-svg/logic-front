import {
  Component,
  OnInit,
  HostListener,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core'
import { CommonModule, UpperCasePipe, Location } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { FilterApplyService } from '@/app/shared/components/filter-clear/filter-apply.service'

// PrimeNG
import { ButtonModule } from 'primeng/button'
import { CardModule } from 'primeng/card'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { ToastModule } from 'primeng/toast'
import { SkeletonModule } from 'primeng/skeleton'
import { TooltipModule } from 'primeng/tooltip'
import { TimelineModule } from 'primeng/timeline'
import { FieldsetModule } from 'primeng/fieldset'
import { DrawerModule } from 'primeng/drawer'
import { MultiSelectModule } from 'primeng/multiselect'
import { MessageService } from 'primeng/api'

// Shared
import { map } from 'rxjs'
import { BaseDataTable } from '@/app/shared/components/datatable/data-table/base-data-table.component'
import {
  BaseImportExportMenu,
  ExportPageFetcher,
} from '@/app/shared/components/import-export-menu/base-import-export-menu.component'
import { FilterTextInputComponent } from '@/app/shared/components/filter-text-input/filter-text-input.component'
import { FilterDateInputComponent } from '@/app/shared/components/filter-date-input/filter-date-input.component'
import {
  ShColumnDef,
  ShPaginationConfig,
  ShSortConfig,
  ShTableEvent,
  ActiveFilterChip,
} from '@/app/shared/types/table.types'
import { resolveIcon } from '@/app/shared/config/icon.registry'
import { BaseStatusBadge } from '@/app/shared/components/status/status-badge/base-status-badge.component'
import { KARDEX_ACTION_COLORS } from '@/app/shared/services/status-color.service'

// Domain
import { TracecardsService } from '../warehouse.service'
import {
  KardexFlowItem,
  KardexFlowFilter,
  KardexFlowDetailKind,
  MatchModel,
  TracecardItem,
} from '../types/warehouse.types'
import { CatalogService } from '@/app/features/inventory/catalog/catalog.service'
import {
  BackendFilters,
  safeFilterChips,
  toApiFilter,
  toApiSortField,
  withoutFilter,
} from '../shared/tracecards-filters.util'
import { ColumnFilterHost } from '../shared/column-filter-host'
import { provideTableColumns } from '@/app/shared/services/table-columns.bus'

/**
 * Fields the context card renders. A tracecard row supplies them all; a SKU
 * with no stock supplies only its own identity, so the rest come back empty.
 */
export type HistoryContext = Pick<
  TracecardItem,
  | 'facility_name'
  | 'location_code'
  | 'container_lpn'
  | 'zone_name'
  | 'tracecard'
  | 'description'
  | 'sku'
  | 'barcode'
  | 'image_path'
>

export type HistorySource = 'location' | 'bin' | 'tracecard' | 'sku'

interface ContextField {
  label: string
  value: string | null | undefined
}

/** Rows the context card shows for each history source, after the facility name. */
export function buildContextFields(item: HistoryContext, source: HistorySource): ContextField[] {
  const location = { label: 'labels.location', value: item.location_code }
  const zone = { label: 'labels.zone', value: item.zone_name || '—' }
  const description = { label: 'labels.description', value: item.description }
  const sku = { label: 'labels.sku', value: item.sku }
  const barcode = { label: 'labels.barcode', value: item.barcode || '—' }

  const bySource: Record<HistorySource, ContextField[]> = {
    location: [location, zone],
    bin: [location, { label: 'labels.container', value: item.container_lpn || '—' }, zone],
    tracecard: [{ label: 'labels.tracecard', value: item.tracecard }, description, sku, barcode],
    sku: [sku, description, barcode],
  }
  return [{ label: 'labels.facility_name', value: item.facility_name || '—' }, ...bySource[source]]
}

@Component({
  selector: 'app-tracecards-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UpperCasePipe,
    TranslateModule,
    ButtonModule,
    CardModule,
    TableModule,
    TagModule,
    ToastModule,
    SkeletonModule,
    TooltipModule,
    TimelineModule,
    FieldsetModule,
    DrawerModule,
    MultiSelectModule,
    BaseDataTable,
    BaseStatusBadge,
    BaseImportExportMenu,
    FilterTextInputComponent,
    FilterDateInputComponent,
  ],
  providers: [MessageService, provideTableColumns()],
  templateUrl: './history.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class HistoryComponent extends ColumnFilterHost implements OnInit {
  private readonly tracecardsService = inject(TracecardsService)
  private readonly catalogService = inject(CatalogService)
  private readonly route = inject(ActivatedRoute)
  private readonly location = inject(Location)
  private readonly translate = inject(TranslateService)
  private readonly filterService = inject(FilterApplyService)

  // Route param — the entity ID (kardex, location, container, or sku depending on source)
  entityId = ''
  // Facility of the row the history was opened from. A SKU is stocked in
  // several facilities, so without it the card and the table mix them.
  // Absent when opened from the catalog: the SKU history then spans them all.
  facilityId = ''

  // === History source (which column was clicked) ===
  historySource = signal<HistorySource>('tracecard')

  get pageTitle(): string {
    const titles: Record<string, string> = {
      location: 'pages.history_location',
      bin: 'pages.history_bin',
      tracecard: 'pages.history_kardex',
      sku: 'pages.history_sku',
    }
    return titles[this.historySource()] || 'pages.history_kardex'
  }

  /** transaction_type → color of the Action badge (table and timeline) */
  readonly actionColors = KARDEX_ACTION_COLORS

  // === State ===
  flowItems = signal<KardexFlowItem[]>([])
  /** The last load came back with an error, so `flowItems` says nothing. */
  readonly loadFailed = signal(false)

  /**
   * What Export would write, for the header's menu.
   *
   * The table disappears in the timeline view and the same events stay
   * exportable, so the menu cannot read the count off the table here — this
   * view has to say it. `null` — not zero, and not nothing — while the answer
   * is not in yet: zero would read as "nothing to export" and kill the button
   * over a request still in flight, or over one that failed, and leaving it
   * out would hand the question to a table that reports its own emptiness.
   */
  readonly exportableCount = computed<number | null>(() =>
    this.loading() || this.loadFailed() ? null : this.flowItems().length
  )
  loading = signal(false)
  contextLoading = signal(true)
  contextItem = signal<HistoryContext | null>(null)
  /** Label/value rows of the context card: facility, then the fields of the history source. */
  contextFields = computed(() => {
    const item = this.contextItem()
    return item ? buildContextFields(item, this.historySource()) : []
  })
  pagination = signal<ShPaginationConfig>({
    page: 1,
    limit: 15,
    total: 0,
    rows_per_page: [10, 15, 25, 50],
  })
  currentSort = signal<ShSortConfig | undefined>({
    field: 'created_at',
    order: 'desc',
  })
  currentFilters = signal<KardexFlowFilter>({})
  protected activeBackendFilters: BackendFilters = {}
  activeFilters = signal<ActiveFilterChip[]>([])

  // === View toggle (table vs timeline) ===
  showTimeline = signal(false)

  // === Detail drawer ===
  selectedFlowItem = signal<KardexFlowItem | null>(null)
  showDetailDrawer = signal(false)
  timelineAlign = signal<'alternate' | 'left'>(
    globalThis.window !== undefined && globalThis.window.innerWidth < 768 ? 'left' : 'alternate'
  )

  // === Column definitions (rebuilt after source is known) ===
  cols: ShColumnDef[] = []
  selectedColumns: ShColumnDef[] = []

  @HostListener('window:resize')
  onResize() {
    this.timelineAlign.set(window.innerWidth < 768 ? 'left' : 'alternate')
  }

  ngOnInit() {
    this.entityId = this.route.snapshot.paramMap.get('kardexId') || ''
    this.facilityId = this.route.snapshot.queryParamMap.get('facility') || ''
    const source = this.route.snapshot.queryParamMap.get('source') as any
    if (['location', 'bin', 'tracecard', 'sku'].includes(source)) {
      this.historySource.set(source)
    }
    // Build columns AFTER source is known
    this.cols = this.buildColumns()
    this.selectedColumns = [...this.cols]
    this.loadContextData()
    this.loadFlowData()
  }

  /**
   * Builds columns dynamically based on historySource.
   * Matches the monocompany column structure:
   *  - location/bin: Time Stamp, Number Event, Action, User, Tracecard, Sku, Qty Available, Qty Event
   *  - tracecard:    Time Stamp, Number Event, Action, User, Location,   Sku, Qty Available, Qty Event
   *  - sku:          Time Stamp, Number Event, Action, User, Tracecard,       Qty Available, Qty Event
   */
  buildColumns(): ShColumnDef[] {
    const base: ShColumnDef[] = [
      {
        field: 'created_at',
        header: 'labels.timestamp',
        sortable: true,
        filterable: true,
        filterType: 'date',
        width: '12rem',
        template: 'timestamp',
      },
      {
        field: 'event_code',
        header: 'labels.number_event',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '10rem',
        template: 'event_link',
        // The cell shows the event code, not the raw id, so the file must too.
        // Rows written before event_code existed fall back to the business
        // reference or a uuid, which the cell truncates and the export keeps
        // whole, since a cut id is no use for auditing.
        exportValue: (row: KardexFlowItem) => this.eventReferenceValue(row),
      },
      {
        field: 'transaction_type',
        header: 'labels.transaction_type',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '10rem',
        template: 'action',
      },
      {
        field: 'user_name',
        header: 'labels.user',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '10rem',
        template: 'user',
      },
    ]

    // Distinctive column(s) per source type
    const source = this.historySource()
    const locationCol = this.contextTextColumn('location_code', 'labels.location')
    const tracecardCol = this.contextTextColumn('tracecard', 'labels.tracecard')
    const skuCol = this.contextTextColumn('sku', 'labels.sku')
    if (source === 'tracecard') {
      // Tracecard history: show Location (tracecard is already in context)
      base.push(locationCol, skuCol)
    } else if (source === 'sku') {
      // SKU history: show Tracecard (sku is already in context)
      base.push(tracecardCol)
    } else {
      // Location / Bin history: show Tracecard + Sku
      base.push(tracecardCol, skuCol)
    }

    // Common tail columns
    base.push(
      {
        field: 'balance_after',
        header: 'labels.qty_available',
        sortable: true,
        filterable: true,
        filterType: 'numeric',
        width: '10rem',
        template: 'number',
      },
      {
        field: 'qty_change',
        header: 'labels.qty_event',
        sortable: true,
        filterable: true,
        filterType: 'numeric',
        width: '10rem',
        template: 'qty',
      },
    )

    return base
  }

  /** Text column for the entity shown alongside the history context (location, tracecard, sku). */
  private contextTextColumn(field: string, header: string): ShColumnDef {
    return {
      field,
      header,
      sortable: true,
      filterable: true,
      filterType: 'text',
      width: '10rem',
      template: 'text',
    }
  }

  // === Data loading ===

  /**
   * Loads context data by querying the tracecards list with the correct filter
   * field based on the history source type.
   */
  loadContextData() {
    this.contextLoading.set(true)

    // Build the filter based on source type
    const filter: any = this.buildEntityFilter('id')

    this.tracecardsService
      .listTracecards({
        filter,
        config: { page: 1, rows: 1 },
      })
      .subscribe({
        next: (res) => {
          const item = res.data?.[0] || null
          // A SKU that never moved has no kardex row, so this lookup comes back
          // empty and the header would vanish — fall back to the SKU record.
          if (!item && this.historySource() === 'sku') {
            this.loadSkuContext()
            return
          }
          this.contextItem.set(item)
          this.contextLoading.set(false)
        },
        error: () => {
          if (this.historySource() === 'sku') {
            this.loadSkuContext()
            return
          }
          this.contextLoading.set(false)
        },
      })
  }

  /**
   * Context for a SKU with no stock: read it from the catalog itself.
   * There is no facility to report — the card shows a dash for it.
   */
  private loadSkuContext() {
    this.catalogService.getSkuListItemById(this.entityId).subscribe({
      next: (sku) => {
        this.contextItem.set(
          sku
            ? {
                facility_name: '',
                location_code: '',
                container_lpn: null,
                zone_name: null,
                tracecard: '',
                // Same precedence the catalog list uses for its description column
                sku: sku.sku_code,
                description: sku.description || sku.product_description || sku.name || sku.sku_code,
                barcode: sku.barcode,
                image_path: sku.images?.[0] ?? null,
              }
            : null
        )
        this.contextLoading.set(false)
      },
      error: () => this.contextLoading.set(false),
    })
  }

  /** Source-specific filter (location / bin / sku / tracecard) for the flow list. */
  private buildPrimaryFilter(): KardexFlowFilter {
    return this.buildEntityFilter('kardex_id')
  }

  /**
   * Equality filter on the entity this history is about. A tracecard is keyed
   * by `tracecardField` (`id` on the tracecard list, `kardex_id` on the flow list).
   */
  private buildEntityFilter(tracecardField: 'id' | 'kardex_id'): Record<string, MatchModel> {
    const fieldBySource: Record<string, string> = {
      location: 'location_id',
      bin: 'container_id',
      sku: 'sku_id',
    }
    const field = fieldBySource[this.historySource()] ?? tracecardField
    const filter: Record<string, MatchModel> = { [field]: { match_mode: 'equals', value: this.entityId } }
    if (this.facilityId) {
      filter['facility_id'] = { match_mode: 'equals', value: this.facilityId }
    }
    return filter
  }

  /** File name for the export, so each history flavour lands in its own file. */
  get exportFilename(): string {
    return `history_${this.historySource()}`
  }

  /**
   * Feeds the header's export menu: pages the flow list with the same source
   * filter, column filters and sort the table is using.
   */
  /**
   * The request the flow list is made of: the source filter plus the column
   * filters. One definition for the table and the export.
   */
  private listRequest(page: number, rows: number) {
    return {
      filter: { ...this.buildPrimaryFilter(), ...this.currentFilters() },
      config: {
        page,
        rows,
        sort_field: toApiSortField(this.currentSort(), [{ field: 'created_at', order: -1 }]),
      },
    }
  }

  readonly fetchExportPage: ExportPageFetcher = (page, rows) =>
    this.tracecardsService
      .listKardexFlow(this.listRequest(page, rows))
      .pipe(map(res => ({ data: res.data || [], total: res.meta_data.total_records })))

  /**
   * Loads flow (history) data using the correct filter field
   * based on the history source type.
   */
  loadFlowData() {
    this.loading.set(true)
    this.loadFailed.set(false)
    const p = this.pagination()

    this.tracecardsService
      .listKardexFlow(this.listRequest(p.page, p.limit))
      .subscribe({
        next: (res) => {
          this.flowItems.set(res.data || [])
          this.pagination.update((prev) => ({
            ...prev,
            total: res.meta_data.total_records,
          }))
          this.loading.set(false)
        },
        error: () => {
          this.loadFailed.set(true)
          this.loading.set(false)
        },
      })
  }

  // === Events ===

  onTableStateChange(event: ShTableEvent) {
    this.pagination.set(event.pagination)
    if (event.sort) {
      this.currentSort.set(event.sort)
    }
    this.loadFlowData()
  }

  // === Filter methods (same pattern as warehouse.component.ts) ===

  clearFilters() {
    this.activeBackendFilters = {}
    this.activeFilters.set([])
    this.currentFilters.set({})
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadFlowData()
  }

  removeFilterChip(field: string): void {
    this.commitFilters(withoutFilter(this.activeBackendFilters, field))
  }

  /** Stores the column filters, refreshes chips and API filter, and reloads from page 1. */
  protected commitFilters(filters: BackendFilters) {
    this.activeBackendFilters = filters
    this.activeFilters.set(safeFilterChips(filters, this.cols, this.translate))
    this.currentFilters.set(toApiFilter<KardexFlowFilter>(filters))
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadFlowData()
  }

  toggleView() {
    this.showTimeline.update((v) => !v)
  }

  // === Detail drawer ===
  selectFlowItem(item: KardexFlowItem) {
    this.selectedFlowItem.set(item)
    this.showDetailDrawer.set(true)
  }

  closeDetail() {
    this.showDetailDrawer.set(false)
  }

  toggleSortOrder() {
    const current = this.currentSort()
    const newOrder = current?.order === 'asc' ? 'desc' : 'asc'
    this.currentSort.set({ field: 'created_at', order: newOrder })
    this.loadFlowData()
  }

  goBack() {
    this.location.back()
  }

  handleMissingImage(event: Event) {
    ;(event.target as HTMLImageElement).src = 'layout/images/kardex.png'
  }

  // === Helpers ===

  /** Action badge text: the raw code, uppercase and without underscores (LOT_EXPIR_CHANGE → LOT EXPIR CHANGE). */
  getActionCode(action: string): string {
    return (action || '').toUpperCase().replaceAll('_', ' ')
  }

  getEventIcon(action: string): string {
    return resolveIcon(action, 'pi-circle')
  }

  getEventColor(action: string): string {
    return KARDEX_ACTION_COLORS[action?.toLowerCase()] ?? '#007ec1'
  }

  /** Header label of the detail drawer, translated per transaction_type. */
  getActionLabel(action: string): string {
    const key = `kardex_flow.types.${action?.toUpperCase()}`
    const label = this.translate.instant(key)
    return label === key ? action || '—' : label
  }

  /**
   * Decides which reference-document section the drawer renders.
   * Driven by reference_doc_type (not transaction_type) because several
   * transaction types share the same document (OUTBOUND/CANCEL/PACK_SPLIT → OMS_ORDER).
   */
  getDetailKind(item: KardexFlowItem): KardexFlowDetailKind {
    switch (item.reference_doc_type?.toUpperCase()) {
      case 'RECEIVING':
        return 'receiving'
      case 'OMS_ORDER':
      case 'OMS_ORDER_LINE':
        return 'order'
      case 'INV_KARDEX':
        return 'move'
      case 'INV_ADJUSTMENT':
        return 'recount'
      default:
        return null
    }
  }

  /** For a move, the counterpart location is the destination on MOVE_OUT and the origin on MOVE_IN. */
  isMoveOut(item: KardexFlowItem): boolean {
    return item.transaction_type?.toUpperCase() === 'MOVE_OUT'
  }

  formatDate(dateStr: string | undefined | null): string {
    if (!dateStr) return '—'
    try {
      const d = new Date(dateStr)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    } catch {
      return dateStr
    }
  }

  formatTime(dateStr: string | undefined | null): string {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      const h = String(d.getHours()).padStart(2, '0')
      const m = String(d.getMinutes()).padStart(2, '0')
      const s = String(d.getSeconds()).padStart(2, '0')
      return `${h}:${m}:${s}`
    } catch {
      return ''
    }
  }

  formatDateTime(dateStr: string | undefined | null): string {
    if (!dateStr) return '—'
    try {
      const d = new Date(dateStr)
      const y = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const h = String(d.getHours()).padStart(2, '0')
      const m = String(d.getMinutes()).padStart(2, '0')
      const s = String(d.getSeconds()).padStart(2, '0')
      return `${y}-${mo}-${day} ${h}:${m}:${s}`
    } catch {
      return dateStr
    }
  }

  /**
   * Returns a business-friendly event reference for a flow item: the 12-char
   * event_code. Rows older than event_code fall back to shipment_number /
   * order_number, then to the raw id.
   */
  getEventReference(item: KardexFlowItem): string {
    return this.truncateUuid(this.eventReferenceValue(item))
  }

  /** Untruncated value behind getEventReference — what the export writes. */
  private eventReferenceValue(item: KardexFlowItem): string {
    return item.event_code || item.shipment_number || item.order_number || item.id
  }

  /**
   * Shortens a uuid for display. A business reference is shown whole — it is
   * what the reader recognizes — so only something that looks like a uuid is
   * cut. The file always carries the value in full.
   */
  truncateUuid(value: string | null | undefined): string {
    if (!value) return '—'
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    return isUuid ? value.substring(0, 8) + '…' : value
  }
}
