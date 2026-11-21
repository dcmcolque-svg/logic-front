/**
 * Sales module (POS) — mirrors logic-back/src/api/v2/sales/sales.types.go.
 *
 * A sale is an outbound order created + reserved + packed + shipped by the
 * checkout pipeline in the same transaction as its payments.
 * Cost fields (cost_total, margin, unit_cost) only arrive for OWNER.
 */
import { CostingCurrency } from '@/app/shared/utils/costing.util'

export type PaymentKind = 'CASH' | 'CARD' | 'QR' | 'TRANSFER' | 'CREDIT' | 'OTHER'
export type PriceList = 'RETAIL' | 'WHOLESALE'
export type SessionStatus = 'OPEN' | 'CLOSED'
/** FACILITY = one shared drawer per facility; USER = personal drawer of the opener. */
export type SessionScope = 'FACILITY' | 'USER'
export type MovementKind = 'IN' | 'OUT'

export const PAYMENT_KINDS: PaymentKind[] = ['CASH', 'CARD', 'QR', 'TRANSFER', 'CREDIT', 'OTHER']

export interface MatchModel {
  match_mode: string
  value: unknown
}

export interface ListConfig {
  page: number
  rows: number
  sort_field?: { field: string; order: number }[]
}

export interface MetaData {
  total_records: number
  page: number
  rows: number
}

// ── Payment methods ─────────────────────────────────────────────────────────

export interface PaymentMethod {
  id: string
  code: string
  name: string
  kind: PaymentKind
  requires_reference: boolean
  sort_order: number
  is_active: boolean
}

export interface PaymentMethodInput {
  code: string
  name: string
  kind: PaymentKind
  requires_reference: boolean
  sort_order: number
  is_active?: boolean
}

// ── Cash register ───────────────────────────────────────────────────────────

export interface CashSession {
  id: string
  facility_id: string
  facility_name: string
  user_id: string
  user_name: string | null
  /** Absent on legacy sessions → treated as USER. */
  scope?: SessionScope
  session_number: string
  status: SessionStatus
  currency: CostingCurrency
  opening_amount: number
  opening_note: string | null
  opened_at: string
  closed_at: string | null
  closed_by_name: string | null
  expected_amount: number | null
  counted_amount: number | null
  difference: number | null
  closing_note: string | null
  sales_count: number
  sales_total: number
}

export interface CashMovement {
  id: string
  kind: MovementKind
  amount: number
  reason: string
  user_name: string | null
  created_at: string
}

export interface MethodTotal {
  payment_method_id: string
  method_name: string
  kind: PaymentKind
  payments: number
  amount: number
}

/** Per-user sales on a shared (FACILITY) drawer. */
export interface UserTotal {
  user_id: string
  user_name: string | null
  sales_count: number
  sales_total: number
}

export interface SessionSummary {
  session: CashSession
  methods: MethodTotal[]
  /** Only filled for FACILITY drawers. */
  users?: UserTotal[]
  movements: CashMovement[]
  /** Payments towards customers' debts taken on this drawer, per method. */
  collections?: MethodTotal[]
  collections_total?: number
  /** Cash part of the collections: it enters the expected cash. */
  cash_collections?: number
  cash_sales: number
  cash_in: number
  cash_out: number
  expected: number
  sales_count: number
  sales_total: number
  discounts: number
  units: number
}

export interface CurrentSessionResponse {
  session: SessionSummary | null
  currency: CostingCurrency
}

export interface SessionFilter {
  facility_id?: MatchModel
  user_id?: MatchModel
  status?: MatchModel
  session_number?: MatchModel
  opened_at?: MatchModel
  opened_from?: MatchModel
  opened_to?: MatchModel
  facility_scope?: MatchModel
  scope?: MatchModel
}

export interface SessionListResponse {
  data: CashSession[]
  meta_data: MetaData
}

// ── POS catalog ─────────────────────────────────────────────────────────────

export interface CatalogItem {
  sku_id: string
  sku_code: string
  sku_name: string | null
  barcode: string | null
  image_url: string | null
  company_id: string
  company_name: string | null
  retail_price: number
  wholesale_price: number
  available: number
  exact_match: boolean
  unit_cost?: number | null
}

// ── Checkout ────────────────────────────────────────────────────────────────

/** Free-text snapshot; ignored by the server when customer_id is set. */
export interface CheckoutCustomer {
  name: string
  business_name?: string
  doc: string
  email: string
  phone: string
}

export interface CheckoutLine {
  sku_id: string
  qty: number
  unit_price: number
  discount: number
}

export interface CheckoutPayment {
  payment_method_id: string
  amount: number
  received: number
  reference: string
}

export interface CheckoutInput {
  facility_id: string
  session_id: string
  client_ref: string
  price_list: PriceList
  /** Registered customer of the sale's company; required to charge on credit. */
  customer_id: string
  customer: CheckoutCustomer
  lines: CheckoutLine[]
  discount: number
  payments: CheckoutPayment[]
  note: string
}

// ── Sales ───────────────────────────────────────────────────────────────────

export interface Sale {
  id: string
  sale_number: string
  order_id: string
  order_status: string | null
  facility_id: string
  facility_name: string
  company_id: string
  company_name: string | null
  session_id: string
  session_number: string
  user_id: string
  user_name: string | null
  status: string
  price_list: PriceList
  currency: CostingCurrency
  customer_id: string | null
  customer_name: string | null
  /** Razón social at the time of the sale (null = customer_name). */
  customer_business_name: string | null
  customer_doc: string | null
  customer_email: string | null
  customer_phone: string | null
  subtotal: number
  discount_total: number
  total: number
  paid_cash: number
  paid_credit: number
  received_total: number
  change_amount: number
  units: number
  lines: number
  payment_kinds: string | null
  note: string | null
  created_at: string
  cost_total?: number | null
  margin?: number | null
  margin_pct?: number | null
}

