import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { MultiSelectModule } from 'primeng/multiselect'

import { ShColumnDef } from '../../../shared/types/table.types'

/**
 * Column visibility picker rendered in the table paginator.
 * Emits the new selection and closes the overlay once every column
 * (or none) is selected. The host uses `display: contents` so the
 * multiselect lays out exactly as if it were inlined by the parent.
 */
@Component({
  selector: 'app-column-toggle',
  standalone: true,
  imports: [FormsModule, MultiSelectModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <p-multiSelect
      #ms
      [options]="options()"
      [ngModel]="selected()"
      (onChange)="onSelectionChange($event.value, ms)"
      optionLabel="translatedHeader"
      [placeholder]="'labels.choose_columns' | translate"
      [selectedItemsLabel]="selected().length + ' ' + ('labels.columns_selected' | translate)"
      [maxSelectedLabels]="0"
      size="small"
      appendTo="body"
    >
      <ng-template let-col pTemplate="item">
        {{ col.translatedHeader }}
      </ng-template>
    </p-multiSelect>
  `,
})
export class ColumnToggleComponent {
  /** All toggleable columns (each with a `translatedHeader`). */
  readonly options = input.required<ShColumnDef[]>()
  /** Currently visible columns. */
  readonly selected = input.required<ShColumnDef[]>()
  readonly selectionChange = output<ShColumnDef[]>()

  protected onSelectionChange(value: ShColumnDef[], ms: { hide: () => void }): void {
    this.selectionChange.emit(value)
    if (value.length === 0 || value.length === this.options().length) {
      ms.hide()
    }
  }
}
