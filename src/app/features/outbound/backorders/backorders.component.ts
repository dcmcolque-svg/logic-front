import { Component } from '@angular/core'
import { map } from 'rxjs'

import { ShColumnDef } from '@/app/shared/types/table.types'

import { Order, OrderFilter, OrderLineDetail } from '../types/order.types'
import { ScopedOrderListBase } from '../shared/scoped-order-list.base'
import { OrderColumnFilter, OrderMenuAction } from '../shared/order-list.types'
import { orderShipToLabel } from '../shared/order-format.util'
import { RowDetailCache } from '../shared/row-detail-cache'
import { ORDER_LIST_IMPORTS, SCOPED_ORDER_LIST_IMPORTS, provideScopedOrderList } from '../shared/order-list.imports'
import { provideTableColumns } from '@/app/shared/services/table-columns.bus'

const BACKORDER_STATUS = 'BACKORDER'

@Component({
  selector: 'app-backorders',
  standalone: true,
  imports: [ORDER_LIST_IMPORTS, SCOPED_ORDER_LIST_IMPORTS],
  providers: [provideScopedOrderList(() => BackordersComponent), provideTableColumns()],
  templateUrl: './backorders.component.html',
  styleUrl: './backorders.component.scss',
})
export default class BackordersComponent extends ScopedOrderListBase {
  protected readonly stateKey = 'binlogic:backorders'
  protected override readonly formatDateFilters = true
  readonly PRESET_PAGE_KEY = 'backorders'

  // Row expansion state
  private readonly orderLines = new RowDetailCache<OrderLineDetail[]>()

  readonly columnFilters: Record<string, OrderColumnFilter> = {
    facility_id: this.facilityColumnFilter,
    order_number: { kind: 'text', placeholder: 'labels.order_number' },
    created_at: { kind: 'date', placeholder: 'labels.order_date' },
    required_delivery_date: { kind: 'date', placeholder: 'labels.ship_by_date' },
  }

  protected buildColumns(): ShColumnDef[] {
    return [
      { field: 'order_number',           header: 'labels.order_number', sortable: true,  filterable: true,  filterType: 'text', width: '14rem',  template: 'order_number' },
      { field: 'status',                 header: 'labels.status',       sortable: true,  filterable: false,                      width: '10rem',  template: 'status', exportValue: (row: Order) => this.statusLabel(row.status) },
      { field: 'facility_id',            header: 'labels.facility',     sortable: false, filterable: true,                       width: '12rem',  template: 'facility', exportValue: (row: Order) => this.facilityName(row) },
      { field: 'ship_to',                header: 'labels.ship_to',      sortable: false, filterable: false,                      width: '16rem',  template: 'ship_to', exportValue: (row: Order) => orderShipToLabel(row) },
      { field: 'created_at',             header: 'labels.order_date',   sortable: true,  filterable: true,  filterType: 'date', width: '13rem',  template: 'created_at' },
      { field: 'required_delivery_date', header: 'labels.ship_by_date', sortable: true,  filterable: true,  filterType: 'date', width: '13rem',  template: 'required_delivery_date' },
    ]
  }

  /** Backorders only ever lists orders in BACKORDER status. */
  protected override requestFilter(): OrderFilter {
    return {
      ...this.currentFilters(),
      status: { match_mode: 'eq', value: BACKORDER_STATUS },
    }
  }

  // === Row expansion ===
  onRowExpand(row: Order) {
    this.orderLines.load(
      row.id,
      () => this.orderService.getOrderLines(row.id).pipe(map(lines => lines || [])),
      []
    )
  }

  linesFor(orderId: string): OrderLineDetail[] {
    return this.orderLines.get(orderId) || []
  }

  isLoadingLines(orderId: string): boolean {
    return this.orderLines.isLoading(orderId)
  }

  // === Row actions ===
  protected menuActions(): OrderMenuAction[] {
    return [
      { labelKey: 'buttons.evaluate', icon: 'pi pi-caret-right', run: orders => this.confirmEvaluate(orders) },
      { labelKey: 'labels.cancel_order', icon: 'pi pi-times-circle', run: orders => this.confirmCancel(orders) },
    ]
  }

  confirmCancel(orders: Order[]) {
    this.confirmAction('orders.confirm_cancel', orders, o => this.cancelInBulk(o))
  }

  private cancelInBulk(orders: Order[]) {
    this.runBatch(this.orderService.cancelOrdersBatch(orders.map(o => o.id)), {
      successStatus: 'CANCELED',
      successKey: 'messages.orders_cancel_success',
      successLife: 4000,
      clearTableSelection: true,
      failureToast: r => ({
        severity: 'error',
        summary: `Order ${r.order_id}`,
        detail: r.previous_state || this.translate.instant('messages.error'),
      }),
    })
  }
}
