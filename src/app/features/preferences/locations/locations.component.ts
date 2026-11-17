import { Component, computed, effect, inject, OnInit, signal, ViewChild } from '@angular/core'
import { forkJoin, Observable, of } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { ChipModule } from 'primeng/chip'
import { MultiSelectModule } from 'primeng/multiselect'
import { SelectModule } from 'primeng/select'
import { ToastModule } from 'primeng/toast'
import { TooltipModule } from 'primeng/tooltip'
import { TreeModule } from 'primeng/tree'
import { ToggleSwitchModule } from 'primeng/toggleswitch'
import { DrawerModule } from 'primeng/drawer'
import { BadgeModule } from 'primeng/badge'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { MessageService, ConfirmationService, TreeNode, MenuItem } from 'primeng/api'
import { MenuModule, Menu } from 'primeng/menu'

// Shared base components
import { BaseDataTable } from '@/app/shared/components/datatable/data-table/base-data-table.component'

import { BaseStatusBadge } from '@/app/shared/components/status/status-badge/base-status-badge.component'
import { LabelGeneratorDialog } from '@/app/shared/components'
import { StatusColorService } from '@/app/shared/services/status-color.service'

import { FilterMultiselectPanelComponent } from '@/app/shared/components/filter-multiselect-panel/filter-multiselect-panel.component'
import { FilterTextInputComponent } from '@/app/shared/components/filter-text-input/filter-text-input.component'
import { FilterPresetManagerComponent } from '@/app/shared/components/filter-preset-manager/filter-preset-manager.component'
import { FilterApplyService } from '@/app/shared/components/filter-clear/filter-apply.service'
import { FilterPresetService } from '@/app/shared/services/filter-preset.service'
import { FilterPreset, buildFiltersFromConditions, presetCombinator } from '@/app/shared/types/filter-preset.types'
import { buildFilterChipsFromColumns } from '@/app/shared/utils/filter-chips.util'
import { flattenTreeNodes } from '@/app/shared/utils/tree.util'

// Types
import {
  ShColumnDef,
  ShPaginationConfig,
  ShSortConfig,
  ShTableEvent,
  ActiveFilterChip,
} from '@/app/shared/types/table.types'
import { ShActionItem } from '@/app/shared/types/api.types'

// Domain
import { LocationService } from './location.service'
import {
  Location,
  LocationFilter,
  LocationProfile,
  Zone,
  OperationalCategory,
  Facility,
  ContainerTreeNode,
} from '@/app/features/preferences/locations/types/location.types'

// Sub-components
import { LocationFormDialogComponent } from './components/location-form-dialog/location-form-dialog.component'
import { LocationGeneratorDialogComponent } from './components/location-generator-dialog/location-generator-dialog.component'
import { LocationConfirmDialogComponent } from './components/location-confirm-dialog/location-confirm-dialog.component'
import { BinFormDialogComponent } from './components/bin-form-dialog/bin-form-dialog.component'
import { WarehousePlannerComponent } from './components/warehouse-planner/warehouse-planner'
import { BinPlannerDialogComponent } from './components/bin-planner-dialog/bin-planner-dialog.component'
import { PlannedBin, BinPlannerResult } from './components/bin-planner-dialog/bin-planner.types'

// Auth
import { AuthService } from '@/app/core/services/auth.service'

import { FacilityPlannerService } from './services/facility-planner.service'
import { Warehouse2dStateService } from './components/warehouse-planner/services/warehouse-2d-state.service'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { scopeApiFilter, dropFacilityFilters, FACILITY_SCOPE_FIELD } from '@/app/shared/utils/facility-scope.util'

/**
 * LocationsComponent — WMS Locations management page.
 *
 * Follows the ParcelsComponent/CatalogComponent orchestrator pattern:
 * - BaseDataTable handles rendering, pagination
 * - Shared filter components (FilterMultiselectPanel, FilterTextInput) in #filterRow
 * - Filter chips for active filter display
 * - Mobile filter drawer for responsive UX
 * - Column toggle in paginatorLeft slot
 * - Sub-components in `components/` handle dialogs
 * - Signals for all reactive state
 */
