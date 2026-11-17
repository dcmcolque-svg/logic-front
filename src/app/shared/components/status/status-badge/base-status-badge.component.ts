import { Component, computed, inject, input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { TagModule } from 'primeng/tag'
import { TranslateModule } from '@ngx-translate/core'

import { StatusColorService, StatusSeverity } from '@/app/shared/services/status-color.service'

/**
 * ShStatusBadge — Colored badge/tag based on status value.
 *
 * Uses the centralized `StatusColorService` for color resolution.
 * Custom overrides can still be passed via `[statusMap]`.
 *
 * Usage:
 * ```html
 * <base-status-badge value="shipped" />
 * <base-status-badge value="pending" [rounded]="true" />
 * <base-status-badge value="custom_status" [statusMap]="{ custom_status: 'info' }" />
 * <base-status-badge value="MOVE_IN" [colorMap]="{ move_in: '#8B5E3C' }" label="MOVE_IN" />
 * ```
 */
@Component({
  selector: 'base-status-badge',
  standalone: true,
  imports: [CommonModule, TagModule, TranslateModule],
  templateUrl: './base-status-badge.component.html',
  styleUrl: './base-status-badge.component.scss',
})
export class BaseStatusBadge {
  private readonly statusColorService = inject(StatusColorService)

  /** The status value (e.g. 'shipped', 'pending') */
  value = input.required<string>()
  /** Whether to render as a rounded pill */
  rounded = input(true)
  /** Custom status→severity mapping (merged with defaults) */
  statusMap = input<Record<string, StatusSeverity>>({})
  /** Custom status→hex color mapping (lowercase keys); wins over severity and WMS colors */
  colorMap = input<Record<string, string>>({})
  /** Optional icon class */
  icon = input<string>('')
  /** Optional label override (use for translated text). Falls back to capitalized value. */
  label = input<string>('')

  severity = computed(() => {
    return this.statusColorService.getSeverity(this.value(), this.statusMap())
  })

  /** Direct CSS color for WMS categories / [colorMap] (bypasses PrimeNG severity palette) */
  directColor = computed(() => {
    return this.statusColorService.getDirectColor(this.value(), this.colorMap())
  })

  /** Inline style override when a direct color is set */
  customStyle = computed(() => {
    const color = this.directColor()
    if (!color) return {}
    return {
      'background-color': color + '22',  // 13% opacity for background
      'color': color,
      'border': 'none',
    }
  })

  translationKey = computed(() => {
    const val = this.value() || ''
    return `status.${val.toLowerCase().trim().replaceAll(/[\s_]+/g, '_')}`
  })

  displayValue = computed(() => {
    if (this.label()) return this.label();
    const val = this.value() || ''
    return val.charAt(0).toUpperCase() + val.slice(1).toLowerCase()
  })
}
