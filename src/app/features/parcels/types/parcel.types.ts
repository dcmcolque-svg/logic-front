/**
 * Parcel domain types — mirrors the v2 outbound box API contracts.
 *
 * Endpoint: POST v2/parcel/shipments/list
 */

// ============================================================
// Common primitives (shared with v2 API — via core.MatchModel / core.ConfigFilter)
// ============================================================

export interface MatchModel {
  match_mode: 'equals' | 'contains' | 'in' | 'lte' | 'gte'
  value: any
  operator?: 'and' | 'or'
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
// Parcel (v2 ClientListItem shape)
// ============================================================

/** Maps to ClientListItem from the v2 outbound box API. */
export interface Parcel {
  id: string
  order_detail: ParcelOrderDetail
  external_channel: ParcelExternalChannel
  customer: ParcelCustomer
  meta_data: ParcelMetaData
  operator: ParcelOperator
  shipment: ParcelShipment
  data_requirements?: DataRequirements
  data_status?: string // 'complete' | 'incomplete'
}

export interface ParcelOrderDetail {
  order_id?: string
  order_number?: string
  order_date?: string
  reference_number?: string
  reference_number_2?: string
  origin?: string
  origin_number?: string
  company?: string
  is_returned?: boolean
}

export interface ParcelExternalChannel {
  channel?: string
  channel_id?: string
  channel_label?: string
}

export interface ParcelCustomer {
  first_name?: string
  last_name?: string
  address?: string
  country?: string
  state?: string
  city?: string
  phone?: string
  email?: string
}

export interface ParcelMetaData {
  order_status?: string
  total_packages?: number
  total_quantity?: number
  total_items?: number
  additional_data?: string[]
  created_by_id?: string
  created_by_user_name?: string
  created_at?: string
}

export interface ParcelOperator {
  facility_id?: string
  facility_name?: string
  user_id?: string
  username?: string
  operator_id?: string
  operator_name?: string
  company_id?: string
  parcel_status?: string
  storage_unit_id?: string
  storage_unit?: ParcelStorageUnit
}

export interface ParcelStorageUnit {
  id?: string
  name?: string
  storage_unit_type?: string
  facility_id?: string
}

export interface ParcelShipment {
  shipment_id?: string
  carrier?: string
  shipping_method?: string
  packages?: ParcelPackage[]
  delivery_detail?: ParcelDeliveryDetail
  ship_by_date?: string
  overdue?: boolean
  overdue_days?: number
}

export interface ParcelPackage {
  tracking_number?: string
  type?: string
  measures?: string
  items?: ParcelProduct[]
  img_pkg?: string
}

export interface ParcelProduct {
  sku?: string
  qty?: number
  description?: string
  sku_image?: string
}

export interface ParcelDeliveryDetail {
  received_at?: string
  received_by?: string
  received_image?: string
  received_signature?: string
  operator_shipped?: string
  date_shipped?: string
  latitude?: number
  longitude?: number
  received_by_name?: string
  received_by_comment?: string
  manifest_code?: string
}

export interface DataRequirements {
  fulfilled?: boolean
  missing_fields?: { field?: string; message?: string }[]
}

// ============================================================
// Update Customer Info DTO (PATCH /v2/parcel/shipments/:id/customer)
// ============================================================

export interface UpdateCustomerInfoDTO {
  id: string
  name: string
  last_name: string
  email: string
  phone: string
  address: string
  ship_by_date: string
}

// ============================================================
// Parcel Items  (GET /v2/parcel/shipments/:id/items)
// Mirrors the legacy /eng/v1/orderitemsproduct/ endpoint shape.
// ============================================================

export interface ParcelEnrichedProduct {
  sku: string
  qty: number
  description: string
  sku_image: string
  barcode?: string
}

export interface ParcelEnrichedPackage {
  tracking_number: string
  type: string
  measures: string
  length?: number
  width?: number
  height?: number
  weight?: number
  items: ParcelEnrichedProduct[]
}

export interface ParcelItemsResponse {
  box_id: string
  order_number: string
  state: string
  total_packages: number
  total_sku: number
  total_item: number
  packages: ParcelEnrichedPackage[]
}

// ============================================================
// Filter / Request / Response (v2 ClientListFilter / ClientListRequest / ClientListResponse)
// ============================================================

export interface ParcelFilter {
  [key: string]: MatchModel | undefined
  id?: MatchModel
  order_id?: MatchModel
  order_number?: MatchModel
  reference_number?: MatchModel
  company?: MatchModel
  customer?: MatchModel
  created_at?: MatchModel
  channel?: MatchModel
  order_status?: MatchModel
  carrier?: MatchModel
  tracking_number?: MatchModel
  parcel_status?: MatchModel
  facility_id?: MatchModel
  storage_unit_id?: MatchModel
  storage_unit_type?: MatchModel
  storage_unit_name?: MatchModel
  container_id?: MatchModel
  ship_details_count?: MatchModel
  data_status?: MatchModel
  date_shipped?: MatchModel
}

export interface ParcelListRequest {
  config: ConfigFilter
  filter: ParcelFilter
}

/** Maps to ClientListResponse from the v2 outbound box API. */
export interface ParcelListResponse {
  data: Parcel[]
  facilities?: ParcelFacility[]
  total_packages?: number
  meta_data: MetaData
}

/** Facility reference returned alongside the parcel list. */
export interface ParcelFacility {
  id: string
  name?: string
  operator_id?: string
}

// ============================================================
// Dashboard Summary  (GET /v2/parcel/dashboard/summary)
// ============================================================

/** Counts for boxes in state = 'SHIPPED'. */
export interface ParcelShippedSummary {
  total: number
  deliveries: number       // parcel_status = LAST_MILE
  customer_pickups: number // parcel_status = COLLECTED
}

/** Counts for boxes in state = 'SHIP PREPARED'. */
export interface ParcelShipPreparedSummary {
  total: number
  ready: number        // data_requirements.fulfilled = true  (edge: Completed)
  missing_data: number // fulfilled ≠ true                   (edge: Incomplete)
}

/** Response shape for GET /v2/parcel/dashboard/summary. */
export interface ParcelDashboardSummary {
  shipped: ParcelShippedSummary
  ship_prepared: ParcelShipPreparedSummary
}

// ── Order Dashboard types ─────────────────────────────────────

/** Counters for the "Orders Shipped" dashboard panel. */
export interface OrdersShippedSummary {
  orders_shipped: number
  total_revenue: number
}

/** Counters for the "Alerts" dashboard panel. */
export interface AlertsSummary {
  back_orders: number
  low_inventory: number
}

/** Response shape for GET /outbound/order/dashboard/summary. */
export interface OrderDashboardSummary {
  orders_shipped: OrdersShippedSummary
  alerts: AlertsSummary
}

// ── Inventory Dashboard types ─────────────────────────────────

/** Response shape for GET /tracecards/dashboard/summary. */
export interface InventoryDashboardSummary {
  total_value: number
  skus: number
  units: number
  trace_cards: number
}

// ── Location Dashboard types ──────────────────────────────────

/** Response shape for GET /wms/location/dashboard/summary. */
export interface LocationDashboardSummary {
  zones: number
  locations: number
  bins: number
}

// ── Best Selling Dashboard types ──────────────────────────────

/** One row in GET /outbound/order/dashboard/best-selling response. */
export interface BestSellingItem {
  sku: string
  product_name: string
  qty_sold: number
  total_amount: number
  image_url: string | null
}
