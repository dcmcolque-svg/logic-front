import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { Router } from '@angular/router'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { PasswordModule } from 'primeng/password'
import { SelectButton, SelectButtonChangeEvent } from 'primeng/selectbutton'
import { Message } from 'primeng/message'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { AuthService } from '@/app/core/services/auth.service'
import { LayoutService } from '@/app/layout/service/layout.service'
import { TranslateLanService } from '@/app/core/services/translate-lan.service'
import { FieldErrorComponent, handleFormError, resolveErrorMessage } from '@/app/shared/components'

@Component({
  selector: 'app-login-landing',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    SelectButton,
    Message,
    TranslateModule,
    FieldErrorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Full-screen surface background (adapts to light/dark theme) -->
    <div class="min-h-screen flex flex-col items-center justify-center surface-ground px-4">

      <!-- Central card -->
      <div
        class="w-full max-w-md surface-card shadow-2xl px-10 py-12 flex flex-col items-center gap-6"
        style="border-radius: 16px;"
      >
        <!-- Logo — switches between dark/light variant -->
        <div class="flex flex-col items-center gap-1 mb-2">
          <img
            [src]="isDark() ? '/layout/images/logo-light.png' : '/layout/images/logo-dark.png'"
            alt="BINLOGIC"
            class="h-12 w-auto object-contain"
          />
          <p class="text-sm text-color-secondary tracking-widest mt-1">
            {{ 'auth.wms_subtitle' | translate }}
          </p>
        </div>

        <!-- Email + password form -->
        <form
          [formGroup]="form"
          (ngSubmit)="login()"
          class="w-full flex flex-col gap-4"
          autocomplete="on"
        >
          <div class="flex flex-col gap-2">
            <label for="login-email" class="text-sm font-medium">{{ 'auth.email' | translate }}</label>
            <input
              pInputText
              id="login-email"
              type="email"
              formControlName="email"
              autocomplete="username"
              [placeholder]="'auth.emailPlaceholder' | translate"
              class="w-full"
            />
            <sh-field-error [ctrl]="form.get('email')" />
          </div>

          <div class="flex flex-col gap-2">
            <label for="login-password" class="text-sm font-medium">{{ 'auth.password' | translate }}</label>
            <p-password
              inputId="login-password"
              formControlName="password"
              [feedback]="false"
              [toggleMask]="true"
              autocomplete="current-password"
              [placeholder]="'auth.passwordPlaceholder' | translate"
              styleClass="w-full"
              [inputStyle]="{ width: '100%' }"
            />
            <sh-field-error [ctrl]="form.get('password')" />
          </div>

          @if (errorMessage()) {
            <p-message
              id="login-error"
              severity="error"
              [text]="errorMessage()"
              styleClass="w-full"
            />
          }

          <p-button
            id="btn-login"
            type="submit"
            [label]="'auth.login' | translate"
            icon="pi pi-sign-in"
            styleClass="w-full justify-center"
            [style]="{ width: '100%' }"
            [loading]="isSubmitting()"
            [disabled]="form.invalid"
          />
        </form>

        <!-- Divider inside card -->
        <div class="w-full border-t surface-border mt-2"></div>

        <!-- Language selector -->
        <div class="flex justify-center">
          <p-selectbutton
            [options]="languageOptions"
            [(ngModel)]="selectedLanguage"
            optionLabel="label"
            [allowEmpty]="false"
            size="small"
            (onChange)="handleLanguageChange($event)"
          >
            <ng-template let-item pTemplate="item">
              <div class="flex items-center gap-2 px-1">
                <img
                  [src]="item.icon"
                  [alt]="item.label"
                  style="width: 1.1rem; height: 1.1rem; border-radius: 50%"
                />
                <span class="text-xs">{{ item.label | translate }}</span>
              </div>
            </ng-template>
          </p-selectbutton>
        </div>

        <!-- Copyright footer -->
        <div class="text-center opacity-60">
          <p class="text-xs font-semibold text-color">
            &copy; Novacrest Systems
          </p>
          <p class="text-[10px] text-color-secondary mt-0.5">
            {{ 'auth.all_rights_reserved' | translate }}
          </p>
        </div>
      </div>
    </div>
  `,
})
export class LoginLandingComponent {
  private readonly authService   = inject(AuthService)
  private readonly layoutService = inject(LayoutService)
  private readonly router        = inject(Router)
  private readonly translate     = inject(TranslateService)
  private readonly translateLan  = inject(TranslateLanService)

  constructor() {
    this.translate.use(this.translateLan.getLanguage())
    const lan = this.translateLan.getLanguage()
    this.selectedLanguage =
      this.languageOptions.find((opt) => opt.value === lan) ||
      this.languageOptions[0]
  }

  readonly isDark = this.layoutService.isDarkTheme

  isSubmitting = signal(false)
  /** Form-level error from the backend (bad credentials, inactive account…). */
  errorMessage = signal('')

  languageOptions = [
    { label: 'labels.english', value: 'en', icon: '/layout/icons/um.png' },
    { label: 'labels.spanish', value: 'es', icon: '/layout/icons/es.png' },
  ]
  selectedLanguage = this.languageOptions[0]

  form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  })

  handleLanguageChange(event: SelectButtonChangeEvent): void {
    const lan = event.value?.value
    if (!lan) return
    this.translateLan.setLanguage(lan)
    this.translate.use(lan)
  }

  login(): void {
    if (this.form.invalid || this.isSubmitting()) return
    this.isSubmitting.set(true)
    this.errorMessage.set('')

    const { email, password } = this.form.getRawValue()
    this.authService.login(email.trim(), password).subscribe({
      next: () => {
        this.isSubmitting.set(false)
        // '' = splash: loads activities and routes to the first allowed page.
        this.router.navigate(['/'])
      },
      error: (err) => {
        this.isSubmitting.set(false)
        this.form.controls.password.reset()
        handleFormError(err, this.form, this.translate)
        // Errors tied to a field (422 + meta.field) are shown under the input
        // by handleFormError; the rest (401/403/500, network) go in the banner.
        if (!(err?.meta?.field ?? err?.error?.meta?.field)) {
          this.errorMessage.set(this.resolveLoginError(err))
        }
      },
    })
  }

  /** Translated message for a login error, falling back to a generic one. */
  private resolveLoginError(err: { code?: string; error?: { code?: string } } | null): string {
    const code = err?.code ?? err?.error?.code ?? ''
    const msg = resolveErrorMessage(err, this.translate)
    // translate.instant returns the key itself when there is no translation.
    if (code && msg && msg !== `errors.${code}`) return msg
    return this.translate.instant('errors.AUTH_GENERIC_ERROR')
  }
}
