import { Component, signal } from '@angular/core'
import { map } from 'rxjs'

import { TagModule } from 'primeng/tag'

import { BaseStatusBadge } from '@/app/shared/components/status/status-badge/base-status-badge.component'
import { ShColumnDef } from '@/app/shared/types/table.types'

import { Order, PackDetailOrder, PackDetailShipment } from '../types/order.types'
import { ScopedOrderListBase } from '../shared/scoped-order-list.base'
import { OrderColumnFilter, OrderMenuAction } from '../shared/order-list.types'
import { FilterValue, UiFilters } from '../shared/order-filter.util'
import { orderShipToLabel, toExportDate } from '../shared/order-format.util'
import { RowDetailCache } from '../shared/row-detail-cache'
import { ORDER_LIST_IMPORTS, SCOPED_ORDER_LIST_IMPORTS, provideScopedOrderList } from '../shared/order-list.imports'
import { provideTableColumns } from '@/app/shared/services/table-columns.bus'

// Status options for the status filter multiselect
const ALLOWED_STATUSES = ['PENDING', 'BACKORDER', 'PROCESSING', 'PACK-READY', 'PARTIAL-SHIPPED', 'SHIPPED', 'CANCELED']

/** Statuses that have shipment data and support row expansion */
const EXPANDABLE_STATUSES = new Set(['PACK-READY', 'PARTIAL-SHIPPED', 'SHIPPED'])

/** The invisible default restriction to the allowed statuses. */
function defaultStatusFilter() {
  return { value: ALLOWED_STATUSES, matchMode: 'in' }
}

/** True when `statuses` is exactly the default (all allowed statuses). */
function isDefaultStatusSelection(statuses: string[]): boolean {
  return statuses.length === ALLOWED_STATUSES.length && ALLOWED_STATUSES.every(s => statuses.includes(s))
}

@Component({
  selector: 'app-allorders',
  standalone: true,
  imports: [ORDER_LIST_IMPORTS, SCOPED_ORDER_LIST_IMPORTS, TagModule, BaseStatusBadge],
  providers: [provideScopedOrderList(() => AllordersComponent), provideTableColumns()],
  templateUrl: './allorders.component.html',
  styleUrl: './allorders.component.scss',
})
export default class AllordersComponent extends ScopedOrderListBase {
  protected readonly stateKey = 'prototipo:allorders'
  readonly PRESET_PAGE_KEY = 'allorders'

  statusOptions: Array<{ label: string; value: string }> = []

  // Status multiselect filter
  statusFilter = signal<string[]>([])

  // Row expansion state — pack detail (shipments)
  private readonly packDetails = new RowDetailCache<PackDetailOrder>()

  readonly columnFilters: Record<string, OrderColumnFilter> = {
    order_number: { kind: 'text', placeholder: 'labels.order_number' },
    status: {
      kind: 'multiselect',
      placeholder: 'labels.status',
      optionLabel: 'label',
      optionValue: 'value',
      options: () => this.statusOptions,
      selected: () => this.statusFilter(),
      showFilter: () => true,
    },
    facility_id: this.facilityColumnFilter,
    ship_to: { kind: 'text', placeholder: 'labels.ship_to' },
    created_at: { kind: 'date', placeholder: 'labels.order_date' },
    required_delivery_date: { kind: 'date', placeholder: 'labels.ship_by_date' },
    priority: { kind: 'numeric', placeholder: 'labels.priority' },
  }

  /** Determines if a row can be expanded — only orders with shipment data */
  isRowExpandable = (row: Order): boolean => {
    return EXPANDABLE_STATUSES.has(row.status?.toUpperCase())
  }

  protected override refreshColumns() {
    // Rebuild translated status options
    this.statusOptions = ALLOWED_STATUSES.map(s => ({
      label: this.translate.instant(`labels.order_statuses.${s}`),
      value: s,
    }))
    super.refreshColumns()
  }

  protected buildColumns(): ShColumnDef[] {
    return [
      { field: 'order_number', header: 'labels.order_number', sortable: true, filterable: true, filterType: 'text', width: '14rem', template: 'order_number' },
      { field: 'status', header: 'labels.status', sortable: true, filterable: true, width: '12rem', template: 'status', exportValue: (row: Order) => this.statusLabel(row.status) },
      { field: 'facility_id', header: 'labels.facility', sortable: false, filterable: true, width: '14rem', template: 'facility', exportValue: (row: Order) => this.facilityName(row) },
      { field: 'ship_to', header: 'labels.ship_to', sortable: false, filterable: false, width: '16rem', template: 'ship_to', exportValue: (row: Order) => orderShipToLabel(row) },
      { field: 'created_at', header: 'labels.order_date', sortable: true, filterable: false, width: '13rem', template: 'created_at', exportValue: (row: Order) => toExportDate(row.created_at) },
      { field: 'required_delivery_date', header: 'labels.ship_by_date', sortable: true, filterable: false, width: '13rem', template: 'required_delivery_date', exportValue: (row: Order) => toExportDate(row.required_delivery_date) },
      { field: 'priority', header: 'labels.priority', sortable: true, filterable: false, width: '8rem', template: 'priority' },
    ]
  }

