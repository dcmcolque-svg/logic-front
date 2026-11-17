import { Component, computed, inject, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'

import { FilterTextInputComponent } from '@/app/shared/components/filter-text-input/filter-text-input.component'
import { FilterDateInputComponent } from '@/app/shared/components/filter-date-input/filter-date-input.component'
import { FilterMultiselectPanelComponent } from '@/app/shared/components/filter-multiselect-panel/filter-multiselect-panel.component'

import { OrderListBase } from '../../order-list.base'

/**
 * Filter widget for one column of an order list's custom filter row.
 * Renders whatever the host list declares in `columnFilters` for the field
 * (nothing when the column has no filter) and reports changes back to it.
 * Place it inside the column's `<th>`.
 */
@Component({
  selector: 'app-order-column-filter',
  standalone: true,
  imports: [
    TranslateModule,
    FilterTextInputComponent,
    FilterDateInputComponent,
    FilterMultiselectPanelComponent,
  ],
  host: { style: 'display: contents' },
  templateUrl: './order-column-filter.component.html',
})
export class OrderColumnFilterComponent {
  protected readonly list = inject(OrderListBase)

  field = input.required<string>()

  protected readonly filter = computed(() => this.list.columnFilters[this.field()])

  protected readonly multiselect = computed(() => {
    const filter = this.filter()
    return filter?.kind === 'multiselect' ? filter : null
  })
}
