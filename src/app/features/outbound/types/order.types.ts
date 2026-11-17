// ============================================================
// Outbound Order — v2 domain types
// POST /v2/outbound/order/list  →  OrderListResponse
// ============================================================

export interface ShipToAddress {
  first_name: string
  last_name: string
  email?: string
  phone?: string
  company?: string
  address_1: string
  address_2?: string
  city: string
  state_name?: string
  zip?: string
  country: string
}

export interface Order {
  id: string                       // UUID
  operator_id: string
  facility_id: string
  /** Embedded facility object — returned by the list API */
  facility?: { id: string; name: string; code: string }
  company_id: string
  order_number: string
  customer_po?: string
  ship_to_address: ShipToAddress
  status: string                   // 'EVALUATING' | 'PENDING' | 'BACKORDER' | 'PROCESSING' | 'SHIPPED' | 'CANCELED'
  priority: number
  required_delivery_date?: string  // yyyy-mm-dd
  created_at: string
  shipped_at?: string
}

// ── Filter helpers ──────────────────────────────────────────

export interface MatchModel {
  value: unknown
  match_mode: string
  /** AND/OR combinator from a custom filter (see presetCombinator) */
  operator?: 'or'
  position?: number
}

export interface OrderFilter {
  id?: MatchModel
  operator_id?: MatchModel
  company_id?: MatchModel
  facility_id?: MatchModel
  order_number?: MatchModel
  customer_po?: MatchModel
  status?: MatchModel
  priority?: MatchModel
  ship_to?: MatchModel
  required_delivery_date?: MatchModel
  created_at?: MatchModel
  [key: string]: MatchModel | undefined
}

// ── Request / Response ──────────────────────────────────────

export interface OrderListRequest {
  filter: OrderFilter
  config: {
    page: number
    rows: number
    sort_field?: { field: string; order: number }[]
  }
}

export interface OrderListResponse {
  data: Order[]
  meta_data: { page: number; rows: number; total_records: number }
}

// ============================================================
// Order lines — GET /v2/outbound/order/:id/lines
// ============================================================

export interface OrderLine {
  id: string
  operator_id: string
  order_id: string
  sku_id: string
  line_number: number
  qty_ordered: number
  qty_allocated: number
  qty_picked: number
  qty_packed: number
  qty_shipped: number
  unit_price: number
  status: string // 'OPEN' | 'FULFILLED' | etc.
}

export interface OrderLineDetail extends OrderLine {
  sku_code: string
  sku_name: string
  /** Description of the SKU — may differ from sku_name */
  sku_description?: string
  /** Barcode of the SKU — from the API 'barcode' field */
  barcode?: string
  /** Array of image URLs from the API 'images' field. images[0] is the primary image. */
  images: string[]
  product_id: string
  product_name: string
  allocations?: OrderLineAllocationDetail[]
}

export interface OrderLineAllocationDetail {
  kardex_id: string
  qty_allocated: number
  location_id: string
  location_code: string
  container_id?: string
  container_lpn?: string
  lot?: string
  expir?: string
}

// ── Per-order error ─────────────────────────────────────────

/** Standard v2 error body carried by a failed row of a batch response. */
export interface OrderItemError {
  code: string
  message?: string
}

// ── Evaluate result ─────────────────────────────────────────

export interface EvalResult {
  order_id: string
  status: string // 'PENDING' | 'PROCESSING' | 'BACKORDER' | 'ERROR'
  shortfalls?: StockShortfall[]
  error?: OrderItemError
}

export interface StockShortfall {
  sku_id: string
  sku_code: string
  qty_ordered: number
  qty_available: number
  qty_short: number
}

// ── Batch evaluate result ────────────────────────────────────

/** Response for POST /v2/outbound/order/evaluate/batch */
export interface EvaluateBatchResult {
  results: EvalResult[]
}

// ============================================================
// Pack Detail — POST /v2/outbound/order/pack/detail
// ============================================================

export interface PackDetailItem {
  order_line_id: string
  kardex_id: string
  origin_kardex_id: string
  sku_id: string
  qty: number
}

export interface PackDetailPackage {
  package_id: string
  container_id: string
  lpn_code: string
  tracking_number?: string
  master_tracking_number?: string
  label_url?: string
  weight_kg?: number
  freight_cost?: number
  items: PackDetailItem[]
}

export interface PackDetailShipment {
  shipment_id: string
  shipment_status: string
  shipment_number: string
  carrier_code: string
  service_level?: string
  packages: PackDetailPackage[]
}

export interface PackDetailOrder {
  order_id: string
  order_number: string
  status: string
  priority: number
  ship_to_address: ShipToAddress
  created_at: string
  shipments: PackDetailShipment[]
}

export interface PackDetailResult {
  orders: PackDetailOrder[]
}

export interface PackDetailFilter {
  order_id?: MatchModel
  [key: string]: MatchModel | undefined
}

export interface PackDetailRequest {
  filter: PackDetailFilter
  config: { page: number; rows: number }
}

// ── Process result ───────────────────────────────────────────

/** Response for POST /v2/outbound/order/process/batch */
export interface ProcessOrderResult {
  order_id: string
  status: string
  task_count: number
  error?: OrderItemError
}

export interface ProcessBatchResult {
  results: ProcessOrderResult[]
}

// ── Revert Process result ────────────────────────────────────

/** Response for POST /v2/outbound/order/:id/revert-process */
export interface RevertProcessResult {
  order_id: string
  status: string   // 'PENDING' or 'ERROR' in batch mode
  tasks_cleaned: number
  error?: OrderItemError
}

/** Batch response for POST /v2/outbound/order/:id/revert-process with body */
export interface RevertProcessBatchResult {
  results: RevertProcessResult[]
}

// ── Archive result ───────────────────────────────────────────

/** Response for POST /v2/outbound/order/:id/archive */
export interface ArchiveOrderResult {
  order_id: string
  status: string   // 'ARCHIVED'
  error?: OrderItemError
}

/** Batch response for POST /v2/outbound/order/:id/archive with body */
export interface ArchiveBatchResult {
  results: ArchiveOrderResult[]
}

// ── Cancel batch result ──────────────────────────────────────

export interface CancelOrderResult {
  order_id: string
  status: string
  shipped_qty: number
  cancelled_qty: number
  shipments_cancelled: number
  shipments_kept: number
  previous_state: string
  error?: OrderItemError
}

/** Batch response for the cancel endpoints (`/_batch/cancel` and `/:id/cancel` with body) */
export interface CancelBatchResult {
  results: CancelOrderResult[]
}

// ── Shipping labels (Xenvio) ─────────────────────────────────

/** One box of a shipment with its tracking number */
export interface ShipmentLabelPackage {
  package_id: string
  lpn_code: string
  tracking_number?: string
  master_tracking_number?: string
}

/** A shipment with its label; label_url is a presigned URL valid for one hour */
export interface ShipmentLabel {
  shipment_id: string
  shipment_number: string
  carrier_code: string
  service_level?: string
  status: string
  label_url?: string
  packages: ShipmentLabelPackage[]
}

/** Response for GET/POST /v2/outbound/order/:id/label */
export interface OrderLabelsResponse {
  order_id: string
  order_number: string
  shipments: ShipmentLabel[]
}
