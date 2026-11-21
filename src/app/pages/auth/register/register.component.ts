import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { PasswordModule } from 'primeng/password'
import { Message } from 'primeng/message'
import { ProgressSpinner } from 'primeng/progressspinner'
import { IconField } from 'primeng/iconfield'
import { InputIcon } from 'primeng/inputicon'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { switchMap } from 'rxjs'
import { AuthService } from '@/app/core/services/auth.service'
import { LayoutService } from '@/app/layout/service/layout.service'
import { TranslateLanService } from '@/app/core/services/translate-lan.service'
import {
  FieldErrorComponent,
  handleFormError,
  resolveErrorMessage,
} from '@/app/shared/components'
import { AuthBrandPanelComponent } from '../auth-brand-panel.component'
import { revealInvalid } from '@/app/shared/utils/form.util'

type LinkState = 'checking' | 'valid' | 'invalid'

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
 * Private sign-up page: /register/:key.
 * Not linked from anywhere — only whoever knows the key (REGISTER_SECRET on
 * the backend) can open it. Creates an OWNER account with its first facility
 * and default locations, then signs in with the same credentials.
 */
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    Message,
    ProgressSpinner,
    IconField,
    InputIcon,
    TranslateModule,
    FieldErrorComponent,
    AuthBrandPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen flex bg-surface-50 dark:bg-surface-950">
      <app-auth-brand-panel />

      <main class="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div class="w-full max-w-lg flex flex-col gap-8">

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

        @switch (linkState()) {
          @case ('checking') {
            <div class="flex flex-col items-center gap-3 py-6">
              <p-progress-spinner strokeWidth="4" [style]="{ width: '2.5rem', height: '2.5rem' }" />
              <span class="text-sm text-muted-color">{{ 'auth.register.checking' | translate }}</span>
            </div>
          }

          @case ('invalid') {
            <p-message severity="error" [text]="'auth.register.invalidLink' | translate" styleClass="w-full" />
            <a routerLink="/login" class="text-sm text-primary font-medium self-center">
              <i class="pi pi-arrow-left text-xs mr-1"></i>{{ 'auth.register.backToLogin' | translate }}
            </a>
          }

          @case ('valid') {
            <div>
              <h2 class="text-3xl font-bold text-color m-0">{{ 'auth.register.title' | translate }}</h2>
              <p class="text-muted-color mt-2 mb-0">{{ 'auth.register.subtitle' | translate }}</p>
            </div>

            <form [formGroup]="form" (ngSubmit)="submit()" class="w-full flex flex-col gap-5" autocomplete="off">
              <div class="flex flex-col gap-2">
                <label for="reg-company" class="text-sm font-medium">{{ 'auth.register.companyName' | translate }}</label>
                <input pInputText id="reg-company" formControlName="company_name"
                       [placeholder]="'auth.register.companyNamePlaceholder' | translate" class="w-full" />
                <sh-field-error [ctrl]="form.get('company_name')" />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="flex flex-col gap-2 sm:col-span-2">
                  <label for="reg-facility" class="text-sm font-medium">{{ 'auth.register.facilityName' | translate }}</label>
                  <input pInputText id="reg-facility" formControlName="facility_name"
                         [placeholder]="'auth.register.facilityNamePlaceholder' | translate" class="w-full" />
                  <sh-field-error [ctrl]="form.get('facility_name')" />
                </div>
                <div class="flex flex-col gap-2">
                  <label for="reg-facility-code" class="text-sm font-medium">{{ 'auth.register.facilityCode' | translate }}</label>
                  <input pInputText id="reg-facility-code" formControlName="facility_code" maxlength="20"
                         [placeholder]="'auth.register.facilityCodePlaceholder' | translate" class="w-full uppercase" />
                  <sh-field-error [ctrl]="form.get('facility_code')" />
                </div>
              </div>

              <div class="w-full border-t border-surface"></div>

              <div class="flex flex-col gap-2">
                <label for="reg-fullname" class="text-sm font-medium">{{ 'auth.register.fullName' | translate }}</label>
                <input pInputText id="reg-fullname" formControlName="full_name" autocomplete="name"
                       [placeholder]="'auth.register.fullNamePlaceholder' | translate" class="w-full" />
                <sh-field-error [ctrl]="form.get('full_name')" />
              </div>

              <div class="flex flex-col gap-2">
                <label for="reg-email" class="text-sm font-medium">{{ 'auth.email' | translate }}</label>
                <p-iconfield>
                  <p-inputicon styleClass="pi pi-envelope" />
                  <input pInputText id="reg-email" type="email" formControlName="email" autocomplete="username"
                         [placeholder]="'auth.emailPlaceholder' | translate" class="w-full" />
                </p-iconfield>
                <sh-field-error [ctrl]="form.get('email')" />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="flex flex-col gap-2">
                  <label for="reg-password" class="text-sm font-medium">{{ 'auth.password' | translate }}</label>
                  <p-password inputId="reg-password" formControlName="password" [feedback]="false" [toggleMask]="true"
                              autocomplete="new-password" [placeholder]="'auth.register.passwordMin' | translate"
                              styleClass="w-full" [inputStyle]="{ width: '100%' }" />
                  <sh-field-error [ctrl]="form.get('password')" />
                </div>
                <div class="flex flex-col gap-2">
                  <label for="reg-confirm" class="text-sm font-medium">{{ 'auth.register.confirmPassword' | translate }}</label>
                  <p-password inputId="reg-confirm" formControlName="confirm_password" [feedback]="false" [toggleMask]="true"
                              autocomplete="new-password" styleClass="w-full" [inputStyle]="{ width: '100%' }" />
                  @if (form.get('confirm_password')?.hasError('mismatch') && form.get('confirm_password')?.touched) {
                    <small class="text-red-500">{{ 'errors.AUTH_PASSWORD_MISMATCH' | translate }}</small>
                  } @else {
                    <sh-field-error [ctrl]="form.get('confirm_password')" />
                  }
                </div>
              </div>

              @if (errorMessage()) {
                <p-message severity="error" [text]="errorMessage()" styleClass="w-full" />
              }
              @if (created()) {
                <p-message severity="success" [text]="'auth.register.created' | translate" styleClass="w-full" />
              }

              <p-button
                type="submit"
                [label]="'auth.register.submit' | translate"
                icon="pi pi-user-plus"
                size="large"
                styleClass="w-full justify-center"
                [style]="{ width: '100%' }"
                [loading]="isSubmitting()"
                [disabled]="created()"
              />
            </form>

            <a routerLink="/login" class="text-sm text-primary font-medium self-center">
              <i class="pi pi-arrow-left text-xs mr-1"></i>{{ 'auth.register.backToLogin' | translate }}
            </a>
          }
        }

        <!-- Copyright (mobile/tablet only; desktop shows it in the brand panel) -->
        <p class="lg:hidden text-xs text-muted-color text-center m-0">
          &copy; {{ year }} J3B · {{ 'auth.all_rights_reserved' | translate }}
        </p>
        </div>
      </main>
    </div>
  `,
})
export class RegisterComponent implements OnInit {
  private readonly authService = inject(AuthService)
  private readonly layoutService = inject(LayoutService)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly translate = inject(TranslateService)
  private readonly translateLan = inject(TranslateLanService)

  readonly isDark = this.layoutService.isDarkTheme
  readonly year = new Date().getFullYear()

  linkState = signal<LinkState>('checking')
  isSubmitting = signal(false)
  created = signal(false)
  errorMessage = signal('')

  private key = ''

  form = new FormGroup(
    {
      company_name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      facility_name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      facility_code: new FormControl('', { nonNullable: true }),
      full_name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
      password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
      confirm_password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: passwordsMatch }
  )

  constructor() {
    this.translate.use(this.translateLan.getLanguage())
  }

  ngOnInit(): void {
    this.key = this.route.snapshot.paramMap.get('key') ?? ''
    if (!this.key) {
      this.linkState.set('invalid')
      return
    }
    this.authService.checkRegisterKey(this.key).subscribe({
      next: () => this.linkState.set('valid'),
      error: () => this.linkState.set('invalid'),
    })
  }

  submit(): void {
    if (this.isSubmitting() || this.created() || revealInvalid(this.form)) return
    this.isSubmitting.set(true)
    this.errorMessage.set('')

    const v = this.form.getRawValue()
    const email = v.email.trim()
    this.authService
      .register({ key: this.key, ...v, email })
      .pipe(
        switchMap(() => {
          this.created.set(true)
          return this.authService.login(email, v.password)
        })
      )
      .subscribe({
        next: () => {
          this.isSubmitting.set(false)
          // '' = splash: loads activities and routes to the first allowed page.
          this.router.navigate(['/'])
        },
        error: (err) => {
          this.isSubmitting.set(false)
          if (this.created()) {
            // Account exists but auto-login failed: let the user sign in manually.
            this.router.navigate(['/login'])
            return
          }
          // The interceptor rethrows the V2 body ({ code, ... }) without the HTTP status.
          const code = err?.code ?? err?.error?.code
          if (code === 'NOT_FOUND' || err?.status === 404) {
            this.linkState.set('invalid')
            return
          }
          handleFormError(err, this.form, this.translate)
          if (!(err?.meta?.field ?? err?.error?.meta?.field)) {
            this.errorMessage.set(this.resolveError(err))
          }
        },
      })
  }

  private resolveError(err: { code?: string; error?: { code?: string } } | null): string {
    const code = err?.code ?? err?.error?.code ?? ''
    const msg = resolveErrorMessage(err, this.translate)
    if (code && msg && msg !== `errors.${code}`) return msg
    return this.translate.instant('errors.AUTH_SETUP_ACCOUNT')
  }
}
