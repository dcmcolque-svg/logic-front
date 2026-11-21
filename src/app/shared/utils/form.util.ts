import { AbstractControl } from '@angular/forms'

/**
 * Save was pressed on an invalid form: show every field's error and move the
 * focus to the first invalid field, so the user sees what is missing instead
 * of a save button that silently does nothing.
 *
 * Returns true when the form is invalid (the caller stops), false otherwise:
 *
 * ```ts
 * onSave() {
 *   if (revealInvalid(this.form)) return
 *   ...
 * }
 * ```
 */
export function revealInvalid(form: AbstractControl | null | undefined): boolean {
  if (!form || form.valid || form.disabled) return false
  form.markAllAsTouched()
  // After the errors render: the open dialog first, the page otherwise
  setTimeout(() => {
    const scope: ParentNode = document.querySelector('.p-dialog:last-of-type') ?? document
    const field = scope.querySelector<HTMLElement>(
      [
        'input.ng-invalid:not([type=hidden])',
        'textarea.ng-invalid',
        '.ng-invalid input:not([type=hidden])',
        '.ng-invalid [role=combobox]',
        '.ng-invalid textarea',
      ].join(', ')
    )
    field?.focus()
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
  return true
}
