import { Component, input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ProgressSpinnerModule } from 'primeng/progressspinner'

/**
 * ShLoadingOverlay — Semi-transparent overlay with centered spinner.
 * Equivalent to agetic's FullScreenLoading / Backdrop.
 *
 * Usage:
 * ```html
 * <div class="relative">
 *   <sh-loading-overlay [visible]="isLoading" />
 *   <!-- content -->
 * </div>
 * ```
 */
@Component({
  selector: 'base-loading-overlay',
  standalone: true,
  imports: [CommonModule, ProgressSpinnerModule],
  templateUrl: './base-loading-overlay.component.html',
  styleUrl: './base-loading-overlay.component.scss',
})
export class BaseLoadingOverlay {
  /** Show or hide the overlay */
  visible = input(false)
  /** Optional loading message */
  message = input<string>('')
  /** Use fixed positioning to cover the entire viewport */
  fullscreen = input(false)
}
