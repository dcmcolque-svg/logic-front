import { Component, effect, inject, OnInit, signal, computed, ViewChild } from '@angular/core'
import { Router } from '@angular/router'
import { CommonModule } from '@angular/common'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { map } from 'rxjs'
import { ButtonModule } from 'primeng/button'
import { ChipModule } from 'primeng/chip'
import { MultiSelectModule } from 'primeng/multiselect'
import { ToastModule } from 'primeng/toast'
import { TooltipModule } from 'primeng/tooltip'
import { DrawerModule } from 'primeng/drawer'
import { PopoverModule } from 'primeng/popover'
import { BadgeModule } from 'primeng/badge'
import { MessageService, MenuItem } from 'primeng/api'
import { Menu, MenuModule } from 'primeng/menu'

// Shared components
import { BaseDataTable } from '@/app/shared/components/datatable/data-table/base-data-table.component'
import { BaseStatusBadge } from '@/app/shared/components/status/status-badge/base-status-badge.component'
import {
  BaseImportExportMenu,
  ExportPageFetcher,
} from '@/app/shared/components/import-export-menu/base-import-export-menu.component'
import { BaseImportDialog } from '@/app/shared/components/import-dialog/base-import-dialog.component'
import { ImportFileFormat, ImportLog } from '@/app/shared/types/import.types'
import { TableStateService } from '@/app/shared/services/table-state.service'

import { FilterMultiselectPanelComponent } from '@/app/shared/components/filter-multiselect-panel/filter-multiselect-panel.component'
import { FilterTextInputComponent } from '@/app/shared/components/filter-text-input/filter-text-input.component'
import { FilterDateInputComponent } from '@/app/shared/components/filter-date-input/filter-date-input.component'
import { FilterApplyService } from '@/app/shared/components/filter-clear/filter-apply.service'
import { FilterPresetManagerComponent } from '@/app/shared/components/filter-preset-manager/filter-preset-manager.component'
import { buildFilterChipsFromColumns } from '@/app/shared/utils/filter-chips.util'
import { formatDateForBackend } from '@/app/shared/utils/date.util'
import { FilterPresetService } from '@/app/shared/services/filter-preset.service'
import { FilterPreset, buildFiltersFromConditions, presetCombinator } from '@/app/shared/types/filter-preset.types'

// Sub-components
import { ParcelDetailDialogComponent } from './components/parcel-detail-dialog/parcel-detail-dialog.component'
import { ParcelUpdateCostumerDialogComponent } from './components/parcel-update-costumer-dialog/parcel-update-costumer-dialog.component'

// Types
import {
  ShColumnDef,
  ShPaginationConfig,
  ShSortConfig,
  ShTableEvent,
  ActiveFilterChip,
} from '@/app/shared/types/table.types'


// Domain
import { ParcelService } from './parcel.service'
import { Parcel, ParcelFilter,
  ParcelListRequest,
} from './types/parcel.types'

// Location service — for fetching facility names
import { LocationService } from '@/app/features/preferences/locations/location.service'
import { Facility } from '@/app/features/preferences/locations/types/location.types'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { NO_FACILITY_ID } from '@/app/core/types/facility.types'
import { scopeApiFilter, dropFacilityFilters, FACILITY_SCOPE_FIELD } from '@/app/shared/utils/facility-scope.util'
import { provideTableColumns } from '@/app/shared/services/table-columns.bus'

/**
 * ParcelsComponent — All Parcels listing page.
 *
 * Follows the LocationsComponent orchestrator pattern:
 * - BaseDataTable handles rendering, filtering, pagination
 * - ParcelService provides v2 API data access
 * - Sub-components handle detail views
 */
