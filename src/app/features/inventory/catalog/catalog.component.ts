import { Component, effect, inject, OnInit, signal, ViewChild } from '@angular/core'
import { Router } from '@angular/router'
import { forkJoin, map } from 'rxjs'
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { ChipModule } from 'primeng/chip'
import { MultiSelectModule } from 'primeng/multiselect'
import { ToastModule } from 'primeng/toast'
import { TooltipModule } from 'primeng/tooltip'
import { DrawerModule } from 'primeng/drawer'
import { BadgeModule } from 'primeng/badge'
import { TagModule } from 'primeng/tag'
import { MessageService, MenuItem } from 'primeng/api'
import { MenuModule, Menu } from 'primeng/menu'

// Shared base components
import { BaseDataTable } from '@/app/shared/components/datatable/data-table/base-data-table.component'
import { BaseActionMenu } from '@/app/shared/components/actions/action-menu/base-action-menu.component'
import {
  BaseImportExportMenu,
  ExportPageFetcher,
} from '@/app/shared/components/import-export-menu/base-import-export-menu.component'
import { BaseImportDialog } from '@/app/shared/components/import-dialog/base-import-dialog.component'
import { ImportFileFormat, ImportLog } from '@/app/shared/types/import.types'
import { TableStateService } from '@/app/shared/services/table-state.service'

import { FilterMultiselectPanelComponent } from '@/app/shared/components/filter-multiselect-panel/filter-multiselect-panel.component'
import { FilterTextInputComponent } from '@/app/shared/components/filter-text-input/filter-text-input.component'
import { FilterPresetManagerComponent } from '@/app/shared/components/filter-preset-manager/filter-preset-manager.component'
import { FilterApplyService } from '@/app/shared/components/filter-clear/filter-apply.service'
import { FilterPresetService } from '@/app/shared/services/filter-preset.service'
import { FilterPreset, buildFiltersFromConditions, presetCombinator } from '@/app/shared/types/filter-preset.types'
import { buildFilterChipsFromColumns } from '@/app/shared/utils/filter-chips.util'

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
import { CatalogService } from './catalog.service'
import { CatalogItem, CatalogFilter, Company, ProductListItem } from './types/catalog.types'

// Sub-components
import { SkuFormDialogComponent } from './components/sku-form-dialog/sku-form-dialog.component'
import { SkuCreateDialogComponent } from './components/sku-create-dialog/sku-create-dialog.component'
import { provideTableColumns } from '@/app/shared/services/table-columns.bus'

// Label Generator
import { LabelGeneratorDialog } from '@/app/shared/components'

@Component({
  selector: 'app-catalog',
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
    BadgeModule,
    TagModule,
    MenuModule,
    DecimalPipe,
    DatePipe,
    BaseDataTable,
    BaseActionMenu,
    BaseImportExportMenu,
    BaseImportDialog,
    FilterMultiselectPanelComponent,
    FilterTextInputComponent,
    FilterPresetManagerComponent,
    // Sub-components
    SkuFormDialogComponent,
    SkuCreateDialogComponent,
    // Label Generator
    LabelGeneratorDialog,
  ],
  providers: [MessageService, provideTableColumns()],
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.scss',
})
export default class CatalogComponent implements OnInit {
  private readonly catalogService = inject(CatalogService)
  private readonly messageService = inject(MessageService)
  private readonly translate = inject(TranslateService)
  private readonly filterService = inject(FilterApplyService)
  private readonly filterPresetService = inject(FilterPresetService)

  readonly PRESET_PAGE_KEY = 'catalog'
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
  private readonly tableState = inject(TableStateService)
  private readonly router = inject(Router)
  /** localStorage key holding this table's filters / sort / page / column selection */
  private readonly STATE_KEY = 'binlogic:catalog'

  /** Reference to base-data-table — used to reset its internal filters on Clear */
  @ViewChild(BaseDataTable) private readonly baseTable!: BaseDataTable

