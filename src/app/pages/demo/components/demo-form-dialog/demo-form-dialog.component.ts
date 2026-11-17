import { Component, input, output, OnChanges, SimpleChanges } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'

import { BaseDialog } from '@/app/shared/components/dialog/dialog/base-dialog.component'
import { BaseFormField } from '@/app/shared/components/form/form-field/base-form-field.component'
import { BaseFormGroup } from '@/app/shared/components/form/form-group/base-form-group.component'
import { DemoOrder } from '@/app/domain/demo/demo.types'

@Component({
  selector: 'app-demo-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    BaseDialog,
    BaseFormField,
    BaseFormGroup,
  ],
  templateUrl: './demo-form-dialog.component.html',
  styleUrl: './demo-form-dialog.component.scss',
})
export class DemoFormDialogComponent implements OnChanges {
  /** Dialog visibility */
  visible = input(false)
  /** Order to edit (null = create mode) */
  order = input<DemoOrder | null>(null)
  /** Whether save is in progress */
  saving = input(false)

  /** Emitted when save is clicked (with form value) */
  save = output<Record<string, any>>()
  /** Emitted when dialog is hidden */
  hide = output<void>()

  /** Whether we are editing an existing order */
  editing = input(false)

  // === Form ===
  orderForm = new FormGroup({
    order_number: new FormControl('', [Validators.required]),
    customer_name: new FormControl('', [Validators.required]),
    status: new FormControl('pending', [Validators.required]),
    items_count: new FormControl(1),
    total_amount: new FormControl(0, [Validators.required, Validators.min(0)]),
    shipping_method: new FormControl(''),
    tracking_number: new FormControl(''),
    warehouse: new FormControl(''),
  })

  // === Options ===
  statusOptions = [
    { label: 'Shipped', value: 'shipped' },
    { label: 'Pending', value: 'pending' },
    { label: 'Processing', value: 'processing' },
    { label: 'Delivered', value: 'delivered' },
    { label: 'Cancelled', value: 'cancelled' },
    { label: 'Backorder', value: 'backorder' },
  ]

  shippingOptions = [
    { label: 'FedEx Ground', value: 'FedEx Ground' },
    { label: 'FedEx Express', value: 'FedEx Express' },
    { label: 'UPS Ground', value: 'UPS Ground' },
    { label: 'UPS 2-Day', value: 'UPS 2-Day' },
    { label: 'USPS Priority', value: 'USPS Priority' },
    { label: 'DHL International', value: 'DHL International' },
  ]

  warehouseOptions = [
    { label: 'WH-Miami', value: 'WH-Miami' },
    { label: 'WH-Dallas', value: 'WH-Dallas' },
    { label: 'WH-LA', value: 'WH-LA' },
  ]

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['order'] || changes['visible']) {
      const order = this.order()
      if (order) {
        this.orderForm.patchValue(order)
      } else if (this.visible()) {
        this.orderForm.reset({
          status: 'pending',
          items_count: 1,
          total_amount: 0,
        })
      }
    }
  }

  onSave() {
    if (this.orderForm.valid) {
      this.save.emit(this.orderForm.value)
    }
  }
}
