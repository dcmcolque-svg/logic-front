import { Component, inject, input } from '@angular/core'
import { ButtonModule } from 'primeng/button'

import { Order } from '../../../types/order.types'
import { OrderListBase } from '../../order-list.base'

/** Row "⋮" button that opens the order actions menu. */
@Component({
  selector: 'app-order-menu-button',
  standalone: true,
  imports: [ButtonModule],
  host: { style: 'display: contents' },
  template: `
    <p-button
      icon="pi pi-ellipsis-v"
      [text]="true"
      [rounded]="true"
      size="small"
      severity="secondary"
      (onClick)="list.onOrderOptionsClick($event, row())"
    />
  `,
})
export class OrderMenuButtonComponent {
  protected readonly list = inject(OrderListBase)

  row = input.required<Order>()
}
