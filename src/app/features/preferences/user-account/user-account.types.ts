import { MatchModel } from '../../../shared/types/api.types'

// ── Sort / Config ─────────────────────────────────────────────────────────────

export interface SortField {
  field: string
  order: number
}

export interface ConfigQuery {
  populate_data: boolean
  page: number
  rows: number
  sort_field: SortField[]
}

export interface MetaData {
  page: number
  rows: number
  total_records: number
}

// ── Catalog types (from v2 backend) ──────────────────────────────────────────

/** Maps facility.Facility in engine-backend v2 */
export interface Facility {
  id: string
  name: string
  code?: string
  is_active: boolean
  operator_id?: string
  external_ref_id?: string
  created_at?: string
}

/** Maps authrole.Role in engine-backend v2 */
export interface Role {
  id: number
  role: string
  display_name: string
  description?: string
  is_readonly?: boolean
}

// ── AuthUser (auth_users table — v2) ─────────────────────────────────────────

export interface AuthUser {
  id?: string
  operator_id?: string
  sso_id?: string
  username?: string
  email?: string
  full_name?: string
  is_active?: boolean
  facility_ids?: string[]      // All assigned facility IDs (from auth_users_facilities)
  last_login_at?: string
  role_id?: number
  user_status: string
  user_phone?: string
  user_img?: string
  created_at?: string
  // Invitation code (EDGE-1357) — in-memory after generateCodeForRow()
  invite_code?: string
  invite_code_expires_at?: string
  // Invitation code from backend list (stored as JSONB in auth_users.invite_metadata)
  invite_metadata?: {
    code: string
    expires_at: string
    used_at?: string | null
  }
}

export interface StatusOption {
  id: string
  state: string
}

// ── Filters ───────────────────────────────────────────────────────────────────

export interface AuthUserFilter {
  id?: MatchModel
  operator_id?: MatchModel
  sso_id?: MatchModel
  username?: MatchModel
  email?: MatchModel
  full_name?: MatchModel
  is_active?: MatchModel
  role_id?: MatchModel
  user_status?: MatchModel
  facility_id?: MatchModel   // Filters by assignment in auth_users_facilities
  created_at?: MatchModel
}

// ── Request / Response ────────────────────────────────────────────────────────

export interface AuthUserListRequest {
  config: ConfigQuery
  filter: AuthUserFilter
}

/**
 * AuthUserListResponse — matches backend AuthUserListResponse.
 * When populate_data: true → facilities + roles are populated.
 */
export interface AuthUserListResponse {
  data: AuthUser[]
  meta_data: MetaData
  facilities?: Facility[]
  roles?: Role[]
}

/** Update input — matches AuthUserUpdateInput in the backend */
export interface AuthUserUpdateInput {
  username?: string
  email?: string
  full_name?: string
  is_active?: boolean
  facility_ids?: string[]   // Re-assigns all facility links in auth_users_facilities
  role_id?: number
  user_status?: string
  user_phone?: string
  user_img?: string
}

/** Invite payload sent to keyauth/users/invite */
export interface InviteUsersDto {
  facility_ids: string[]
  emails: {
    email: string
    username?: string
    role_id: number
  }[]
}

// ── EDGE-1357: create-with-invite-code ────────────────────────────────────────

/** POST /v2/authuser/create-with-invite-code — body (same shape as InviteUsersDto) */
export interface CreateWithInviteCodeRequest {
  emails: { email: string; role_id: number }[]
  facility_ids: string[]
}

