// receiving-v2.types.ts

export type MatchMode =
  | 'equals'
  | 'lte'
  | 'gte'
  | 'contains'
  | 'notEquals'
  | 'in'
  | 'isNot'

export interface MatchModel {
  match_mode?: MatchMode
  value?: string | number | boolean | Array<string | number | boolean> | null
}

export interface SortField {
  field: string
  order: number
}

export interface MetaData {
  total_records: number
  page: number
  rows: number
}

export interface ConfigFilter {
  sort_field?: SortField[]
  page: number
  rows: number
  populate_data: boolean
}

export interface ReceivingStatusOption {
  label: string
  value: ReceivingStatus
}

export type ReceivingStatus =
  | 'IN-TRANSIT'
  | 'IN-WAREHOUSE'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'DISCREPANCY'
  | 'CANCELLED'

export type ReceivingLineStatus = 'OPEN' | 'PARTIAL' | 'COMPLETE' | 'CLOSED'

export const RECEIVING_STATUS_OPTIONS: ReceivingStatusOption[] = [
  { label: 'In transit', value: 'IN-TRANSIT' },
  { label: 'In warehouse', value: 'IN-WAREHOUSE' },
  { label: 'Processing', value: 'PROCESSING' },
  { label: 'Complete', value: 'COMPLETE' },
  { label: 'Discrepancy', value: 'DISCREPANCY' },
  { label: 'Cancelled', value: 'CANCELLED' },
]

export const RECEIVING_LINE_STATUS_OPTIONS: { label: string; value: ReceivingLineStatus }[] = [
  { label: 'Open', value: 'OPEN' },
  { label: 'Partial', value: 'PARTIAL' },
  { label: 'Complete', value: 'COMPLETE' },
  { label: 'Closed', value: 'CLOSED' },
]

export interface ReceivingLinePreview {
  sku_code: string
  qty_expected: number
  qty_received: number
  status: ReceivingLineStatus
}

export interface ReceivingListItem {
  id: string
  // operator_id: string
  facility_id: string
  company_id: string
  supplier_id?: string | null
  /** Supplier name (join) — only on the list projection. */
  supplier_name?: string | null
  doc_type: string
  doc_number: string
  external_ref?: string | null
  status: ReceivingStatus
  expected_arrival?: string | null
  started_at?: string | null
  finished_at?: string | null
  notes?: string | null
  created_at: string
  items: number
  qty_expected_sum: number
  qty_received_sum: number
  products?: ReceivingLinePreview[]
}

export interface Receiving {
  id: string
  // operator_id: string
  facility_id: string
  company_id: string
  supplier_id?: string | null
  /** Supplier name (join) — only on the list projection. */
  supplier_name?: string | null
  doc_type: string
  doc_number: string
  external_ref?: string | null
  status: ReceivingStatus
  expected_arrival?: string | null
  started_at?: string | null
  finished_at?: string | null
  notes?: string | null
  created_at: string
}

export interface ReceivingLine {
  id: string
  // operator_id: string
  receiving_id: string
  sku_id: string
  line_number: number
  qty_expected: number
  qty_received: number
  status: ReceivingLineStatus
  created_at: string
}

export interface ReceivingLineDetail {
  id: string
  // operator_id: string
  receiving_id: string
  sku_id: string
  sku_code: string
  barcode?: string | null
  line_number: number
  qty_expected: number
  qty_received: number
  qty_pending: number
  status: ReceivingLineStatus
  created_at: string

  // Fields from cat_products
  description?: string | null
  product_description?: string | null
  brand?: string | null

  // Costs — OWNER only (omitted by the backend for other roles)
  /** Expected unit cost of the line (purchase order). */
  unit_cost?: number | null
  /** Catalog cost (cat_skus.cost) — pre-fill and comparison. */
  sku_cost?: number | null

  // Fields from cat_skus
  weight?: number
  serial_control_mode?: string | null
  retail_price?: number
  wholesale_price?: number
  explicit_volume?: number
  images?: string[]
}

export interface ReceivingFlow {
  id: string
  // operator_id: string
  receiving_id: string
  line_id: string
  sku_id: string
  qty_received: number
  target_lpn_code?: string | null
  target_location_id?: string | null
  batch_lot?: string | null
  expiry_date?: string | null
  user_id?: string | null
  device_id?: string | null
  /** Resolved cost of this ingress — OWNER only, null when the facility does not cost. */
  unit_cost?: number | null
  created_at: string
}

export interface ReceivingCreateItem {
  sku_code: string
  qty_expected: number
  /** Expected unit cost (purchase order). Applied by the backend only for OWNER. */
  unit_cost?: number | null
  /** Optional — only used when the backend must auto-create the SKU in cat_skus. */
  sku_barcode?: string | null
  sku_weight?: number
  sku_name?: string | null
}

