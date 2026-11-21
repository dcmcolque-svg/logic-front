import { CostingCurrency } from '@/app/shared/utils/costing.util'
/**
 * Tracecards domain types — mirrors the v2 tracecards API contracts.
 *
 * Entity types map 1:1 to the Go backend structs.
 * Filter/Request/Response types follow the core.MatchModel pattern.
 */

// ============================================================
// Core filter primitives (shared with other v2 modules)
// ============================================================

export interface MatchModel {
  match_mode: 'equals' | 'contains' | 'in' | 'lte' | 'gte'
  value: any
}

export interface ConfigFilter {
  page: number
  rows: number
  sort_field?: { field: string; order: number }[]
}

export interface MetaData {
  page: number
  rows: number
  total_records: number
}

// ============================================================
// Tracecard Item (aggregated inv_kardex view)
// ============================================================

export interface TracecardItem {
  id: string
  tracecard: string
  operator_id: string
  facility_id: string
  facility_name: string
  company_id: string
  company_name: string
  sku_id: string
  sku: string
  barcode: string | null
  description: string
  brand: string | null
  image_path: string | null
  location_id: string
  location_code: string
  aisle: string | null
  section: string | null
  level: string | null
  category: string | null
  zone_name: string | null
  container_id: string | null
  container_lpn: string | null
  qty_on_hand: number
  qty_reserved: number
  qty_blocked: number
  uom: number
  total_value: number
  weight: number
  length: number
  width: number
  height: number
  lot: string | null
  expir: string | null
  status: string
  updated_at: string | null
  // Costing — OWNER only; null when the facility does not cost
  /** Weighted average cost of the SKU in this facility */
  avg_cost?: number | null
  /** qty_on_hand × avg_cost */
  cost_value?: number | null
  cost_currency?: CostingCurrency | null
}

// ============================================================
// Tracecard Filter
// ============================================================

export interface TracecardFilter {
  [key: string]: MatchModel | undefined
  company_id?: MatchModel
  company_name?: MatchModel
  facility_id?: MatchModel
  category?: MatchModel
  sku?: MatchModel
  barcode?: MatchModel
  description?: MatchModel
  location_code?: MatchModel
  aisle?: MatchModel
  section?: MatchModel
  level?: MatchModel
  qty_on_hand?: MatchModel
  qty_reserved?: MatchModel
  lot?: MatchModel
  expir?: MatchModel
  status?: MatchModel
  weight?: MatchModel
  length?: MatchModel
  width?: MatchModel
  height?: MatchModel
  container_lpn?: MatchModel
}

// ============================================================
// Tracecard Request / Response
// ============================================================

export interface TracecardListRequest {
  filter: TracecardFilter
  config: ConfigFilter
}

export interface TracecardListResponse {
  data: TracecardItem[]
  meta_data: MetaData
}

// ============================================================
// Company (for filter dropdowns — reused from catalog)
// ============================================================

export interface Company {
  id: string
  name: string
}

export interface CompanyFilter {
  id?: MatchModel
  name?: MatchModel
}

export interface CompanyListRequest {
  filter: CompanyFilter
  config: ConfigFilter
}

export interface CompanyListResponse {
  data: Company[]
  meta_data: MetaData
}

// ============================================================
// Move / Recount (POST /v2/inventory/move, /v2/inventory/recount)
// ============================================================

/**
 * Body of POST /v2/inventory/move. At least one target is required:
 * location only → loose stock; container only → the container's location;
 * both → the container must already be at that location.
 */
export interface MoveInput {
  source_kardex_id: string
  target_location_code?: string
  target_container_lpn?: string
  /** Units to move — strictly positive, at most qty_on_hand − qty_reserved. */
  qty: number
  /** Operator comment, max 500 characters; stored in wms_movement_flow.notes. */
  notes?: string
}

export interface MoveResult {
  source_kardex_id: string
  target_kardex_id: string
  qty: number
  source_qty_after: number
  target_qty_after: number
}

/** Body of POST /v2/inventory/recount. `qty` is a delta added to qty_on_hand. */
export interface RecountInput {
  kardex_id: string
  qty: number
  reason_code?: string
}

export interface RecountResult {
  adjustment_id: string
  kardex_id: string
  qty_previous: number
  qty_new: number
  qty_delta: number
}

/**
 * Body of POST /v2/inventory/block. Blocks the whole tracecard (all of
 * qty_on_hand): it stays on hand but cannot be reserved, moved or recounted.
 */