@Component({
  selector: 'app-parcels',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    ChipModule,
    MultiSelectModule,
    ToastModule,
    TooltipModule,
    DrawerModule,
    PopoverModule,
    BadgeModule,
    BaseDataTable,
    BaseStatusBadge,
    BaseImportExportMenu,
    BaseImportDialog,
    MenuModule,

    FilterMultiselectPanelComponent,
    FilterTextInputComponent,
    FilterDateInputComponent,
    ParcelDetailDialogComponent,
    ParcelUpdateCostumerDialogComponent,
    FilterPresetManagerComponent,
  ],
  providers: [MessageService, provideTableColumns()],
  templateUrl: './parcels.component.html',
  styleUrl: './parcels.component.scss',
})
export default class ParcelsComponent implements OnInit {
  /** Global facility scope from the topbar selector. */
  private readonly facilityScope = inject(FacilityScopeService)
  private readonly parcelService = inject(ParcelService)
  private readonly locationService = inject(LocationService)
  private readonly messageService = inject(MessageService)
  private readonly translate = inject(TranslateService)
  private readonly filterservice = inject(FilterApplyService)
  private readonly tableState = inject(TableStateService)
  private readonly filterPresetService = inject(FilterPresetService)
  private readonly router = inject(Router)
  private readonly STATE_KEY = 'binlogic:parcels'
  readonly PRESET_PAGE_KEY = 'parcels'

  activeFilters = signal<ActiveFilterChip[]>([])
  /** Initialized from localStorage at field-init time so [initialFilters] is correct when BaseDataTable mounts */
  protected activeBackendFilters: Record<string, any> =
    (inject(TableStateService).load('binlogic:parcels')?.filters ?? {}) as Record<string, any>

  /** Committed multiselect values for display/chip sync */
  facilityFilter = signal<string[]>([])
  statusFilter = signal<string[]>([])
  dataStatusFilter = signal<string[]>([])

  /** Single shared popup menu for row actions */
  @ViewChild('parcelMenu') parcelMenu!: Menu
  /** Reference to base-data-table — used to reset the sort icon on Clear */
  @ViewChild(BaseDataTable) private readonly baseTable!: BaseDataTable
  rowMenuItems: MenuItem[] = []

  /** Controls mobile filter bottom drawer */
  showMobileFilters = signal(false)

  /** Status options for both the filterRow and mobile drawer */
  statusOptions = signal<{ label: string; value: string }[]>([])
  dataStatusOptions = signal<{ label: string; value: string }[]>([])

  // Sentinel value for "No Facility" option in the facility filter dropdown.
  // Converted to null before sending to the backend.
  private readonly NULL_FACILITY_ID = NO_FACILITY_ID

  // === Default filter values ===
  private readonly DEFAULT_ORDER_STATUS = ['PRE_CHECK_IN', 'SHIP PREPARED', 'SHIPPED']

  // === State ===
  parcels = signal<Parcel[]>([])
  loading = signal(false)
  pagination = signal<ShPaginationConfig>({
    page: 1,
    limit: 15,
    total: 0,
    rows_per_page: [10, 15, 25, 50],
  })
  currentSort = signal<ShSortConfig | undefined>(undefined)
  currentFilters = signal<ParcelFilter>({})
  selectedParcels = signal<Parcel[]>([])

  // Facility lookup
  facilities = signal<Facility[]>([])
  facilityMap = computed(() => {
    const map = new Map<string, string>()
    for (const f of this.facilities()) {
      map.set(f.id, f.name)
    }
    return map
  })

  /**
   * Options offered by the facility column filter.
   *
   * Sourced from the global topbar scope rather than from `facilities()`, so a
   * user can never filter this column for a facility the global selector has
   * excluded. `inScope()` falls back to every facility when the scope is
   * "all", which is the pre-selector behaviour.
   *
   * The "No Facility" sentinel is prepended here rather than taken from
   * `facilities()`: it is not a real facility. Like the facilities, it is only
   * offered while the topbar scope includes it ("No facility" ticked, or all).
   */
  facilityFilterOptions = computed<Facility[]>(() => {
    const inScope = this.facilityScope.inScope() as unknown as Facility[]
    if (!this.facilityScope.includesNoFacility()) return inScope
    const noFacility = {
      id: this.NULL_FACILITY_ID,
      name: this.translate.instant('labels.no_facility_option'),
    } as Facility
    return [noFacility, ...inScope]
  })

  // Detail sidebar
  showDetailSidebar = signal(false)
  selectedParcel = signal<Parcel | null>(null)
  selectedField = signal<'shipment' | 'order' | 'ship_details'>('shipment')

