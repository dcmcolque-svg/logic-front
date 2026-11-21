import { facilityDayFilters } from '@/app/shared/utils/time-zone.util'
import { formatDisplayDate } from '@/app/shared/utils/display-format'
import { TagModule } from 'primeng/tag'
import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core'
import { Router } from '@angular/router'
import { forkJoin, map } from 'rxjs'
import { CommonModule, DecimalPipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { ChipModule } from 'primeng/chip'
import { MultiSelectModule } from 'primeng/multiselect'
import { ToastModule } from 'primeng/toast'
import { TooltipModule } from 'primeng/tooltip'
import { DrawerModule } from 'primeng/drawer'
import { BadgeModule } from 'primeng/badge'
import { Menu, MenuModule } from 'primeng/menu'
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api'
import { ConfirmDialogModule } from 'primeng/confirmdialog'

// Shared base components
import { BaseDataTable } from '@/app/shared/components/datatable/data-table/base-data-table.component'
import { LabelGeneratorDialog } from '@/app/shared/components'
import {
  BaseImportExportMenu,
  ExportPageFetcher,
} from '@/app/shared/components/import-export-menu/base-import-export-menu.component'

import { FilterMultiselectPanelComponent } from '@/app/shared/components/filter-multiselect-panel/filter-multiselect-panel.component'
import { FilterTextInputComponent } from '@/app/shared/components/filter-text-input/filter-text-input.component'
import { FilterPresetManagerComponent } from '@/app/shared/components/filter-preset-manager/filter-preset-manager.component'
import { FilterApplyService } from '@/app/shared/components/filter-clear/filter-apply.service'
import { FilterPresetService } from '@/app/shared/services/filter-preset.service'
import { FilterPreset, buildFiltersFromConditions } from '@/app/shared/types/filter-preset.types'

// Types
import {
  ShColumnDef,
  ShPaginationConfig,
  ShSortConfig,
  ShTableEvent,
  ActiveFilterChip,
} from '@/app/shared/types/table.types'

// Domain
import { TracecardsService } from './warehouse.service'
import {
  TracecardItem,
  TracecardFilter,
  Company,
  MoveResult,
  RecountResult,
  BlockResult,
  AppErrorBody,
} from './types/warehouse.types'
import { TracecardBlockDialogComponent } from './components/tracecard-block-dialog/tracecard-block-dialog.component'
import { TracecardMoveDialogComponent } from './components/tracecard-move-dialog/tracecard-move-dialog.component'
import { TracecardRecountDialogComponent } from './components/tracecard-recount-dialog/tracecard-recount-dialog.component'
import {
  Facility,
  OperationalCategory,
} from '@/app/features/preferences/locations/types/location.types'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { scopeApiFilter, dropFacilityFilters, FACILITY_SCOPE_FIELD } from '@/app/shared/utils/facility-scope.util'
import {
  BackendFilters,
  restoreActivePresetEffect,
  safeFilterChips,
  toApiFilter,
  toApiSortField,
  withMultiselectFilter,
  withoutFilter,
} from './shared/tracecards-filters.util'
import { ColumnFilterHost } from './shared/column-filter-host'
import { provideTableColumns } from '@/app/shared/services/table-columns.bus'
import { AuthService } from '@/app/core/services/auth.service'
import { CostingCurrency, formatCost, isOwnerRole } from '@/app/shared/utils/costing.util'

/**
 * TracecardsComponent — Inventory tracecards page.
 *
 * Follows the CatalogComponent orchestrator pattern:
 * - BaseDataTable handles rendering, pagination
 * - Shared filter components (FilterMultiselectPanel, FilterTextInput) in #filterRow
 * - Filter chips for active filter display
 * - Mobile filter drawer for responsive UX
 * - Column toggle in paginatorLeft slot
 * - Signals for all reactive state
 */
@Component({
  selector: 'app-tracecards',
  standalone: true,
  imports: [
    TagModule,
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    ChipModule,
    MultiSelectModule,
    ToastModule,
    TooltipModule,
    DrawerModule,
    BadgeModule,
    MenuModule,
    ConfirmDialogModule,
    DecimalPipe,
    TracecardMoveDialogComponent,
    TracecardRecountDialogComponent,
    TracecardBlockDialogComponent,
    BaseDataTable,
    LabelGeneratorDialog,
    BaseImportExportMenu,
    FilterMultiselectPanelComponent,
    FilterTextInputComponent,
    FilterPresetManagerComponent,
  ],
  providers: [MessageService, ConfirmationService, provideTableColumns()],
  templateUrl: './warehouse.component.html',
  styleUrl: './warehouse.component.scss',
})
export default class TracecardsComponent extends ColumnFilterHost implements OnInit {
  /** Global facility scope from the topbar selector. */
  private readonly facilityScope = inject(FacilityScopeService)
  private readonly tracecardsService = inject(TracecardsService)
  private readonly messageService = inject(MessageService)
  private readonly translate = inject(TranslateService)
  private readonly filterService = inject(FilterApplyService)
  private readonly filterPresetService = inject(FilterPresetService)
  private readonly router = inject(Router)
  private readonly auth = inject(AuthService)
  private readonly confirmation = inject(ConfirmationService)

  /** Costs are OWNER-only; the backend omits them for other roles too. */
  readonly isOwner = isOwnerRole(this.auth.getAuthUserInfo()?.role)

  readonly PRESET_PAGE_KEY = 'tracecards'
  activePresetColor = signal<string | null>(null)
  activePresetName = signal<string | null>(null)

  // Restore active preset color when navigating back to this page
  private readonly _restorePreset = restoreActivePresetEffect(
    this.filterPresetService,
    this.activePresetColor,
    this.activePresetName
  )

  // === Filter state (catalog/parcels pattern) ===
  activeFilters = signal<ActiveFilterChip[]>([])
  activeBackendFilters: Record<string, any> = {}

  /** Committed multiselect values for display/chip sync */
  companyFilter = signal<string[]>([])
  facilityFilter = signal<string[]>([])
  categoryFilter = signal<string[]>([])

  /** Controls mobile filter bottom drawer */
  showMobileFilters = signal(false)

  // === State ===
  tracecardItems = signal<TracecardItem[]>([])
  loading = signal(false)
  selectedItems = signal<TracecardItem[]>([])
  showLabelDialog = signal(false)

  // === Stock operations (move / recount) ===
  readonly rowMenu = viewChild<Menu>('rowMenu')
  rowMenuItems: MenuItem[] = []
  /** Row the open move/recount dialog acts on. */
  opItem = signal<TracecardItem | null>(null)
  showMoveDialog = signal(false)
  showRecountDialog = signal(false)
  showBlockDialog = signal(false)
  pagination = signal<ShPaginationConfig>({
    page: 1,
    limit: 15,
    total: 0,
    rows_per_page: [10, 15, 25, 50],
  })
  currentSort = signal<ShSortConfig | undefined>(undefined)
  currentFilters = signal<TracecardFilter>({})

  // Auxiliary data
  companies = signal<Company[]>([])
  facilities = signal<Facility[]>([])
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
  categories = signal<OperationalCategory[]>([])

  // === Column definitions ===
  cols: ShColumnDef[] = []
  selectedColumns: ShColumnDef[] = []

  private buildColumns(): ShColumnDef[] {
    return [
      {
        field: 'facility_name',
        header: 'labels.facility_name',
        sortable: true,
        filterable: true,
        filterType: 'multiselect',
        filterOptions: this.facilities().map((f) => ({
          label: f.name,
          value: f.id,
        })),
        width: '12rem',
        template: 'facility',
        mobileVisible: true,
      },
      {
        field: 'location_code',
        header: 'labels.location',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '12rem',
        template: 'location',
        mobileVisible: true,
      },
      {
        field: 'container_lpn',
        header: 'labels.container',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '12rem',
        template: 'container',
        mobileVisible: true,
      },
      {
        field: 'tracecard',
        header: 'labels.tracecard',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '12rem',
        template: 'tracecard',
        mobileVisible: true,
      },
      {
        field: 'category',
        header: 'labels.category',
        sortable: true,
        filterable: true,
        filterType: 'multiselect',
        filterOptions: this.categories().map((c) => ({
          label: c.code,
          value: c.code,
        })),
        width: '10rem',
        template: 'category',
        mobileVisible: true,
      },
      {
        field: 'image_path',
        header: 'labels.image',
        sortable: false,
        filterable: false,
        exportable: false,
        width: '5rem',
        template: 'image',
      },
      {
        field: 'sku',
        header: 'labels.sku',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '12rem',
        template: 'sku',
        mobileLabel: true,
        mobileVisible: true,
      },
      {
        field: 'barcode',
        header: 'labels.barcode',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '12rem',
        template: 'barcode',
      },
      {
        field: 'description',
        header: 'labels.description',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '20rem',
        template: 'description',
        mobileVisible: true,
      },
      {
        field: 'qty_on_hand',
        header: 'labels.quantity',
        sortable: true,
        filterable: true,
        filterType: 'numeric',
        width: '10rem',
        template: 'number',
      },
      {
        field: 'qty_reserved',
        header: 'labels.qty_processing',
        sortable: true,
        filterable: true,
        filterType: 'numeric',
        width: '10rem',
        template: 'number',
      },
      {
        field: 'qty_blocked',
        header: 'labels.qty_blocked',
        sortable: true,
        filterable: true,
        filterType: 'numeric',
        width: '10rem',
        template: 'number',
      },
      ...(this.isOwner
        ? [
            {
              // Average (AVERAGE) or the row's own cost (SPECIFIC)
              field: 'avg_cost',
              header: 'labels.unit_cost',
              sortable: true,
              width: '10rem',
              align: 'right' as const,
              template: 'cost',
              exportValue: (row: TracecardItem) => row.avg_cost ?? null,
            },
            {
              field: 'cost_value',
              header: 'labels.cost_value',
              sortable: true,
              width: '11rem',
              align: 'right' as const,
              template: 'cost',
              exportValue: (row: TracecardItem) => row.cost_value ?? null,
            },
          ]
        : []),
      {
        field: 'weight',
        header: 'labels.weight',
        sortable: true,
        filterable: true,
        filterType: 'numeric',
        width: '10rem',
        template: 'decimal',
      },
      {
        field: 'length',
        header: 'labels.length',
        sortable: true,
        filterable: true,
        filterType: 'numeric',
        width: '10rem',
        template: 'decimal',
      },
      {
        field: 'width',
        header: 'labels.width',
        sortable: true,
        filterable: true,
        filterType: 'numeric',
        width: '10rem',
        template: 'decimal',
      },
      {
        field: 'height',
        header: 'labels.height',
        sortable: true,
        filterable: true,
        filterType: 'numeric',
        width: '10rem',
        template: 'decimal',
      },
      {
        field: 'lot',
        header: 'labels.lot',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '10rem',
        template: 'lot',
      },
      {
        field: 'expir',
        header: 'labels.expir_date',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '10rem',
        template: 'expir',
      },
      {
        field: 'uom',
        header: 'labels.uom',
        sortable: true,
        filterable: true,
        filterType: 'numeric',
        width: '8rem',
        template: 'number',
      },
      {
        field: 'total_value',
        header: 'labels.total_value',
        sortable: true,
        filterable: true,
        filterType: 'numeric',
        width: '11rem',
        template: 'decimal',
      },
      /* {
        field: 'status',
        header: 'labels.status',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '9rem',
        template: 'status',
        mobileVisible: true,
      }, */
    ]
  }

  /**
   * Feeds the header's export menu: pages the tracecard list with the filters
   * and sort the table is using, so the file covers every matching record.
   */
  /**
   * The request the tracecard list is made of, global facility scope included.
   * The export used to skip the scope, so a table narrowed to one facility
   * still exported every other one. One definition keeps them together.
   */
  private listRequest(page: number, rows: number) {
    return {
      filter: scopeApiFilter(facilityDayFilters(this.currentFilters()), this.facilityScope.apiValue(), { scopeField: FACILITY_SCOPE_FIELD }),
      config: {
        page,
        rows,
        sort_field: toApiSortField(this.currentSort()),
      },
    }
  }

  readonly fetchExportPage: ExportPageFetcher = (page, rows) =>
    this.tracecardsService.listTracecards(this.listRequest(page, rows)).pipe(
      map((resp) => ({
        data: resp.data || [],
        total: resp.meta_data.total_records,
      }))
    )

  // === Lifecycle ===
  ngOnInit() {
    this.filterPresetService.loadPresets(this.PRESET_PAGE_KEY)
    this.loadAuxiliaryData()
    this.loadData()
  }

  // === Data loading ===
  loadData() {
    this.loading.set(true)

    this.tracecardsService
      .listTracecards(this.listRequest(this.pagination().page, this.pagination().limit))
      .subscribe({
        next: (resp) => {
          this.tracecardItems.set(resp.data || [])
          this.pagination.update((p) => ({
            ...p,
            total: resp.meta_data.total_records,
          }))
          this.refreshColumns()
          this.loading.set(false)
        },
        error: () => {
          this.loading.set(false)
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('messages.error'),
            detail: this.translate.instant('messages.load_error'),
          })
        },
      })
  }

  loadAuxiliaryData() {
    forkJoin({
      companies: this.tracecardsService.listCompanies({
        filter: {},
        config: { page: 1, rows: 500 },
      }),
      facilities: this.tracecardsService.listMyFacilities({
        filter: {},
        config: { page: 1, rows: 500 },
      }),
      categories: this.tracecardsService.listOperationalCategories({
        filter: {},
        config: { page: 1, rows: 500 },
      }),
    }).subscribe({
      next: (result) => {
        this.companies.set(result.companies.data || [])
        this.facilities.set(result.facilities.data || [])
        this.categories.set(result.categories.data || [])
        this.refreshColumns()
      },
    })
  }

  /** Rebuild column definitions — preserves user column selection (catalog pattern) */
  refreshColumns() {
    this.cols = this.buildColumns()
    if (this.selectedColumns.length === 0) {
      this.selectedColumns = this.cols
    } else {
      this.selectedColumns = this.selectedColumns.map((sc) => {
        const updated = this.cols.find((c) => c.field === sc.field)
        return updated || sc
      })
    }
  }

  // === Table events (catalog pattern) ===
  onTableStateChange(event: ShTableEvent) {
    // The global facility selector moved: drop our own copy of the facility
    // filter too, or it survives here and re-enters the request once the scope
    // is released — with no column filter left to reveal it.
    if (event.facilityScopeChanged) {
      this.activeBackendFilters = dropFacilityFilters(this.activeBackendFilters)
    }

    this.pagination.set(event.pagination)
    if (event.sort) {
      this.currentSort.set(event.sort)
    }

    const appliedFilter = event.filters
      ? this.filterService.applyFilterNew(event.filters, {})
      : {}

    const finalFilters = { ...appliedFilter, ...this.activeBackendFilters }
    this.buildFilterChips(finalFilters)

    this.currentFilters.set(this.buildApiFilter(finalFilters))
    this.loadData()
  }

  // === Filters ===
  clearFilters() {
    this.activeBackendFilters = {}
    this.companyFilter.set([])
    this.facilityFilter.set([])
    this.categoryFilter.set([])
    this.activeFilters.set([])
    this.currentFilters.set({})
    this.activePresetColor.set(null)
    this.activePresetName.set(null)
    this.filterPresetService.clearLastApplied()
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadData()
  }

  onPresetSelected(preset: FilterPreset): void {
    this.activePresetColor.set(preset.color ?? null)
    this.activePresetName.set(preset.name)
    this.activeBackendFilters = buildFiltersFromConditions(preset.conditions ?? [])
    this.companyFilter.set(this.activeBackendFilters['company_name']?.value ?? [])
    this.facilityFilter.set(this.activeBackendFilters['facility_name']?.value ?? [])
    this.categoryFilter.set(this.activeBackendFilters['category']?.value ?? [])
    if (preset.sort_field) {
      this.currentSort.set({ field: preset.sort_field, order: (preset.sort_order as 'asc' | 'desc') ?? 'asc' })
    } else {
      this.currentSort.set(undefined)
    }
    this.commitFilters(this.activeBackendFilters)
  }

  private buildApiFilter(filters?: BackendFilters): TracecardFilter {
    return toApiFilter<TracecardFilter>(filters, {
      company_name: 'company_id',
      facility_name: 'facility_id',
      category: 'category',
    })
  }

  // === Custom Filters (catalog pattern) ===

  onMultiselectApply(field: string, values: any[]) {
    this.setMultiselectValues(field, values)
    this.updateTableFilter(field, values)
  }

  onMultiselectClear(field: string) {
    this.setMultiselectValues(field, [])
    this.updateTableFilter(field, [])
  }

  private updateTableFilter(field: string, values: any[]) {
    this.commitFilters(withMultiselectFilter(this.activeBackendFilters, field, values))
  }

  removeFilterChip(field: string): void {
    this.setMultiselectValues(field, [])
    this.commitFilters(withoutFilter(this.activeBackendFilters, field))
  }

  /** Syncs the committed multiselect values shown by the company/facility/category filters. */
  private setMultiselectValues(field: string, values: string[]) {
    if (field === 'company_name') this.companyFilter.set(values)
    if (field === 'facility_name') this.facilityFilter.set(values)
    if (field === 'category') this.categoryFilter.set(values)
  }

  /** Stores the column filters, refreshes chips and API filter, and reloads from page 1. */
  protected commitFilters(filters: BackendFilters) {
    this.activeBackendFilters = filters
    this.buildFilterChips(filters)
    this.currentFilters.set(this.buildApiFilter(filters))
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadData()
  }

  private buildFilterChips(filters: BackendFilters): void {
    const resolvers: Record<string, (v: any) => string> = {
      company_name: (id: string) => this.companyName(id),
      facility_name: (id: string) => this.facilityName(id),
      category: (code: string) => code,
    }
    this.activeFilters.set(safeFilterChips(filters, this.cols, this.translate, resolvers))
  }

  /** Resolve a company UUID to its display name. */
  companyName(id: string | undefined | null): string {
    if (!id) return '—'
    const company = this.companies().find((c) => c.id === id)
    return company?.name || id.substring(0, 8)
  }

  /** Resolve a facility UUID to its display name. */
  facilityName(id: string | undefined | null): string {
    if (!id) return '—'
    const facility = this.facilities().find((f) => f.id === id)
    return facility?.name || id.substring(0, 8)
  }

  /** Status label in the user's language; an unknown status shows as sent. */
  statusLabel(status: string | null | undefined): string {
    if (!status) return '—'
    const key = `tracecard_ops.status.${status}`
    const label = this.translate.instant(key)
    return label === key ? status : label
  }

  statusSeverity(status: string | null | undefined): 'success' | 'danger' | 'warn' {
    if (status === 'AVAILABLE') return 'success'
    if (status === 'BLOCKED') return 'danger'
    return 'warn'
  }

  /** Lots expiring within this many days are flagged. */
  readonly EXPIRY_WARN_DAYS = 30

  /**
   * Days until a lot expires (negative once expired), counted on calendar days
   * in UTC — expir is a date-only value, read in UTC like formatDate does.
   */
  daysToExpiry(expir: string | null | undefined): number | null {
    if (!expir) return null
    const d = new Date(expir)
    if (Number.isNaN(d.getTime())) return null
    const now = new Date()
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    return Math.round((day - today) / 86_400_000)
  }

  /** Red once expired, orange within EXPIRY_WARN_DAYS, plain otherwise. */
  expiryClass(days: number | null): string {
    if (days === null) return ''
    if (days < 0) return 'font-semibold text-red-600 dark:text-red-400'
    if (days <= this.EXPIRY_WARN_DAYS) return 'text-orange-600 dark:text-orange-400'
    return ''
  }

  /** Format date string for display */
  formatDate(dateStr: string | undefined | null): string {
    if (!dateStr) return '—'
    // Used for expir, a date-only value: read and shown in UTC, or a
    // yyyy-mm-dd would show the previous day west of Greenwich.
    return formatDisplayDate(dateStr, 'date', 'UTC') || dateStr
  }

  // === Image fallback ===
  handleMissingImage(event: Event) {
    ; (event.target as HTMLImageElement).src =
      'https://cdn3d.iconscout.com/3d/premium/thumb/shipping-package-3d-icon-download-in-png-blend-fbx-gltf-file-formats--cardboard-box-delivery-pack-icons-6220845.png?f=webp'
  }

  // === Navigation ===
  navigateToHistory(row: TracecardItem, source: 'location' | 'bin' | 'tracecard' | 'sku' = 'tracecard') {
    let entityId: string
    switch (source) {
      case 'location':
        entityId = row.location_id
        break
      case 'bin':
        // The template only links rows that have a container
        entityId = row.container_id!
        break
      case 'sku':
        entityId = row.sku_id
        break
      case 'tracecard':
      default:
        entityId = row.id
        break
    }
    this.router.navigate(['/app/inventory/tracecards/history', entityId], {
      // The facility pins the history to this row: codes, SKUs and even ids
      // repeat across facilities.
      queryParams: { source, facility: row.facility_id },
    })
  }

  // === Stock operations ===

  /**
   * Opens the shared popup menu for a row. Items are built on open (not bound
   * per row) so the menu DOM stays stable while it is open.
   */
  openRowMenu(event: Event, row: TracecardItem): void {
    const blocked = row.status === 'BLOCKED'
    this.rowMenuItems = [
      {
        label: this.translate.instant('tracecard_ops.move_action'),
        icon: 'pi pi-arrow-right-arrow-left',
        disabled: blocked || row.qty_on_hand - row.qty_reserved <= 0,
        command: () => this.openOperation(row, 'move'),
      },
      {
        label: this.translate.instant('tracecard_ops.recount_action'),
        icon: 'pi pi-clipboard',
        disabled: blocked,
        command: () => this.openOperation(row, 'recount'),
      },
      blocked
        ? {
            label: this.translate.instant('tracecard_ops.unblock_action'),
            icon: 'pi pi-lock-open',
            command: () => this.confirmUnblock(row),
          }
        : {
            label: this.translate.instant('tracecard_ops.block_action'),
            icon: 'pi pi-lock',
            // The backend rejects blocking empty or reserved stock; reserved
            // rows still open the dialog so the user sees which orders hold it.
            disabled: row.qty_on_hand <= 0,
            command: () => this.openOperation(row, 'block'),
          },
      { separator: true },
      {
        label: this.translate.instant('labels.history'),
        icon: 'pi pi-history',
        command: () => this.navigateToHistory(row, 'tracecard'),
      },
    ]
    this.rowMenu()?.toggle(event)
  }

  private openOperation(row: TracecardItem, op: 'move' | 'recount' | 'block'): void {
    this.opItem.set(row)
    this.showMoveDialog.set(op === 'move')
    this.showRecountDialog.set(op === 'recount')
    this.showBlockDialog.set(op === 'block')
  }

  closeOperation(): void {
    this.showMoveDialog.set(false)
    this.showRecountDialog.set(false)
    this.showBlockDialog.set(false)
    this.opItem.set(null)
  }

  onBlocked(res: BlockResult): void {
    this.closeOperation()
    this.messageService.add({
      severity: 'success',
      summary: this.translate.instant('tracecard_ops.block_success'),
      detail: this.translate.instant('tracecard_ops.block_success_detail', { qty: res.qty_on_hand }),
      life: 4000,
    })
    this.loadData()
  }

  private confirmUnblock(row: TracecardItem): void {
    this.confirmation.confirm({
      header: this.translate.instant('tracecard_ops.unblock_title'),
      message: this.translate.instant('tracecard_ops.unblock_confirm', {
        tracecard: row.tracecard,
        qty: row.qty_on_hand,
      }),
      icon: 'pi pi-lock-open',
      acceptLabel: this.translate.instant('tracecard_ops.unblock_action'),
      rejectLabel: this.translate.instant('buttons.cancel'),
      rejectButtonStyleClass: 'p-button-text',
      accept: () => this.unblock(row),
    })
  }

  private unblock(row: TracecardItem): void {
    this.tracecardsService.unblock({ kardex_id: row.id }).subscribe({
      next: (res) => {
        this.messageService.add({
          severity: res.expired ? 'warn' : 'success',
          summary: this.translate.instant('tracecard_ops.unblock_success'),
          detail: res.expired
            ? this.translate.instant('tracecard_ops.unblock_expired', { expir: res.expir })
            : this.translate.instant('tracecard_ops.unblock_success_detail', { qty: res.qty_on_hand }),
          life: res.expired ? 8000 : 4000,
        })
        this.loadData()
      },
      error: (err) => {
        const body = ((err as { error?: AppErrorBody })?.error ?? err) as AppErrorBody
        // Non-422 v2 errors are already toasted by the error interceptor.
        if (body?.http_status && body.http_status !== 422) return
        const key = `errors.${body?.code}`
        const t = body?.code ? this.translate.instant(key) : ''
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('messages.error'),
          detail: t && t !== key ? t : body?.message,
          life: 5000,
        })
      },
    })
  }

  onMoved(res: MoveResult): void {
    this.closeOperation()
    this.messageService.add({
      severity: 'success',
      summary: this.translate.instant('tracecard_ops.move_success'),
      detail: this.translate.instant('tracecard_ops.move_success_detail', { qty: res.qty }),
      life: 4000,
    })
    this.loadData()
  }

  onRecounted(res: RecountResult): void {
    this.closeOperation()
    this.messageService.add({
      severity: 'success',
      summary: this.translate.instant('tracecard_ops.recount_success'),
      detail: this.translate.instant('tracecard_ops.recount_success_detail', {
        previous: res.qty_previous,
        current: res.qty_new,
      }),
      life: 4000,
    })
    this.loadData()
  }

  /** "Bs 10.67" — "—" when the facility does not cost. */
  costText(value: number | null | undefined, currency: CostingCurrency | null | undefined): string {
    if (value === null || value === undefined || !currency) return '—'
    return formatCost(value, currency)
  }
}
