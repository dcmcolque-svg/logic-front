import { Component, inject, OnInit, signal, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormControl, ReactiveFormsModule, FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { ChipModule } from 'primeng/chip'
import { MultiSelectModule } from 'primeng/multiselect'
import { ToggleSwitchModule } from 'primeng/toggleswitch'
import { InputTextModule } from 'primeng/inputtext'
import { SelectModule } from 'primeng/select'
import { MenuItem } from 'primeng/api'
import { Menu, MenuModule } from 'primeng/menu'

// Shared components
import { BaseDataTable } from '@/app/shared/components/datatable/data-table/base-data-table.component'
import { BaseFormField } from '@/app/shared/components/form/form-field/base-form-field.component'
import { BaseStatusBadge } from '@/app/shared/components/status/status-badge/base-status-badge.component'
import { FilterMultiselectPanelComponent } from '@/app/shared/components/filter-multiselect-panel/filter-multiselect-panel.component'
import { FilterTextInputComponent } from '@/app/shared/components/filter-text-input/filter-text-input.component'

// Sub-components
import { RotationsFormDialogComponent } from './components/rotations-form-dialog/rotations-form-dialog.component'
import { RotationsConfirmDialogComponent } from './components/rotations-confirm-dialog/rotations-confirm-dialog.component'

// Types
import {
  ShColumnDef,
  ShPaginationConfig,
  ShSortConfig,
  ShTableEvent,
  ActiveFilterChip,
} from '@/app/shared/types/table.types'
import { ShActionItem } from '@/app/shared/types/api.types'

// Services
import { RotationsService } from './services/rotations.service'
import { Company, Facility, InventoryRotation, RotationListRequest, Zone } from './services/rotations.types'
import { AuthService } from '@/app/core/services/auth.service'
import { firstValueFrom } from 'rxjs'
import { TableStateService } from '@/app/shared/services/table-state.service'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { scopeApiFilter, dropFacilityFilters } from '@/app/shared/utils/facility-scope.util'

@Component({
  selector: 'app-rotations',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    ChipModule,
    MultiSelectModule,
    ToggleSwitchModule,
    InputTextModule,
    SelectModule,
    BaseDataTable,
    BaseFormField,
    BaseStatusBadge,
    FilterMultiselectPanelComponent,
    FilterTextInputComponent,
    MenuModule,
    RotationsFormDialogComponent,
    RotationsConfirmDialogComponent,
  ],
  templateUrl: './rotations.component.html',
  styleUrl: './rotations.component.scss',
})
export default class RotationsComponent implements OnInit {
  /** Global facility scope from the topbar selector. */
  private readonly facilityScope = inject(FacilityScopeService)
  private readonly rotationsService = inject(RotationsService)
  private readonly authService = inject(AuthService)
  private readonly translateService = inject(TranslateService)
  private readonly tableState = inject(TableStateService)

  private readonly STATE_KEY = 'binlogic:rotations'

  /** Resets the sort icon on Clear — same pattern as FacilitiesComponent */
  @ViewChild(BaseDataTable) private readonly baseTable!: BaseDataTable

  // === State ===
  rotations = signal<InventoryRotation[]>([])
  zones = signal<Zone[]>([])
  facilities = signal<Facility[]>([])
  companies = signal<Company[]>([])
  loading = signal(false)
  pagination = signal<ShPaginationConfig>({
    page: 1,
    limit: 15,
    total: 0,
    rows_per_page: [5, 10, 15, 25, 50],
  })
  currentSort = signal<ShSortConfig | undefined>(undefined)
  selectedRotations = signal<InventoryRotation[]>([])
  showDialog = signal(false)
  showDeleteConfirm = signal(false)
  savingRotation = signal(false)
  editingRotation = signal<InventoryRotation | null>(null)
  deleteTarget = signal<InventoryRotation | null>(null)

  @ViewChild('rowMenu') rowMenu!: Menu
  menuItems: MenuItem[] = []

  /** Active filter chips — { field, label, displayValue } */
  activeFilters = signal<ActiveFilterChip[]>([])

  /** Selected facility IDs for the toolbar multiselect */
  facilityFilter = signal<string[]>([])

  /** Selected company IDs for the toolbar multiselect */
  companyFilter = signal<string[]>([])

