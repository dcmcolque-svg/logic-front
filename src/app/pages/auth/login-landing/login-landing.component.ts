import {
  afterNextRender,
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
import { IconField } from 'primeng/iconfield'
import { InputIcon } from 'primeng/inputicon'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TooltipModule } from 'primeng/tooltip'
import { AuthService } from '@/app/core/services/auth.service'
import { LayoutService } from '@/app/layout/service/layout.service'
import { TranslateLanService } from '@/app/core/services/translate-lan.service'
import { FieldErrorComponent, handleFormError, resolveErrorMessage } from '@/app/shared/components'
import { AuthBrandPanelComponent } from '../auth-brand-panel.component'
import { revealInvalid } from '@/app/shared/utils/form.util'

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
    IconField,
    InputIcon,
    TranslateModule,
    TooltipModule,
    FieldErrorComponent,
    AuthBrandPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen flex bg-surface-50 dark:bg-surface-950">

      <app-auth-brand-panel />

      <!-- Form panel -->
      <main class="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div class="w-full max-w-sm flex flex-col gap-8">

          <!-- Logo (mobile/tablet only) -->
          <div class="flex lg:hidden flex-col items-center gap-1">
            <img
              [src]="isDark() ? '/layout/images/logo-light.png' : '/layout/images/logo-dark.png'"
              alt="LOGIC"
              class="h-20 w-auto object-contain"
            />
            <p class="text-sm text-muted-color tracking-widest m-0">
              {{ 'auth.wms_subtitle' | translate }}
            </p>
          </div>

          <div>
            <h2 class="text-3xl font-bold text-color m-0">{{ 'auth.welcome_title' | translate }}</h2>
            <p class="text-muted-color mt-2 mb-0">{{ 'auth.welcome_subtitle' | translate }}</p>
          </div>

          <form
            [formGroup]="form"
            (ngSubmit)="login()"
            class="w-full flex flex-col gap-5"
            autocomplete="on"
          >
            <div class="flex flex-col gap-2">
              <label for="login-email" class="text-sm font-medium">{{ 'auth.email' | translate }}</label>
              <p-iconfield>
                <p-inputicon styleClass="pi pi-envelope" />
                <input
                  pInputText
                  id="login-email"
                  type="email"
                  formControlName="email"
                  autocomplete="username"
                  [placeholder]="'auth.emailPlaceholder' | translate"
                  class="w-full"
                  (keyup)="checkCapsLock($event)"
                />
              </p-iconfield>
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
                (keydown)="checkCapsLock($event)"
                (keyup)="checkCapsLock($event)"
              />
              @if (capsLock()) {
                <small id="login-caps-lock" class="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400" role="status">
                  <i class="pi pi-exclamation-triangle text-xs"></i>{{ 'auth.caps_lock_on' | translate }}
                </small>
              }
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
              icon="pi pi-arrow-right"
              iconPos="right"
              size="large"
              styleClass="w-full justify-center"
              [style]="{ width: '100%' }"
              [loading]="isSubmitting()"
              [disabled]="isSubmitting()"
            />

            <!-- No self-service reset yet: the way back in is a new invitation -->
            <p class="text-xs text-muted-color text-center m-0 leading-relaxed">
              <i class="pi pi-question-circle mr-1 text-xs"></i>{{ 'auth.forgot_password_hint' | translate }}
            </p>
          </form>

          <div class="flex flex-col items-center gap-4">
            <div class="flex items-center gap-2">
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
            <!-- Light / dark, before signing in (same setting as the topbar) -->
            <p-button
              id="btn-login-theme"
              [icon]="isDark() ? 'pi pi-sun' : 'pi pi-moon'"
              [rounded]="true"
              [text]="true"
              severity="secondary"
              [ariaLabel]="(isDark() ? 'auth.theme_light' : 'auth.theme_dark') | translate"
              [pTooltip]="(isDark() ? 'auth.theme_light' : 'auth.theme_dark') | translate"
              tooltipPosition="top"
              (onClick)="toggleTheme()"
            />
            </div>

            <!-- Copyright (mobile/tablet only; desktop shows it in the brand panel) -->
            <p class="lg:hidden text-xs text-muted-color text-center m-0">
              &copy; {{ year }} J3B · {{ 'auth.all_rights_reserved' | translate }}
            </p>
          </div>
        </div>
      </main>
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
    // Ready to type: the cursor starts in the email field
    afterNextRender(() => document.getElementById('login-email')?.focus())
    this.translate.use(this.translateLan.getLanguage())
    const lan = this.translateLan.getLanguage()
    this.selectedLanguage =
      this.languageOptions.find((opt) => opt.value === lan) ||
      this.languageOptions[0]
  }

  readonly isDark = this.layoutService.isDarkTheme
  readonly year = new Date().getFullYear()

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

  /** Caps Lock is on (read from the last key event in a field). */
  readonly capsLock = signal(false)

  checkCapsLock(event: Event): void {
    const e = event as KeyboardEvent
    if (typeof e.getModifierState === 'function') this.capsLock.set(e.getModifierState('CapsLock'))
  }

  toggleTheme(): void {
    this.layoutService.layoutConfig.update(prev => ({ ...prev, darkTheme: !prev.darkTheme }))
  }

  handleLanguageChange(event: SelectButtonChangeEvent): void {
    const lan = event.value?.value
    if (!lan) return
    this.translateLan.setLanguage(lan)
    this.translate.use(lan)
  }

  login(): void {
    if (this.isSubmitting() || revealInvalid(this.form)) return
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
        // The password was cleared: put the cursor back there to retry
        setTimeout(() => document.getElementById('login-password')?.focus())
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
    // Known login codes resolved explicitly (backend: logic-back auth/login).
    const known: Record<string, string> = {
      AUTH_INVALID_CREDENTIALS: 'auth.invalidCredentials',
    }
    if (known[code]) return this.translate.instant(known[code])

    const msg = resolveErrorMessage(err, this.translate)
    // translate.instant returns the key itself when there is no translation.
    if (code && msg && msg !== `errors.${code}`) return msg
    return this.translate.instant('errors.AUTH_GENERIC_ERROR')
  }
}