  /** Shared popup menu for row actions — same pattern as Locations / Receivings */
  @ViewChild('rowMenu') rowMenu!: Menu
  rowMenuItems: MenuItem[] = []

  // ═══════════════════════════════════════════════════════
  // Inventory state
  // ═══════════════════════════════════════════════════════
  activeFilters = signal<ActiveFilterChip[]>([])
  activeBackendFilters: Record<string, any> = {}
  companyFilter = signal<string[]>([])
  showMobileFilters = signal(false)

  catalogItems = signal<CatalogItem[]>([])
  inventoryLoading = signal(false)
  inventoryPagination = signal<ShPaginationConfig>({
    page: 1, limit: 15, total: 0, rows_per_page: [10, 15, 25, 50],
  })
  currentSort = signal<ShSortConfig | undefined>(undefined)
  currentFilters = signal<CatalogFilter>({})

  // Auxiliary data
  companies = signal<Company[]>([])

  // ═══════════════════════════════════════════════════════
  // Dialog state
  // ═══════════════════════════════════════════════════════
  showSkuCreateDialog = signal(false)
  skuCreatePreselectedProduct = signal<ProductListItem | null>(null)
  showSkuEditDialog = signal(false)
  editingSku = signal<CatalogItem | null>(null)

  // Label Generator
  selectedItems = signal<CatalogItem[]>([])
  showLabelDialog = signal(false)

  // ═══════════════════════════════════════════════════════
  // Columns
  // ═══════════════════════════════════════════════════════
  cols: ShColumnDef[] = []
  selectedColumns: ShColumnDef[] = []

  private buildColumns(): ShColumnDef[] {
    return [
      {
        field: 'company_name', header: 'labels.company', sortable: true, filterable: true,
        filterType: 'multiselect',
        filterOptions: this.companies().map(c => ({ label: c.name, value: c.id })),
        width: '12rem', template: 'company', mobileVisible: true,
      },
      { field: 'image_path', header: 'labels.image', sortable: false, filterable: false, width: '5rem', template: 'image', exportable: false },
      { field: 'sku', header: 'labels.sku', sortable: true, filterable: true, filterType: 'text', width: '12rem', template: 'sku', mobileLabel: true, mobileVisible: true },
      { field: 'barcode', header: 'labels.barcode', sortable: true, filterable: true, filterType: 'text', width: '12rem', template: 'barcode' },
      { field: 'description', header: 'labels.description', sortable: true, filterable: true, filterType: 'text', width: '20rem', template: 'description', mobileVisible: true },
      { field: 'available', header: 'labels.available', sortable: true, filterable: true, filterType: 'numeric', width: '8rem', template: 'number' },
      { field: 'asign', header: 'labels.asign', sortable: true, filterable: true, filterType: 'numeric', width: '8rem', template: 'number' },
      { field: 'reserved', header: 'labels.reserved', sortable: true, filterable: true, filterType: 'numeric', width: '8rem', template: 'number' },
      { field: 'hurt', header: 'labels.hurt', sortable: true, filterable: true, filterType: 'numeric', width: '8rem', template: 'number' },
      { field: 'blocked', header: 'labels.blocked', sortable: true, filterable: true, filterType: 'numeric', width: '8rem', template: 'number' },
      { field: 'in_transit', header: 'labels.in_transit', sortable: true, filterable: true, filterType: 'numeric', width: '8rem', template: 'number' },
      { field: 'back_order', header: 'labels.back_order', sortable: true, filterable: true, filterType: 'numeric', width: '8rem', template: 'number' },
    ]
  }

  // ═══════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════
  ngOnInit() {
    this.filterPresetService.loadPresets(this.PRESET_PAGE_KEY)
    this.loadAuxiliaryData()
    this.loadInventoryData()
  }

