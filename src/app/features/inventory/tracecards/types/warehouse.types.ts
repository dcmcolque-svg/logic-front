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
