import { Component, inject, ChangeDetectionStrategy } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ButtonModule } from 'primeng/button'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { AuthService } from '@/app/core/services/auth.service'
import { LayoutService } from '@/app/layout/service/layout.service'
import { TranslateLanService } from '@/app/core/services/translate-lan.service'
import { AuthBrandPanelComponent } from './auth-brand-panel.component'

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [CommonModule, ButtonModule, TranslateModule, AuthBrandPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen flex bg-surface-50 dark:bg-surface-950">
      <app-auth-brand-panel />

      <main class="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div class="w-full max-w-md flex flex-col gap-8">

          <!-- Logo (mobile/tablet only) -->
          <div class="flex lg:hidden justify-center">
            <img
              [src]="isDark() ? '/layout/images/logo-light.png' : '/layout/images/logo-dark.png'"
              alt="LOGIC"
              class="h-20 w-auto object-contain"
            />
          </div>

          <div class="flex flex-col gap-5">
            <span class="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-400/10">
              <i class="pi pi-lock text-3xl text-primary"></i>
            </span>
            <div>
              <h2 class="text-3xl font-bold text-color m-0">{{ 'auth.access_denied.title' | translate }}</h2>
              <p class="text-muted-color mt-2 mb-0">{{ 'auth.access_denied.subtitle' | translate }}</p>
            </div>
          </div>

          <div class="bg-surface-0 dark:bg-surface-900 border border-surface rounded-xl p-5 flex flex-col gap-2">
            <p class="text-color font-medium m-0">
              {{ 'auth.access_denied.greeting' | translate: { name: userName || ('auth.access_denied.default_user' | translate) } }}
            </p>
            <p class="text-muted-color leading-6 m-0">
              {{ 'auth.access_denied.body' | translate: { account: accountName } }}
            </p>
          </div>

          <p-button
            [label]="'auth.access_denied.sign_out' | translate"
            icon="pi pi-sign-out"
            size="large"
            severity="secondary"
            [outlined]="true"
            styleClass="w-full justify-center"
            [style]="{ width: '100%' }"
            (onClick)="logout()"
          />

          <p class="lg:hidden text-xs text-muted-color text-center m-0">
            &copy; {{ year }} J3B · {{ 'auth.all_rights_reserved' | translate }}
          </p>
        </div>
      </main>
    </div>
  `,
})
export class AccessDenied {
  private readonly authService = inject(AuthService)
  private readonly translate = inject(TranslateService)
  private readonly translateLan = inject(TranslateLanService)

  readonly isDark = inject(LayoutService).isDarkTheme
  readonly year = new Date().getFullYear()

  accountName = this.authService.getAccountName()
  userName = this.authService.getAuthUserInfo()?.user_name || ''

  constructor() {
    // Root-level standalone route: load the language manually.
    this.translate.use(this.translateLan.getLanguage())
  }

  logout() {
    const userId = this.authService.getAuthUserInfo()?.id || 0
    this.authService.logout(userId).subscribe()
  }
}