  /** Selected zone IDs for the toolbar multiselect */
  zoneFilter = signal<string[]>([])

  // === Stats ===
  stats = signal([
    {
      label: 'rotations.total',
      value: 0,
      icon: 'pi pi-list',
      bgClass: 'bg-blue-100 dark:bg-blue-900/30',
      iconClass: 'text-blue-600',
    },
  ])

  // === Filter Options ===
  kardexSortOptions = [
    { label: 'Greater than order', value: 'greater_than_order' },
    { label: 'Less than order', value: 'less_than_order' },
  ]

  firstRotationOptions = [
    { label: 'FIFO', value: 'FIFO' },
    { label: 'LIFO', value: 'LIFO' },
    { label: 'LOCATION-BIN ascending', value: 'LOCATION-BIN ascending' },
    { label: 'LOCATION-BIN descending', value: 'LOCATION-BIN descending' },
    { label: 'FEFO', value: 'FEFO' },
    { label: 'LEFO', value: 'LEFO' },
    { label: 'FLFO', value: 'FLFO' },
    { label: 'LLFO', value: 'LLFO' },
    { label: 'TraceCard qty ascending', value: 'tracecard qty ascending' },
    { label: 'TraceCard qty descending', value: 'tracecard qty descending' },
  ]

  secondRotationOptions = [
    { label: 'FIFO', value: 'FIFO' },
    { label: 'LIFO', value: 'LIFO' },
    { label: 'LOCATION-BIN ascending', value: 'LOCATION-BIN ascending' },
    { label: 'LOCATION-BIN descending', value: 'LOCATION-BIN descending' },
  ]

  /** Map field -> human-readable label for the chip header */
  private readonly fieldLabelMap: Record<string, string> = {
    name: 'preferences.rotations.name',
    facility_id: 'labels.facility',
    facility_name: 'labels.facility',
    company_id: 'labels.company',
    kardex_sort: 'preferences.rotations.tracecards_sort',
    first_rotation: 'preferences.rotations.first_rotation',
    second_rotation: 'preferences.rotations.second_rotation',
  }

  /** Options for the facility multiselect in the toolbar (reactive, built from loaded facilities) */
  /**
   * Options offered by the facility column filter.
   *
   * Sourced from the global topbar scope rather than from `facilities()`, so a
   * user can never filter this column for a facility the global selector has
   * excluded. `inScope()` falls back to every facility when the scope is
   * "all", which is the pre-selector behaviour. `facilities()` is left alone:
   * it still backs `getFacilityName()` and the rotation dialog.
   */
  get facilityFilterOptions(): { label: string; value: string }[] {
    return this.facilityScope.inScope().map((f) => ({ label: f.name, value: f.id }))
  }

  /** Options for the company multiselect in the toolbar (reactive, built from loaded companies) */
  get companyFilterOptions(): { label: string; value: string }[] {
    return this.companies().map((c) => ({ label: c.name, value: c.id }))
  }

  /** Options for the zone multiselect in the toolbar (reactive, built from loaded zones) */
  get zoneFilterOptions(): { label: string; value: string }[] {
    return this.zones().map((z) => ({ label: z.name, value: z.id }))
  }

  // === Column definitions ===
  cols: ShColumnDef[] = [
    {
      field: 'name',
      header: 'preferences.rotations.name',
      sortable: true,
      filterable: true,
      filterType: 'text',
      width: '12rem',
      mobileLabel: true,
    },
    {
      field: 'company',
      header: 'labels.company',
      sortable: true,
      filterable: false,
      width: '12rem',
      template: 'company',
    },
    {
      field: 'facility_name',
      header: 'labels.facility',
      sortable: true,
      filterable: false,
      width: '12rem',
      template: 'facility_name',
    },
    {
      field: 'zones',
      header: 'preferences.rotations.zone',
      sortable: true,
      filterable: true,
      width: '14rem',
      template: 'zones',
    },
    {
      field: 'default',
      header: 'preferences.rotations.default',
      sortable: false,
      filterable: false,
      width: '8rem',
      template: 'default',
    },
    {
      field: 'category',
      header: 'preferences.rotations.category',
      sortable: false,
      filterable: false,
      width: '8rem',
      template: 'category',
    },
    {
      field: 'kardex_sort',
      header: 'preferences.rotations.tracecards_sort',
      sortable: true,
      filterable: true,
      filterType: 'multiselect',
      filterOptions: this.kardexSortOptions,
      width: '17rem',
      template: 'kardex_sort',
    },
    {
      field: 'first_rotation',
      header: 'preferences.rotations.first_rotation',
      sortable: true,
      filterable: true,
      filterType: 'multiselect',
      filterOptions: this.firstRotationOptions,
      width: '13rem',
      template: 'first_rotation',
    },
    {
      field: 'second_rotation',
      header: 'preferences.rotations.second_rotation',
      sortable: true,
      filterable: true,
      filterType: 'multiselect',
      filterOptions: this.secondRotationOptions,
      width: '15rem',
      template: 'second_rotation',
    },
  ]
  selectedColumns: ShColumnDef[] = this.cols

