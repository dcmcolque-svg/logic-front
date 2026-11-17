import { Component, computed, inject, input } from '@angular/core'
import { CommonModule } from '@angular/common'

import { BaseStatusBadge } from '@/app/shared/components/status/status-badge/base-status-badge.component'

import { Order, ShipToAddress } from '../../../types/order.types'
import { orderRecipientName } from '../../order-format.util'
import { OrderListBase } from '../../order-list.base'

/** How a date column is rendered. */
export interface OrderDateCellOptions {
  /** Show the time (HH:mm) under the date. */
  showTime?: boolean
  /** Timezone passed to the date pipe (local time when omitted). */
  timezone?: string
}

/**
 * Cell content for the outbound order tables, selected by the column's
 * `template` key (order_number, status, facility, ship_to, priority,
 * created_at, required_delivery_date).
 */
@Component({
  selector: 'app-order-cell',
  standalone: true,
  imports: [CommonModule, BaseStatusBadge],
  host: { style: 'display: contents' },
  templateUrl: './order-cell.component.html',
})
export class OrderCellComponent {
  protected readonly list = inject(OrderListBase)

  row = input.required<Order>()
  template = input.required<string>()
  /** Rendering of the `created_at` cell. */
  createdAt = input<OrderDateCellOptions>({})
  /** Rendering of the `required_delivery_date` cell. */
  deliveryDate = input<OrderDateCellOptions>({ timezone: 'UTC' })

  /** Ship-to address; the API may omit it. */
  protected readonly address = computed(() => this.row().ship_to_address as ShipToAddress | undefined)

  fullName(order: Order): string {
    return orderRecipientName(order)
  }
}