export interface SaleLine {
  id: string
  line_number: number
  sku_id: string
  sku_code: string
  sku_name: string | null
  qty: number
  list_price: number | null
  unit_price: number
  discount: number
  line_total: number
  price_edited: boolean
  unit_cost?: number | null
  cost_total?: number | null
  margin?: number | null
}

export interface SalePayment {
  id: string
  payment_method_id: string
  method_name: string
  kind: PaymentKind
  amount: number
  received: number
  change_amount: number
  reference: string | null
}

export interface SaleDetail extends Sale {
  items: SaleLine[]
  payments: SalePayment[]
  idempotent?: boolean
}

export interface SaleFilter {
  sale_number?: MatchModel
  facility_id?: MatchModel
  session_id?: MatchModel
  user_name?: MatchModel
  customer_id?: MatchModel
  customer_name?: MatchModel
  price_list?: MatchModel
  payment_kind?: MatchModel
  created_at?: MatchModel
  /** Inclusive day range: start of the local day, RFC3339. */
  created_from?: MatchModel
  created_to?: MatchModel
  search?: MatchModel
  facility_scope?: MatchModel
}

export interface SaleTotals {
  currency: CostingCurrency
  sales: number
  units: number
  subtotal: number
  discounts: number
  total: number
  cost_total?: number | null
  margin?: number | null
  costed_total?: number | null
}

export interface SaleListResponse {
  data: Sale[]
  meta_data: MetaData
  totals: SaleTotals[]
  can_see_cost: boolean
}

// ── Dashboard ───────────────────────────────────────────────────────────────

/** POS sales of one currency for the dashboard period (never added across currencies). */
export interface SalesDashboardCurrency {
  currency: CostingCurrency
  sales: number
  total: number
  units: number
  avg_ticket: number
  /** Previous period of the same length; absent for an open or instant range. */
  prev_sales?: number
  prev_total?: number
}

export interface SalesDailyPoint {
  day: string // yyyy-mm-dd, facility zone
  currency: CostingCurrency
  sales: number
  total: number
}

/** GET /v2/sales/dashboard/summary */
export interface SalesDashboardSummary {
  currencies: SalesDashboardCurrency[]
  /** Cash sessions open right now */
  open_registers: number
  daily: SalesDailyPoint[]
}

// ── Customers & accounts receivable ─────────────────────────────────────────

export interface CompanyOption {
  id: string
  name: string
}

/** Debt of a customer in one currency (only non-zero balances arrive). */
export interface CustomerBalance {
  currency: CostingCurrency
  balance: number
}

export interface Customer {
  id: string
  company_id: string
  company_name: string | null
  name: string
  /** Razón social for invoicing; null = name. */
  business_name: string | null
  /** NIT / CI / RUT — unique per company. */
  doc: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  is_active: boolean
  sales_count: number
  last_sale_at: string | null
  created_at: string
  updated_at: string
  /** Search only: doc or phone equals the query. */
  exact_match?: boolean
  balances: CustomerBalance[]
}

export interface CustomerInput {
  /** Empty on create = the operator's only selling company. Fixed after creation. */
  company_id: string
  name: string
  business_name: string | null
  doc: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  is_active?: boolean
}

export interface CustomerFilter {
  id?: MatchModel
  company_id?: MatchModel
  name?: MatchModel
  business_name?: MatchModel
  doc?: MatchModel
  email?: MatchModel
  phone?: MatchModel
  is_active?: MatchModel
  created_at?: MatchModel
  /** { value: true } keeps the customers that owe something. */
  has_balance?: MatchModel
  search?: MatchModel
}

export interface CustomerListRequest {
  filter: CustomerFilter
  config: ListConfig
}

export interface CustomerListResponse {
  data: Customer[]
  meta_data: MetaData
}

export interface CustomerPaymentInput {
  facility_id: string
  client_ref: string
  payment_method_id: string
  amount: number
  received: number
  reference: string
  note: string
}

export interface CustomerPayment {
  id: string
  customer_id: string
  customer_name: string
  customer_doc: string | null
  facility_id: string
  facility_name: string
  session_id: string | null
  session_number: string | null
  payment_method_id: string
  method_name: string
  kind: PaymentKind
  currency: CostingCurrency
  amount: number
  received: number
  change_amount: number
  reference: string | null
  note: string | null
  user_name: string | null
  created_at: string
}

export interface CustomerPaymentResult {
  payment: CustomerPayment
  /** What the customer still owes in the payment's currency. */
  balance_after: number
  balances: CustomerBalance[]
  idempotent?: boolean
}

export type StatementEntryType = 'SALE' | 'PAYMENT'

/** One movement of the account; balance is the running debt in its currency. */
export interface StatementEntry {
  type: StatementEntryType
  id: string
  number: string | null
  created_at: string
  currency: CostingCurrency
  facility_id: string
  facility_name: string | null
  total: number
  debit: number
  credit: number
  balance: number
  method_name: string | null
  reference: string | null
  user_name: string | null
}

export interface PurchaseTotal {
  currency: CostingCurrency
  sales: number
  total: number
}

export interface CustomerStatement {
  customer: Customer
  balances: CustomerBalance[]
  purchases: PurchaseTotal[]
  /** Newest first, at most 300. */
  entries: StatementEntry[]
  truncated: boolean
}