  // === Filter controls ===
  searchControl = new FormControl('')

  // === Lifecycle ===
  ngOnInit() {
    this.restoreState()
    this.rotationsService.getZones().subscribe((res) => {
      if (res) {
        this.zones.set(res.data)
        // Re-resolve chips now that zone lookup data is available
        if (Object.keys(this.activeBackendFilters).length > 0) {
          this.buildFilterChips(this.activeBackendFilters)
        }
      }
    })
  }

  /** Restore persisted filter/sort/page from localStorage before the first load. */
  private restoreState(): void {
    const saved = this.tableState.load(this.STATE_KEY)
    if (saved?.filters && Object.keys(saved.filters).length > 0) {
      this.activeBackendFilters = saved.filters as Record<string, any>

      // Restore toolbar multiselect signals from persisted filters
      const f = this.activeBackendFilters
      if (f['facility_id']?.value) this.facilityFilter.set(f['facility_id'].value)
      if (f['company_id']?.value) this.companyFilter.set(f['company_id'].value)
      if (f['zones']?.value) this.zoneFilter.set(f['zones'].value)

      this.buildFilterChips(this.activeBackendFilters)
    }
    if (saved?.page) {
      this.pagination.update((p) => ({ ...p, page: saved.page! }))
    }
    if (saved?.sort) {
      this.currentSort.set(saved.sort)
    }
    this.loadData()
  }

  /** Persist the current filter/sort/page state to localStorage. */
  private saveState(): void {
    const sort = this.currentSort()
    this.tableState.save(this.STATE_KEY, {
      filters: this.activeBackendFilters as Record<string, unknown>,
      page: this.pagination().page,
      sort: sort ? { field: sort.field, order: sort.order } : undefined,
    })
  }

  // === Helpers ===
  private getFacilityId(): string {
    const defaultFacilityId = '019d98dd-89a7-79ed-96da-4da97a4ff86e'
    return this.authService.authInfo()?.uid || defaultFacilityId
  }

  /** Resolve a facility_id to its display name using the facilities list from the API.
   * Falls back to partial match (handles trailing-char data issues),
   * then shows a short truncated ID if nothing matches. */
  getFacilityName(facilityId: string): string {
    if (!facilityId) return '—'
    const facs = this.facilities()
    // 1. Exact match
    const exact = facs.find((f) => f.id === facilityId)
    if (exact) return exact.name
    // 2. Partial match (e.g., facility_id has a trailing char from bad test data)
    const partial = facs.find(
      (f) => facilityId.startsWith(f.id) || f.id.startsWith(facilityId)
    )
    if (partial) return partial.name
    // 3. Fallback: truncated UUID
    return facilityId.length > 14 ? facilityId.substring(0, 8) + '…' : facilityId
  }

  getCompanyName(companyId: string): string {
    if (!companyId) return '—'
    const comps = this.companies()
    const exact = comps.find((c) => c.id === companyId)
    if (exact) return exact.name
    const partial = comps.find(
      (c) => companyId.startsWith(c.id) || c.id.startsWith(companyId)
    )
    if (partial) return partial.name
    return companyId.length > 14 ? companyId.substring(0, 8) + '…' : companyId
  }

  getZoneNames(zoneIds: string[]): string[] {
    return zoneIds.map((id) => this.zones().find((z) => z.id === id)?.name || id)
  }

