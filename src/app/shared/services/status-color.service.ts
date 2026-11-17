import { Injectable } from '@angular/core'

/**
 * PrimeNG tag severity type.
 */
export type StatusSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'

/**
 * Centralized status/category → severity mapping.
 *
 * This is the single source of truth for color mappings across the app.
 * Used by `BaseStatusBadge`, `FilterMultiselectPanelComponent`, and any
 * component that needs to resolve a status string to a visual color.
 *
 * To add new statuses, simply add them to the appropriate section below.
 */
const STATUS_SEVERITY_MAP: Record<string, StatusSeverity> = {
  // ── Common order / entity statuses ──────────────────────────────────────
  shipped: 'success',
  delivered: 'success',
  completed: 'success',
  complete: 'success',
  active: 'success',
  approved: 'success',
  fulfilled: 'success',

  // ── Warning / in-progress ───────────────────────────────────────────────
  pending: 'secondary',
  processing: 'warn',
  'in progress': 'warn',
  'pack-ready': 'info',
  'partial-shipped': 'contrast',
  partial: 'contrast',

  // ── Danger ──────────────────────────────────────────────────────────────
  cancelled: 'danger',
  canceled: 'danger',
  failed: 'danger',
  error: 'danger',
  rejected: 'danger',
  expired: 'danger',

  // ── Info ─────────────────────────────────────────────────────────────────
  new: 'info',
  draft: 'info',
  backorder: 'secondary',
  evaluating: 'info',

  // ── Secondary ───────────────────────────────────────────────────────────
  archived: 'secondary',
  inactive: 'secondary',
  pre_check_in: 'secondary',

  // ── Receivings ──────────────────────────────────────────────────────────
  'in-transit': 'secondary',
  'in-warehouse': 'info',
  discrepancy: 'contrast',

  // ── WMS Operational Categories ──────────────────────────────────────────
  flow: 'secondary',
  picking: 'danger',
  regular: 'success',
  repository: 'warn',
  staged: 'info',
  blocked: 'warn',
  hurt: 'danger',
}

/**
 * Maps PrimeNG severity to a CSS color value.
 * Uses PrimeNG's design token conventions for consistency.
 */
const SEVERITY_CSS_COLORS: Record<StatusSeverity, string> = {
  success: 'var(--p-green-500, #22c55e)',
  info: 'var(--p-blue-500, #3b82f6)',
  warn: 'var(--p-orange-500, #f97316)',
  danger: 'var(--p-red-500, #ef4444)',
  secondary: 'var(--p-surface-500, #71717a)',
  contrast: 'var(--p-purple-500, #a855f7)',
}

/**
 * Direct CSS color overrides for WMS operational categories.
 * These take priority over severity-based colors to match the exact
 * design palette specified for the Locations module.
 */
const CATEGORY_CSS_OVERRIDES: Record<string, string> = {
  picking:    '#FF00E5',   // Magenta / Hot Pink
  flow:       '#B0B0B0',   // Silver / Gray
  staged:     '#2979FF',   // Blue
  regular:    '#00E676',   // Green
  repository: '#FF9800',   // Orange
  blocked:    '#FF5722',   // Deep Orange
  hurt:       '#FF0044',   // Red
  backorder:  '#7C3AED',   // Violet-600
}

/**
 * Kardex flow `transaction_type` → CSS color (History "Action" column and timeline).
 * Not merged into the global overrides: keys like 'shipped' would otherwise recolor
 * order-status badges. Pass it explicitly via `<base-status-badge [colorMap]>`.
 */
