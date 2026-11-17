import { Observable } from 'rxjs'

/**
 * FilterPreset — Represents a named set of saved table filters.
 *
 * Shared across all users of a tenant (operator). Persisted in the
 * backend via core_filter_presets table.
 *
 * The `filters` Record is reconstructed client-side from `conditions`
 * when a preset is selected — it is NOT stored in the database.
 */
export interface FilterPreset {
  /** Unique identifier — UUID generated server-side (UUIDv7) */
  id: string
  /** Tenant operator ID (injected by backend from JWT) */
  operator_id?: string
  /** User who created the preset (nullable — set to null if user is deleted) */
  created_by_user_id?: string | null
  /** Human-readable name given by the user (max 50 chars) */
  name: string
  /** Optional description of the preset */
  description?: string
  /** Color tag for visual identification (hex string, e.g. '#22c55e') */
  color?: string
  /** Page identifier — ties the preset to a specific table (e.g. 'parcels') */
  page_key: string
  /** Structured filter conditions — stored in the database as JSONB array */
  conditions: FilterCondition[]
  /** Sort field name */
  sort_field?: string | null
  /** Sort direction ('asc' or 'desc') */
  sort_order?: string | null
  /** Display order for tabs (SMALLINT, set by supervisor) */
  position: number
  /** Whether this preset loads by default when entering the page */
  is_default: boolean
  /** ISO-8601 creation timestamp */
  created_at: string
  /** ISO-8601 last-updated timestamp */
  updated_at: string
}

/**
 * A single filter condition row in the preset builder dialog.
 * Represents: "field matchMode value"
 */
export interface FilterCondition {
  /** Column field key (e.g. 'facility_id', 'created_at') */
  field: string
  /** Comparison operator (e.g. 'contains', 'equals', 'gte', 'lte', 'in') */
  matchMode: string
  /** The filter value — string, number, Date, or string[] depending on field type */
  value: any
  /** Logical operator: 'and' (default) or 'or' — how this condition joins the previous one */
  operator?: 'and' | 'or'
  /** Position in the filter sequence (1-based). Determines processing order on the backend. */
  position?: number
}

/** Input for creating a new filter preset via the API */
export interface CreatePresetInput {
  page_key: string
  name: string
  description?: string
  color?: string
  conditions: FilterCondition[]
  sort_field?: string | null
  sort_order?: string | null
  position?: number
  is_default?: boolean
}

/** Input for updating an existing filter preset via the API */
export interface UpdatePresetInput {
  name?: string
  description?: string
  color?: string
  conditions?: FilterCondition[]
  sort_field?: string | null
  sort_order?: string | null
  position?: number
  is_default?: boolean
}

/**
 * Abstract storage contract for filter presets.
 *
 * Implementations:
 * - FilterPresetApiStorage (backend HTTP)
 *
 * The FilterPresetService delegates all persistence through this
 * interface, so swapping implementations requires zero UI changes.
 */
export abstract class FilterPresetStorage {
  /** Return all presets for the given page */
  abstract list(pageKey: string): Observable<FilterPreset[]>
  /** Persist a new preset */
  abstract save(input: CreatePresetInput): Observable<FilterPreset>
  /** Remove a preset by its ID */
  abstract delete(presetId: string): Observable<void>
  /** Update an existing preset by ID */
  abstract update(id: string, input: UpdatePresetInput): Observable<FilterPreset>
}

/**
 * Reconstruct the filters Record from conditions.
 * This is used client-side when a preset is selected to build the
 * filter state that BaseDataTable / parent components understand.
 */
export function buildFiltersFromConditions(conditions: FilterCondition[]): Record<string, any> {
  const filters: Record<string, any> = {}
  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i]
    filters[cond.field] = {
      value: cond.value,
      matchMode: cond.matchMode,
      operator: cond.operator ?? 'and',
      position: cond.position ?? i + 1,
    }
  }
  return filters
}

/** The AND/OR part of an API filter: `{ operator: 'or' }` and/or `{ position }`. */
export interface FilterCombinator {
  operator?: 'or'
  position?: number
}

/**
 * Extracts the combinator a filter got from a custom filter, in the API shape,
 * so list pages forward it with `{ value, match_mode, ...presetCombinator(f) }`.
 *
 * The backend groups only filters that carry a position: each OR starts a new
 * group of ANDs. Filters without one (typed in the table, or the facility
 * scope) narrow the whole result. 'and' is the default and is not sent.
 */
export function presetCombinator(filter: { operator?: string; position?: number } | null | undefined): FilterCombinator {
  const out: FilterCombinator = {}
  if (filter?.operator === 'or') out.operator = 'or'
  const position = filter?.position
  if (typeof position === 'number' && Number.isInteger(position) && position > 0 && position < Number.MAX_SAFE_INTEGER) {
    out.position = position
  }
  return out
}
