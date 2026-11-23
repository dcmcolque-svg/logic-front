import { Component, computed, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { AutoCompleteModule } from 'primeng/autocomplete'
import { InputTextModule } from 'primeng/inputtext'

import { BaseFormField } from '@/app/shared/components/form/form-field/base-form-field.component'
import { SkuCustomAttributes } from './sku-custom-attributes'
import { SkuForm } from './sku-dialog-base'

/** State of the live SKU code uniqueness lookup (create dialog only). */
export type SkuCodeStatus = 'idle' | 'checking' | 'available' | 'taken'

/** Margin of a price over the cost, as a % of the price. */
export interface PriceMargin {
  /** Translation key of the price's label */
  label: string
  /** Rounded margin percentage (negative when the price is below cost) */
  percent: number
}

/** Margin of `price` over `cost`, or null when either is missing/zero. */
export function priceMargin(cost: number | null | undefined, price: number | null | undefined): number | null {
  if (!cost || !price || cost <= 0 || price <= 0) return null
  return Math.round(((price - cost) / price) * 1000) / 10
}

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
  /** Live uniqueness lookup state shown under the SKU code */
  skuStatus = input<SkuCodeStatus>('idle')
  /** Fixed DOM id of the SKU code input, so the dialog can focus it */
  readonly skuFieldId = 'sku-code-field'

  private readonly translate = inject(TranslateService)
  /** Re-labels the serial modes when the language changes */
  private readonly lang = toSignal(this.translate.onLangChange)

  readonly serialControlModeOptions = computed(() => {
    this.lang()
    return [
      { key: 'catalog.serial_mode.none', value: 'NONE' },
      { key: 'catalog.serial_mode.in', value: 'IN' },
      { key: 'catalog.serial_mode.out', value: 'OUT' },
      { key: 'catalog.serial_mode.in_out', value: 'IN/OUT' },
    ].map(o => ({ label: this.translate.instant(o.key), value: o.value }))
  })

  /** Margins of the retail and wholesale prices over the cost (only the ones that apply). */
  margins(): PriceMargin[] {
    const v = this.form().getRawValue()
    const out: PriceMargin[] = []
    const retail = priceMargin(v.cost, v.retail_price)
    if (retail !== null) out.push({ label: 'labels.retail_price', percent: retail })
    const wholesale = priceMargin(v.cost, v.wholesale_price)
    if (wholesale !== null) out.push({ label: 'labels.wholesale_price', percent: wholesale })
    return out
  }

  /** True when any price margin is negative (selling below cost). */
  hasPriceBelowCost(margins: PriceMargin[]): boolean {
    return margins.some(m => m.percent < 0)
  }
}
