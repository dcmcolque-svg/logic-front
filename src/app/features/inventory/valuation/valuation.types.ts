/**
 * Inventory valuation (costing phase 5) — mirrors
 * logic-back/src/api/v2/inventory/valuation. Every endpoint is OWNER-only.
 */
import { CostingCurrency, CostingMethod } from '@/app/shared/utils/costing.util'

export interface MatchModel {
  match_mode?: string
  value?: unknown
}

export interface ValuationConfig {
  page: number
  rows: number
  sort_field?: { field: string; order: number }[]
}

export interface MetaData {
  total_records: number
  page: number
  rows: number
}

// ── Balances ────────────────────────────────────────────────────────────────

export interface BalanceItem {
  id: string
  facility_id: string
  facility_name: string
  company_id: string
  company_name: string | null
  sku_id: string
  sku: string
  sku_name: string | null
  method: CostingMethod
  currency: CostingCurrency
  qty: number
  total_value: number
  /** value / qty — the standard under STANDARD */
  avg_cost: number
  last_cost: number | null
  updated_at: string
}

export interface BalanceFilter {
  facility_id?: MatchModel
  company_id?: MatchModel
  sku?: MatchModel
  method?: MatchModel
  currency?: MatchModel
  facility_scope?: MatchModel
}

export interface CurrencyTotal {
  currency: CostingCurrency
  skus: number
  qty: number
  total_value: number
}

export interface BalanceListResponse {
  data: BalanceItem[]
  meta_data: MetaData
  /** Over the whole filtered set, one entry per currency */
  totals: CurrencyTotal[]
}

// ── Variances (STANDARD) ────────────────────────────────────────────────────

export type VarianceKind = 'PURCHASE' | 'REVALUATION'

export interface VarianceItem {
  id: string
  facility_id: string
  facility_name: string
  company_name: string | null
  sku_id: string
  sku: string
  sku_name: string | null
  flow_id: string
  event_code: string | null
  transaction_type: string | null
  receiving_number: string | null
  kind: VarianceKind
  qty: number
  standard_cost: number
  /** REVALUATION: the previous standard */
  actual_cost: number
  /** PURCHASE: qty × (actual − standard), positive = paid more */
  variance: number
  currency: CostingCurrency
  created_at: string
}

export interface VarianceFilter {
  facility_id?: MatchModel
  sku?: MatchModel
  kind?: MatchModel
  currency?: MatchModel
  created_at?: MatchModel
  facility_scope?: MatchModel
}

export interface VarianceTotal {
  currency: CostingCurrency
  kind: VarianceKind
  count: number
  variance: number
}

export interface VarianceListResponse {
  data: VarianceItem[]
  meta_data: MetaData
  totals: VarianceTotal[]
}

// ── FIFO layers ─────────────────────────────────────────────────────────────

export interface LayerItem {
  id: string
  seq: number
  qty_in: number
  qty_remaining: number
  unit_cost: number
  value: number
  created_at: string
  /** null = opening layer (costing initialization) */
  source_flow_id: string | null
  event_code: string | null
  transaction_type: string | null
  tracecard: string | null
}

export interface LayerListResponse {
  data: LayerItem[]
  currency: CostingCurrency
}