@Component({
  selector: 'app-locations',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    ChipModule,
    MultiSelectModule,
    SelectModule,
    ToastModule,
    TooltipModule,
    TreeModule,
    ToggleSwitchModule,
    DrawerModule,
    BadgeModule,
    ConfirmDialogModule,
    BaseDataTable,
    MenuModule,
    BaseStatusBadge,
    LabelGeneratorDialog,
    FilterMultiselectPanelComponent,
    FilterTextInputComponent,
    FilterPresetManagerComponent,
    // Sub-components
    LocationFormDialogComponent,
    LocationGeneratorDialogComponent,
    LocationConfirmDialogComponent,
    BinFormDialogComponent,
    WarehousePlannerComponent,
    BinPlannerDialogComponent,
  ],
  providers: [ConfirmationService],
  templateUrl: './locations.component.html',
  styleUrl: './locations.component.scss',
})
export default class LocationsComponent implements OnInit {
  /** Global facility scope from the topbar selector. */
  private readonly facilityScope = inject(FacilityScopeService)
  private readonly locationService = inject(LocationService)
  private readonly messageService = inject(MessageService)
  private readonly translate = inject(TranslateService)
  private readonly authService = inject(AuthService)
  private readonly filterService = inject(FilterApplyService)
  private readonly filterPresetService = inject(FilterPresetService)
  private readonly facilityPlanner = inject(FacilityPlannerService)
  readonly stateService = inject(Warehouse2dStateService)
  private readonly statusColorService = inject(StatusColorService)

  readonly PRESET_PAGE_KEY = 'locations'
  activePresetColor = signal<string | null>(null)
  activePresetName = signal<string | null>(null)