  // Edit customer info dialog
  showEditCustomerDialog = signal(false)
  parcelToEdit = signal<Parcel | null>(null)

  // Active preset indicator
  activePresetColor = signal<string | null>(null)
  activePresetName = signal<string | null>(null)

  // === Column definitions ===
  cols: ShColumnDef[] = []
  selectedColumns: ShColumnDef[] = []

  /** Column defs with pre-translated label — used by multiSelect so search works in any language */
  translatedColumnDefs: (ShColumnDef & { translatedHeader: string })[] = []

  private buildColumns(): ShColumnDef[] {
    return [
      {
        field: 'tracking_number',
        header: 'labels.tracking',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '16rem',
        template: 'tracking',
        mobileLabel: true,
        // The row carries no root-level tracking_number: the cell reads it off
        // the shipment, and so must the export, or the column downloads blank.
        exportValue: (row: Parcel) =>
          row.shipment?.shipment_id ??
          row.shipment?.packages?.[0]?.tracking_number ??
          null,
      },
      {
        field: 'meta_data.order_status',
        header: 'labels.status',
        sortable: true,
        filterable: true,
        filterType: 'multiselect',
        filterOptions: this.statusOptions(),
        width: '10rem',
        template: 'status',
        mobileVisible: true,
        exportValue: (row: Parcel) => this.statusLabel(row.meta_data?.order_status),
      },
      {
        field: 'data_status',
        header: 'labels.data_status',
        sortable: true,
        filterable: true,
        filterType: 'multiselect',
        filterOptions: this.dataStatusOptions(),
        width: '10rem',
        template: 'data_status',
        mobileVisible: true,
      },
      {
        field: 'order_number',
        header: 'labels.order',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '15rem',
        template: 'order',
        mobileVisible: true,
        // The cell shows the reference under the order number; the file keeps
        // both, since no other column carries it.
        exportValue: (row: Parcel) => {
          const detail = row.order_detail
          if (!detail?.order_number) return null
          return detail.reference_number
            ? `${detail.order_number} (${detail.reference_number})`
            : detail.order_number
        },
      },
      {
        field: 'channel',
        header: 'labels.merchant',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '10rem',
        template: 'merchant',
        mobileVisible: true,
        exportValue: (row: Parcel) => row.external_channel?.channel ?? null,
      },
      {
        field: 'facility_id',
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
        exportValue: (row: Parcel) => this.facilityName(row.operator?.facility_id),
      },
      {
        field: 'storage_unit_name',
        header: 'labels.slot_lpn',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '10rem',
        template: 'slot_lpn',
        mobileVisible: true,
        // The prefix is not decoration: it says whether the unit is an LPN or
        // a slot, which is only visible there.
        exportValue: (row: Parcel) => {
          const unit = row.operator?.storage_unit
          if (!unit?.name) return null
          return `${unit.storage_unit_type === 'LPN' ? 'LPN' : 'Slot'}: ${unit.name}`
        },
      },
      {
        field: 'total_packages',
        header: 'labels.ship_details',
        sortable: true,
        filterable: true,
        filterType: 'numeric',
        width: '9rem',
        template: 'ship_details',
        mobileVisible: true,
        // The cell shows three counters behind icons; a file cell holds one
        // value, so it carries the three labelled — the shape the previous
        // frontend used for this same column.
        exportValue: (row: Parcel) => this.shipDetailsLabel(row),
      },
      {
        field: 'created_at',
        header: 'labels.created_at',
        sortable: true,
        filterable: true,
        filterType: 'date',
        width: '13rem',
        template: 'created_at',
        mobileVisible: true,
        exportValue: (row: Parcel) => this.toDate(row.meta_data?.created_at),
      },
      {
        field: 'date_shipped',
        header: 'labels.date_shipped',
        sortable: true,
        filterable: true,
        filterType: 'date',
        width: '13rem',
        template: 'date_shipped',
        mobileVisible: true,
        exportValue: (row: Parcel) =>
          this.toDate(row.shipment?.delivery_detail?.date_shipped),
      },
    ]
  }

