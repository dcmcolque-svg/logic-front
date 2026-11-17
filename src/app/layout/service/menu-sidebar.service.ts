import { inject, Injectable, signal, computed } from '@angular/core'
import { MenuItem } from 'primeng/api'
import { AuthService } from '../../core/services/auth.service'
import { Activity } from '../../core/types/auth.types'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'

/** True when the label matches (case-insensitive) one of the user's activities. */
function matchesActivity(label: string | undefined, activities: Activity[]): boolean {
  return activities.some(
    (acc) => label?.toUpperCase() === acc.activity?.toUpperCase()
  )
}

@Injectable({
  providedIn: 'root',
})
export class MenuSidebarService {
  private readonly authService = inject(AuthService)
  private readonly translate = inject(TranslateService)

  private readonly _menuItems = signal<MenuItem[]>([])
  readonly menuItems = this._menuItems.asReadonly()
  readonly hasMenu = computed(() => this._menuItems().length > 0)

  /**
   * Filters the provided menu items based on the user's activities/permissions.
   * Only shows menu items that match the user's allowed activities.
   */
  setMenu(fullMenu: MenuItem[]): void {
    const activities = this.authService.getActivities()

    // If no activities, show full menu (no permission filtering)
    if (!activities || activities.length === 0) {
      this._menuItems.set(fullMenu)
      return
    }

    const filteredMenu = fullMenu
      .map((menuItem) => ({
        ...menuItem,
        items: menuItem.items?.filter((item) => {
          // Handle nested submenus (e.g., "developer" section)
          if (item.items && item.items.length > 0) {
            const filteredSubItems = item.items.filter((subItem: any) =>
              matchesActivity(subItem.label, activities)
            )

            if (filteredSubItems.length > 0) {
              item.items = filteredSubItems
              return true
            }
            return false
          }

          // Normal items: match by activity label
          return matchesActivity(item.label, activities)
        }),
      }))
      .filter((menuItem) => menuItem.items && menuItem.items.length > 0)

    this._menuItems.set(filteredMenu)
  }

  /**
   * Returns a deep-cloned copy of the menu with translated labels.
   * Labels are translated using 'pages.{label}' keys from the i18n files.
   */
  async getTranslatedMenu(): Promise<MenuItem[]> {
    const menus = structuredClone(this._menuItems())
    await this.processMenuTranslation(menus)
    return menus
  }

  /**
   * Recursively translates menu item labels using the TranslateService.
   */
  private async processMenuTranslation(items: MenuItem[]): Promise<void> {
    for (const item of items) {
      if (item.separator) continue

      // Store original label for reference (used by tabs, permission checks, etc.)
      ;(item as any)['labelOriginal'] = item.label

      // Translate using 'pages.{label}' key
      const translatedLabel = await firstValueFrom(
        this.translate.get('pages.' + item.label)
      )
      item.label = translatedLabel

      if (item.items) {
        await this.processMenuTranslation(item.items)
      }
    }
  }

  /**
   * Clears the menu (e.g., on logout)
   */
  clearMenu(): void {
    this._menuItems.set([])
  }
}
