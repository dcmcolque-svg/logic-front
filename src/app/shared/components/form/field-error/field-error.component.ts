import { ChangeDetectorRef, Component, effect, inject, input } from '@angular/core'
import { AbstractControl } from '@angular/forms'
import { TranslateService } from '@ngx-translate/core'

/**
 * FieldErrorComponent — Displays an inline validation error for a single form control.
 *
 * Shows a red <small> message when the control is invalid AND (dirty OR touched).
 * Handles both server-side errors (`serverError`) and standard validators (`required`).
 *
 * @example
 * ```html
 * <input pInputText formControlName="name" [class.ng-invalid]="isInvalidCtrl(form.get('name'))" />
 * <sh-field-error [ctrl]="form.get('name')" />
 * ```
 *
 * @example — Set a server error after a failed HTTP call:
 * ```typescript
 * error: (err) => {
 *   if (err?.code === 'APIKEY_DUPLICATE_NAME') {
 *     setFieldError(this.form.get('name'), this.translate.instant('...'))
 *   }
 * }
 * ```
 */
@Component({
  selector: 'sh-field-error',
  standalone: true,
  template: `
    @if (show) {
      <small role="alert" class="text-red-500 text-xs mt-0.5 block">{{ message }}</small>
    }
  `,
})
export class FieldErrorComponent {
  private readonly translate = inject(TranslateService)
  private readonly cdr = inject(ChangeDetectorRef)

  /** The reactive AbstractControl to validate. Accepts null (no-op when null). */
  ctrl = input.required<AbstractControl | null>()

  /**
   * Optional map of Angular error keys → i18n translation keys.
   * Use this for custom validators (e.g. pattern) where the message depends on the field.
   *
   * @example
   * ```html
   * <sh-field-error [ctrl]="form.get('url')" [errors]="{ pattern: 'forms_validation.valid_url' }" />
   * ```
   */
  errors = input<Record<string, string>>({})

  private sub: any = null

  constructor() {
    // Re-subscribe whenever the control reference changes, so that server-side
    // errors (setErrors + markAsTouched) trigger re-rendering even when the
    // AbstractControl object reference stays the same.
    effect(() => {
      this.sub?.unsubscribe()
      const c = this.ctrl()
      if (!c) return
      this.sub = c.statusChanges.subscribe(() => this.cdr.markForCheck())
    })
  }

  get show(): boolean {
    const c = this.ctrl()
    if (!c) return false
    // Server errors must always show regardless of disabled state
    if (c.errors?.['serverError'] && c.touched) return true
    // Standard validation errors only when enabled + interacted with
    return !!(c.invalid && (c.dirty || c.touched))
  }

  get message(): string {
    const c = this.ctrl()
    if (!c?.errors) return ''
    // 1. Server-side error always takes priority
    if (c.errors['serverError']) return c.errors['serverError']
    // 2. Custom error map (pattern, etc.)
    for (const [key, translationKey] of Object.entries(this.errors())) {
      if (c.errors[key]) return this.translate.instant(translationKey)
    }
    // 3. Standard validators
    if (c.errors['required']) return this.translate.instant('forms_validation.required')
    if (c.errors['minlength']) {
      return this.translate.instant('forms_validation.min_length', {
        min: c.errors['minlength'].requiredLength,
      })
    }
    return ''
  }
}

// ── Utility functions ───────────────────────────────────────────────────────

/**
 * Returns true when the control is invalid AND has been interacted with
 * (dirty or touched). Use this to bind `[class.ng-invalid]` on inputs.
 */
export function isInvalidCtrl(ctrl: AbstractControl | null | undefined): boolean {
  return !!(ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched))
}

