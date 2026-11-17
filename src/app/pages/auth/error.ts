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

@Component({
  selector: 'app-error',
  standalone: true,
  imports: [ButtonModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950 p-4 relative overflow-hidden">
      
      <!-- Decorative background elements -->
      <div class="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-primary-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Main Card -->
      <div class="relative z-10 w-full max-w-lg bg-surface-0 dark:bg-surface-900 shadow-2xl rounded-2xl border border-surface-200 dark:border-surface-700 overflow-hidden">
        <!-- Top accent line -->
        <div class="h-1.5 w-full bg-gradient-to-r from-primary-400 to-primary-600"></div>
        
        <div class="p-8 sm:p-12 text-center">
          <!-- Icon container (without animation) -->
          <div class="mx-auto w-24 h-24 bg-orange-50 dark:bg-orange-500/10 rounded-full flex items-center justify-center mb-8 relative">
            <i class="pi pi-exclamation-triangle text-4xl text-orange-500 relative z-10"></i>
          </div>

          <h1 class="text-3xl font-bold text-surface-900 dark:text-surface-0 mb-3 tracking-tight">
            {{ 'errors.AUTH_FAILED_TITLE' | translate }}
          </h1>
          
          <p class="text-surface-500 dark:text-surface-400 text-lg mb-8 leading-relaxed">
            {{ messageKey() | translate }} {{ messageDetail() }}
          </p>

          <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
            <p-button
              label="{{ 'buttons.refresh' | translate }}"
              icon="pi pi-refresh"
              (onClick)="retry()"
              styleClass="w-full sm:w-auto rounded-full"
              severity="primary"
            />
            <p-button
              label="{{ 'buttons.home' | translate }}"
              icon="pi pi-home"
              (onClick)="goHome()"
              styleClass="w-full sm:w-auto rounded-full"
              severity="secondary"
              variant="outlined"
            />
          </div>
        </div>
      </div>
    </div>
  `,
})
export class Error implements OnInit {
  private readonly authService = inject(AuthService)
  private readonly translate = inject(TranslateService)
  private readonly translateLan = inject(TranslateLanService)
  private readonly layoutService = inject(LayoutService)

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
