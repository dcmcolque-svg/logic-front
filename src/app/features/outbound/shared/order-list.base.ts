import {
  computed,
  Directive,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslateService } from '@ngx-translate/core'
import { Observable } from 'rxjs'
import { ConfirmationService, MenuItem, MessageService, ToastMessageOptions } from 'primeng/api'
import { Menu } from 'primeng/menu'

import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { BaseDataTable } from '@/app/shared/components/datatable/data-table/base-data-table.component'
import { TableStateService } from '@/app/shared/services/table-state.service'
import { LocationService } from '@/app/features/preferences/locations/location.service'
import { Facility } from '@/app/features/preferences/locations/types/location.types'
import { ShColumnDef, ShPaginationConfig, ShSortConfig, ShTableEvent } from '@/app/shared/types/table.types'
import { dropFacilityFilters, scopeApiFilter } from '@/app/shared/utils/facility-scope.util'

import { OrderService } from '../order.service'
import { Order, OrderFilter } from '../types/order.types'
import {
  buildOrderApiFilter,
  FilterValue,
  mergeTableFilters,
  orderSortField,
  UiFilters,
  withColumnFilter,
  withMultiselectFilter,
} from './order-filter.util'
import { orderRecipientName } from './order-format.util'
import {
  OrderBatchItemResult,
  OrderColumnFilter,
  OrderMenuAction,
  OrderMultiselectColumnFilter,
} from './order-list.types'

/** How `runBatch` reports the per-order results of a batch request. */
export interface OrderBatchOptions<R extends OrderBatchItemResult> {
  /** Result status (or statuses) that counts as success. */
  successStatus: string | string[]
  /** Translation key appended to the success count. */
  successKey: string
  successLife: number
  /** Toast for each failed order; defaults to an error toast with `r.error.message`. */
  failureToast?: (r: R) => ToastMessageOptions
  /** Also clear the table's own checkbox selection. */
  clearTableSelection?: boolean
}

function appliesTo(action: OrderMenuAction, status: string | undefined): boolean {
  return !action.statuses || action.statuses.includes(status as string)
}

/**
 * Shared state and behaviour of the outbound order lists (All Orders,
 * Backorders, Processing): server-side pagination/sort/filters persisted in
 * TableStateService, the global facility scope and the facility filter, column
 * toggling, row/bulk action menus with confirmation, batch result toasts and
 * the detail drawer.
 */
@Directive()
export abstract class OrderListBase implements OnInit {
  protected readonly orderService = inject(OrderService)
  protected readonly locationService = inject(LocationService)
  protected readonly messageService = inject(MessageService)
  protected readonly confirmationService = inject(ConfirmationService)
  protected readonly translate = inject(TranslateService)
  protected readonly tableState = inject(TableStateService)
  /** Global facility scope from the topbar selector. */
  protected readonly facilityScope = inject(FacilityScopeService)

  @ViewChild('orderMenu') orderMenu!: Menu
  @ViewChild(BaseDataTable) protected readonly baseTable!: BaseDataTable
  rowMenuItems: MenuItem[] = []

  /** TableStateService key the list persists its filters, page and sort under. */
  protected abstract readonly stateKey: string
  /** Send Date filter values as `yyyy-MM-dd` strings instead of Date objects. */
  protected readonly formatDateFilters: boolean = false

  // === Table state ===
  orders = signal<Order[]>([])
  loading = signal(false)
  pagination = signal<ShPaginationConfig>({
    page: 1,
    limit: 15,
    total: 0,
    rows_per_page: [10, 15, 25, 50],
  })
  currentSort = signal<ShSortConfig | undefined>(undefined)
  currentFilters = signal<OrderFilter>({})
  selectedOrders = signal<Order[]>([])

  // Detail drawer
  showDetailDrawer = signal(false)
  selectedOrder = signal<Order | null>(null)

  // Persisted filters (loaded from TableStateService on init)
  activeBackendFilters: UiFilters = {}

