// ── Webhook types ──

export type WebhookAuthType = 'none' | 'oauth2' | 'bearer_token'

export interface Webhook {
  id: string
  operator_id: string
  api_version: string
  subscribed_events: string[]  // V2: pq.StringArray → string[]
  status: 'ACTIVE' | 'INACTIVE'
  endpoint_url: string
  description?: string
  facility_id?: string | null  // UUID — null/undefined = operator-level
  company_id?: string | null
  custom_headers?: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
  auth_type?: WebhookAuthType  // none | oauth2 | bearer_token
  bearer_token?: string        // only when auth_type === 'bearer_token'
  oauth_credential_id?: string // UUID of int_oauth_credentials.id — only when auth_type === 'oauth2'
}

export interface WebhookCreateUpdateDto {
  id?: string
  api_version?: string
  subscribed_events: string[]   // V2: maps to subscribed_events
  endpoint_url: string
  description?: string
  facility_id?: string | null
  company_id?: string | null
  custom_headers?: string | null
  auth_type?: WebhookAuthType
  bearer_token?: string
  oauth_credential_id?: string // UUID of int_oauth_credentials.id — only when auth_type === 'oauth2'
}

export interface Facility {
  id: string
  name: string
  code?: string
}

export interface Application {
  id: string
  name: string
  company: string
  is_active: boolean
  events: string[]
}

export interface WebhookResp {
  data: Webhook[]
  facilities?: Facility[]
  events?: WebhookEvents
  meta_data: {
    page: number
    rows: number
    total_records: number
  }
}

export interface MatchModel {
  value: any
  match_mode: string
}

export interface WebhookFilter {
  [key: string]: any
}

export interface WebhookFilterDto {
  config: {
    populate_data: boolean
    page: number
    rows: number
    sort_field: any[]
  }
  filter: WebhookFilter
}

export interface Column {
  field: string
  header: string
}

// ── Webhook Log types (V2 PostgreSQL) ──

export interface WebhookLog {
  id: string
  operator_id: string
  webhook_id: string
  event_type: string
  request_payload: any
  response_payload?: any
  http_status_code?: number
  execution_status: string
  duration_ms?: number
  created_at: string
}

export interface WebhookLogResp {
  data?: WebhookLog[] | null
  meta_data: {
    page: number
    rows: number
    total_records: number
  }
}

export interface WebhookLogFilter {
  webhook_id?: any
  event_type?: any
  execution_status?: any
  created_at?: any
}

export interface WebhookLogFilterDto {
  config: {
    populate_data: boolean
    page: number
    rows: number
    sort_field: any[]
  }
  filter: WebhookLogFilter
}


export const VERSION_BY_SCOPE: Record<WebhookScope, string> = {
  operator: 'v1.0.0',
  facility: 'v2.0.0',
}

export const AUTH_TYPE_OPTIONS: { label: string; value: WebhookAuthType }[] = [
  { label: 'None', value: 'none' },
  { label: 'OAuth2', value: 'oauth2' },
  { label: 'Bearer Token', value: 'bearer_token' },
]

export type WebhookScope = 'operator' | 'facility'

/** Response from POST /webhook/list with populate_data:true → events field */
export interface WebhookEvents {
  operator: { label: string; value: string }[]
  facility: { label: string; value: string }[]
}
