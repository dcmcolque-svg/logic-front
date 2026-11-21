import { Component, computed, input, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { InputTextModule } from 'primeng/inputtext'
import { InputNumberModule } from 'primeng/inputnumber'
import { DatePickerModule } from 'primeng/datepicker'
import { SelectModule } from 'primeng/select'
import { MultiSelectModule } from 'primeng/multiselect'
import { TextareaModule } from 'primeng/textarea'
import { PasswordModule } from 'primeng/password'
import { ToggleSwitchModule } from 'primeng/toggleswitch'
import { FileUploadModule } from 'primeng/fileupload'
import { MessageModule } from 'primeng/message'

/**
 * Default unique id for a field. Uses the Web Crypto CSPRNG (available in
 * non-secure contexts too, unlike randomUUID) and keeps a letter prefix so
 * the result is always a valid HTML id.
 */
function generateFieldId(): string {
  const [high, low] = crypto.getRandomValues(new Uint32Array(2))
  return `sh-field-${high.toString(36)}${low.toString(36)}`
}

/**
 * BaseFormField — Universal form field wrapper.
 * Uses fixed labels above inputs (edge-frontend pattern) with
 * PrimeNG p-error validation styling.
 *
 * Usage:
 * ```html
 * <base-form-field type="text" label="labels.name" [control]="form.controls.name" [required]="true" />
 * <base-form-field type="dropdown" label="labels.status" [control]="form.controls.status"
 *   [options]="statusOptions" optionLabel="label" optionValue="value" />
 * ```
 */
@Component({
  selector: 'base-form-field',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    InputTextModule,
    InputNumberModule,
    DatePickerModule,
    SelectModule,
    MultiSelectModule,
    TextareaModule,
    PasswordModule,
    ToggleSwitchModule,
    FileUploadModule,
    MessageModule,
  ],
  templateUrl: './base-form-field.component.html',
  styleUrl: './base-form-field.component.scss',
})
export class BaseFormField {
  private readonly translate = inject(TranslateService)

  /** Input type — determines which PrimeNG component to render */
  type = input<
    | 'text'
    | 'number'
    | 'date'
    | 'dropdown'
    | 'multiselect'
    | 'textarea'
    | 'password'
    | 'switch'
    | 'file'
  >('text')
  /** Reactive FormControl reference */
  control = input.required<FormControl>()
  /** Label translation key */
  label = input('')
  /** Placeholder translation key */
  placeholder = input('')
  /** Mark as required (visual indicator). Also on automatically when the control has Validators.required. */
  required = input(false)

  /** Asterisk shown: the explicit input, or the control's own required validator. */
  readonly isRequired = computed(
    () => this.required() || this.control().hasValidator(Validators.required)
  )

  /** Id of the error message, referenced by aria-describedby. */
  readonly errorId = computed(() => `${this.fieldId()}-error`)

  /**
   * Errors show once the user has touched or edited the field, or the form was
   * submitted (markAllAsTouched) — the same rule as sh-field-error.
   */
  showError(): boolean {
    const c = this.control()
    return c.invalid && (c.dirty || c.touched)
  }
  /** Options for dropdown/multiselect */
  options = input<any[]>([])
  /** Option label property */
  optionLabel = input('label')
  /** Option value property */
  optionValue = input('value')
  /** Unique field ID */
  fieldId = input(generateFieldId())
  /** Additional CSS class for the container */
  containerClass = input('')
  /** Show increment/decrement buttons for number inputs */
  showButtons = input(false)
  /** Minimum value for number inputs */
  min = input<number | null>(null)
  /**
   * Decimal precision for number inputs.
   * PrimeNG's InputNumber silently discards the decimal separator keystroke
   * unless `maxFractionDigits` is set, so any field that accepts decimals
   * (prices, weights, dimensions) must declare it explicitly.
   * `null` keeps the integer-only behaviour; `0` forbids decimals explicitly.
   */
  maxFractionDigits = input<number | null>(null)
  /** Minimum decimals always rendered (e.g. 2 → 10.50). Null = only what the user typed. */
  minFractionDigits = input<number | null>(null)
}