  // ═══════════════════════════════════════════════════════
  // Persisted state (filters / sort / page / columns)
  // ═══════════════════════════════════════════════════════
  /** Restores filters, sort and page saved in a previous visit. */
  private restoreState(): void {
    if (Object.keys(this.activeBackendFilters).length > 0) {
      this.buildFilterChips(this.activeBackendFilters)
      if (this.activeBackendFilters['company_name']?.value) {
        this.companyFilter.set(this.activeBackendFilters['company_name'].value)
      }
      this.currentFilters.set(this.buildApiFilter(this.activeBackendFilters))
    }
    const saved = this.tableState.load(this.STATE_KEY)
    if (saved?.page) this.inventoryPagination.update(p => ({ ...p, page: saved.page! }))
    if (saved?.sort) this.currentSort.set(saved.sort)
  }

  private saveState(): void {
    this.tableState.save(this.STATE_KEY, {
      filters: this.activeBackendFilters as Record<string, unknown>,
      page:    this.inventoryPagination().page,
      sort:    this.currentSort(),
    })
  }

  /** Persists the visible column selection so it survives a page reload. */
  private saveColumns(): void {
    this.tableState.save(this.STATE_KEY, {
      columns: this.selectedColumns.map(c => c.field),
    })
  }

  // ═══════════════════════════════════════════════════════
  // Data loading
  // ═══════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════
  // Import
  // ═══════════════════════════════════════════════════════

  showImportDialog = signal(false)
  /** File type the dialog was opened for — By .csv or By .xlsx. */
  importFormat = signal<ImportFileFormat>('csv')

  openImport(format: ImportFileFormat = 'csv'): void {
    this.importFormat.set(format)
    this.showImportDialog.set(true)
  }

  /** New SKUs landed, so the table has to catch up. */
  onImported(log: ImportLog): void {
    if (log.success_count > 0) this.loadInventoryData()
  }

  /** Opens the Upload Logs view on the log the user just produced. */
  goToUploadLogs(log?: ImportLog): void {
    this.router.navigate(['app/inventory/catalog/upload-logs'], {
      queryParams: log ? { log: log.id } : undefined,
    })
  }

  /**
   * Feeds the header's export menu: pages the catalog with the filters and sort
   * the table is using, so the file covers every matching record.
   */
  /**
   * The request the catalog list is made of. One definition for the table and
   * for the export, so a change to the filters or the sort cannot reach one
   * and miss the other.
   */
  private listRequest(page: number, rows: number) {
    const sort = this.currentSort()
    return {
      filter: this.currentFilters(),
      config: {
        page,
        rows,
        sort_field: sort ? [{ field: sort.field, order: sort.order === 'asc' ? 1 : -1 }] : [],
      },
    }
  }

  readonly fetchExportPage: ExportPageFetcher = (page, rows) =>
    this.catalogService
      .listCatalog(this.listRequest(page, rows))
      .pipe(map(resp => ({ data: resp.data || [], total: resp.meta_data.total_records })))

  loadInventoryData() {
    this.inventoryLoading.set(true)

    this.catalogService.listCatalog(
      this.listRequest(this.inventoryPagination().page, this.inventoryPagination().limit)
    ).subscribe({
      next: resp => {
        this.catalogItems.set((resp.data || []).map(item => ({ ...item, id: item.sku_id })))
        this.inventoryPagination.update(p => ({ ...p, total: resp.meta_data.total_records }))
        this.refreshColumns()
        this.inventoryLoading.set(false)
      },
      error: () => {
        this.inventoryLoading.set(false)
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
      companies: this.catalogService.listCompanies({
        filter: {},
        config: { page: 1, rows: 500 },
      }),
    }).subscribe({
      next: result => {
        this.companies.set(result.companies.data || [])
        this.refreshColumns()
        // Re-build chips now that company names resolve (restored chips showed IDs)
        this.buildFilterChips(this.activeBackendFilters)
      },
    })
  }

  refreshColumns() {
    this.cols = this.buildColumns()
    if (this.selectedColumns.length === 0) {
      // First build — restore the persisted selection, falling back to all columns
      this.selectedColumns = this.tableState.resolveColumns(this.STATE_KEY, this.cols) ?? this.cols
    } else {
      this.selectedColumns = this.selectedColumns.map(sc => {
        const updated = this.cols.find(c => c.field === sc.field)
        return updated || sc
      })
    }
  }

  // ═══════════════════════════════════════════════════════
  // Table events
  // ═══════════════════════════════════════════════════════
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
    this.saveColumns()
  }

