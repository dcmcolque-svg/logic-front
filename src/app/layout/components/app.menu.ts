import { Component, effect, inject, OnInit, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import { RouterModule } from '@angular/router'
import { MenuItem } from 'primeng/api'
import { AppMenuitem } from './app.menuitem'
import { MenuSidebarService } from '../service/menu-sidebar.service'
import { TranslateLanService } from '../../core/services/translate-lan.service'
import { APP_MENU } from '../config/app.menu.config'

@Component({
  selector: '[app-menu]',
  standalone: true,
  imports: [CommonModule, AppMenuitem, RouterModule],
  template: `<ul class="layout-menu">
    @for (item of translatedMenuItems(); track item.label) {
      @if (!item.separator) {
        <li app-menuitem [item]="item" [root]="true"></li>
      } @else {
        <li class="menu-separator"></li>
      }
    }
  </ul>`,
})
export class AppMenu implements OnInit {
  menuService = inject(MenuSidebarService)
  private readonly translateLanService = inject(TranslateLanService)

  translatedMenuItems = signal<MenuItem[]>([])

  constructor() {
    // React to language changes and retranslate the menu
    effect(
      () => {
        // Read the signal to register dependency
        this.translateLanService.changeLanguage()
        this.loadTranslatedMenu()
      },
      { allowSignalWrites: true }
    )
  }

  ngOnInit() {
    this.menuService.setMenu(APP_MENU)
  }

  private async loadTranslatedMenu() {
    const translated = await this.menuService.getTranslatedMenu()
    this.translatedMenuItems.set(translated)
  }
}
