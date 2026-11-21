import { ChangeDetectionStrategy, Component } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'

/**
 * Left-hand brand panel shared by the auth pages (login, register).
 * Only visible on large screens; the pages show a compact logo on smaller ones.
 */
@Component({
  selector: 'app-auth-brand-panel',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hidden lg:block lg:w-1/2 xl:w-[55%] shrink-0' },
  template: `
    <aside
      class="sticky top-0 h-screen relative overflow-hidden flex flex-col justify-between p-12 text-white"
      style="background: linear-gradient(135deg, var(--p-primary-700) 0%, var(--p-primary-500) 55%, var(--p-primary-400) 100%);"
    >
      <!-- Decorative shapes -->
      <div class="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/10"></div>
      <div class="absolute -bottom-40 -left-24 w-[28rem] h-[28rem] rounded-full bg-white/5"></div>
      <div
        class="absolute inset-0 opacity-[0.07]"
        style="background-image: radial-gradient(circle, #fff 1px, transparent 1px); background-size: 22px 22px;"
      ></div>

      <div class="relative z-10">
        <img src="/layout/images/logo-light.png" alt="LOGIC" class="h-16 w-auto object-contain" />
      </div>

      <div class="relative z-10 max-w-lg">
        <h1 class="text-4xl xl:text-5xl font-bold leading-tight m-0">
          {{ 'auth.brand_tagline' | translate }}
        </h1>
        <p class="text-lg text-white/80 mt-4 mb-8">{{ 'auth.wms_subtitle' | translate }}</p>

        <ul class="list-none p-0 m-0 flex flex-col gap-4">
          @for (f of features; track f.key) {
            <li class="flex items-center gap-3">
              <span class="flex items-center justify-center w-10 h-10 rounded-xl bg-white/15 shrink-0">
                <i [class]="f.icon"></i>
              </span>
              <span class="text-white/90">{{ f.key | translate }}</span>
            </li>
          }
        </ul>
      </div>

      <p class="relative z-10 text-sm text-white/70 m-0">
        &copy; {{ year }} J3B · {{ 'auth.all_rights_reserved' | translate }}
      </p>
    </aside>
  `,
})
export class AuthBrandPanelComponent {
  readonly year = new Date().getFullYear()

  readonly features = [
    { key: 'auth.feature_inventory', icon: 'pi pi-box' },
    { key: 'auth.feature_sales', icon: 'pi pi-shopping-cart' },
    { key: 'auth.feature_costing', icon: 'pi pi-chart-line' },
  ]
}