  // Restore active preset color when navigating back to this page
  private readonly _restorePreset = effect(() => {
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

  /** Shared popup menu — one instance reused across all rows (same pattern as Receivings) */
  @ViewChild('rowMenu') rowMenu!: Menu
  /** Items currently bound to the shared popup menu */
  rowMenuItems: MenuItem[] = []

  // === Filter state (parcels/catalog pattern) ===
  activeFilters = signal<ActiveFilterChip[]>([])
  activeBackendFilters: Record<string, any> = {}

  /** Committed multiselect values for display/chip sync */
  facilityFilter = signal<string[]>([])
  zoneFilter = signal<string[]>([])
  categoryFilter = signal<any[]>([])
  profileFilter = signal<string[]>([])
  statusFilter = signal<any[]>([])

  /** Controls mobile filter bottom drawer */
  showMobileFilters = signal(false)

  // === State ===
  locations = signal<Location[]>([])
  loading = signal(false)
  pagination = signal<ShPaginationConfig>({
    page: 1,
    limit: 15,
    total: 0,
    rows_per_page: [10, 15, 25, 50],
  })
  currentSort = signal<ShSortConfig | undefined>(undefined)
  currentFilters = signal<LocationFilter>({})
  selectedLocations = signal<Location[]>([])
  showLabelDialog = signal(false)

  /**
   * Rows handed to the label generator.
   *
   * Category and Type are stored as ids and resolved for display through
   * lookup tables this page owns, so the raw fields would print a code — or a
   * uuid — where the table shows a name. Resolving them here with the very
   * same helpers the table cells use keeps the label and the screen in step.
   */
  labelLocations = computed(() =>
    this.selectedLocations().map((l) => ({
      ...l,
      category: this.getCategoryCode(
        l.operational_category_code || l.operational_category_id
      ),
      type: this.getProfileName(l.location_profile_code || l.location_profile_id),
    }))
  )

  // Dialog state
  showFormDialog = signal(false)
  showGeneratorDialog = signal(false)
  showDeleteConfirm = signal(false)
  editingLocation = signal<Location | null>(null)
  deleteTarget = signal<Location | null>(null)

  // Bin tree (inline slider)
  showBinDrawer = signal(false)
  selectedLocationForDrawer = signal<Location | null>(null)
  binTreeData = signal<TreeNode[]>([])
  binLoading = signal(false)
  binNodeCount = signal(0)

  // Bin label selection
  selectedBinNodes = signal<TreeNode[]>([])
  /** Whether checking a bin also checks everything nested inside it. */
  includeNestedBins = signal(true)
  showBinLabelDialog = signal(false)

  /** p-tree hands back TreeNode; the label generator wants the domain object. */
  selectedBins = computed(() =>
    this.selectedBinNodes().map((n) => n.data as ContainerTreeNode)
  )
  editingContainerId: string | null = null
  parentIdForCreate: string | null = null

  // Warehouse Planner overlay
  showPlanner = signal(false)

  // Bin Planner dialog
  showBinPlanner = signal(false)

  // Bulk Bin Planner dialog
  showBulkBinPlanner = signal(false)
  bulkBinPlannerCodes = signal<string[]>([])
  /** Snapshot of selected locations at the time the bulk dialog was opened */
  private bulkBinPlannerLocations = signal<Location[]>([])

  // Bin form dialog
  showBinFormDialog = signal(false)
  editingBinNode = signal<ContainerTreeNode | null>(null)

  private readonly confirmService = inject(ConfirmationService)

  zones = signal<Zone[]>([])
  operationalCategories = signal<OperationalCategory[]>([])
  locationProfiles = signal<LocationProfile[]>([])
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

  /** Color map for category dropdown options: category.id → CSS color */
  categoryColorMap = computed(() =>
    this.statusColorService.buildColorMap(this.operationalCategories(), 'code', 'id')
  )

  /** Color map for status dropdown options: boolean value → CSS color */
  statusColorMap = computed(() => ({
    'true': this.statusColorService.getCssColor('active'),
    'false': this.statusColorService.getCssColor('inactive'),
  }))

  // Facility ID (selected or first available)
  facilityId = signal<string>('')

  // === Column definitions ===
  cols: ShColumnDef[] = []
  selectedColumns: ShColumnDef[] = []

  private buildColumns(): ShColumnDef[] {
    return [
      {
        field: 'facility_name',
        header: 'labels.facility',
        sortable: false,
        filterable: true,
        filterType: 'multiselect',
        filterOptions: this.facilities().map((f) => ({
          label: f.name,
          value: f.id,
        })),
        width: '10rem',
        template: 'facility',
        mobileVisible: true,
      },
      {
        field: 'zone_id',
        header: 'preferences.location.zone',
        sortable: true,
        filterable: true,
        filterType: 'multiselect',
        filterOptions: this.zones().map((z) => ({
          label: z.name,
          value: z.id,
        })),
        width: '10rem',
        template: 'zone',
        mobileVisible: true,
      },
      {
        field: 'location_code',
        header: 'labels.location',
        sortable: true,
        filterable: true,
        filterType: 'text',
        width: '14rem',
        template: 'location_code',
        mobileLabel: true,
      },
      {
        field: 'bin_qty',
        header: 'labels.bin_qty',
        sortable: false,
        filterable: true,
        filterType: 'numeric',
        width: '7rem',
        template: 'bin_qty',
      },
      {
        field: 'content',
        header: 'labels.content',
        sortable: false,
        filterable: true,
        filterType: 'numeric',
        width: '10rem',
        template: 'content',
      },
      {
        field: 'operational_category_id',
        header: 'preferences.location.category',
        sortable: true,
        filterable: true,
        filterType: 'multiselect',
        filterOptions: this.operationalCategories().map((c) => ({
          label: `${c.code} \u2014 ${this.translate.instant('preferences.location.category_' + c.code)}`,
          value: c.id,
        })),
        width: '10rem',
        template: 'category',
      },
      {
        field: 'location_profile_id',
        header: 'preferences.location.type',
        sortable: true,
        filterable: true,
        filterType: 'multiselect',
        filterOptions: this.locationProfiles().map((p) => ({
          label: p.name,
          value: p.id,
        })),
        width: '12rem',
        template: 'profile',
      },
      {
        field: 'is_active',
        header: 'labels.status',
        sortable: true,
        filterable: true,
        filterType: 'multiselect',
        filterOptions: [
          { label: 'Active', value: true },
          { label: 'Inactive', value: false },
        ],
        width: '7rem',
        template: 'status',
        mobileVisible: true,
      },
    ]
  }

  // === Lifecycle ===
  ngOnInit() {
    this.filterPresetService.loadPresets(this.PRESET_PAGE_KEY)
    this.loadAuxiliaryData()
    this.loadData()
  }

  // === Data loading ===
  loadData() {
    this.loading.set(true)
    const sort = this.currentSort()

    this.locationService
      .listLocations({
        filter: scopeApiFilter(this.currentFilters(), this.facilityScope.apiValue(), { scopeField: FACILITY_SCOPE_FIELD }),
        config: {
          page: this.pagination().page,
          rows: this.pagination().limit,
          sort_field: sort
            ? [{ field: sort.field, order: sort.order === 'asc' ? 1 : -1 }]
            : [],
        },
      })
      .subscribe({
        next: (resp) => {
          this.locations.set(resp.data || [])
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
            detail: this.translate.instant('preferences.location.load_error'),
          })
        },
      })
  }

  loadAuxiliaryData() {
    forkJoin({
      zones: this.locationService.listZones({
        filter: {},
        config: { page: 1, rows: 500 },
      }),
      categories: this.locationService.listOperationalCategories({
        filter: {},
        config: { page: 1, rows: 500 },
      }),
      profiles: this.locationService.listLocationProfiles({
        filter: {},
        config: { page: 1, rows: 500 },
      }),
      facilities: this.locationService.listMyFacilities({
        filter: { is_active: { value: true, match_mode: 'equals' } },
        config: { page: 1, rows: 500 },
      }),
    }).subscribe({
      next: (result) => {
        this.zones.set(result.zones.data || [])
        this.operationalCategories.set(result.categories.data || [])
        this.locationProfiles.set(result.profiles.data || [])
        
        // Feed taxonomy into the warehouse planner state service
        this.stateService.locationProfiles.set(
          (result.profiles.data || []).map(p => ({ code: p.code, name: p.name }))
        );
        this.stateService.operationalCategories.set(
          (result.categories.data || []).map(c => ({ code: c.code }))
        );
        this.stateService.warehouseZones.set(result.zones.data || []);

        let facilityList = result.facilities.data || [];
        this.facilities.set(facilityList)
        
        if (facilityList.length > 0 && !this.facilityId()) {
          this.facilityId.set(facilityList[0].id);
        }

        // Build columns after aux data is loaded (filterOptions depend on signals)
        this.refreshColumns()
      },
    })
  }