  getKardexSortLabel(val: string): string {
    if (!val) return '—'
    return this.kardexSortOptions.find((o) => o.value === val)?.label || val
  }

  getFirstRotationLabel(val: string): string {
    if (!val) return '—'
    return this.firstRotationOptions.find((o) => o.value === val)?.label || val
  }

  getSecondRotationLabel(val: string): string {
    if (!val) return '—'
    return this.secondRotationOptions.find((o) => o.value === val)?.label || val
  }

  // === Data loading ===
  async loadData() {
    this.loading.set(true)
    try {
      const page = this.pagination().page
      const limit = this.pagination().limit

      const request: RotationListRequest = {
        config: {
          page: page,
          rows: limit,
          populate_data: true,
        },
      }

      // Add sort
      const sort = this.currentSort()
      if (sort) {
        request.config.sort_field = [
          {
            field: sort.field,
            order: sort.order === 'asc' ? 1 : -1,
          },
        ]
      }

      // Build filters from search control + active column filters
      request.filter = {}

      const searchValue = this.searchControl.value
      if (searchValue) {
        request.filter['$or'] = [
          { name: { match_mode: 'contains', value: searchValue } },
          { kardex_sort: { match_mode: 'contains', value: searchValue } },
          { first_rotation: { match_mode: 'contains', value: searchValue } },
          { second_rotation: { match_mode: 'contains', value: searchValue } }
        ]
      }

      // Map column filters (from table events) to backend format
      this.appendColumnFilters(request.filter)

      const response = await firstValueFrom(this.rotationsService.getRotations({
        ...request,
        filter: scopeApiFilter(request.filter ?? {}, this.facilityScope.apiValue()),
      }))

      this.rotations.set(response.data || [])
      // Store facilities for name lookup in the table
      if (response.facilities) {
        this.facilities.set(response.facilities)
      }
      if (response.companies) {
        this.companies.set(response.companies)
      }

      // Re-resolve chips now that lookup data (facilities, companies) is available
      if (Object.keys(this.activeBackendFilters).length > 0) {
        this.buildFilterChips(this.activeBackendFilters)
      }

      this.pagination.update((p) => ({ ...p, total: response.meta_data?.total_records || 0 }))
      this.stats.update((s) => {
        s[0].value = response.meta_data?.total_records || 0
        return s
      })
    } catch (error: any) {
      console.error('Error loading rotations', error)
      if (error?.error) {
        console.error('Backend validation error:', error.error)
      }
      // Handle error notification
    } finally {
      this.loading.set(false)
    }
  }

  /** Maps active column filters (from table events) into the backend filter payload. */
  private appendColumnFilters(filter: NonNullable<RotationListRequest['filter']>): void {
    for (const field of Object.keys(this.activeBackendFilters)) {
      const f = this.activeBackendFilters[field]
      if (f?.value === undefined || f.value === null || f.value === '') continue
      const matchMode = f.matchMode || 'contains'
      const value = f.value
      filter[field] = {
        match_mode: Array.isArray(value) ? 'in' : matchMode,
        value,
      }
    }
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
    // Merge column-level filters from the table into the existing backend
    // filters (facility / company / zone dropdowns). Without merging, a
    // page or rows-per-page change emits event.filters={} which would wipe
    // out the backend filters that were set via the custom filter panels.
    if (event.filters === undefined) {
      this.saveState()
      this.loadData()
    } else {
      const merged = { ...this.activeBackendFilters, ...event.filters }
      this.applyColumnFiltersToRequest(merged)
    }
  }

  /**
   * Converts the table filter map (field -> { value, matchMode }) into
   * backend filter payload and triggers a new data load.
   */
  private applyColumnFiltersToRequest(filters: Record<string, any>) {
    this.activeBackendFilters = filters
    this.buildFilterChips(filters)
    this.saveState()
    this.loadData()
  }

  /** The last filter map sent from the table */
  private activeBackendFilters: Record<string, any> = {}

  onSelectionChange(selection: InventoryRotation[]) {
    this.selectedRotations.set(selection)
  }

  clearSelection() {
    this.selectedRotations.set([])
  }

