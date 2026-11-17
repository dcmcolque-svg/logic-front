import { ScopeFacility } from '@/app/core/types/facility.types'
import { ShColumnDef } from '../types/table.types'

/**
 * Column fields that represent a facility across the app.
 *
 * The codebase is inconsistent: parcels / receivings / allorders / backorders /
 * credentials declare `facility_id`, tracecards / locations / rotations declare
 * `facility_name` and remap it to `facility_id` before calling the API, and
 * webhooks declares plain `facility` (with `sortField: 'facility_id'`).
 * Normalising here means none of the three conventions has to change.
 */
export const FACILITY_COLUMN_FIELDS = [
  'facility_id',
  'facility_name',
  'facility',
] as const

/** True when the column represents a facility under either naming convention. */
export function isFacilityColumn(col: ShColumnDef): boolean {
  return (FACILITY_COLUMN_FIELDS as readonly string[]).includes(col.field)
}

/** The facility column fields actually present in a column set. */
export function facilityFieldsIn(cols: readonly ShColumnDef[]): string[] {
  return cols.filter(isFacilityColumn).map((c) => c.field)
}

export interface FacilityScopeState {
  /** True when exactly one facility is in scope. */
  isSingle: boolean
  /** Facilities the user may filter by. */
  inScope: readonly ScopeFacility[]
}

/**
 * Applies the global facility scope to a column set.
 *
 * - One facility in scope  → the facility column is dropped. Every row would
 *   carry the same value, so the column is pure noise.
 * - Several (or all)       → the column stays, but its multiselect options are
 *   narrowed to the facilities in scope, so a user can never filter for a
 *   facility the global selector has excluded.
 *
 * Pure and non-mutating: returns the original array when nothing changes, so
 * downstream `computed()`s keep their referential equality.
 */
export function scopeColumns(
  cols: readonly ShColumnDef[],
  scope: FacilityScopeState
): ShColumnDef[] {
  if (!cols.some(isFacilityColumn)) return cols as ShColumnDef[]

  if (scope.isSingle) {
    return cols.filter((c) => !isFacilityColumn(c))
  }

  const options = scope.inScope.map((f) => ({ label: f.name, value: f.id }))

  return cols.map((c) => {
    if (!isFacilityColumn(c) || !c.filterable) return c
    // Preserve any sentinel options the module added itself (e.g. parcels'
    // "__NULL__" / "No facility"), which are not real facilities and must
    // survive the narrowing.
    const sentinels = (c.filterOptions ?? []).filter(
      (o) => !scope.inScope.some((f) => f.id === o.value)
        && typeof o.value === 'string'
        && o.value.startsWith('__')
    )
    return { ...c, filterOptions: [...sentinels, ...options] }
  })
}

/**
 * Removes every facility key from a module's own filter store.
 *
 * Call it when `ShTableEvent.facilityScopeChanged` is set. All three naming
 * conventions are covered, plus the canonical API key: rotations declares the
 * column as `facility_name` but stores the filter under `facility_id`, so
 * clearing by column field alone would miss it.
 *
 * Returns a new object; never mutates the input.
 */
export function dropFacilityFilters<T extends object>(filters: T): T {
  const next = { ...(filters as Record<string, unknown>) }
  for (const key of [...FACILITY_COLUMN_FIELDS, 'facility_id']) delete next[key]
  return next as T
}

/**
 * A facility id that matches no row. Used when a local filter and the global
 * scope have nothing in common: the request must come back empty rather than
 * unfiltered. It has to be a syntactically valid UUID — `facility_id` is a uuid
 * column, and anything else fails the Postgres cast with a 500 instead.
 */
export const OUT_OF_SCOPE_FACILITY_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Field the lists that support it read the global selector from, separately
 * from their own `facility_id` filter (parcels, orders, receivings, inventory
 * tracecards, locations). The backend ANDs it with the user's access and with
 * `facility_id`, which stays a user filter and may join a custom-filter OR.
 */
export const FACILITY_SCOPE_FIELD = 'facility_scope'

export interface ScopeApiFilterOptions {
  /** API field name. Defaults to the canonical `facility_id`. */
  field?: string
  /**
   * Send the selector in its own field (see FACILITY_SCOPE_FIELD) instead of
   * intersecting it into `field`. The module's facility filter then reaches
   * the API untouched — its AND/OR included — and the backend narrows it.
   * Only for endpoints that read that field: the others would drop the scope.
   */
  scopeField?: string
}

/** Reads a MatchModel-shaped value as a flat array. */
function filterValues(entry: unknown): (string | null)[] {
  if (!entry || typeof entry !== 'object') return []
  const value = (entry as { value?: unknown }).value
  if (value === null) return [null]
  if (Array.isArray(value)) {
    return value.filter(
      (v): v is string | null => v === null || typeof v === 'string'
    )
  }
  return typeof value === 'string' && value !== '' ? [value] : []
}

/**
 * Merges the global scope into an outgoing API filter.
 *
 * The scope bounds the request; a filter the module set itself **refines**
 * within it. That is the same rule the column dropdowns already follow via
 * `inScope()`, applied to the payload — it used to be a plain overwrite, which
 * silently discarded parcels' "no facility" selection (the only local filter
 * that carries a `null`).
 *
 * Returns a new object; never mutates the input.
 *
 * A `null` element means "no facility" on both sides. The global selector
 * offers it as an entry of its own, so it is bounded like any facility: a
 * local "no facility" only survives when the scope includes it too.
 *
 * @param filter     the module's own filter payload, already keyed by API field
 * @param scopeValue `FacilityScopeService.apiValue()` — ids (`null` for "No
 *                   facility"), or null for "all"
 */
export function scopeApiFilter<T extends object>(
  filter: T,
  scopeValue: (string | null)[] | null,
  options: ScopeApiFilterOptions = {}
): T {
  const { field = 'facility_id', scopeField } = options

  // No global narrowing: leave the module's own filter exactly as it is.
  if (!scopeValue || scopeValue.length === 0) return filter

  if (scopeField) {
    return { ...filter, [scopeField]: { value: [...scopeValue], match_mode: 'in' } } as T
  }

  const local = filterValues((filter as Record<string, unknown>)[field])
  let value: (string | null)[]

  if (local.length === 0) {
    value = [...scopeValue]
  } else {
    const allowed = new Set(scopeValue)
    value = local.filter((v) => allowed.has(v))
    if (value.length === 0) value = [OUT_OF_SCOPE_FACILITY_ID]
  }

  return {
    ...filter,
    [field]: { value, match_mode: 'in' },
  } as T
}