  // Facility filter
  facilities = signal<Facility[]>([])
  facilityFilter = signal<string[]>([])
  facilityMap = computed(() => {
    const m = new Map<string, string>()
    for (const f of this.facilities()) m.set(f.id, f.name)
    return m
  })
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

  /** Facility multiselect for the custom filter row. */
  protected readonly facilityColumnFilter: OrderMultiselectColumnFilter = {
    kind: 'multiselect',
    placeholder: 'labels.facility',
    optionLabel: 'name',
    optionValue: 'id',
    options: () => this.facilityFilterOptions(),
    selected: () => this.facilityFilter(),
    showFilter: () => this.facilityFilterOptions().length > 5,
  }

  /** Filters rendered in the custom filter row, by column field. */
  abstract readonly columnFilters: Readonly<Record<string, OrderColumnFilter>>

  // Columns
  cols: ShColumnDef[] = []
  selectedColumns: ShColumnDef[] = []

  constructor() {
    this.translate.onLangChange.pipe(takeUntilDestroyed()).subscribe(() => {
      setTimeout(() => this.refreshColumns())
    })
  }

  /** Column definitions, rebuilt on every language change. */
  protected abstract buildColumns(): ShColumnDef[]

  /** Actions offered in the row and bulk menus, in display order. */
  protected abstract menuActions(): OrderMenuAction[]

  ngOnInit() {
    const saved = this.tableState.load(this.stateKey)
    this.activeBackendFilters = (saved?.filters ?? {}) as UiFilters
    this.refreshColumns()
    if (saved?.page) this.pagination.update(p => ({ ...p, page: saved.page! }))
    if (saved?.sort) this.currentSort.set(saved.sort)
    this.restoreFilters()
    this.currentFilters.set(this.buildApiFilter(this.activeBackendFilters))
    this.buildFilterChips()
    this.onFiltersRestored()
    this.loadFacilities()
    this.loadData()
  }

  /** Syncs the filter widgets with the persisted filters on init. */
  protected restoreFilters(): void {
    if (this.activeBackendFilters['facility_id']?.value) {
      this.facilityFilter.set(this.activeBackendFilters['facility_id'].value)
    }
  }

  /** Hook run on init once the persisted filters are applied. */
  protected onFiltersRestored(): void {
    // No-op by default
  }

  private loadFacilities() {
    this.locationService
      .listMyFacilities({ filter: {}, config: { page: 1, rows: 200 } })
      .subscribe({
        next: (resp) => {
          this.facilities.set(resp.data || [])
          // Rebuild chips now that facilityMap can resolve IDs to names
          this.buildFilterChips()
        },
      })
  }

  protected refreshColumns() {
    this.cols = this.buildColumns()
    if (this.selectedColumns.length === 0) {
      this.selectedColumns = [...this.cols]
    } else {
      this.selectedColumns = this.selectedColumns.map(sc => this.cols.find(c => c.field === sc.field) || sc)
    }
  }

  onColSelectChange(newCols: ShColumnDef[]) {
    const orderMap = new Map(this.cols.map((c, i) => [c.field, i]))
    this.selectedColumns = [...newCols].sort((a, b) => (orderMap.get(a.field) ?? 0) - (orderMap.get(b.field) ?? 0))
  }

  // === Data loading ===

  /** Filter sent to the list endpoint (before facility scoping). */
  protected requestFilter(): OrderFilter {
    return this.currentFilters()
  }

  /** `requestFilter()` bounded by the global facility scope. */
  protected scopedRequestFilter(): OrderFilter {
    return scopeApiFilter(this.requestFilter(), this.facilityScope.apiValue())
  }

