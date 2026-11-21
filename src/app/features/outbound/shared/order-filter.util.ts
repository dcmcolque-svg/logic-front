import { presetCombinator } from '@/app/shared/types/filter-preset.types'
import { ShSortConfig } from '@/app/shared/types/table.types'
import { OrderFilter } from '../types/order.types'

/** Filter values are heterogeneous: text, numbers, dates and id lists. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FilterValue = any

/** UI-side filter state: `{ field: { value, matchMode } }`, as persisted by TableStateService. */
export type UiFilters = Record<string, FilterValue>

/** True when a `{ value }` filter entry carries a usable value. */
export function hasFilterValue(val: FilterValue): boolean {
  return val?.value !== null && val?.value !== undefined && val?.value !== ''
}

/** Formats a Date as `yyyy-MM-dd` (local time) for the API. */
function toApiDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Converts UI filters into the API's `{ value, match_mode }` shape, skipping
 * empty entries. With `formatDates`, Date values are sent as `yyyy-MM-dd`: on
 * created_at the backend takes it as that day in the order's facility zone.
 */
export function buildOrderApiFilter(filters: UiFilters, formatDates = false): OrderFilter {
  const apiFilter: OrderFilter = {}
  for (const [field, val] of Object.entries(filters)) {
    if (!hasFilterValue(val)) continue
    const value = formatDates && val.value instanceof Date ? toApiDate(val.value) : val.value
    apiFilter[field] = {
      value,
      match_mode: val.match_mode ?? val.matchMode ?? 'contains',
      ...presetCombinator(val),
    }
  }
  return apiFilter
}

/** Overlays the non-empty column filters of a table event on top of `filters`. */
export function mergeTableFilters(filters: UiFilters, eventFilters: UiFilters | undefined): UiFilters {
  const merged: UiFilters = { ...filters }
  for (const [field, val] of Object.entries(eventFilters ?? {})) {
    if (hasFilterValue(val)) merged[field] = val
  }
  return merged
}

/**
 * Returns a copy of `filters` with `field` set from a column filter event
 * (`{ value, matchMode }` or a bare value), or removed when the value is empty.
 */
export function withColumnFilter(filters: UiFilters, field: string, event: FilterValue): UiFilters {
  const next = { ...filters }
  const value = event?.value === undefined ? event : event.value
  const matchMode = event?.matchMode ?? (Array.isArray(value) ? 'in' : 'contains')
  if (value !== null && value !== undefined && value !== '') {
    next[field] = { value, matchMode }
  } else {
    delete next[field]
  }
  return next
}

/** Returns a copy of `filters` with an `in` filter for `values`, or without `field` when empty. */
export function withMultiselectFilter(filters: UiFilters, field: string, values: string[]): UiFilters {
  const next = { ...filters }
  if (values.length > 0) {
    next[field] = { value: values, matchMode: 'in' }
  } else {
    delete next[field]
  }
  return next
}

/** API sort spec for the current table sort; newest orders first by default. */
export function orderSortField(sort: ShSortConfig | undefined): { field: string; order: number }[] {
  return sort
    ? [{ field: sort.field, order: sort.order === 'asc' ? 1 : -1 }]
    : [{ field: 'created_at', order: -1 }]
}