  /** Column selector change — re-filters `cols` in original definition order
   *  so that checking/unchecking never reorders visible columns. */
  onColumnSelectionChange(selection: ShColumnDef[]) {
    const selectedFields = new Set(selection.map((c) => c.field))
    this.selectedColumns = this.cols.filter((c) => selectedFields.has(c.field))
  }

  // === Filters ===
  applyFilters() {
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadData()
  }

  clearAllFilters() {
    this.searchControl.setValue('')
    this.facilityFilter.set([])
    this.companyFilter.set([])
    this.zoneFilter.set([])
    this.activeBackendFilters = {}
    this.activeFilters.set([])
    this.currentSort.set(undefined)
    this.baseTable?.clearSort()
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.tableState.clear(this.STATE_KEY)
    this.loadData()
  }

  removeFilterChip(field: string) {
    const filters = { ...this.activeBackendFilters }
    delete filters[field]
    // If removing the facility filter, also reset the multiselect signal
    if (field === 'facility_id') {
      this.facilityFilter.set([])
    }
    // If removing the company filter, also reset the multiselect signal
    if (field === 'company_id') {
      this.companyFilter.set([])
    }
    // If removing the zone filter, also reset the multiselect signal
    if (field === 'zones') {
      this.zoneFilter.set([])
    }
    this.activeBackendFilters = filters
    this.buildFilterChips(filters)
    this.tableState.clearFilterByField(this.STATE_KEY, field)
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadData()
  }

  onFacilityFilterChange(selectedIds: string[]) {
    this.facilityFilter.set(selectedIds)
    const filters = { ...this.activeBackendFilters }
    if (selectedIds.length > 0) {
      filters['facility_id'] = { value: selectedIds, matchMode: 'in' }
    } else {
      delete filters['facility_id']
    }
    this.activeBackendFilters = filters
    this.buildFilterChips(filters)
    this.saveState()
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadData()
  }

  onCompanyFilterChange(selectedIds: string[]) {
    this.companyFilter.set(selectedIds)
    const filters = { ...this.activeBackendFilters }
    if (selectedIds.length > 0) {
      filters['company_id'] = { value: selectedIds, matchMode: 'in' }
    } else {
      delete filters['company_id']
    }
    this.activeBackendFilters = filters
    this.buildFilterChips(filters)
    this.saveState()
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadData()
  }

  onZoneFilterChange(selectedIds: string[]) {
    this.zoneFilter.set(selectedIds)
    const filters = { ...this.activeBackendFilters }
    if (selectedIds.length > 0) {
      filters['zones'] = { value: selectedIds, matchMode: 'in' }
    } else {
      delete filters['zones']
    }
    this.activeBackendFilters = filters
    this.buildFilterChips(filters)
    this.saveState()
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadData()
  }

  /** Returns the current filter value for a given field (used by the custom filterRow template) */
  getActiveFilterValue(field: string): any {
    return this.activeBackendFilters[field]?.value ?? null
  }

  /** Called from the custom filterRow template for text/select filters */
  onColumnFilterChange(field: string, event: any) {
    const filters = { ...this.activeBackendFilters }

    // Handle null — filter cleared by the input component
    if (event === null || event === undefined) {
      delete filters[field]
    } else {
      // Unwrap { value, matchMode } from applyWithMode, or use raw value
      const value = event?.value === undefined ? event : event.value
      const matchMode: string = event?.matchMode ?? (Array.isArray(value) ? 'in' : 'contains')

      if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
        filters[field] = { value, matchMode }
      } else {
        delete filters[field]
      }
    }

