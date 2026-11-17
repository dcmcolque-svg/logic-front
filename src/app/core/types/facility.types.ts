/**
 * Facility contract shared by the global facility scope.
 *
 * Lives in `core/` because FacilityScopeService is an app-wide singleton and
 * `core/` must never import from `features/`. Feature modules already declare
 * their own richer `Facility` shapes; this is the minimal subset the scope
 * needs (id + display name + active flag) and is structurally compatible
 * with all of them.
 */
export interface ScopeFacility {
  id: string
  name: string
  code?: string
  is_active?: boolean
}

/**
 * Id of the "No facility" entry of the global selector: records whose
 * facility_id is NULL (operator-level webhooks and API keys, pre-check-in
 * parcels). Never a real facility id; it travels to the API as `null`, which
 * the backend's `applyInWhere` turns into `facility_id IS NULL`.
 * Same value parcels already used for its own column filter.
 */
export const NO_FACILITY_ID = '__NULL__'

/** Single filter constraint as understood by the v2 API. */
export interface FacilityMatchModel {
  value: unknown
  match_mode: string
}

export interface FacilityScopeListRequest {
  filter: Record<string, FacilityMatchModel>
  config: { page: number; rows: number }
}

export interface FacilityScopeListResponse {
  data: ScopeFacility[]
  meta_data?: { total?: number }
}