export interface BlockInput {
  kardex_id: string
  /** Upper-case code (A-Z, 0-9, _ -), 2-50 chars — e.g. DAMAGED. */
  reason_code: string
  notes?: string
}

export interface BlockResult {
  hold_id: string
  kardex_id: string
  status: string
  qty_on_hand: number
  reason_code: string
  notes: string | null
  blocked_at: string
}

/** Body of POST /v2/inventory/unblock — releases the ACTIVE hold. */
export interface UnblockInput {
  kardex_id: string
}

export interface UnblockResult {
  hold_id: string
  kardex_id: string
  status: string
  qty_on_hand: number
  reason_code: string
  released_at: string
  /** YYYY-MM-DD when the tracecard has an expiration date. */
  expir: string | null
  /** The lot is already expired: unblocking is allowed, but the user should know. */
  expired: boolean
}

/** One order in `meta.orders` of BLOCK_HAS_RESERVATIONS. */
export interface ReservingOrder {
  order_id: string
  order_number: string
  order_status: string
  qty_allocated: number
}

/** Slim projection of POST /v2/wms/location/list (destination picker). */
export interface LocationOption {
  id: string
  location_code: string
  operational_category_code?: string | null
}

/** Raw node of POST /v2/wms/container/tree. */
export interface ContainerTreeNode {
  id: string
  lpn_code: string
  type: string
  content_units: number
  children?: ContainerTreeNode[]
}

/** Container (LPN) of a location, flattened; depth 0 = directly in the location. */
export interface ContainerOption {
  id: string
  lpn_code: string
  type: string
  content_units: number
  depth: number
}

/** v2 AppError body as rethrown by the error interceptor. */
export interface AppErrorBody {
  code?: string
  message?: string
  http_status?: number
  errors?: Array<{ field: string; rule: string }>
  meta?: Record<string, unknown>
}

// ============================================================
// Kardex Flow (history)
// ============================================================

export interface KardexFlowItem {
  id: string
  kardex_id: string
  transaction_type: string
  qty_change: number
  balance_after: number
  reference_doc_id: string | null
  reference_doc_type: string | null
  user_id: string | null
  event_code: string | null // 12-char business alias; null on rows written before it existed
  created_at: string
  // Costs — OWNER only (omitted for other roles); null when the facility does not cost
  unit_cost?: number | null
  /** qty_change × unit_cost — negative on exits */
  total_cost?: number | null
  cost_source?: string | null
  currency?: CostingCurrency | null
  // Joined fields
  tracecard: string
  sku: string
  barcode: string | null
  image_path: string | null
  description: string | null
  location_code: string | null
  container_lpn: string | null
  company_name: string | null
  facility_name: string | null
  user_name: string | null
  zone_name: string | null
  category: string | null
  // Reference document (populated according to reference_doc_type)
  shipment_number: string | null // RECEIVING → inb_receivings.doc_number
  delivery_date: string | null // RECEIVING → inb_receivings.finished_at
  order_number: string | null // OMS_ORDER → oms_orders.order_number
  reference_number: string | null // OMS_ORDER → oms_orders.customer_po
  adjustment_reason: string | null // INV_ADJUSTMENT → inv_adjustments.reason_code
  related_location_code: string | null // INV_KARDEX (move) → counterpart location
  move_notes?: string | null // MOVE_OUT / MOVE_IN → wms_movement_flow.notes (null on older moves)
}

/** Which reference-document section the history detail drawer shows. */
export type KardexFlowDetailKind =
  | 'receiving'
  | 'order'
  | 'move'
  | 'recount'
  | null

export interface KardexFlowFilter {
  [key: string]: MatchModel | undefined
  kardex_id?: MatchModel
  event_code?: MatchModel
  location_id?: MatchModel
  sku_id?: MatchModel
  container_id?: MatchModel
  company_id?: MatchModel
  transaction_type?: MatchModel
  created_at?: MatchModel
  qty_change?: MatchModel
  balance_after?: MatchModel
  // Joined-field filters (columns visible in the UI history table)
  user_name?: MatchModel
  tracecard?: MatchModel
  sku?: MatchModel
  location_code?: MatchModel
  shipment_number?: MatchModel
  order_number?: MatchModel
}

export interface KardexFlowListRequest {
  filter: KardexFlowFilter
  config: ConfigFilter
}

export interface KardexFlowListResponse {
  data: KardexFlowItem[]
  meta_data: MetaData
}
