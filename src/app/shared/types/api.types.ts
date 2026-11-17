/**
 * Standard paginated list response from the backend.
 * Matches the response shape used across edge-frontend services.
 */
export interface ApiListResponse<T> {
  data: T[]
  page: number
  limit: number
  total: number
}

/**
 * Filter match model sent to the backend.
 * Used by FilterApplyService to normalize PrimeNG filter metadata
 * into the format expected by the Go backend.
 */
export interface MatchModel {
  match_mode: string
  value: any
}

/**
 * Generic API error response.
 */
export interface ApiError {
  error?: string
  message?: string
  detail?: string
}

/**
 * Action item for ShActionMenu.
 */
export interface ShActionItem {
  /** Display label — i18n translation key */
  label: string
  /** PrimeIcon class (e.g. 'pi pi-pencil') */
  icon?: string
  /** Callback when action is selected */
  command?: (event?: any) => void
  /** Whether the action is visible */
  visible?: boolean
  /** Whether the action is disabled */
  disabled?: boolean
  /** Visual severity  */
  severity?: 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'
  /** Divider before this item */
  separator?: boolean
}