  constructor() {
    this.translate.onLangChange.pipe(takeUntilDestroyed()).subscribe(() => {
      // Defer to next microtask so column/filter mutations don't run inside
      // the current change-detection cycle (prevents PrimeNG onFilter loop).
      setTimeout(() => {
        this.translateOptions()
        this.refreshColumns()
        // Rebuild chips so labels reflect the new language
        if (Object.keys(this.activeBackendFilters).length > 0) {
          this.buildFilterChips(this.activeBackendFilters)
        }
      })
    })

    // Restore active preset color when navigating back to this page.
    // presets() is populated async after loadPresets(); this effect fires
    // once the HTTP response arrives and sets the color/name signals.
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

  translateOptions() {
    const statuses = [
      'PRE_CHECK_IN',
      'SHIP PREPARED',
      'SHIPPED'
    ]
    this.statusOptions.set(
      statuses.map((s) => {
        const key = `status.${s.toLowerCase().replaceAll(/[\s_]+/g, '_')}`
        const translated = this.translate.instant(key)
        return {
          label: translated === key ? s : translated,
          value: s,
        }
      })
    )

    this.dataStatusOptions.set([
      {
        label: this.translate.instant('status.complete'),
        value: 'complete',
      },
      {
        label: this.translate.instant('status.incomplete'),
        value: 'incomplete',
      },
    ])
  }

  // === Lifecycle ===
  ngOnInit() {
    this.translateOptions()
    // Build columns early so filter chips have access to headers + filterOptions
    this.refreshColumns()
    this.loadFacilities()
    // Initialize filter presets for this page
    this.filterPresetService.loadPresets(this.PRESET_PAGE_KEY)
    // Restore multiselect signals and filter chips (activeBackendFilters already set at field-init)
    if (Object.keys(this.activeBackendFilters).length > 0) {
      this.buildFilterChips(this.activeBackendFilters)
      if (this.activeBackendFilters['facility_id']?.value)            this.facilityFilter.set(this.activeBackendFilters['facility_id'].value)
      if (this.activeBackendFilters['meta_data.order_status']?.value) this.statusFilter.set(this.activeBackendFilters['meta_data.order_status'].value)
      if (this.activeBackendFilters['data_status']?.value)            this.dataStatusFilter.set(this.activeBackendFilters['data_status'].value)
      this.currentFilters.set(this.buildApiFilter(this.activeBackendFilters))
    }
    const saved = this.tableState.load(this.STATE_KEY)
    if (saved?.page) this.pagination.update(p => ({ ...p, page: saved.page! }))
    if (saved?.sort) this.currentSort.set(saved.sort)
    this.loadData()
  }

  private saveState(): void {
    const sort = this.currentSort()
    this.tableState.save(this.STATE_KEY, {
      filters: this.activeBackendFilters as Record<string, unknown>,
      page:    this.pagination().page,
      sort:    sort,
    })
  }

  /** Load facilities for the filter dropdown and name display */
  private loadFacilities() {
    this.locationService
      .listMyFacilities({ filter: {}, config: { page: 1, rows: 200 } })
      .subscribe({
        next: (resp) => {
          // Prepend a "No Facility" option so users can filter for parcels
          // with facility_id = NULL (only PRE_CHECK_IN parcels).
          const noFacility: Facility = {
            id: this.NULL_FACILITY_ID,
            name: this.translate.instant('labels.no_facility_option'),
          } as Facility
          this.facilities.set([noFacility, ...(resp.data || [])])
          // Refresh columns so the filter options are populated
          if (this.cols.length > 0) this.refreshColumns()
          // Re-build chips now that facilityMap() has data - fixes the timing issue
          // where chips built in ngonInit() show IDs instead of facility names
          this.buildFilterChips(this.activeBackendFilters)
        },
      })
  }

  // === Data loading ===
  // === Import ===

  showImportDialog = signal(false)
  /** File type the dialog was opened for — By .csv or By .xlsx. */
  importFormat = signal<ImportFileFormat>('csv')

  openImport(format: ImportFileFormat = 'csv'): void {
    this.importFormat.set(format)
    this.showImportDialog.set(true)
  }

  /**
   * A finished upload created parcels in this facility, so the table has to
   * catch up. Failed rows stay in the upload log, which the dialog links to.
   */
  onImported(log: ImportLog): void {
    if (log.success_count > 0) this.loadData()
  }

  /** Opens the Upload Logs view on the log the user just produced. */
  goToUploadLogs(log?: ImportLog): void {
    this.router.navigate(['app/parcels/upload-logs'], {
      queryParams: log ? { log: log.id } : undefined,
    })
  }

  // === Export ===

  /**
   * The three counters of the Ship Details cell as one readable value:
   * packages, SKUs and items, each with the label its icon carries as a
   * tooltip on screen.
   */
  private shipDetailsLabel(row: Parcel): string {
    const meta = row.meta_data
    return [
      `${this.translate.instant('labels.total_packages')}: ${meta?.total_packages ?? 0}`,
      `${this.translate.instant('labels.total_sku')}: ${meta?.total_quantity ?? 0}`,
      `${this.translate.instant('labels.total_item')}: ${meta?.total_items ?? 0}`,
      // One line each, as the cell stacks them: xlsx keeps the breaks, CSV
      // collapses them so a record stays on one line.
    ].join('\n')
  }

  /** Translated status label — same text the badge shows. */
  private statusLabel(status: string | undefined | null): string {
    if (!status) return ''
    const opt = this.statusOptions().find(o => o.value === status)
    return opt?.label ?? status
  }

  /** Keeps date columns as real dates so xlsx gets date cells, not strings. */
  private toDate(value: string | null | undefined): Date | null {
    if (!value) return null
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  /**
   * Feeds the header's export menu: pages the parcel list with the filters and
   * sort the table is using (default status filter included), so the file
   * covers every matching record.
   */
  /**
   * The request the parcel list is made of: the column filters, the default
   * status filter and the global facility scope, which the table applies and
   * the export used to miss — so a scoped table could still export parcels
   * from facilities outside the selection.
   *
   * One definition for both, so they cannot drift again.
   */
  private listRequest(page: number, rows: number): ParcelListRequest {
    const sort = this.currentSort()
    const filters = this.currentFilters()
    const apiFilter: ParcelFilter = {
      ...filters,
      order_status: filters['order_status'] || {
        match_mode: 'in',
        value: this.DEFAULT_ORDER_STATUS,
      },
    }
    return {
      config: {
        page,
        rows,
        sort_field: sort
          ? [{ field: this.mapSortField(sort.field), order: sort.order === 'asc' ? 1 : -1 }]
          : [{ field: 'created_at', order: -1 }],
      },
      filter: scopeApiFilter(apiFilter, this.facilityScope.apiValue(), { scopeField: FACILITY_SCOPE_FIELD }),
    }
  }

  readonly fetchExportPage: ExportPageFetcher = (page, rows) =>
    this.parcelService.listParcels(this.listRequest(page, rows)).pipe(
      map(resp => ({
        data: resp.data || [],
        total: resp.meta_data?.total_records || 0,
      }))
    )

  loadData() {
    this.loading.set(true)

    this.parcelService
      .listParcels(this.listRequest(this.pagination().page, this.pagination().limit))
      .subscribe({
        next: (resp) => {
          this.parcels.set(resp.data || [])
          this.pagination.update((p) => ({
            ...p,
            total: resp.meta_data?.total_records || 0,
          }))

          // Refresh columns
          this.refreshColumns()
          this.loading.set(false)
        },
        error: () => {
          this.loading.set(false)
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('messages.error'),
            detail: this.translate.instant('labels.error_loading_data'),
          })
        },
      })
  }

