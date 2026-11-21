import { Component, computed, inject, input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { TagModule } from 'primeng/tag'
import { DisplayDatePipe } from '@/app/shared/pipes/display-date.pipe'

import { FacilityDatePipe } from '@/app/shared/pipes/facility-date.pipe'
import { BaseStatusBadge } from '@/app/shared/components/status/status-badge/base-status-badge.component'

import { Order, ShipToAddress } from '../../../types/order.types'
import { orderRecipientName } from '../../order-format.util'
import { OrderListBase } from '../../order-list.base'

/** How a date column is rendered. */
export interface OrderDateCellOptions {
  /** Show the time (HH:mm) under the date. */
  showTime?: boolean
  /**
   * Timezone of a date-only value ('UTC'). When omitted the value is an
   * instant, shown in the order's facility zone.
   */
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
  imports: [CommonModule, TranslateModule, TagModule, DisplayDatePipe, BaseStatusBadge, FacilityDatePipe],
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

  /** Priority band: 8+ high, 5–7 medium, otherwise low. */
  protected readonly priorityBand = computed(() => {
    const p = Number(this.row().priority ?? 0)
    if (p >= 8) return { key: 'labels.priority_high', severity: 'danger' as const }
    if (p >= 5) return { key: 'labels.priority_medium', severity: 'warn' as const }
    return { key: 'labels.priority_low', severity: 'secondary' as const }
  })

  /**
   * Required delivery date already passed and the order is still to ship
   * (not shipped, not canceled). A date-only value (timezone set) compares
   * calendar days in that zone's UTC terms; an instant compares to now.
   */
  protected readonly deliveryOverdue = computed(() => {
    const row = this.row()
    const value = row.required_delivery_date
    if (!value) return false
    const status = String(row.status ?? '').toUpperCase()
    if (status === 'SHIPPED' || status === 'CANCELED' || status === 'CANCELLED') return false
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return false
    if (!this.deliveryDate().timezone) return d.getTime() < Date.now()
    const now = new Date()
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) < today
  })

  fullName(order: Order): string {
    return orderRecipientName(order)
  }
}
