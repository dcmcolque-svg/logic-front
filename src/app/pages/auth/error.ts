import {
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core'
import { ButtonModule } from 'primeng/button'
import { AuthService } from '@/app/core/services/auth.service'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TranslateLanService } from '@/app/core/services/translate-lan.service'
import { LayoutService } from '@/app/layout/service/layout.service'
import { AuthBrandPanelComponent } from './auth-brand-panel.component'

@Component({
  selector: 'app-error',
  standalone: true,
  imports: [ButtonModule, TranslateModule, AuthBrandPanelComponent],
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
            <span class="flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-500/10">
              <i class="pi pi-exclamation-triangle text-3xl text-orange-500"></i>
            </span>
            <div>
              <h2 class="text-3xl font-bold text-color m-0">{{ 'errors.AUTH_FAILED_TITLE' | translate }}</h2>
              <p class="text-muted-color text-lg leading-relaxed mt-2 mb-0">
                {{ messageKey() | translate }} {{ messageDetail() }}
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <p-button
              [label]="'buttons.refresh' | translate"
              icon="pi pi-refresh"
              size="large"
              styleClass="w-full justify-center"
              [style]="{ width: '100%' }"
              (onClick)="retry()"
            />
            <p-button
              [label]="'buttons.home' | translate"
              icon="pi pi-home"
              size="large"
              severity="secondary"
              [outlined]="true"
              styleClass="w-full justify-center"
              [style]="{ width: '100%' }"
              (onClick)="goHome()"
            />
          </div>

          <p class="lg:hidden text-xs text-muted-color text-center m-0">
            &copy; {{ year }} J3B · {{ 'auth.all_rights_reserved' | translate }}
          </p>
        </div>
      </main>
    </div>
  `,
})
export class Error implements OnInit {
  private readonly authService = inject(AuthService)
  private readonly translate = inject(TranslateService)
  private readonly translateLan = inject(TranslateLanService)
  private readonly layoutService = inject(LayoutService)

  readonly isDark = this.layoutService.isDarkTheme
  readonly year = new Date().getFullYear()

  messageKey = signal<string>('errors.AUTH_GENERIC_ERROR')
  messageDetail = signal<string>('')

  constructor() {
    // Manually trigger language load since this is a root-level standalone route
    this.translate.use(this.translateLan.getLanguage())
  }

  ngOnInit(): void {
    void this.loadAuthMessage()
  }

  private async loadAuthMessage(): Promise<void> {
    // Await the auth info directly to ensure it reads from the cookie
    const auth = await this.authService.getAuthInfo()
    const rawMessage = auth?.status?.message

    if (rawMessage) {
      if (rawMessage.startsWith('errors.')) {
        const separatorIdx = rawMessage.indexOf('|')
        if (separatorIdx === -1) {
          this.messageKey.set(rawMessage)
          this.messageDetail.set('')
        } else {
          this.messageKey.set(rawMessage.substring(0, separatorIdx))
          this.messageDetail.set(rawMessage.substring(separatorIdx + 1))
        }
      } else {
        // If it's not a translation key, just use it as detail so it won't be translated
        this.messageKey.set('')
        this.messageDetail.set(rawMessage)
      }
    }
  }

  goHome() {
    this.authService.goToRootPage()
  }

  retry() {
    this.authService.redirectTologin()
  }
}
