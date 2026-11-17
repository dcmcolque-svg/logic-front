import { FilterCombinator, presetCombinator } from '@/app/shared/types/filter-preset.types'
import { effect, EffectRef, WritableSignal } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'

import { FilterPresetService } from '@/app/shared/services/filter-preset.service'
import { ActiveFilterChip, ShColumnDef, ShSortConfig } from '@/app/shared/types/table.types'
import { buildFilterChipsFromColumns } from '@/app/shared/utils/filter-chips.util'

/**
 * Shared filter helpers for the tracecards list and its history page.
 *
 * Both pages keep the column filters the user typed in `activeBackendFilters`
 * (`{ [field]: { value, matchMode } }`) and translate them to the API shape on
 * every change. These pure helpers hold that logic so each page only wires the
 * result into its own signals and reload.
 */

/** One column filter as kept by the page (`match_mode` comes from saved presets). */
export interface BackendFilterEntry {
  value: unknown
  matchMode?: string | null
  match_mode?: string
  /** AND/OR combinator from a custom filter (see presetCombinator) */
  operator?: string
  position?: number
}

/** Column filters as the table emits them: `{ [field]: { value, matchMode } }`. */
export type BackendFilters = Record<string, BackendFilterEntry>

/** Chip label resolvers accepted by `buildFilterChipsFromColumns`. */
type ChipLabelResolvers = Parameters<typeof buildFilterChipsFromColumns>[3]

/** Event emitted by the column filter inputs: a bare value or `{ value, matchMode }`. */
type FilterInputEvent = { value?: unknown; matchMode?: string | null } | null | undefined

/** API sort descriptor used by every tracecards list request. */
export type ApiSortField = { field: string; order: number }[]

/**
 * Effect that re-highlights the last applied preset (color and name) when the
 * user navigates back to a page. Must be created in an injection context.
 */
export function restoreActivePresetEffect(
  presetService: FilterPresetService,
  activeColor: WritableSignal<string | null>,
  activeName: WritableSignal<string | null>
): EffectRef {
  return effect(() => {
    const presets = presetService.presets()
    const lastId = presetService.lastAppliedPresetId()
    if (presets.length === 0 || !lastId) return
    const active = presets.find((p) => p.id === lastId)
    if (active) {
      activeColor.set(active.color ?? null)
      activeName.set(active.name)
    }
  })
}

/** Converts the table sort into the API `sort_field`, or `fallback` when unsorted. */
export function toApiSortField(
  sort: ShSortConfig | undefined,
  fallback: ApiSortField = []
): ApiSortField {
  return sort ? [{ field: sort.field, order: sort.order === 'asc' ? 1 : -1 }] : fallback
}

/** Current value of a column filter, or null when the column is not filtered. */
export function activeFilterValue(filters: BackendFilters, field: string): unknown {
  return filters[field]?.value ?? null
}

/** Current match mode of a column filter, or null when the column is not filtered. */
export function activeFilterMatchMode(filters: BackendFilters, field: string): string | null {
  return filters[field]?.matchMode ?? null
}

/**
 * Normalizes a filter-input event into a filter entry. Returns null when the
 * event clears the filter (no event, or an empty value).
 */
function toFilterEntry(event: unknown): BackendFilterEntry | null {
  if (event === null || event === undefined) return null

  const input = event as FilterInputEvent
  let value: unknown = input?.value === undefined ? event : input.value
  if (value instanceof Date) {
    value = value.toISOString().split('T')[0]
  }
  if (value === null || value === undefined || value === '') return null

  const matchMode = input?.matchMode || (Array.isArray(value) ? 'in' : 'contains')
  return { value, matchMode }
}

/** Copy of `filters` with the column filter from a filter-input event applied (or cleared). */
export function withColumnFilter(filters: BackendFilters, field: string, event: unknown): BackendFilters {
  const entry = toFilterEntry(event)
  return entry ? { ...filters, [field]: entry } : withoutFilter(filters, field)
}

/**
 * Like withColumnFilter, for a filter on a timestamp column: the picked day goes
 * out as the instant of its local midnight, so the backend (ApplyWhereDate)
 * covers the user's day rather than the UTC one. Date-only columns (expir)
 * keep withColumnFilter's yyyy-mm-dd.
 */
export function withTimestampFilter(filters: BackendFilters, field: string, event: unknown): BackendFilters {
  const input = event as FilterInputEvent
  const value = input?.value === undefined ? event : input.value
  if (!(value instanceof Date)) return withColumnFilter(filters, field, event)
  return withColumnFilter(filters, field, {
    value: value.toISOString(),
    matchMode: input?.matchMode || 'equals',
  })
}

/** Copy of `filters` with a multiselect filter applied, or cleared when nothing is selected. */
export function withMultiselectFilter(
  filters: BackendFilters,
  field: string,
  values: unknown[]
): BackendFilters {
  return values && values.length > 0
    ? { ...filters, [field]: { value: values, matchMode: 'in' } }
    : withoutFilter(filters, field)
}

/** Copy of `filters` without the given column. */
export function withoutFilter(filters: BackendFilters, field: string): BackendFilters {
  const next = { ...filters }
  delete next[field]
  return next
}

/**
 * Translates column filters to the API filter shape, skipping empty values.
 * `fieldMap` renames columns whose API field differs (e.g. facility_name -> facility_id).
 */
export function toApiFilter<T>(
  filters: BackendFilters | undefined,
  fieldMap: Record<string, string> = {}
): T {
  const apiFilter: Record<string, { value: unknown; match_mode: string } & FilterCombinator> = {}
  if (!filters) return apiFilter as T

  for (const [field, val] of Object.entries(filters)) {
    if (val?.value === null || val?.value === undefined || val?.value === '') continue
    apiFilter[fieldMap[field] || field] = {
      value: val.value,
      match_mode: val.match_mode ?? val.matchMode ?? 'contains',
      ...presetCombinator(val),
    }
  }
  return apiFilter as T
}

/** Builds the active filter chips, falling back to none if a chip cannot be resolved. */
export function safeFilterChips(
  filters: BackendFilters,
  columns: ShColumnDef[],
  translate: TranslateService,
  labelResolvers?: ChipLabelResolvers
): ActiveFilterChip[] {
  try {
    return buildFilterChipsFromColumns(filters, columns, translate, labelResolvers)
  } catch (err) {
    console.error('Error building filter chips:', err)
    return []
  }
}