/**
 * Injects a server-side validation error into a form control so that
 * `FieldErrorComponent` can display it inline.
 *
 * Mutations are deferred via `setTimeout` to avoid NG0100
 * (ExpressionChangedAfterItHasBeenCheckedError) when called from inside an
 * HTTP error callback — Angular has already completed its CD pass by then,
 * and synchronous form-state changes would be detected as inconsistencies.
 *
 * Call this from the `error` callback of an HTTP subscription:
 * ```typescript
 * setFieldError(this.form.get('name'), 'A key with this name already exists.')
 * ```
 */
export function setFieldError(ctrl: AbstractControl | null | undefined, message: string): void {
  if (ctrl) {
    setTimeout(() => {
      ctrl.setErrors({ serverError: message })
      ctrl.markAsTouched()
    })
  }
}

/**
 * Generic form error handler for server-side `AppError` responses.
 *
 * Handles three shapes sent by the backend:
 *
 * **Shape A — array value** (`meta.<fieldName>` is an array):
 * ```json
 * { "code": "INVITE_USER_ALREADY_EXISTS", "meta": { "email": ["a@b.com"] } }
 * ```
 * → The **key** (`email`) is the form-control name.
 *
 * **Shape B — `meta.field` string**:
 * ```json
 * { "code": "SENDGRID_NOT_CONFIGURED", "meta": { "field": "email" } }
 * ```
 * → The **value** of the `field` key is the form-control name.
 *
 * **Shape C — `errors` array** (validation errors with field + rule):
 * ```json
 * { "code": "OAUTH_VALIDATION_ERROR", "errors": [{"field": "client_secret", "rule": "required"}] }
 * ```
 * → Each entry maps `field` to the form-control name and `rule` to a
 *   `forms_validation.<rule>` i18n key for the error message.
 *
 * No action is taken when `code` is absent (e.g. network errors).
 *
 * @example
 * ```typescript
 * error: (err) => {
 *   this.loading = false
 *   handleFormError(err, this.form, this.translate)
 * }
 * ```
 */
export function handleFormError(
  err: any,
  form: { get(field: string): AbstractControl | null },
  translate: TranslateService
): void {
  const body = err?.error ?? err
  const code: string = body?.code ?? ''
  if (!code) return

  const meta: Record<string, unknown> = body?.meta ?? {}

  const msg = resolveErrorMessage(err, translate)

  // Shape A: any meta value that is an array → the key is the field name or contains partial failure objects.
  for (const [key, val] of Object.entries(meta)) {
    if (Array.isArray(val) && applyArrayMetaError(key, val, form, translate, msg)) return
  }

  // Shape C: errors array → each entry has { field, rule }.
  const errors: Array<{ field: string; rule: string }> = body?.errors ?? []
  if (errors.length > 0) {
    for (const { field: f, rule } of errors) {
      const ruleMsg = translate.instant(`forms_validation.${rule}`)
      setFieldError(form.get(f), ruleMsg || msg)
    }
    return
  }

  // Shape B: meta.field is a string → the value is the field name.
  const field = (meta['field'] as string) ?? ''
  if (field) {
    setFieldError(form.get(field), msg)
  }
}

type FormLike = { get(field: string): AbstractControl | null }

/**
 * Handles a single `meta` entry whose value is an array (Shape A / Shape D).
 * Returns true when an error was applied to a control (caller must stop processing).
 */
function applyArrayMetaError(
  key: string,
  val: unknown[],
  form: FormLike,
  translate: TranslateService,
  msg: string
): boolean {
  if (val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
    // Generic partial failures: array of objects containing errors (Shape D)
    return applyPartialFailures(val as Array<Record<string, unknown>>, form, translate)
  }
  // Original Shape A: array of primitives (e.g. email strings)
  setFieldError(form.get(key), msg)
  return true
}

