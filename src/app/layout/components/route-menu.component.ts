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
import { TieredMenuModule, TieredMenu } from 'primeng/tieredmenu'
import { RippleModule } from 'primeng/ripple'
import { ButtonModule } from 'primeng/button'
import { AuthService } from '../../core/services/auth.service'
import { Activity } from '../../core/types/auth.types'
import { APP_MENU_TOPBAR } from '../config/app.menu.config'
import { TranslateService } from '@ngx-translate/core'
import { TranslateLanService } from '../../core/services/translate-lan.service'
import { firstValueFrom } from 'rxjs'

@Component({
  selector: 'app-route-menu',
  standalone: true,
  imports: [CommonModule, RouterModule, TieredMenuModule, RippleModule, ButtonModule],
  template: `
    <p-tieredMenu
      #menuAccountOptions
      [model]="itemsMenuOptions()"
      [popup]="true"
      appendTo="body"
    ></p-tieredMenu>
    @if (itemsMenuOptions().length > 0) {
      <div class="mr-6 flex items-center">
        <p-button
          (click)="menuAccountOptions.toggle($event)"
          [rounded]="true"
          severity="secondary"
          icon="pi pi-cog"
          [pt]="{ icon: { style: { fontSize: '18px' } } }"
        />
      </div>
    }
  `,
})
export class RouteMenuComponent implements OnInit {
  @ViewChild('menuAccountOptions') menuAccountOptions!: TieredMenu

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