export const KARDEX_ACTION_COLORS: Record<string, string> = {
  shipped:               '#16A34A',   // Green
  outbound:              '#16A34A',   // legacy SHIPPED
  receiving:             '#2563EB',   // Blue
  pack_split_in:         '#EA580C',   // Orange
  pack_split:            '#EA580C',   // legacy PACK_SPLIT_IN (box side only)
  pack_split_out:        '#0D9488',   // Turquoise
  recount:               '#CA8A04',   // Amber
  move:                  '#8B5E3C',   // Brown
  move_in:               '#8B5E3C',
  move_out:              '#8B5E3C',
  block:                 '#DC2626',   // Red
  // Not color-coded yet — neutral so they don't read as RECEIVING (blue)
  unblock:               '#6B7280',
  lot_expir_change:      '#6B7280',
  adjustment:            '#6B7280',
  pack_merge:            '#6B7280',
  packaging_consumption: '#6B7280',
  inbound:               '#6B7280',
  cancel:                '#6B7280',
}

/**
 * StatusColorService — Centralized color resolution for statuses and categories.
 *
 * Provides a single source of truth for mapping status/category strings
 * to PrimeNG severities and CSS colors.
 *
 * @example
 * ```ts
 * // In a component
 * private statusColor = inject(StatusColorService)
 *
 * severity = this.statusColor.getSeverity('picking')   // → 'success'
 * cssColor = this.statusColor.getCssColor('picking')   // → 'var(--p-green-500, #22c55e)'
 * ```
 */
@Injectable({ providedIn: 'root' })
export class StatusColorService {
  /**
   * Get the PrimeNG severity for a given status/category string.
   * Falls back to 'info' for unknown values.
   *
   * @param value  The status or category code (case-insensitive).
   * @param customMap  Optional overrides merged on top of the defaults.
   */
  getSeverity(
    value: string,
    customMap?: Record<string, StatusSeverity>,
  ): StatusSeverity {
    const key = (value || '').toLowerCase().trim()
    const merged = customMap
      ? { ...STATUS_SEVERITY_MAP, ...customMap }
      : STATUS_SEVERITY_MAP
    return merged[key] ?? 'info'
  }

  /**
   * Get a CSS color string for a given status/category.
   * For WMS categories, returns exact design-palette colors.
   * Useful for inline styles (e.g., colored dots in dropdowns).
   *
   * @param value  The status or category code (case-insensitive).
   * @param customMap  Optional severity overrides.
   */
  getCssColor(
    value: string,
    customMap?: Record<string, StatusSeverity>,
  ): string {
    const key = (value || '').toLowerCase().trim()
    // Direct override for WMS categories takes priority
    if (CATEGORY_CSS_OVERRIDES[key]) {
      return CATEGORY_CSS_OVERRIDES[key]
    }
    const severity = this.getSeverity(value, customMap)
    return SEVERITY_CSS_COLORS[severity]
  }

  /**
   * Get a direct CSS color override for a given value, if one exists.
   * Returns null if no direct override is set (i.e. severity-based coloring should be used).
   *
   * @param value  The status or category code (case-insensitive).
   * @param customColors  Optional value → CSS color overrides (lowercase keys), checked first.
   */
  getDirectColor(value: string, customColors?: Record<string, string>): string | null {
    const key = (value || '').toLowerCase().trim()
    return customColors?.[key] ?? CATEGORY_CSS_OVERRIDES[key] ?? null
  }

  /**
   * Build a colorMap (option value → CSS color) from an array of option objects.
   * Designed for use with FilterMultiselectPanelComponent's [colorMap] input.
   *
   * @param options  Array of option objects.
   * @param labelKey  Property to read the display label (used for color lookup).
   * @param valueKey  Property to use as the map key.
   * @param customMap  Optional severity overrides.
   *
   * @example
   * ```ts
   * colorMap = this.statusColor.buildColorMap(
   *   this.operationalCategories(), 'code', 'id'
   * )
   * // → { 'uuid-1': 'var(--p-blue-500)', 'uuid-2': 'var(--p-green-500)', ... }
   * ```
   */
  buildColorMap(
    options: any[],
    labelKey: string,
    valueKey: string,
    customMap?: Record<string, StatusSeverity>,
  ): Record<string, string> {
    const map: Record<string, string> = {}
    for (const opt of options) {
      const label = opt[labelKey]
      const value = opt[valueKey]
      if (label != null && value != null) {
        map[String(value)] = this.getCssColor(String(label), customMap)
      }
    }
    return map
  }
}