  // === Table events (parcels pattern) ===
  onTableStateChange(event: ShTableEvent) {
    this.inventoryPagination.set(event.pagination)
    if (event.sort) this.currentSort.set(event.sort)

    const appliedFilter = event.filters
      ? this.filterService.applyFilterNew(event.filters, {})
      : {}
    const finalFilters = { ...appliedFilter, ...this.activeBackendFilters }
    this.buildFilterChips(finalFilters)
    this.currentFilters.set(this.buildApiFilter(finalFilters))
    this.saveState()
    this.loadInventoryData()
  }

  clearFilters() {
    this.activeBackendFilters = {}
    this.companyFilter.set([])
    this.activeFilters.set([])
    this.currentFilters.set({})
    this.activePresetColor.set(null)
    this.activePresetName.set(null)
    this.filterPresetService.clearLastApplied()
    this.currentSort.set(undefined)
    this.baseTable?.resetColumnFilters()
    this.inventoryPagination.update(p => ({ ...p, page: 1 }))
    // Keep the persisted column selection — only filters / sort / page are reset
    this.tableState.clearFilters(this.STATE_KEY)
    this.tableState.save(this.STATE_KEY, { page: 1, sort: undefined })
    this.loadInventoryData()
  }

  onPresetSelected(preset: FilterPreset): void {
    this.activePresetColor.set(preset.color ?? null)
    this.activePresetName.set(preset.name)
    this.activeBackendFilters = buildFiltersFromConditions(preset.conditions ?? [])
    this.companyFilter.set(this.activeBackendFilters['company_name']?.value ?? [])
    if (preset.sort_field) {
      this.currentSort.set({ field: preset.sort_field, order: (preset.sort_order as 'asc' | 'desc') ?? 'asc' })
    } else {
      this.currentSort.set(undefined)
    }
    this.currentFilters.set(this.buildApiFilter(this.activeBackendFilters))
    this.buildFilterChips(this.activeBackendFilters)
    this.inventoryPagination.update(p => ({ ...p, page: 1 }))
    this.loadInventoryData()
  }