    this.activeBackendFilters = filters
    this.buildFilterChips(filters)
    this.saveState()
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadData()
  }

  private buildFilterChips(filters: Record<string, any>) {
    const chips: ActiveFilterChip[] = []
    for (const field of Object.keys(filters)) {
      const f = filters[field]
      if (f?.value === undefined || f.value === null || f.value === '') continue
      const labelKey = this.fieldLabelMap[field] || field
      const label = this.translateService.instant(labelKey)
      const raw = f.value
      let displayValue: string
      if (Array.isArray(raw)) {
        if (field === 'zones') {
          // Resolve zone UUIDs to names
          displayValue = raw
            .map((id: string) => this.zones().find((z) => z.id === id)?.name || id)
            .join(', ')
        } else if (field === 'facility_id') {
          // Resolve facility UUIDs to names
          displayValue = raw
            .map((id: string) => this.facilities().find((fac) => fac.id === id)?.name || id)
            .join(', ')
        } else if (field === 'company_id') {
          // Resolve company UUIDs to names
          displayValue = raw
            .map((id: string) => this.companies().find((c) => c.id === id)?.name || id)
            .join(', ')
        } else {
          displayValue = raw.join(', ')
        }
      } else {
        displayValue = String(raw)
      }
      chips.push({ field, label, displayValue })
    }
    this.activeFilters.set(chips)
  }

  // === Row actions ===
  onRowMenuClick(event: Event, row: InventoryRotation): void {
    this.menuItems = [
      {
        label: this.translateService.instant('buttons.edit'),
        icon: 'pi pi-pencil',
        command: () => this.openEditDialog(row),
      },
      {
        label: this.translateService.instant('labels.delete'),
        icon: 'pi pi-trash',
        styleClass: 'text-red-500',
        command: () => this.onDeleteRow(row),
      },
    ]
    this.rowMenu.toggle(event)
  }

  // === Dialog ===
  openCreateDialog() {
    this.editingRotation.set(null)
    this.showDialog.set(true)
  }

  openEditDialog(rotation: InventoryRotation) {
    this.editingRotation.set(rotation)
    this.showDialog.set(true)
  }

  async onSaveRotation(formValue: Record<string, any>) {
    this.savingRotation.set(true)

    try {
      // Build payload based on formValue and DTO
      const payload = {
        facility_id: formValue['facility_id'],
        company_id: formValue['company_id'],
        name: formValue['name'],
        default: formValue['default'] || false,
        zones: Array.isArray(formValue['zones']) ? formValue['zones'] : [],
        category: formValue['category'] || false,
        kardex_sort: formValue['kardex_sort'],
        first_rotation: formValue['first_rotation'],
        second_rotation: formValue['second_rotation'] || '',
      }

      const editing = this.editingRotation()
      if (editing) {
        await firstValueFrom(this.rotationsService.updateRotation(editing.id, payload))
      } else {
        await firstValueFrom(this.rotationsService.createRotation(payload as any))
      }

      this.showDialog.set(false)
      this.loadData()
    } catch (error) {
      console.error('Error saving rotation', error)
      // Handle error
    } finally {
      this.savingRotation.set(false)
    }
  }

  // === Bulk actions ===
  getBulkActions(): ShActionItem[] {
    const count = this.selectedRotations().length
    if (count === 0) return []
    return [
      {
        label: `Delete ${count} selected`,
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.onBulkDelete(),
      },
      {
        label: 'Clear selection',
        icon: 'pi pi-times',
        command: () => this.clearSelection(),
      },
    ]
  }

  // === Delete ===
  onDeleteRow(rotation: InventoryRotation) {
    this.deleteTarget.set(rotation)
    this.showDeleteConfirm.set(true)
  }

  onBulkDelete() {
    this.deleteTarget.set(null)
    this.showDeleteConfirm.set(true)
  }

  onConfirmDelete() {
    this.savingRotation.set(true) // Reusing the flag or use a new one for deleting
    this.confirmDeleteInternal()
  }

  private async confirmDeleteInternal() {
    try {
      const target = this.deleteTarget()
      if (target) {
        await firstValueFrom(this.rotationsService.deleteRotation(target.id))
      } else {
        // Bulk delete logic if there is an endpoint for it
        // Or loop through selections
        const selections = this.selectedRotations()
        for (const sel of selections) {
          await firstValueFrom(this.rotationsService.deleteRotation(sel.id))
        }
      }

      this.showDeleteConfirm.set(false)
      this.deleteTarget.set(null)
      this.selectedRotations.set([])
      this.loadData()
    } catch (error) {
      console.error('Error deleting rotation', error)
    } finally {
      this.savingRotation.set(false)
    }
  }

  async onToggleDefault(rotation: InventoryRotation, newValue: boolean) {
    try {
      await firstValueFrom(this.rotationsService.toggleDefault(rotation.id, newValue))
      this.loadData()
    } catch (error) {
      console.error('Error toggling default', error)
    }
  }
}