/** Shape D: sets a combined error message on the control matched by the failed objects' keys. */
function applyPartialFailures(
  objArray: Array<Record<string, unknown>>,
  form: FormLike,
  translate: TranslateService
): boolean {
  const failedObjects = objArray.filter((item) => item && (item['error'] || item['message']))
  if (failedObjects.length === 0) return false

  const target = findPartialFailureControl(failedObjects[0], form)
  if (!target) return false

  const failedMsg = failedObjects
    .map((item) => formatPartialFailure(item, target.key, translate))
    .join(', ')

  setFieldError(target.ctrl, failedMsg)
  return true
}

/** Finds the first key of the sample object that maps to a form control. */
function findPartialFailureControl(
  sampleObj: Record<string, unknown>,
  form: FormLike
): { ctrl: AbstractControl; key: string } | null {
  for (const objKey of Object.keys(sampleObj)) {
    if (objKey === 'error' || objKey === 'status') continue
    const ctrl = findControlByKeyVariants(objKey, form)
    if (ctrl) return { ctrl, key: objKey }
  }
  return null
}

/** Try exact match, pluralized match, or singularized match. */
function findControlByKeyVariants(objKey: string, form: FormLike): AbstractControl | null {
  let ctrl = form.get(objKey)
  ctrl ??= form.get(objKey + 's')
  if (!ctrl && objKey.endsWith('s')) ctrl = form.get(objKey.slice(0, -1))
  return ctrl
}

/** Formats a single failed object as `identifier: message` (or just `message`). */
function formatPartialFailure(
  item: Record<string, unknown>,
  matchedKey: string,
  translate: TranslateService
): string {
  const identifier = item[matchedKey] as string | number | undefined
  const errStr = resolvePartialFailureText(item, translate)
  return identifier ? `${identifier}: ${errStr}` : errStr
}

/** Translates the item's `code` when a translation exists; otherwise falls back to `error`/`message`. */
function resolvePartialFailureText(item: Record<string, unknown>, translate: TranslateService): string {
  const errCode = item['code'] as string
  if (errCode) {
    const translated = translate.instant(`errors.${errCode}`)
    if (translated !== `errors.${errCode}`) return translated
  }
  return (item['error'] ?? item['message']) as string
}

/**
 * Resolves a backend error into a translated, interpolated string.
 *
 * Use this when the error is NOT field-specific — e.g. `INVITE_USER_ALREADY_EXISTS`
 * carries a list of emails in `meta`. The caller decides how to display the
 * message (toast, summary banner, etc.).
 *
 * Resolution flow:
 * 1. Extracts `code` from `err.code` or `err.error.code`
 * 2. Flattens `meta` values — arrays become comma-separated strings
 * 3. Calls `translate.instant('errors.{CODE}', params)` with meta as interpolation context
 *
 * Backend contract example:
 * ```go
 * errInviteAlreadyExists(emails).WithMeta("emails", emails)
 * // → { "code": "INVITE_USER_ALREADY_EXISTS", "meta": { "emails": ["a@x.com", "b@x.com"] } }
 * ```
 *
 * i18n entry (`en.json` → `errors` namespace):
 * ```json
 * { "INVITE_USER_ALREADY_EXISTS": "These emails already exist: {{emails}}" }
 * ```
 *
 * Usage:
 * ```typescript
 * error: (err) => {
 *   this.loading = false
 *   this.messageService.add({
 *     severity: 'error',
 *     detail: resolveErrorMessage(err, this.translate),
 *   })
 * }
 * ```
 */
export function resolveErrorMessage(err: any, translate: TranslateService): string {
  const code: string = err?.code ?? err?.error?.code ?? ''
  if (!code) return ''

  const meta: Record<string, any> = err?.meta ?? err?.error?.meta ?? {}

  // Flatten arrays → comma-separated strings for ngx-translate interpolation.
  // Skip 'field' — it's a frontend routing hint, not a display value.
  const params = Object.fromEntries(
    Object.entries(meta)
      .filter(([key]) => key !== 'field')
      .map(([key, val]) => [key, Array.isArray(val) ? val.join(', ') : val])
  )

  return translate.instant(`errors.${code}`, params)
}
