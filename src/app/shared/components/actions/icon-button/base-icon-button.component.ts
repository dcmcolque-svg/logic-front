import { Component, input, output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ButtonModule } from 'primeng/button'
import { TooltipModule } from 'primeng/tooltip'

/**
 * ShIconButton — Icon button with tooltip.
 * Equivalent to agetic's IconoBoton.
 *
 * Usage:
 * ```html
 * <sh-icon-button icon="pi pi-pencil" tooltip="Edit" (clicked)="onEdit()" />
 * <sh-icon-button icon="pi pi-trash" tooltip="Delete" severity="danger" />
 * ```
 */
@Component({
  selector: 'base-icon-button',
  standalone: true,
  imports: [CommonModule, ButtonModule, TooltipModule],
  templateUrl: './base-icon-button.component.html',
  styleUrl: './base-icon-button.component.scss',
})
export class BaseIconButton {
  /** PrimeIcon class */
  icon = input.required<string>()
  /** Tooltip text */
  tooltip = input('')
  /** Button severity */
  severity = input<
    | 'success'
    | 'info'
    | 'warn'
    | 'danger'
    | 'secondary'
    | 'contrast'
    | undefined
  >(undefined)
  /** Show as text button (no background) */
  text = input(true)
  /** Show as outlined button */
  outlined = input(false)
  /** Disabled state */
  disabled = input(false)
  /** Loading state */
  loading = input(false)
  /** Button size */
  size = input<'small' | 'large' | undefined>('small')

  /** Click event */
  clicked = output<Event>()
}