export interface ReceivingCreateInput {
  // operator_id: string
  facility_id: string
  company_id: string
  /** Optional — an active supplier of company_id. null clears it on update. */
  supplier_id?: string | null
  doc_type?: string
  doc_number: string
  external_ref?: string | null
  expected_arrival?: string | null
  notes?: string | null
  items: ReceivingCreateItem[]
}

export interface ReceivingResult {
  receiving_id: string
  doc_number: string
  status: ReceivingStatus
}

export interface MakeReceivingItem {
  sku_code: string
  qty_received: number
  batch_lot?: string | null
  /** yyyy-MM-dd */
  expiry_date?: string | null
  /** Required for SKUs with serial_control_mode IN or IN/OUT — one per unit. */
  serials?: string[]
  /** Real unit cost of this ingress (OWNER only). Omitted → line cost, then catalog cost. */
  unit_cost?: number | null
}

export interface MakeReceivingInput {
  receiving_id: string
  location: string
  container?: string | null
  allow_over_receiving: boolean
  items: MakeReceivingItem[]
}

export interface ExceededSkuDetail {
  sku_code: string
  qty_expected: number
  qty_received: number
  qty_remaining: number
  qty_requested: number
}

export interface MakeReceivingResult {
  receiving_id: string
  status: ReceivingStatus
  lines_received: number
  qty_exceeded?: boolean
  exceeded_skus?: ExceededSkuDetail[]
}

export interface ReceivingFilter {
  id?: MatchModel
  // operator_id?: MatchModel
  company_id?: MatchModel
  supplier_id?: MatchModel
  facility_id?: MatchModel
  doc_number?: MatchModel
  doc_type?: MatchModel
  status?: MatchModel
  external_ref?: MatchModel
  expected_arrival?: MatchModel
  finished_at?: MatchModel
  qty_expected_sum?: MatchModel
  qty_received_sum?: MatchModel
}

export interface ReceivingListRequest {
  filter: ReceivingFilter
  config: ConfigFilter
}

/** Slim facility projection returned by the list endpoint */
export interface FacilityItem {
  id: string
  name: string
  code: string
}

export interface ReceivingListResponse {
  data: ReceivingListItem[]
  meta_data: MetaData
  facilities?: FacilityItem[]
}

export interface ReceivingLineFilter {
  receiving_id?: MatchModel
  sku_id?: MatchModel
  sku_code?: MatchModel
  status?: MatchModel
}

export interface ReceivingLineListRequest {
  filter: ReceivingLineFilter
  config: ConfigFilter
}

export interface ReceivingLineListResponse {
  data: ReceivingLineDetail[]
  meta_data: MetaData
}

/** Response from PATCH /v2/inbound/receiving/archive */
export interface ArchiveReceivingResult {
  archived: number
  ids: string[]
}

// ── Companies ────────────────────────────────────────────────────────────────

/** One company (client account) of the operator. */
export interface CompanyItem {
  id: string
  name: string
}

/** Response of POST /v2/company/list. */
export interface CompanyListResponse {
  data: CompanyItem[]
  meta_data: {
    total_records: number
    page: number
    rows: number
  }
}

// ── SKU lookup (create dialog) ───────────────────────────────────────────────

/** Slim projection of POST /v2/cat/sku/list used by the receiving form's SKU search. */
export interface ReceivingSkuOption {
  id: string
  sku_code: string
  name?: string | null
  barcode?: string | null
  product_name?: string | null
  /** cat_skus.cost — pre-fills the line's unit cost. */
  cost?: number | null
}

// ── Location lookup (processing) ─────────────────────────────────────────────

/** Slim projection of POST /v2/wms/location/list used by the processing screen. */
export interface ReceivingLocationOption {
  id: string
  location_code: string
  aisle?: string | null
  section?: string | null
  level?: string | null
  location_profile_code?: string | null
  operational_category_code?: string | null
  content_skus?: number
  content_units?: number
}

/** Raw node of POST /v2/wms/container/tree (bins nested inside a location). */
export interface ReceivingContainerTreeNode {
  id: string
  lpn_code: string
  type: string
  parent_id?: string
  container_profile_code?: string
  content_skus: number
  content_units: number
  children?: ReceivingContainerTreeNode[]
}

/** Flattened container (bin/LPN) of a location, used by the processing screen. */
export interface ReceivingContainerOption {
  id: string
  lpn_code: string
  type: string
  container_profile_code?: string | null
  content_skus: number
  content_units: number
  /** Nesting level inside the location (0 = directly in the location). */
  depth: number
}