  /** Rebuild column definitions */
  refreshColumns() {
    this.cols = this.buildColumns()
    // Keep user's column selection if already set, otherwise default to all
    if (this.selectedColumns.length === 0) {
      this.selectedColumns = this.cols
    } else {
      // Merge updated filterOptions into existing selected columns
      this.selectedColumns = this.selectedColumns.map((sc) => {
        const updated = this.cols.find((c) => c.field === sc.field)
        return updated || sc
      })
    }
    this.buildTranslatedColumns()
  }

  /** Build translated column labels so p-multiSelect search works in any language */
  private buildTranslatedColumns(): void {
    this.translatedColumnDefs = this.cols.map(col => ({
      ...col,
      translatedHeader: this.translate.instant(col.header),
    }))
    // Keep selectedColumns in sync with the translated defs
    this.selectedColumns = this.translatedColumnDefs.filter(def =>
      this.selectedColumns.some(s => s.field === def.field)
    )
  }

  /**
   * Called via (ngModelChange) on the column selector p-multiSelect.
   * At the moment this fires, this.selectedColumns still holds the PREVIOUS
   * selection (one-way [ngModel] binding), so we can detect removed columns.
  */
  onColSelectChange (newCols: (ShColumnDef & { translatedHeader?: string })[]): void{
    const prevFields = new Set(this.selectedColumns.map(c => c.field))
    // Re-sort selected columns to match the original definition order in this.cols
    // so that re-enabled columns return to their original position instead of the end.
    this.selectedColumns = this.translatedColumnDefs.filter(def =>
      newCols.some(c => c.field === def.field)
    )
    const newFields = new Set(this.selectedColumns.map(c => c.field))
    const removedFields = [...prevFields].filter(f => !newFields.has(f))
    if (removedFields.length > 0) this.clearFiltersForHiddenColumns(removedFields)
  }