  protected override restoreFilters(): void {
    const savedStatuses: string[] | undefined = this.activeBackendFilters['status']?.value
    // Only show in dropdown if the user explicitly selected a subset (not the full default)
    if (savedStatuses && !isDefaultStatusSelection(savedStatuses)) {
      this.statusFilter.set(savedStatuses)
    }
    super.restoreFilters()

    // Default: restrict to allowed statuses when no user-set status filter
    if (!this.activeBackendFilters['status']) {
      this.activeBackendFilters['status'] = defaultStatusFilter()
    }
  }

  override loadData() {
    this.selectedOrders.set([])
    this.baseTable?.clearSelection()
    super.loadData()
  }

  // === Filters ===

  /** Keep the default status restriction even after clearing. */
  protected override defaultFilters(): UiFilters {
    return { status: defaultStatusFilter() }
  }

  protected override resetFilterExtras(): void {
    this.statusFilter.set([])
    super.resetFilterExtras()
  }

  protected override syncFilterWidgets(): void {
    this.statusFilter.set(this.activeBackendFilters['status']?.value ?? [])
    super.syncFilterWidgets()
  }

  /** Persist the preset right away, before reloading. */
  protected override onPresetApplied(): void {
    this.saveState()
  }

  override onMultiselectApply(field: string, values: string[]) {
    if (field === 'status') {
      this.onStatusFilterApply(values)
      return
    }
    super.onMultiselectApply(field, values)
  }

  onStatusFilterApply(values: string[]) {
    const filters = { ...this.activeBackendFilters }
    // An empty selection restores the default restriction — filter stays active but dropdown appears clean
    filters['status'] = values.length > 0 ? { value: values, matchMode: 'in' } : defaultStatusFilter()
    this.statusFilter.set(values)
    this.applyFilters(filters)
    this.reloadFirstPage()
  }

  // === Filter chips ===

  /** Hides the invisible default status restriction from the chips. */
  protected override visibleChipFilters(): UiFilters {
    const visibleFilters = { ...this.activeBackendFilters }
    const statusVal: string[] | undefined = visibleFilters['status']?.value
    if (statusVal && isDefaultStatusSelection(statusVal)) {
      delete visibleFilters['status']
    }
    return visibleFilters
  }

  protected override chipResolvers(): Record<string, (v: FilterValue) => string> {
    return {
      ...super.chipResolvers(),
      status: (s: string) => this.translate.instant(`labels.order_statuses.${s}`),
    }
  }

  protected override withoutFilter(field: string): UiFilters {
    if (field !== 'status') return super.withoutFilter(field)
    // Restore the default restriction instead of removing entirely
    this.statusFilter.set([])
    return { ...this.activeBackendFilters, status: defaultStatusFilter() }
  }

  // === Row expansion — loads pack/detail (shipments → packages) ===
  onRowExpand(row: Order) {
    this.packDetails.load(row.id, () =>
      this.orderService.getPackDetail(row.id).pipe(map(result => result?.orders?.[0] ?? null))
    )
  }

  shipmentsFor(orderId: string): PackDetailShipment[] {
    return this.packDetails.get(orderId)?.shipments || []
  }

  isLoadingDetail(orderId: string): boolean {
    return this.packDetails.isLoading(orderId)
  }

  // === Row actions — context-sensitive by status ===
  protected menuActions(): OrderMenuAction[] {
    return [
      { labelKey: 'buttons.process', icon: 'pi pi-caret-right', statuses: ['PENDING', 'EVALUATING'], run: orders => this.confirmProcess(orders) },
      { labelKey: 'buttons.evaluate', icon: 'pi pi-caret-right', statuses: ['BACKORDER'], run: orders => this.confirmEvaluate(orders) },
      { labelKey: 'labels.revert_to_pending', icon: 'pi pi-undo', statuses: ['PROCESSING'], run: orders => this.confirmRevert(orders) },
      { labelKey: 'labels.archive', icon: 'pi pi-inbox', statuses: ['SHIPPED', 'CANCELED'], run: orders => this.confirmArchive(orders) },
      { labelKey: 'labels.cancel_order', icon: 'pi pi-times-circle', statuses: ['PENDING', 'BACKORDER'], run: orders => this.confirmCancel(orders) },
    ]
  }

  confirmProcess(orders: Order[]) {
    this.confirmAction('orders.confirm_process', orders, o =>
      this.runBatch(this.orderService.processOrdersBatch(o.map(x => x.id)), {
        successStatus: 'PROCESSING',
        successKey: 'messages.orders_processed',
        successLife: 4000,
      })
    )
  }

  confirmCancel(orders: Order[]) {
    this.confirmAction('orders.confirm_cancel', orders, o =>
      this.runBatch(this.orderService.cancelOrders(o.map(x => x.id)), {
        successStatus: 'CANCELED',
        successKey: 'messages.orders_cancel_success',
        successLife: 3000,
      })
    )
  }

  confirmArchive(orders: Order[]) {
    this.confirmAction('orders.confirm_archive', orders, o =>
      this.runBatch(this.orderService.archiveOrders(o.map(x => x.id)), {
        successStatus: 'ARCHIVED',
        successKey: 'messages.orders_archived_success',
        successLife: 3000,
      })
    )
  }

  confirmRevert(orders: Order[]) {
    this.confirmAction('orders.confirm_revert', orders, o =>
      this.runBatch(this.orderService.revertProcessBatch(o.map(x => x.id)), {
        successStatus: 'PENDING',
        successKey: 'messages.orders_revert_success',
        successLife: 3000,
      })
    )
  }
}
