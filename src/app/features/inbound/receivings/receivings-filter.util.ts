import { presetCombinator } from '@/app/shared/types/filter-preset.types'
import { ShTableEvent } from '../../../shared/types/table.types'
import { ConfigFilter } from './receivings.types'

/** A column filter as kept by the list pages (camelCase match mode). */
export interface RawColumnFilter {
  value?: unknown
  matchMode?: string
  /** AND/OR combinator from a custom filter (see presetCombinator) */
  operator?: string
  position?: number
}

/**
 * Copies every non-empty raw column filter (`{ value, matchMode }`) into
 * `target` using the API shape (`{ value, match_mode }`), defaulting the
 * match mode to `contains`. Returns `target` for convenience.
 */
export function toApiFilter<T extends object>(
  rawFilters: Record<string, RawColumnFilter | null | undefined>,
  target: T = {} as T
): T {
  for (const [field, val] of Object.entries(rawFilters)) {
    if (val?.value !== null && val?.value !== undefined && val?.value !== '') {
      ;(target as Record<string, unknown>)[field] = {
        value: val.value,
        match_mode: val.matchMode ?? 'contains',
        ...presetCombinator(val),
      }
    }
  }
  return target
}

/** Builds the list request config (page, rows, sort) from a table event. */
export function toListConfig(event: ShTableEvent): ConfigFilter {
  return {
    populate_data: true,
    page: event.pagination.page,
    rows: event.pagination.limit,
    sort_field: event.sort
      ? [{ field: event.sort.field, order: event.sort.order === 'asc' ? 1 : -1 }]
      : [],
  }
}
