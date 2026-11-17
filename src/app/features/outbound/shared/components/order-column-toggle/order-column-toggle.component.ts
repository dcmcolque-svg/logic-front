import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { MultiSelectModule } from 'primeng/multiselect'

import { OrderListBase } from '../../order-list.base'

/** Column visibility picker shown on the left of an order table's paginator. */
@Component({
  selector: 'app-order-column-toggle',
  standalone: true,
  imports: [FormsModule, TranslateModule, MultiSelectModule],
  host: { style: 'display: contents' },
  template: `
    <p-multiSelect
      [options]="list.cols"
      [ngModel]="list.selectedColumns"
      optionLabel="header"
      [maxSelectedLabels]="0"
      [selectedItemsLabel]="list.selectedColumns.length + ' ' + ('labels.columns_selected' | translate)"
      size="small"
      appendTo="body"
      [placeholder]="'labels.choose_columns' | translate"
      (ngModelChange)="list.onColSelectChange($event)"
    >
      <ng-template let-col pTemplate="item">{{ col.header | translate }}</ng-template>
    </p-multiSelect>
  `,
})
export class OrderColumnToggleComponent {
  protected readonly list = inject(OrderListBase)
}