  loadData() {
    this.loading.set(true)
    this.orderService
      .listOrders({
        config: {
          page: this.pagination().page,
          rows: this.pagination().limit,
          sort_field: orderSortField(this.currentSort()),
        },
        filter: this.scopedRequestFilter(),
      })
      .subscribe({
        next: (resp) => {
          this.orders.set(resp.data || [])
          this.pagination.update(p => ({ ...p, total: resp.meta_data?.total_records || 0 }))
          this.loading.set(false)
          // Clear selections — data changed, old checks no longer valid
          this.selectedOrders.set([])
          this.baseTable?.clearSelection()
          this.saveState()
        },
        error: () => {
          this.loading.set(false)
          this.messageService.add(this.loadErrorToast())
        },
      })
  }

  /** Generic "error loading data" toast. */
  private loadErrorToast(): ToastMessageOptions {
    return {
      severity: 'error',
      summary: this.translate.instant('messages.error'),
      detail: this.translate.instant('labels.error_loading_data'),
    }
  }

  protected saveState() {
    this.tableState.save(this.stateKey, {
      filters: this.activeBackendFilters as Record<string, unknown>,
      page: this.pagination().page,
      sort: this.currentSort(),
    })
  }

  onTableStateChange(event: ShTableEvent) {
    // The global facility selector moved: drop our own copy of the facility
    // filter too, or it survives here and re-enters the request once the scope
    // is released — with no column filter left to reveal it.
    if (event.facilityScopeChanged) {
      this.activeBackendFilters = dropFacilityFilters(this.activeBackendFilters)
      this.facilityFilter.set([])
      this.buildFilterChips()
    }
    this.pagination.set(event.pagination)
    if (event.sort) this.currentSort.set(event.sort)
    // Merge external filters with column filters from the table event — minus
    // any facility key the table still carries after a scope change (e.g. one
    // restored from localStorage under a key its column doesn't clear).
    const tableFilters = event.facilityScopeChanged ? dropFacilityFilters(event.filters ?? {}) : event.filters
    this.currentFilters.set(this.buildApiFilter(mergeTableFilters(this.activeBackendFilters, tableFilters)))
    this.loadData()
  }

  // === Filters ===

  /** Filters restored by "Clear". */
  protected defaultFilters(): UiFilters {
    return {}
  }

  /** Resets list-specific filter state on "Clear". */
  protected resetFilterExtras(): void {
    // No-op by default
  }

  clearFilters() {
    this.tableState.clear(this.stateKey)
    this.activeBackendFilters = this.defaultFilters()
    this.currentFilters.set(this.buildApiFilter(this.activeBackendFilters))
    this.currentSort.set(undefined)
    this.facilityFilter.set([])
    this.resetFilterExtras()
    this.selectedOrders.set([])
    this.buildFilterChips()
    this.baseTable?.clearSelection()
    this.baseTable?.resetColumnFilters()
    this.reloadFirstPage()
  }

  onMultiselectApply(field: string, values: string[]) {
    if (field === 'facility_id') this.facilityFilter.set(values)
    this.applyFilters(withMultiselectFilter(this.activeBackendFilters, field, values))
    this.reloadFirstPage()
  }

  onMultiselectClear(field: string) {
    this.onMultiselectApply(field, [])
  }

  onColumnFilterChange(field: string, event: FilterValue) {
    this.applyFilters(withColumnFilter(this.activeBackendFilters, field, event))
    this.reloadFirstPage()
  }

  /** Makes `filters` the active UI filters and rebuilds the API filter and chips. */
  protected applyFilters(filters: UiFilters) {
    this.activeBackendFilters = filters
    this.currentFilters.set(this.buildApiFilter(filters))
    this.buildFilterChips()
  }

  protected reloadFirstPage() {
    this.pagination.update(p => ({ ...p, page: 1 }))
    this.loadData()
  }

  protected buildApiFilter(filters: UiFilters): OrderFilter {
    return buildOrderApiFilter(filters, this.formatDateFilters)
  }

  /** Rebuilds the active filter chips; lists without chips do nothing. */
  protected buildFilterChips(): void {
    // No-op by default
  }

  getActiveFilterValue(field: string): FilterValue {
    return this.activeBackendFilters[field]?.value ?? null
  }