  /** Clears filter state for columns that were just hidden by the user. */
  private clearFiltersForHiddenColumns(removedFields: string[]): void {
    let changed = false
    const filters = { ...this.activeBackendFilters }
    for (const field of removedFields) {
      if (field in filters) { delete filters[field]; changed = true }
      if (field === 'facility_id') this.facilityFilter.set([])
      if (field === 'meta_data.order_status') this.statusFilter.set([])
      if (field === 'data_status') this.dataStatusFilter.set([])
    }
    if (!changed) return
    this.activeBackendFilters = filters
    this.buildFilterChips(filters)
    this.currentFilters.set(this.buildApiFilter(filters))
    this.saveState()
  }
  // === Table events ===
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
      ? this.filterservice.applyFilterNew(event.filters, {})
      : {}

    const finalFilters = { ...appliedFilter, ...this.activeBackendFilters }
    this.buildFilterChips(finalFilters)

    this.currentFilters.set(this.buildApiFilter(finalFilters))
    this.saveState()
    this.loadData()
  }

  onSelectionChange(selection: Parcel[]) {
    this.selectedParcels.set(selection)
  }

  clearSelection() {
    this.selectedParcels.set([])
  }

  clearFilters() {
    this.tableState.clear(this.STATE_KEY)
    this.activeBackendFilters = {}
    this.facilityFilter.set([])
    this.statusFilter.set([])
    this.dataStatusFilter.set([])
    this.activeFilters.set([])
    this.currentFilters.set({})
    this.currentSort.set(undefined)
    // Clear active preset indicator
    this.activePresetColor.set(null)
    this.activePresetName.set(null)
    this.filterPresetService.clearLastApplied()
    // Clear BaseDataTable's internal columnFilters so stale filters
    // don't resurface when the user clicks a sort header next
    this.baseTable?.resetColumnFilters()
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadData()
  }

  /**
   * Restores filters, sort, and pagination from a saved preset.
   * Called by FilterPresetManagerComponent when the user selects a preset.
   */
  onPresetSelected(preset: FilterPreset): void {
    // Store preset visual identity
    this.activePresetColor.set(preset.color ?? null)
    this.activePresetName.set(preset.name)

    // Reconstruct filter state from conditions (filters field no longer stored)
    this.activeBackendFilters = buildFiltersFromConditions(preset.conditions ?? [])

    // Restore multiselect signals
    this.facilityFilter.set(this.activeBackendFilters['facility_id']?.value ?? [])
    this.statusFilter.set(this.activeBackendFilters['meta_data.order_status']?.value ?? [])
    this.dataStatusFilter.set(this.activeBackendFilters['data_status']?.value ?? [])

    // Restore sort from preset's sort_field / sort_order
    if (preset.sort_field) {
      this.currentSort.set({ field: preset.sort_field, order: (preset.sort_order as 'asc' | 'desc') ?? 'asc' })
    } else {
      this.currentSort.set(undefined)
    }

    // Rebuild chips and API filters
    this.buildFilterChips(this.activeBackendFilters)
    this.currentFilters.set(this.buildApiFilter(this.activeBackendFilters))

    // Reset to page 1 and reload
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.baseTable?.resetColumnFilters()
    this.saveState()
    this.loadData()
  }

  /**
   * Convert BaseDataTable filter format to v2 API MatchModel format.
   */
  private buildApiFilter(filters?: Record<string, any>): ParcelFilter {
    const apiFilter: ParcelFilter = {}

    for (const [field, val] of Object.entries(filters ?? {})) {
      if (
        val?.value !== null &&
        val?.value !== undefined &&
        val?.value !== ''
      ) {
        const apiField = this.mapFilterField(field)
        let value = val.value
        // Convert __NULL__ sentinel to null so the backend receives nil
        // in the IN array (triggers IS NULL filtering for facility_id).
        if (apiField === 'facility_id' && Array.isArray(value)) {
          value = value.map((v: any) => v === this.NULL_FACILITY_ID ? null : v)
        }
        ;(apiFilter as any)[apiField] = {
          value,
          match_mode: val.match_mode ?? val.matchMode ?? 'contains',
          ...presetCombinator(val),
        }
      }
    }
    return apiFilter
  }

  /**
   * Map display column field names to v2 API filter field names.
   */
  private mapFilterField(field: string): string {
    const fieldMap: Record<string, string> = {
      'meta_data.order_status': 'order_status',
      total_packages: 'ship_details_count',
    }
    return fieldMap[field] || field
  }

  /**
   * Map display column field names to v2 API sort field names.
   */
  private mapSortField(field: string): string {
    const fieldMap: Record<string, string> = {
      'meta_data.order_status': 'order_status',
    }
    return fieldMap[field] || field
  }

  // === Detail sidebar ===
  openDetailSidebar(
    parcel: Parcel,
    field: 'shipment' | 'order' | 'ship_details' = 'shipment'
  ) {
    this.selectedParcel.set(parcel)
    this.selectedField.set(field)
    this.showDetailSidebar.set(true)
  }

  closeDetailSidebar() {
    this.showDetailSidebar.set(false)
    this.selectedParcel.set(null)
  }

  onParcelOptionsClick(event: Event, row: Parcel): void {
    this.rowMenuItems = [
      {
        label: this.translate.instant('parcels.update_customer.action_label'),
        icon: 'pi pi-user-edit',
        command: () => this.openEditCustomerDialog(row),
      },
    ]
    this.parcelMenu.toggle(event)
  }

  // === Edit Customer Info Dialog ===

  openEditCustomerDialog(parcel: Parcel) {
    this.parcelToEdit.set(parcel)
    this.showEditCustomerDialog.set(true)
  }

  closeEditCustomerDialog() {
    this.showEditCustomerDialog.set(false)
    this.parcelToEdit.set(null)
  }



  /** Truncate a UUID to the first 8 characters for display. */
  shortId(id: string): string {
    return id ? id.substring(0, 8) : '—'
  }

  /** Resolve a facility UUID to its display name. */
  facilityName(id: string | undefined | null): string {
    if (!id) return '—'
    if (id === this.NULL_FACILITY_ID) return this.translate.instant('labels.no_facility_option')
    return this.facilityMap().get(id) || this.shortId(id)
  }

  /** Build an HTML tooltip listing missing fields for incomplete data status. */
  buildMissingFieldsTooltip(
    missingFields: { field?: string; message?: string }[]
  ): string {
    if (!missingFields || missingFields.length === 0) return ''
    const items = missingFields
      .map(
        (mf) =>
          `<li style="display:flex;align-items:center;gap:6px;padding:4px 0;">` +
          `<i class="pi pi-times-circle" style="color:#ef4444;font-size:0.85rem;flex-shrink:0;"></i>` +
          `<span>${mf.message || mf.field || 'Unknown field'}</span>` +
          `</li>`
      )
      .join('')
    return (
      `<div style="text-align:left;min-width:200px;">` +
      `<strong style="display:block;margin-bottom:6px;font-size:0.9rem;">Missing Fields</strong>` +
      `<ul style="list-style:none;margin:0;padding:0;">${items}</ul>` +
      `</div>`
    )
  }

  // === Custom Filters ===

  /**
   * Generic apply handler for FilterMultiselectPanelComponent.
   * Maps the field to the committed signal and triggers a data load.
   */
  onMultiselectApply(field: string, values: any[]) {
    if (field === 'facility_id') this.facilityFilter.set(values)
    if (field === 'meta_data.order_status') this.statusFilter.set(values)
    if (field === 'data_status') this.dataStatusFilter.set(values)
    this.updateTableFilter(field, values)
  }

  /**
   * Generic clear handler for FilterMultiselectPanelComponent.
   */
  onMultiselectClear(field: string) {
    if (field === 'facility_id') this.facilityFilter.set([])
    if (field === 'meta_data.order_status') this.statusFilter.set([])
    if (field === 'data_status') this.dataStatusFilter.set([])
    this.updateTableFilter(field, [])
  }

  getActiveFilterValue(field: string): any {
    return this.activeBackendFilters[field]?.value ?? null
  }

  getActiveFilterMatchMode(field: string): string | null {
    return this.activeBackendFilters[field]?.matchMode ?? null
  }

  onColumnFilterChange(field: string, event: any) {
    const filters = { ...this.activeBackendFilters }

    // Handle null (filter cleared)
    if (event === null || event === undefined) {
      delete filters[field]
      this.activeBackendFilters = filters
      this.buildFilterChips(filters)
      this.currentFilters.set(this.buildApiFilter(filters))
      this.pagination.update((p) => ({ ...p, page: 1 }))
      this.saveState()
      this.loadData()
      return
    }

    // Unwrap { value, matchMode } from applyWithMode, or use raw value
    let value = event?.value === undefined ? event : event.value
    let matchMode = event?.matchMode ?? null

    if (value instanceof Date) {
      value = formatDateForBackend(value)
    }

    if (value !== null && value !== undefined && value !== '') {
      if (!matchMode) {
        matchMode = Array.isArray(value) ? 'in' : 'contains'
      }
      filters[field] = { value, matchMode }
    } else {
      delete filters[field]
    }
    this.activeBackendFilters = filters
    this.buildFilterChips(filters)

    this.currentFilters.set(this.buildApiFilter(filters))
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.saveState()
    this.loadData()
  }

  private updateTableFilter(field: string, values: any[]) {
    const filters = { ...this.activeBackendFilters }
    if (values && values.length > 0) {
      filters[field] = { value: values, matchMode: 'in' }
    } else {
      delete filters[field]
    }
    this.activeBackendFilters = filters
    this.buildFilterChips(filters)

    this.currentFilters.set(this.buildApiFilter(filters))
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.saveState()
    this.loadData()
  }

  removeFilterChip(field: string): void {
    const filters = { ...this.activeBackendFilters }
    delete filters[field]

    if (field === 'facility_id') this.facilityFilter.set([])
    if (field === 'meta_data.order_status') this.statusFilter.set([])
    if (field === 'data_status') this.dataStatusFilter.set([])

    this.activeBackendFilters = filters
    this.buildFilterChips(filters)

    this.currentFilters.set(this.buildApiFilter(filters))
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.saveState()
    this.loadData()
  }

  private buildFilterChips(filters: any): void {
    try {
      const resolvers: Record<string, (v: any) => string> = {
        facility_id: (id: string) => this.facilityName(id),
        'meta_data.order_status': (val: string) => {
          const key = `status.${val.toLowerCase().replaceAll(/[\s_]+/g, '_')}`
          const translated = this.translate.instant(key)
          return translated === key ? val : translated
        },
        data_status: (val: string) => {
          const key = `status.${val.toLowerCase().replaceAll(/[\s_]+/g, '_')}`
          const translated = this.translate.instant(key)
          return translated === key ? val : translated
        },
      }
      this.activeFilters.set(
        buildFilterChipsFromColumns(filters, this.cols, this.translate, resolvers)
      )
    } catch (err) {
      console.error('Error building filter chips:', err)
      this.activeFilters.set([])
    }
  }
}
