/**
 * Icon Registry — Single source of truth for semantic key → PrimeIcon mappings.
 *
 * Anything in the app that needs to turn a domain concept (a field key, a status,
 * a transaction type) into an icon resolves it here. Consumers:
 * - `IconPipe` for templates: `{{ 'shipped' | icon }}` → `'pi pi-truck'`
 * - `IconRasterService` for the label PDF, which cannot use a pipe
 *
 * Values are stored WITHOUT the `pi ` prefix (e.g. `'pi-truck'`) to match the
 * existing template convention `class="pi {{ cfg.icon }}"`. Use `iconClass()`
 * when you need the full class string.
 */

/** Data field keys — used by the label generator and any field-oriented UI. */
export const FIELD_ICONS: Record<string, string> = {
  // Catalog
  sku: 'pi-tag',
  sku_id: 'pi-hashtag',
  barcode: 'pi-barcode',
  description: 'pi-align-left',
  name: 'pi-bookmark',
  brand: 'pi-star',
  company_name: 'pi-building',
  company: 'pi-building',

  // Tracecard
  location_code: 'pi-map-marker',
  location: 'pi-map-marker',
  qty_on_hand: 'pi-box',
  lot: 'pi-hashtag',
  expir: 'pi-calendar-times',
  expiration: 'pi-calendar-times',

  // Location
  aisle: 'pi-directions',
  section: 'pi-th-large',
  level: 'pi-sort-amount-up',
  facility_name: 'pi-building',
  facility: 'pi-building',

  // Classification
  category: 'pi-sitemap',

  // Bin / container
  lpn_code: 'pi-inbox',
  type: 'pi-list',
  container_profile_code: 'pi-cog',
  profile: 'pi-cog',
}

/** Order / entity statuses. Keys are normalized to lowercase on lookup. */
export const STATUS_ICONS: Record<string, string> = {
  discrepancy: 'pi-exclamation-triangle',
  'in-transit': 'pi-truck',
  'in-warehouse': 'pi-home',
  processing: 'pi-cog',
  complete: 'pi-check-circle',
  completed: 'pi-check-circle',
  canceled: 'pi-times-circle',
  archived: 'pi-folder',
  draft: 'pi-file',
  planned: 'pi-calendar',
  late: 'pi-calendar-times',
  rescheduled: 'pi-calendar-plus',
  finished: 'pi-check-circle',
  urgent: 'pi-bolt',
  'back-work-order': 'pi-exclamation-triangle',
  assigned: 'pi-user',
  incomplete: 'pi-exclamation-triangle',
  'api-error': 'pi-info-circle',
  'back-order': 'pi-exclamation-triangle',
  backorder: 'pi-clock',
  pending: 'pi-clock',
  shipping: 'pi-clock',
  active: 'pi-check-circle',
  inactive: 'pi-exclamation-triangle',
  evaluating: 'pi-refresh',
  error: 'pi-exclamation-circle',
  'partial-shipped': 'pi-inbox',
  shipped: 'pi-truck',
  failed: 'pi-exclamation-circle',
  'ship prepared': 'pi-clock',
  'ship-prepared': 'pi-clock',
}

/** Inventory transaction / event types. */
export const EVENT_ICONS: Record<string, string> = {
  order: 'pi-shopping-cart',
  receiving: 'pi-plus-circle',
  move: 'pi-arrows-alt',
  recount: 'pi-replay',
  restocking: 'pi-box',
  replenishment: 'pi-box',
  blocked: 'pi-lock',
  unblocked: 'pi-lock-open',
}

/** Returned when a key matches nothing. */
export const FALLBACK_ICON = 'pi-circle'

/**
 * Normalize a lookup key: trims, lowercases and strips the `labels.` i18n
 * prefix, so `'labels.sku'`, `'SKU'` and `'sku'` all resolve to the same entry.
 */
function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/^labels\./, '')
}

/**
 * Resolve a semantic key to a PrimeIcon name (without the `pi ` prefix).
 * Looks through fields, then statuses, then events.
 *
 * A value that is already a `pi-*` name passes through untouched, so callers
 * can accept either a semantic key or an explicit icon override.
 */
export function resolveIcon(key: string, fallback = FALLBACK_ICON): string {
  if (!key) return fallback
  const k = normalizeKey(key)
  if (k.startsWith('pi-')) return k
  return FIELD_ICONS[k] ?? STATUS_ICONS[k] ?? EVENT_ICONS[k] ?? fallback
}

/**
 * Resolve a semantic key to a full icon class ready for a template,
 * e.g. `'pi pi-truck'`.
 */
export function iconClass(key: string, fallback = FALLBACK_ICON): string {
  return `pi ${resolveIcon(key, fallback)}`
}
