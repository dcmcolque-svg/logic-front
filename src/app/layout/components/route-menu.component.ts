import {
  Component,
  effect,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { RouterModule } from '@angular/router'
import { MenuItem } from 'primeng/api'
import { Popover, PopoverModule } from 'primeng/popover'
import { RippleModule } from 'primeng/ripple'
import { ButtonModule } from 'primeng/button'
import { TooltipModule } from 'primeng/tooltip'
import { AuthService } from '../../core/services/auth.service'
import { Activity } from '../../core/types/auth.types'
import { APP_MENU_TOPBAR } from '../config/app.menu.config'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TranslateLanService } from '../../core/services/translate-lan.service'
import { firstValueFrom } from 'rxjs'

@Component({
  selector: 'app-route-menu',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    PopoverModule,
    RippleModule,
    ButtonModule,
    TooltipModule,
    TranslateModule,
  ],
  template: `
    @if (itemsMenuOptions().length > 0) {
      <div class="mr-6 flex items-center">
        <p-button
          (click)="panel.toggle($event)"
          [rounded]="true"
          [text]="!open()"
          severity="secondary"
          icon="pi pi-cog"
          [pTooltip]="'topbar.settings' | translate"
          tooltipPosition="bottom"
          [attr.aria-label]="'topbar.settings' | translate"
          [attr.aria-expanded]="open()"
          styleClass="settings-gear"
        />
      </div>
    }

    <p-popover
      #panel
      appendTo="body"
      (onShow)="open.set(true)"
      (onHide)="open.set(false)"
      [style]="{ width: '23rem', maxWidth: 'calc(100vw - 2rem)' }"
    >
      <div class="flex flex-col">
        <div class="flex items-center gap-3 px-1 pb-3 mb-2 border-b border-surface-200 dark:border-surface-700">
          <span class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-400/10 text-primary">
            <i class="pi pi-cog"></i>
          </span>
          <div class="flex flex-col">
            <span class="font-semibold text-surface-900 dark:text-surface-0">
              {{ 'topbar.settings' | translate }}
            </span>
            <span class="text-xs text-muted-color">
              {{ 'topbar.settings_hint' | translate }}
            </span>
          </div>
        </div>

        <ul class="list-none m-0 p-0 flex flex-col gap-1">
          @for (item of itemsMenuOptions(); track item.label) {
            <li>
              <a
                pRipple
                [routerLink]="item.routerLink"
                routerLinkActive="settings-item-active"
                (click)="panel.hide()"
                class="settings-item group flex items-center gap-3 p-2 rounded-lg cursor-pointer no-underline transition-colors hover:bg-surface-100 dark:hover:bg-surface-800"
              >
                <span class="settings-item-icon flex items-center justify-center shrink-0 w-9 h-9 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 transition-colors group-hover:bg-primary group-hover:text-primary-contrast">
                  <i [class]="item.icon"></i>
                </span>
                <span class="flex flex-col min-w-0 flex-1">
                  <span class="text-sm font-medium text-surface-900 dark:text-surface-0 truncate">
                    {{ item.label }}
                  </span>
                  @if (item['description']) {
                    <span class="text-xs text-muted-color truncate">
                      {{ item['description'] | translate }}
                    </span>
                  }
                </span>
                <i class="pi pi-angle-right text-muted-color opacity-0 transition-opacity group-hover:opacity-100"></i>
              </a>
            </li>
          }
        </ul>
      </div>
    </p-popover>
  `,
  styles: [
    `
      :host ::ng-deep .settings-gear .p-button-icon {
        font-size: 18px;
      }
      .settings-item-active {
        background: var(--p-primary-50);
      }
      :host-context(.app-dark) .settings-item-active {
        background: color-mix(in srgb, var(--p-primary-400) 12%, transparent);
      }
      .settings-item-active .settings-item-icon {
        background: var(--p-primary-color);
        color: var(--p-primary-contrast-color);
      }
    `,
  ],
})
export class RouteMenuComponent implements OnInit {
  @ViewChild('panel') panel!: Popover

  /** Whether the settings panel is open (styles the gear as pressed). */
  readonly open = signal(false)

  private readonly authService = inject(AuthService)
  private readonly translate = inject(TranslateService)
  private readonly translateLanService = inject(TranslateLanService)

  private filteredMenu: MenuItem[] = []
  itemsMenuOptions = signal<MenuItem[]>([])

  constructor() {
    effect(
      () => {
        const lan = this.translateLanService.changeLanguage()
        this.translate.use(lan)
        this.loadTranslatedMenu()
      },
      { allowSignalWrites: true }
    )
  }

  ngOnInit() {
    this.setActivitiesOption()
  }

  setActivitiesOption() {
    const activities: Activity[] = this.authService.getActivities()
    if (!activities || activities.length === 0) {
      this.filteredMenu = structuredClone(APP_MENU_TOPBAR)
    } else {
      const result: MenuItem[] = []
      APP_MENU_TOPBAR.forEach((item: MenuItem) => {
        if (item.items && item.items.length > 0) {
          const filteredSubItems = item.items.filter((subItem: MenuItem) =>
            activities.some(
              (activity: Activity) =>
                activity.activity.toLowerCase() === subItem.label?.toLowerCase()
            )
          )
          if (filteredSubItems.length > 0) {
            result.push({ ...item, items: [...filteredSubItems] })
          }
        } else {
          const hasActivity = activities.some(
            (activity: Activity) =>
              activity.activity.toLowerCase() === item.label?.toLowerCase()
          )
          if (hasActivity) {
            result.push({ ...item })
          }
        }
      })
      this.filteredMenu = result
    }

    this.loadTranslatedMenu()
  }

  private async loadTranslatedMenu() {
    const menus: MenuItem[] = structuredClone(this.filteredMenu)
    await this.translateMenuItems(menus)
    this.itemsMenuOptions.set(menus)
  }

  private async translateMenuItems(items: MenuItem[]): Promise<void> {
    for (const item of items) {
      const route = Array.isArray(item.routerLink) ? item.routerLink[0] : item.routerLink
      if (typeof route === 'string' && !item['description']) {
        item['description'] = 'topbar.settings_desc.' + route.split('/').pop()
      }
      if (item.label) {
        item.label = await firstValueFrom(
          this.translate.get('pages.' + item.label)
        )
      }
      if (item.items) {
        await this.translateMenuItems(item.items)
      }
    }
  }
}