  getActiveFilterMatchMode(field: string): string | null {
    return this.activeBackendFilters[field]?.matchMode ?? null
  }

  // === Row actions ===

  onOrderOptionsClick(event: Event, row: Order) {
    const status = row.status?.toUpperCase()
    this.rowMenuItems = [
      { label: this.translate.instant('buttons.detail'), icon: 'pi pi-eye', command: () => this.openDetailDrawer(row) },
      { separator: true },
      ...this.menuActions()
        .filter(action => appliesTo(action, status))
        .map(action => ({
          label: this.translate.instant(action.labelKey),
          icon: action.icon,
          command: () => action.run([row]),
        })),
    ]
    this.orderMenu.toggle(event)
  }

  onBulkActionsClick(event: Event) {
    const sel = this.selectedOrders()
    this.rowMenuItems = this.menuActions().map(action => {
      const targets = sel.filter(o => appliesTo(action, o.status?.toUpperCase()))
      return {
        label: this.translate.instant(action.labelKey),
        icon: action.icon,
        disabled: !targets.length,
        command: () => action.run(targets),
      }
    })
    this.orderMenu.toggle(event)
  }

  /**
   * Asks for confirmation before running `accept` on the orders, using the
   * `<headerKey>` / `<headerKey>_msg` translations.
   */
  protected confirmAction(headerKey: string, orders: Order[], accept: (orders: Order[]) => void) {
    if (!orders.length) return
    this.confirmationService.confirm({
      message: this.translate.instant(`${headerKey}_msg`) + ': ' + orders.map(o => o.order_number).join(', '),
      header: this.translate.instant(headerKey),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('buttons.yes'),
      rejectLabel: this.translate.instant('buttons.no'),
      accept: () => accept(orders),
    })
  }

  /** Runs a batch request, toasts the per-order outcome and reloads the list. */
  protected runBatch<R extends OrderBatchItemResult>(
    request: Observable<{ results: R[] } | null | undefined>,
    options: OrderBatchOptions<R>
  ) {
    this.loading.set(true)
    request.subscribe({
      next: (batch) => {
        this.reportBatchResults(batch?.results ?? [], options)
        this.selectedOrders.set([])
        if (options.clearTableSelection) this.baseTable?.clearSelection()
        this.loadData()
      },
      error: () => {
        this.loading.set(false)
        this.messageService.add({ ...this.loadErrorToast(), life: 5000 })
      },
    })
  }

  private reportBatchResults<R extends OrderBatchItemResult>(results: R[], options: OrderBatchOptions<R>) {
    const successStatuses = [options.successStatus].flat()
    const succeeded = results.filter(r => successStatuses.includes(r.status))
    const failed = results.filter(r => !successStatuses.includes(r.status))
    if (succeeded.length)
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('messages.success'),
        detail: `${succeeded.length} ${this.translate.instant(options.successKey)}`,
        life: options.successLife,
      })
    const failureToast = options.failureToast ?? ((r: R) => this.defaultFailureToast(r))
    failed.forEach(r => this.messageService.add({ ...failureToast(r), life: 6000 }))
  }

  private defaultFailureToast(r: OrderBatchItemResult): ToastMessageOptions {
    return {
      severity: 'error',
      summary: `Order ${r.order_id}`,
      detail: r.error?.message || this.translate.instant('messages.error'),
    }
  }

  // === Detail drawer ===
  openDetailDrawer(order: Order) {
    this.selectedOrder.set(order)
    this.showDetailDrawer.set(true)
  }

  closeDetailDrawer() {
    this.showDetailDrawer.set(false)
    this.selectedOrder.set(null)
  }

  // === Helpers ===
  fullName(order: Order): string {
    return orderRecipientName(order)
  }

  /** Facility name for the row, falling back to the embedded facility or its id. */
  facilityName(order: Order): string {
    return this.facilityMap().get(order.facility_id) ?? order.facility?.name ?? order.facility_id
  }
}
