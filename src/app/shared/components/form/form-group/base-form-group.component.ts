import { Component, input } from '@angular/core'
import { CommonModule } from '@angular/common'

/**
 * BaseFormGroup — Responsive form grid layout.
 * Arranges BaseFormField components in a responsive grid.
 *
 * Usage:
 * ```html
 * <base-form-group [columns]="2">
 *   <base-form-field type="text" label="labels.name" [control]="form.controls.name" />
 *   <base-form-field type="text" label="labels.email" [control]="form.controls.email" />
 *   <base-form-field type="textarea" label="labels.notes" [control]="form.controls.notes"
 *     containerClass="md:col-span-2" />
 * </base-form-group>
 * ```
 */
@Component({
  selector: 'base-form-group',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './base-form-group.component.html',
  styleUrl: './base-form-group.component.scss',
})
export class BaseFormGroup {
  /** Number of form columns on desktop (1-4) */
  columns = input(2)
}
