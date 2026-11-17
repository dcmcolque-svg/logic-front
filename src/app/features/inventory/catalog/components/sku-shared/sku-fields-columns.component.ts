import { Component, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { AutoCompleteModule } from 'primeng/autocomplete'
import { InputTextModule } from 'primeng/inputtext'

import { BaseFormField } from '@/app/shared/components/form/form-field/base-form-field.component'
import { SkuCustomAttributes } from './sku-custom-attributes'
import { SkuForm } from './sku-dialog-base'

/**
 * Left (general information) and center (dimensions, cost & price, custom
 * attributes) columns of the SKU create/edit dialogs.
 *
 * The host uses `display: contents`, so both columns sit directly in the
 * dialog's 12-column grid. Content projected into the component is rendered
 * at the top of the general information fields (e.g. the company dropdown).
 */
@Component({
  selector: 'app-sku-fields-columns',
  standalone: true,
  imports: [FormsModule, TranslateModule, ButtonModule, AutoCompleteModule, InputTextModule, BaseFormField],
  templateUrl: './sku-fields-columns.component.html',
  styles: [':host { display: contents; }'],
})
export class SkuFieldsColumnsComponent {
  form = input.required<SkuForm>()
  attributes = input.required<SkuCustomAttributes>()
  /** Hides both columns (the product workspace takes over the dialog) */
  hideColumns = input(false)
  /** Tighter spacing and smaller section headers */
  dense = input(false)
  skuPlaceholder = input('')

  readonly serialControlModeOptions = [
    { label: 'None', value: 'NONE' },
    { label: 'Inbound Only', value: 'IN' },
    { label: 'Outbound Only', value: 'OUT' },
    { label: 'Inbound / Outbound', value: 'IN/OUT' },
  ]
}
