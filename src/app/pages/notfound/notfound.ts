import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Location } from '@angular/common'
import { RouterModule } from '@angular/router'
import { ButtonModule } from 'primeng/button'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { LayoutService } from '@/app/layout/service/layout.service'
import { TranslateLanService } from '@/app/core/services/translate-lan.service'
import { AuthBrandPanelComponent } from '@/app/pages/auth/auth-brand-panel.component'

@Component({
  selector: 'app-notfound',
  standalone: true,
  imports: [RouterModule, ButtonModule, TranslateModule, AuthBrandPanelComponent],
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
            <span class="text-7xl font-extrabold leading-none text-primary tracking-tight">404</span>
            <div>
              <h2 class="text-3xl font-bold text-color m-0">{{ 'auth.not_found.title' | translate }}</h2>
              <p class="text-muted-color text-lg leading-relaxed mt-2 mb-0">
                {{ 'auth.not_found.subtitle' | translate }}
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <p-button
              [label]="'auth.not_found.go_home' | translate"
              icon="pi pi-home"
              size="large"
              styleClass="w-full justify-center"
              [style]="{ width: '100%' }"
              [routerLink]="['/']"
            />
            <p-button
              [label]="'auth.not_found.go_back' | translate"
              icon="pi pi-arrow-left"
              size="large"
              severity="secondary"
              [outlined]="true"
              styleClass="w-full justify-center"
              [style]="{ width: '100%' }"
              (onClick)="goBack()"
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
export class Notfound {
  private readonly location = inject(Location)
  private readonly translate = inject(TranslateService)
  private readonly translateLan = inject(TranslateLanService)

  readonly isDark = inject(LayoutService).isDarkTheme
  readonly year = new Date().getFullYear()

  constructor() {
    // Root-level standalone route: load the language manually.
    this.translate.use(this.translateLan.getLanguage())
  }

  goBack(): void {
    this.location.back()
  }
}
