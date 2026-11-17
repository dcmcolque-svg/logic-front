import { ChangeDetectorRef, Component, computed, inject, input, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ButtonModule } from 'primeng/button'
import { MenuModule, Menu } from 'primeng/menu'
import { TooltipModule } from 'primeng/tooltip'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ShActionItem } from '../../../types/api.types'

/**
 * ShActionMenu — Contextual action dropdown button.
 * Equivalent to agetic's BotonAcciones.
 *
 * Usage:
 * ```html
 * <sh-action-menu [items]="actions" />
 * <sh-action-menu [items]="actions" label="Actions" icon="pi pi-cog" />
 * ```
 */
@Component({
  selector: 'base-action-menu',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    MenuModule,
    TooltipModule,
    TranslateModule,
  ],
  templateUrl: './base-action-menu.component.html',
  styleUrl: './base-action-menu.component.scss',
})
export class BaseActionMenu {
  private readonly translate = inject(TranslateService)
  private readonly cdr = inject(ChangeDetectorRef)

  /** Action items */
  items = input.required<ShActionItem[]>()
  /** Button label (hidden in icon-only mode) */
  label = input('')
  /** Button icon */
  icon = input('pi pi-ellipsis-v')
  /** Tooltip for icon-only mode */
  tooltip = input('Actions')
  /** Show as icon-only button */
  iconOnly = input(true)
  /** Show the label text */
  showLabel = input(false)
  /** Button severity */
  severity = input<
    | 'success'
    | 'info'
    | 'warn'
    | 'danger'
    | 'secondary'
    | 'contrast'
    | undefined
  >('secondary')
  /** Disabled state */
  disabled = input(false)
  /** Button size */
  size = input<'small' | 'large' | undefined>('small')

  @ViewChild('menuRef') menuRef!: Menu

  /** Transform ShActionItem[] → PrimeNG MenuItem[] */
  menuItems = computed(() => {
    const result: any[] = []
    for (const item of this.items()) {
      if (item.visible === false) continue
      // Insert a separator entry BEFORE this item when requested
      if (item.separator) {
        result.push({ separator: true })
      }
      result.push({
        label: this.translate.instant(item.label),
        icon: item.icon,
        disabled: item.disabled,
        command: item.command,
        styleClass: item.severity === 'danger' ? 'text-red-500' : '',
      })
    }
    return result
  })

  toggleMenu(event: Event) {
    event.stopPropagation()
    this.menuRef?.toggle(event)
    // PrimeNG Menu popup toggle doesn't notify Angular's change detection
    // in zoneless mode, causing the menu to require a double-click.
    this.cdr.markForCheck()
  }
}
