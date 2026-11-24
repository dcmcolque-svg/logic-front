import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { PasswordModule } from 'primeng/password'
import { Message } from 'primeng/message'
import { DynamicDialogRef } from 'primeng/dynamicdialog'
import { AuthService } from '@/app/core/services/auth.service'
import { FieldErrorComponent, handleFormError, resolveErrorMessage } from '@/app/shared/components'
import { revealInvalid } from '@/app/shared/utils/form.util'

const MIN_PASSWORD_LENGTH = 8

/** Flags `confirm_password` with `mismatch` while it differs from `password`. */
const passwordsMatch = (group: AbstractControl): ValidationErrors | null => {
  const pass = group.get('password')?.value
  const confirm = group.get('confirm_password')
  if (!confirm || !confirm.value) return null
  if (pass !== confirm.value) {
    confirm.setErrors({ ...(confirm.errors ?? {}), mismatch: true })
    return { mismatch: true }
  }
  if (confirm.hasError('mismatch')) {
    const { mismatch: _, ...rest } = confirm.errors ?? {}
    confirm.setErrors(Object.keys(rest).length ? rest : null)
  }
  return null
}

/**
 * Change own password (topbar avatar menu → "Cambiar contraseña").
 * Backend: POST /login/change { curr, password, confirm_password }; the user
 * comes from the token. The session stays open after the change.
 */
@Component({
  selector: 'app-change-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslateModule, ButtonModule, PasswordModule, Message, FieldErrorComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4 pt-2">
      <div class="flex flex-col gap-2">
        <label for="cp-current" class="text-sm font-medium">{{ 'topbar.current_password' | translate }}</label>
        <p-password
          inputId="cp-current"
          formControlName="curr"
          [feedback]="false"
          [toggleMask]="true"
          autocomplete="current-password"
          styleClass="w-full"
          [inputStyle]="{ width: '100%' }"
        />
        <sh-field-error [ctrl]="form.get('curr')" />
      </div>

      <div class="flex flex-col gap-2">
        <label for="cp-new" class="text-sm font-medium">{{ 'topbar.new_password' | translate }}</label>
        <p-password
          inputId="cp-new"
          formControlName="password"
          [feedback]="false"
          [toggleMask]="true"
          autocomplete="new-password"
          [placeholder]="'auth.register.passwordMin' | translate"
          styleClass="w-full"
          [inputStyle]="{ width: '100%' }"
        />
        <sh-field-error [ctrl]="form.get('password')" />
      </div>

      <div class="flex flex-col gap-2">
        <label for="cp-confirm" class="text-sm font-medium">{{ 'auth.register.confirmPassword' | translate }}</label>
        <p-password
          inputId="cp-confirm"
          formControlName="confirm_password"
          [feedback]="false"
          [toggleMask]="true"
          autocomplete="new-password"
          styleClass="w-full"
          [inputStyle]="{ width: '100%' }"
        />
        @if (form.get('confirm_password')?.hasError('mismatch') && form.get('confirm_password')?.touched) {
          <small class="text-red-500">{{ 'errors.AUTH_PASSWORD_MISMATCH' | translate }}</small>
        } @else {
          <sh-field-error [ctrl]="form.get('confirm_password')" />
        }
      </div>

      @if (errorMessage()) {
        <p-message severity="error" [text]="errorMessage()" />
      }

      <div class="flex justify-end gap-2 pt-4 border-t border-surface">
        <p-button
          [label]="'buttons.cancel' | translate"
          severity="secondary"
          [text]="true"
          [disabled]="saving()"
          (click)="ref.close()"
        />
        <p-button
          type="submit"
          [label]="'buttons.save' | translate"
          [loading]="saving()"
          [disabled]="saving()"
        />
      </div>
    </form>
  `,
})
export class AppChangePassword {
  readonly ref = inject(DynamicDialogRef)
  private readonly authService = inject(AuthService)
  private readonly translate = inject(TranslateService)

  saving = signal(false)
  errorMessage = signal('')

  form = new FormGroup(
    {
      curr: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)],
      }),
      confirm_password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: passwordsMatch }
  )

  save(): void {
    if (this.saving() || revealInvalid(this.form)) return
    this.saving.set(true)
    this.errorMessage.set('')

    this.authService.changePassword(this.form.getRawValue()).subscribe({
      next: () => {
        this.saving.set(false)
        this.ref.close(true)
      },
      error: (err) => {
        this.saving.set(false)
        // 422 with meta.field (curr / password / confirm_password) → under the input.
        handleFormError(err, this.form, this.translate)
        if (!(err?.meta?.field ?? err?.error?.meta?.field)) {
          this.errorMessage.set(resolveErrorMessage(err, this.translate))
        }
      },
    })
  }
}
