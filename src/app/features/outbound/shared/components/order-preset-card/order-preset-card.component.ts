import { Component, inject, input } from '@angular/core'

import { FilterPresetManagerComponent } from '@/app/shared/components/filter-preset-manager/filter-preset-manager.component'

import { ScopedOrderListBase } from '../../scoped-order-list.base'

/**
 * Saved-filter preset bar plus the card that holds the order table; the card
 * gets a top border in the active preset's color. Project the table inside.
 */
@Component({
  selector: 'app-order-preset-card',
  standalone: true,
  imports: [FilterPresetManagerComponent],
  host: { style: 'display: contents' },
  template: `
    <div class="preset-table-wrapper">
      <app-filter-preset-manager
        [pageKey]="list.PRESET_PAGE_KEY"
        [columns]="list.cols"
        [currentFilters]="list.activeBackendFilters"
        [currentSort]="list.currentSort()"
        [hasActiveFilters]="hasActiveFilters()"
        (presetSelected)="list.onPresetSelected($event)"
      />
      <div
        class="card"
        [style.border-top]="list.activePresetColor() ? '3px solid ' + list.activePresetColor() : null"
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class OrderPresetCardComponent {
  protected readonly list = inject(ScopedOrderListBase)

  /** Whether the preset manager should treat the list as filtered. */
  hasActiveFilters = input(false)
}
