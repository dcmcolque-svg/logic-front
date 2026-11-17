/**
 * Declarative field configuration for ShFormField.
 * Each config describes a single form input with its type, label, validation, and layout.
 */
export interface ShFieldConfig {
  /** Input type — determines which PrimeNG component to render */
  type:
    | 'text'
    | 'number'
    | 'date'
    | 'dropdown'
    | 'multiselect'
    | 'textarea'
    | 'password'
    | 'switch'
    | 'file'
  /** FormControl name (must match the FormGroup key) */
  name: string
  /** Label — i18n translation key */
  label: string
  /** Placeholder text — i18n translation key */
  placeholder?: string
  /** Whether the field is required (shows * badge) */
  required?: boolean
  /** Whether the field is disabled */
  disabled?: boolean
  /** Options array for dropdown/multiselect */
  options?: any[]
  /** Property name for the option label */
  optionLabel?: string
  /** Property name for the option value */
  optionValue?: string
  /** Grid column span (1-12) — controls width in form grid */
  colSpan?: number
  /** Additional PrimeNG input props (passed through) */
  inputProps?: Record<string, any>
  /** Icon prefix for the input field */
  icon?: string
}