  private buildApiFilter(filters?: Record<string, any>): CatalogFilter {
    const apiFilter: CatalogFilter = {}
    const fieldMap: Record<string, string> = { company_name: 'company_id' }
    for (const [field, val] of Object.entries(filters ?? {})) {
      if (val?.value !== null && val?.value !== undefined && val?.value !== '') {
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

  onMultiselectApply(field: string, values: any[]) {
    if (field === 'company_name') this.companyFilter.set(values)
    this.updateTableFilter(field, values)
  }

  onMultiselectClear(field: string) {
    if (field === 'company_name') this.companyFilter.set([])
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
    if (event === null || event === undefined) {
      delete filters[field]
      this.applyBackendFilters(filters)
      return
    }
    let value = event?.value === undefined ? event : event.value
    let matchMode = event?.matchMode ?? null
    if (value instanceof Date) value = value.toISOString().split('T')[0]
    if (value !== null && value !== undefined && value !== '') {
      if (!matchMode) matchMode = Array.isArray(value) ? 'in' : 'contains'
      filters[field] = { value, matchMode }
    } else {
      delete filters[field]
    }
    this.applyBackendFilters(filters)
  }

  private updateTableFilter(field: string, values: any[]) {
    const filters = { ...this.activeBackendFilters }
    if (values && values.length > 0) {
      filters[field] = { value: values, matchMode: 'in' }
    } else {
      delete filters[field]
    }
    this.applyBackendFilters(filters)
  }

  removeFilterChip(field: string): void {
    const filters = { ...this.activeBackendFilters }
    delete filters[field]
    if (field === 'company_name') this.companyFilter.set([])
    this.applyBackendFilters(filters)
  }

  /** Stores the filters, refreshes chips/API filter and reloads from page 1. */
  private applyBackendFilters(filters: CatalogComponent['activeBackendFilters']): void {
    this.activeBackendFilters = filters
    this.buildFilterChips(filters)
    this.currentFilters.set(this.buildApiFilter(filters))
    this.inventoryPagination.update(p => ({ ...p, page: 1 }))
    this.saveState()
    this.loadInventoryData()
  }

  private buildFilterChips(filters: any): void {
    try {
      const resolvers: Record<string, (v: any) => string> = {
        company_name: (id: string) => this.companyName(id),
      }
      this.activeFilters.set(
        buildFilterChipsFromColumns(filters, this.cols, this.translate, resolvers)
      )
    } catch (err) {
      console.error('Error building filter chips:', err)
      this.activeFilters.set([])
    }
  }

  companyName(id: string | undefined | null): string {
    if (!id) return '—'
    const company = this.companies().find(c => c.id === id)
    return company?.name || id.substring(0, 8)
  }

  // ═══════════════════════════════════════════════════════
  // Navigation
  // ═══════════════════════════════════════════════════════
  /**
   * Opens the SKU history — same destination the Tracecards module links to
   * from its SKU column (`source=sku` makes that view filter by sku_id).
   */
  navigateToSkuHistory(row: CatalogItem) {
    this.router.navigate(['/app/inventory/tracecards/history', row.sku_id], {
      queryParams: { source: 'sku' },
    })
  }

  // ═══════════════════════════════════════════════════════
  // Row actions
  // ═══════════════════════════════════════════════════════
  getSkuActions(row: CatalogItem): ShActionItem[] {
    return [
      { label: 'labels.edit', icon: 'pi pi-pencil', command: () => this.openEditSkuDialog(row) },
    ]
  }

  /**
   * Opens the shared popup menu for a row. Building the items here (instead of
   * binding a fresh array per row on every change detection) keeps the menu DOM
   * stable while it is open, so a single click on an item is enough.
   */
  openRowMenu(event: Event, row: CatalogItem): void {
    const items: MenuItem[] = []
    for (const a of this.getSkuActions(row)) {
      if (a.visible === false) continue
      if (a.separator) {
        items.push({ separator: true })
      }
      items.push({
        label: this.translate.instant(a.label),
        icon: a.icon,
        disabled: a.disabled,
        command: a.command,
        styleClass: a.severity === 'danger' ? 'text-red-500' : '',
      })
    }
    this.rowMenuItems = items
    this.rowMenu?.toggle(event)
  }

  // ═══════════════════════════════════════════════════════
  // Dialog handlers
  // ═══════════════════════════════════════════════════════
  openSkuCreateDialog(preselectedProduct?: ProductListItem) {
    this.skuCreatePreselectedProduct.set(preselectedProduct || null)
    this.showSkuCreateDialog.set(true)
  }

  openEditSkuDialog(row: CatalogItem) {
    this.editingSku.set(row)
    this.showSkuEditDialog.set(true)
  }

  // ═══════════════════════════════════════════════════════
  // Save handlers
  // ═══════════════════════════════════════════════════════
  onSkuCreated() {
    this.showSkuCreateDialog.set(false)
    this.loadInventoryData()
  }

  onSkuUpdated() {
    this.showSkuEditDialog.set(false)
    this.loadInventoryData()
  }

  // Image fallback
  handleMissingImage(event: Event) {
    ;(event.target as HTMLImageElement).src =
      'https://cdn3d.iconscout.com/3d/premium/thumb/shipping-package-3d-icon-download-in-png-blend-fbx-gltf-file-formats--cardboard-box-delivery-pack-icons-6220845.png?f=webp'
  }
}
