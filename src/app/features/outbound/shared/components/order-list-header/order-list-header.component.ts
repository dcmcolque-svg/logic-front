import { Component, input, output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'

/**
 * Title row of an order list: page title, "Selected" bulk-actions button and
 * "Clear" filters button. Extra buttons are projected before "Clear"
 * (elements marked `orderHeaderStart`) or after it (everything else).
 */
@Component({
  selector: 'app-order-list-header',
  standalone: true,
  imports: [CommonModule, TranslateModule, ButtonModule],
  host: { style: 'display: contents' },
  templateUrl: './order-list-header.component.html',
})
export class OrderListHeaderComponent {
  /** Translation key of the page title. */
  titleKey = input.required<string>()
  selectedCount = input(0)

  bulkActions = output<Event>()
  clearFilters = output<void>()
}
