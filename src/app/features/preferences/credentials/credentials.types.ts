// ── API Keys (base) ──────────────────────────────────────────────────────────

export interface BaseFilter {
  match_mode?: string
  value?: any
}

export interface SortField {
  field: string
  order: number
}

export interface MetaData {
  page: number
  rows: number
  total_records: number
}

export interface Facility {
  id: string    // UUID in V2
  code: string
  name?: string
}

export interface Column {
  field: string
  header: string
}

export interface KeyFilter {
  name?: BaseFilter
  facility_id?: BaseFilter
  user_id?: BaseFilter
  status?: BaseFilter
}

export interface KeyDTO {
  filter?: KeyFilter
  config: {
    sort_field?: SortField[]
    page: number
    rows: number
    populate_data: boolean
  }
}

export interface KeyListResponse<T> {
  data: T[]
  meta_data: MetaData
  facilities?: Facility[]
}

// ── Create / Update DTOs ──────────────────────────────────────────

/** Matches backend CreateRequest: operator_id / user_id are set from JWT */
export interface CreateApiKeyDto {
  name: string
  facility_id?: string | null
  expiration_days?: number   // 1–365, backend defaults to 365
}

/** Matches backend UpdateRequest: only name is accepted */
export interface UpdateApiKeyDto {
  name: string
}

/** Operator Key — access token scoped to an operator (no facility) */
export interface OperatorKey {
  id?: string
  operator_id?: string
  user_id?: string
  facility_id?: string
  name?: string
  api_key?: string        // V2: was 'key' in legacy
  status?: string
  expires_at?: string     // V2: was 'expired_at'
  revoked_at?: string
  revoked_by_id?: string
  created_at?: string
  // UI only
  showKey?: boolean
}

/** Facility Key — access token scoped to operator + facility */
export interface FacilityKey extends OperatorKey {
  facility_id?: string
  operator_id?: string
}

// ── OAuth2 Credentials ───────────────────────────────────────────────────────

/** Payload sent when saving OAuth2 credentials — matches backend UpsertRequest */
export interface OAuth2CredentialRequest {
  client_id: string
  /** Optional on update: leave empty to keep the stored secret */
  client_secret: string
  environment: 'qa' | 'sandbox' | 'production'
  token_url?: string
}

/** Cached access token stored as JSONB in token_payload column */
export interface OAuth2StoredToken {
  access_token: string
  /** Unix timestamp of expiration */
  exp: number
  obtained_at: string
}

// ── OAuth2 List (paginated) ───────────────────────────────────────────────────

export interface OAuth2CredentialFilter {
  provider_name?: BaseFilter
  environment?: BaseFilter
  is_active?: BaseFilter
  client_id?: BaseFilter
  updated_at?: BaseFilter
  token_status?: BaseFilter
}

export interface OAuth2ListRequest {
  filter?: OAuth2CredentialFilter
  config?: {
    sort_field?: SortField[]
    page?: number
    rows?: number
  }
}

export interface OAuth2ListResponse {
  data: OAuth2CredentialResponse[]
  meta_data: MetaData
}

/** Response from POST /integration/credentials/list — client_secret is always "****" */
export interface OAuth2CredentialResponse {
  id: string
  operator_id: string
  provider_name: string
  environment: string
  client_id: string
  /** Always returned as "****" */
  client_secret: string
  token_url?: string
  is_active: boolean
  token?: OAuth2StoredToken
  updated_at: string
}

/** Response from POST /integration/test-token/:provider */
export interface OAuth2TestResponse {
  message: string
  valid: boolean
  /** First 12 chars of access_token + "..." */
  preview: string
}

export const ENV_OPTIONS: { label: string; value: 'qa' | 'sandbox' | 'production' }[] = [
  { label: 'QA / Testing', value: 'qa' },
  { label: 'Sandbox', value: 'sandbox' },
  { label: 'Production', value: 'production' },
]