  /** Rebuild column definitions — preserves user column selection (parcels pattern) */
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
  }

  /**
   * Called via (ngModelChange) on the column selector p-multiSelect.
   * Re-sorts selected columns to match the original definition order in this.cols
   * so that re-enabled columns return to their original position instead of the end.
   */
  onColSelectChange(newCols: ShColumnDef[]): void {
    const orderMap = new Map(this.cols.map((c, i) => [c.field, i]))
    this.selectedColumns = [...newCols].sort(
      (a, b) => (orderMap.get(a.field) ?? 0) - (orderMap.get(b.field) ?? 0)
    )
  }

  // === Table events (parcels/catalog pattern) ===
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

  onSelectionChange(selection: Location[]) {
    this.selectedLocations.set(selection)
  }

  clearSelection() {
    this.selectedLocations.set([])
  }

  // === Filters ===
  clearFilters() {
    this.activeBackendFilters = {}
    this.facilityFilter.set([])
    this.zoneFilter.set([])
    this.categoryFilter.set([])
    this.profileFilter.set([])
    this.statusFilter.set([])
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
    this.facilityFilter.set(this.activeBackendFilters['facility_name']?.value ?? [])
    this.zoneFilter.set(this.activeBackendFilters['zone']?.value ?? [])
    this.categoryFilter.set(this.activeBackendFilters['category']?.value ?? [])
    this.profileFilter.set(this.activeBackendFilters['profile']?.value ?? [])
    this.statusFilter.set(this.activeBackendFilters['status']?.value ?? [])
    if (preset.sort_field) {
      this.currentSort.set({ field: preset.sort_field, order: (preset.sort_order as 'asc' | 'desc') ?? 'asc' })
    } else {
      this.currentSort.set(undefined)
    }
    this.currentFilters.set(this.buildApiFilter(this.activeBackendFilters))
    this.buildFilterChips(this.activeBackendFilters)
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadData()
  }

  private buildApiFilter(filters?: Record<string, any>): LocationFilter {
    if (!filters) return {}
    const apiFilter: LocationFilter = {}

    // Map frontend column fields to backend API filter fields
    const fieldMap: Record<string, string> = {
      facility_name: 'facility_id',
    }

    for (const [field, val] of Object.entries(filters)) {
      if (
        val?.value !== null &&
        val?.value !== undefined &&
        val?.value !== ''
      ) {
        const apiField = fieldMap[field] || field
        ;(apiFilter as any)[apiField] = {
          value: val.value,
          match_mode: val.match_mode ?? val.matchMode ?? 'contains',
          ...presetCombinator(val),
        }
      }
    }
    return apiFilter
  }

  // === Custom Filters (parcels/catalog pattern) ===

  /**
   * Generic apply handler for FilterMultiselectPanelComponent.
   * Maps the field to the committed signal and triggers a data load.
   */
  onMultiselectApply(field: string, values: any[]) {
    if (field === 'facility_name') this.facilityFilter.set(values)
    if (field === 'zone_id') this.zoneFilter.set(values)
    if (field === 'operational_category_id') this.categoryFilter.set(values)
    if (field === 'location_profile_id') this.profileFilter.set(values)
    if (field === 'is_active') this.statusFilter.set(values)
    this.updateTableFilter(field, values)
  }

  /**
   * Generic clear handler for FilterMultiselectPanelComponent.
   */
  onMultiselectClear(field: string) {
    if (field === 'facility_name') this.facilityFilter.set([])
    if (field === 'zone_id') this.zoneFilter.set([])
    if (field === 'operational_category_id') this.categoryFilter.set([])
    if (field === 'location_profile_id') this.profileFilter.set([])
    if (field === 'is_active') this.statusFilter.set([])
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
      this.loadData()
      return
    }

    // Unwrap { value, matchMode } from applyWithMode, or use raw value
    let value = event?.value === undefined ? event : event.value
    let matchMode = event?.matchMode ?? null

    if (value instanceof Date) {
      value = value.toISOString().split('T')[0]
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
    this.loadData()
  }

  removeFilterChip(field: string): void {
    const filters = { ...this.activeBackendFilters }
    delete filters[field]

    if (field === 'facility_name') this.facilityFilter.set([])
    if (field === 'zone_id') this.zoneFilter.set([])
    if (field === 'operational_category_id') this.categoryFilter.set([])
    if (field === 'location_profile_id') this.profileFilter.set([])
    if (field === 'is_active') this.statusFilter.set([])

    this.activeBackendFilters = filters
    this.buildFilterChips(filters)

    this.currentFilters.set(this.buildApiFilter(filters))
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadData()
  }

  private buildFilterChips(filters: any): void {
    try {
      // Use the shared utility — resolvers for domain-specific display values
      const resolvers: Record<string, (v: any) => string> = {
        facility_name: (id: string) => this.getFacilityName(id),
        zone_id: (id: string) => this.getZoneName(id),
        operational_category_id: (id: number) => this.getCategoryCode(id),
        location_profile_id: (id: string) => this.getProfileName(id),
      }
      this.activeFilters.set(
        buildFilterChipsFromColumns(
          filters,
          this.cols,
          this.translate,
          resolvers
        )
      )
    } catch (err) {
      console.error('Error building filter chips:', err)
      this.activeFilters.set([])
    }
  }

  // === Bin Tree (inline slider) ===
  openBinDrawer(location: Location) {
    this.selectedLocationForDrawer.set(location)
    this.showBinDrawer.set(true)
    this.loadBinTree()
  }

  closeBinTree() {
    this.showBinDrawer.set(false)
  }

  private loadBinTree() {
    const loc = this.selectedLocationForDrawer()
    if (!loc) return
    this.binLoading.set(true)
    this.binNodeCount.set(0)
    this.selectedBinNodes.set([])

    this.locationService.getContainerTree(loc.id).subscribe({
      next: (nodes) => {
        this.binTreeData.set(this.toTreeNodes(nodes))
        this.binLoading.set(false)
      },
      error: () => {
        this.binLoading.set(false)
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('messages.error'),
          detail: 'Failed to load container tree',
        })
      },
    })
  }

  // === Bin label selection ===

  /**
   * p-tree types its selection against every selectionMode at once, so the
   * event arrives as a single node, a list, or nothing. Checkbox mode only
   * ever emits a list; the other shapes are normalised rather than trusted.
   */
  onBinSelectionChange(selection: TreeNode | TreeNode[] | null | undefined) {
    if (Array.isArray(selection)) {
      this.selectedBinNodes.set(selection)
    } else {
      this.selectedBinNodes.set(selection ? [selection] : [])
    }
  }

  /**
   * Cascading and per-node checking select different things, so a selection
   * made under one rule cannot be reinterpreted under the other — clearing is
   * more predictable than silently reshaping it.
   */
  onIncludeNestedBinsChange(value: boolean) {
    this.includeNestedBins.set(value)
    this.selectedBinNodes.set([])
  }

  /**
   * Select every bin at any depth, skipping planner previews: a simulated bin
   * has not been created yet, so there is no physical container to label.
   */
  selectAllBins() {
    this.selectedBinNodes.set(
      flattenTreeNodes(this.binTreeData(), (n) => !n.data?.simulated)
    )
  }

  clearBinSelection() {
    this.selectedBinNodes.set([])
  }

  openBinLabelDialog() {
    if (this.selectedBins().length === 0) return
    this.showBinLabelDialog.set(true)
  }

  private toTreeNodes(nodes: ContainerTreeNode[]): TreeNode[] {
    return nodes.map((n) => {
      this.binNodeCount.update((c) => c + 1)
      return {
        key: n.id,
        label: n.lpn_code,
        data: n,
        expanded: true,
        icon: 'pi pi-box',
        children: this.toTreeNodes(n.children || []),
      }
    })
  }

  onAddBin() {
    this.editingContainerId = null
    this.parentIdForCreate = null
    this.editingBinNode.set(null)
    this.showBinFormDialog.set(true)
  }

  onOpenBinPlanner() {
    this.showBinPlanner.set(true)
  }

  onBinPlannerApply(result: BinPlannerResult) {
    const loc = this.selectedLocationForDrawer()
    if (!loc) return

    this.showBinPlanner.set(false)

    // Build batch-create payload
    const containers = result.bins.map(bin => ({
      lpn_code: result.nameFormat.replace('{loc}', loc.location_code).replace('{bin}', bin.id),
      type: bin.type || 'BOX',
      tags: bin.tag ? bin.tag.split(',').map(t => t.trim()).filter(Boolean) : [],
    }))

    this.binLoading.set(true)

    // 1. Batch-create containers
    this.locationService.batchCreateContainers({
      facility_id: loc.facility_id,
      location_code: loc.location_code,
      containers,
    }).subscribe({
      next: (resp) => {
        const errorCount = resp.errors?.length || 0
        const msg = errorCount > 0
          ? this.translate.instant('preferences.bin_planner.created_with_skipped', { created: resp.created, skipped: errorCount })
          : this.translate.instant('preferences.bin_planner.created_success', { created: resp.created })

        this.messageService.add({
          severity: errorCount > 0 ? 'warn' : 'success',
          summary: this.translate.instant('preferences.bin_planner.title'),
          detail: msg,
          life: 4000,
        })

        // 2. Reload the bin tree to show real containers
        this.loadBinTree()
      },
      error: (err) => {
        this.binLoading.set(false)
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('preferences.bin_planner.title'),
          detail: err?.error?.message || this.translate.instant('preferences.bin_planner.create_failed'),
          life: 5000,
        })
      },
    })
  }

  onRemoveSimulatedBin(key: string) {
    const filtered = this.binTreeData().filter(n => n.key !== key)
    this.binTreeData.set(filtered)
    this.binNodeCount.update(c => Math.max(0, c - 1))
  }

  onOpenBulkBinPlanner() {
    const selected = this.selectedLocations()
    const codes = selected.map(l => l.location_code)
    this.bulkBinPlannerCodes.set(codes)
    this.bulkBinPlannerLocations.set([...selected])  // snapshot
    this.showBulkBinPlanner.set(true)
  }

  onBulkBinPlannerApply(result: BinPlannerResult) {
    const locations = this.bulkBinPlannerLocations()  // use snapshot, not live selection
    if (locations.length === 0) return

    this.showBulkBinPlanner.set(false)
    this.loading.set(true)

    // Fire one batch-create request per selected location,
    // resolving {loc} with each location's code
    const requests = locations.map(loc => {
      const containers = result.bins.map(bin => ({
        lpn_code: result.nameFormat.replace('{loc}', loc.location_code).replace('{bin}', bin.id),
        type: bin.type || 'BOX',
        tags: bin.tag ? bin.tag.split(',').map(t => t.trim()).filter(Boolean) : [],
      }))

      return this.locationService.batchCreateContainers({
        facility_id: loc.facility_id,
        location_code: loc.location_code,
        containers,
      }).pipe(
        catchError(err => of({
          created: 0,
          errors: [{ location_code: loc.location_code, message: err?.error?.message || 'Unknown error' }],
          _failed: true as const,
          _location_code: loc.location_code,
        }))
      )
    })

    forkJoin(requests).subscribe({
      next: (responses) => {
        const totalCreated = responses.reduce((sum, r) => sum + (r.created || 0), 0)
        const totalErrors  = responses.reduce((sum, r) => sum + (r.errors?.length || 0), 0)
        const failedLocations = responses
          .filter((r: any) => r._failed)
          .map((r: any) => r._location_code)

        let msg: string
        if (failedLocations.length > 0) {
          msg = this.translate.instant('preferences.bin_planner.bulk_partial_failure', {
            created: totalCreated,
            total: locations.length,
            failed: failedLocations.length,
            locations: failedLocations.join(', '),
          })
        } else if (totalErrors > 0) {
          msg = this.translate.instant('preferences.bin_planner.bulk_created_with_skipped', {
            created: totalCreated,
            total: locations.length,
            skipped: totalErrors,
          })
        } else {
          msg = this.translate.instant('preferences.bin_planner.bulk_created_success', {
            created: totalCreated,
            total: locations.length,
          })
        }

        this.messageService.add({
          severity: failedLocations.length > 0 ? 'error' : (totalErrors > 0 ? 'warn' : 'success'),
          summary: this.translate.instant('preferences.bin_planner.title'),
          detail: msg,
          life: 5000,
        })

        this.loading.set(false)
        this.loadData()
      },
    })
  }

  onAddChildBin(node: ContainerTreeNode) {
    this.editingContainerId = null
    this.parentIdForCreate = node.id
    this.editingBinNode.set(null)
    this.showBinFormDialog.set(true)
  }

  onEditBin(node: ContainerTreeNode) {
    this.editingContainerId = node.id
    this.parentIdForCreate = null
    this.editingBinNode.set(node)
    this.showBinFormDialog.set(true)
  }

  onDeleteBin(node: ContainerTreeNode) {
    this.confirmService.confirm({
      message: this.translate.instant('preferences.bin.delete_message'),
      header: this.translate.instant('preferences.bin.confirm_delete'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.locationService.deleteContainer(node.id).subscribe({
          next: () => {
            this.loadData()
            this.loadBinTree()
          },
          error: (err) => {
            const code = err?.error?.code || ''
            if (code === 'CONTAINER_HAS_INVENTORY') {
              this.messageService.add({
                severity: 'warn',
                summary: this.translate.instant('messages.warning'),
                detail: this.translate.instant('preferences.bin.has_inventory'),
                life: 5000,
              })
            } else {
              this.messageService.add({
                severity: 'error',
                summary: this.translate.instant('messages.error'),
                detail: err?.error?.message || 'Error deleting container',
              })
            }
          },
        })
      },
    })
  }

  // === Row actions ===

  /** Opens the shared popup menu for a row — same pattern as Receivings */
  openRowMenu(event: Event, row: Location): void {
    const items: MenuItem[] = []
    for (const a of this.getRowActions(row)) {
      if (a.visible === false) continue
      // Insert a separator entry BEFORE this item when requested
      if (a.separator) {
        items.push({ separator: true })
      }
      items.push({
        label:      this.translate.instant(a.label),
        icon:       a.icon,
        disabled:   a.disabled,
        command:    a.command,
        styleClass: a.severity === 'danger' ? 'text-red-500' : '',
      })
    }
    this.rowMenuItems = items
    this.rowMenu?.toggle(event)
  }

  getRowActions(row: Location): ShActionItem[] {
    return [
      {
        label: 'labels.edit',
        icon: 'pi pi-pencil',
        command: () => this.openEditDialog(row),
      },
      {
        label: 'labels.delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.onDeleteRow(row),
        separator: true,
      },
    ]
  }

  // === Dialogs ===
  openCreateDialog() {
    this.editingLocation.set(null)
    this.showFormDialog.set(true)
  }

  openEditDialog(location: Location) {
    this.editingLocation.set(location)
    this.showFormDialog.set(true)
  }

  openGeneratorDialog() {
    this.showGeneratorDialog.set(true)
  }

  openPlanner() {
    this.showPlanner.set(true);
    if (this.facilityId()) {
      this.stateService.facilityId.set(this.facilityId());
      this.facilityPlanner.loadLayout(this.facilityId());
    }
  }

  onFacilityChange(event: any) {
    const facilityId = event.value;
    if (facilityId) {
      this.stateService.facilityId.set(facilityId);
      this.facilityPlanner.loadLayout(facilityId);
    }
  }

  onSavePlanner() {
    const facilityId = this.facilityId();
    if (!facilityId) {
      this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select a facility first' });
      return;
    }

    // ── Guard: no unsaved changes → nothing to do ────────────────────────────
    if (!this.stateService.hasUnsavedChanges()) {
      this.messageService.add({ severity: 'info', summary: 'Info', detail: 'No changes to save' });
      return;
    }

    // ── Guard: overlap conflicts → block save ────────────────────────────────
    if (this.stateService.overlapConflicts().size > 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Overlap Detected',
        detail: 'There are overlapping elements. Move them to fix the problem before saving.',
      });
      return;
    }

    const items = this.stateService.items();
    const locs = items.filter(i => i.type === 'Loc');
    const visualItems = items.filter(i => i.type !== 'Loc' && i.type !== 'Area' && i.type !== 'Zone');

    // Compute which backend locations were removed (present in loadedLocIds but not in current locs)
    const currentLocIds = new Set(locs.map(l => l.id));
    const deletedLocIds = [...this.stateService.loadedLocIds].filter(id => !currentLocIds.has(id));

    // Classify locs
    const newLocs      = locs.filter(l => l.id === l.name);
    const existingLocs = locs.filter(l => l.id !== l.name);

    // Only update existing locs that actually changed
    const dirtyIds     = this.stateService.getDirtyExistingLocIds();
    const dirtyLocs    = existingLocs.filter(l => dirtyIds.has(l.id));

    // Build a descriptive message
    const parts: string[] = [];
    if (newLocs.length > 0)      parts.push(`create ${newLocs.length} new locations`);
    if (dirtyLocs.length > 0)    parts.push(`update ${dirtyLocs.length} locations`);
    if (deletedLocIds.length > 0) parts.push(`delete ${deletedLocIds.length} locations`);
    if (visualItems.length > 0)  parts.push(`save the visual layout`);
    const confirmMsg = parts.length > 0
      ? `This will ${parts.join(', ')}. Proceed?`
      : 'Save changes to the warehouse layout?';

    this.confirmService.confirm({
      message: confirmMsg,
      header: 'Save Warehouse Layout',
      icon: 'pi pi-save',
      acceptLabel: 'Confirm',
      rejectLabel: 'Cancel',
      accept: () => {
        this.loading.set(true)
        this.stateService.isSavingLayout.set(true)

        const batchInputs = newLocs.map((l) => ({
          facility_id: facilityId,
          location_code: l.name,
          location_profile_code: l.bayType || '',
          operational_category_code: l.category || '',
          zone_id: l.zoneId || undefined,
          gx: l.gx,
          gy: l.gy,
          gw: l.gw,
          gh: l.gh,
          level_num: l.level,
          travel_sequence: 0,
        }))

        const layoutInput = {
          facility_id: facilityId,
          items: visualItems.map((v) => ({
            id: v.id.startsWith('temp_') ? undefined : v.id,
            type: v.type,
            gx: v.gx,
            gy: v.gy,
            gw: v.gw,
            gh: v.gh,
            metadata: {
              name: v.name,
              connections: v.connections,
              hallwayOrientation: v.hallwayOrientation,
            },
          })),
        }

        const calls: Observable<unknown>[] = []
        if (batchInputs.length > 0) {
          calls.push(this.locationService.batchCreateLocations(batchInputs))
        }
        // Update only dirty existing locs (position + category/type)
        for (const l of dirtyLocs) {
          calls.push(this.locationService.updateLocation(l.id, {
            location_profile_code:     l.bayType  || undefined,
            operational_category_code: l.category || undefined,
            zone_id: l.zoneId || undefined,
            gx: l.gx,
            gy: l.gy,
            gw: l.gw,
            gh: l.gh,
            level_num: l.level ?? 1,
          }))
        }
        // Always sync the visual layout (handles both adding and clearing layout_items)
        calls.push(this.locationService.syncWarehouseLayout(layoutInput))
        // Delete removed backend locations in a single batch call
        if (deletedLocIds.length > 0) {
          calls.push(this.locationService.batchDeleteLocations(deletedLocIds))
        }

        forkJoin(calls).subscribe({
          next: () => {
            this.loading.set(false)
            this.stateService.isSavingLayout.set(false)
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Warehouse layout saved successfully',
            })
            this.loadData() // Refresh the table

            // Reload the planner layout to get fresh backend UUIDs
            // (prevents duplicate key errors on subsequent saves)
            this.facilityPlanner.loadLayout(facilityId);
          },
          error: (err) => {
            this.loading.set(false)
            this.stateService.isSavingLayout.set(false)
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: 'Failed to save warehouse layout',
            })
            console.error('Save error:', err)
          },
        })
      },


    })
  }

  onClearPlanner() {
    this.stateService.clearAll();
  }

  clearAutoLayoutToast() {
    this.messageService.clear('autoLayout');
  }

  // === Sub-component event handlers ===

  /** Called when location form dialog saves successfully */
  onLocationSaved() {
    this.showFormDialog.set(false)
    this.loadData()
  }

  /** Called when a new zone is created inline in the form dialog */
  onZoneCreated(zone: Zone) {
    this.zones.update((list) => [...list, zone])
    this.refreshColumns()
  }

  /** Called when generator dialog generates successfully */
  onLocationsGenerated() {
    this.showGeneratorDialog.set(false)
    this.loadData()
  }

  /** Called when confirm dialog deletes successfully */
  onLocationDeleted() {
    this.showDeleteConfirm.set(false)
    this.deleteTarget.set(null)
    this.loadData()
  }

  /** Called when bin form dialog saves successfully */
  onBinSaved() {
    this.showBinFormDialog.set(false)
    this.loadData()
    this.loadBinTree()
  }

  // === Delete ===
  onDeleteRow(location: Location) {
    this.deleteTarget.set(location)
    this.showDeleteConfirm.set(true)
  }

  onBulkDelete() {
    this.deleteTarget.set(null)
    this.showDeleteConfirm.set(true)
  }

  // === Helper methods ===
  getZoneName(zoneId?: string): string {
    if (!zoneId) return '—'
    const zone = this.zones().find((z) => z.id === zoneId)
    return zone?.name || '—'
  }

  getProfileName(profileIdOrCode: string): string {
    if (!profileIdOrCode) return '—'
    const profiles = this.locationProfiles()
    const profile = profiles.find((p) => p.id === profileIdOrCode) || profiles.find((p) => p.code === profileIdOrCode)
    return profile?.name || profileIdOrCode
  }

  getProfilePriority(profileIdOrCode: string): string {
    const profiles = this.locationProfiles()
    const profile = profiles.find((p) => p.id === profileIdOrCode) || profiles.find((p) => p.code === profileIdOrCode)
    if (!profile) return ''
    return `Priority ${profile.micro_priority}`
  }

  getCategoryCode(categoryIdOrCode: number | string): string {
    if (!categoryIdOrCode && categoryIdOrCode !== 0) return '—'
    const cats = this.operationalCategories()
    // Try by id first (for filter chips), then by code (for display from API response)
    const cat = cats.find((c) => c.id === categoryIdOrCode) || cats.find((c) => c.code === categoryIdOrCode)
    return cat?.code || (typeof categoryIdOrCode === 'string' ? categoryIdOrCode : '—')
  }

  /** Resolve a facility UUID to its display name. */
  getFacilityName(id: string | undefined | null): string {
    if (!id) return '—'
    const facility = this.facilities().find((f) => f.id === id)
    return facility?.name || id.substring(0, 8)
  }
}
