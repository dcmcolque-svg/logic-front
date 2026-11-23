/**
 * Inventory costing — shared types and helpers.
 * Mirrors logic-back/src/api/v2/inventory/costing (docs/costing-design.md).
 *
 * Costs are OWNER-only: the backend omits every cost field for other roles,
 * and the UI hides cost columns for them too.
 */

import { formatDisplayNumber } from './display-format'

export type CostingMethod = 'NONE' | 'AVERAGE' | 'SPECIFIC' | 'FIFO' | 'STANDARD'
export type CostingCurrency = 'BOB' | 'CLP' | 'USD'

/** core_facilities.settings.costing */
export interface CostingSettings {
  method: CostingMethod
  currency?: CostingCurrency
  cost_required_on_receiving?: boolean
}

/** Response of POST /v2/facility/:id/costing/initialize */
export interface CostingInitializeResult {
  costing: CostingSettings
  /** true when the opening balance was (re)built */
  initialized: boolean
  /** SKUs with stock that got an opening balance */
  skus: number
  /** Opening inventory value, in costing.currency */
  total_value: number
}

export const COSTING_METHODS: CostingMethod[] = ['NONE', 'AVERAGE', 'SPECIFIC', 'FIFO', 'STANDARD']
/** Methods that can be turned on (all since phase 4). */
export const COSTING_METHODS_AVAILABLE: CostingMethod[] = ['NONE', 'AVERAGE', 'SPECIFIC', 'FIFO', 'STANDARD']
export const COSTING_CURRENCIES: CostingCurrency[] = ['BOB', 'CLP', 'USD']
export const DEFAULT_CURRENCY: CostingCurrency = 'BOB'

/** Display prefix and decimals per currency. Storage keeps 6 decimals. */
const CURRENCY_FORMAT: Record<CostingCurrency, { prefix: string; decimals: number }> = {
  BOB: { prefix: 'Bs', decimals: 2 },
  CLP: { prefix: 'CLP$', decimals: 0 },
  USD: { prefix: 'US$', decimals: 2 },
}

export const OWNER_ROLE = 'OWNER'

export function isOwnerRole(role: string | null | undefined): boolean {
  return (role ?? '').toUpperCase() === OWNER_ROLE
}

export function isCostingEnabled(s: CostingSettings | null | undefined): boolean {
  return !!s?.method && s.method !== 'NONE'
}

export function currencyOf(s: CostingSettings | null | undefined): CostingCurrency {
  return s?.currency && s.currency in CURRENCY_FORMAT ? s.currency : DEFAULT_CURRENCY
}

export function currencyPrefix(currency: CostingCurrency): string {
  return CURRENCY_FORMAT[currency]?.prefix ?? currency
}

export function currencyDecimals(currency: CostingCurrency): number {
  return CURRENCY_FORMAT[currency]?.decimals ?? 2
}

/**
 * Decimals an amount may carry in any currency. Users may type cents even in
 * CLP (e.g. a price of 46,30), and every screen shows them as typed.
 */
export const MONEY_MAX_DECIMALS = 2

/**
 * "Bs 10,50", "CLP$ 1.250", "CLP$ 46,3", "US$ 3,00"; "—" when there is no
 * value. The currency's decimals are the minimum (BOB/USD always show cents);
 * cents a CLP amount does carry are shown, never rounded away. Numbers follow
 * DISPLAY_LOCALE (display-format), not the UI language.
 */
export function formatCost(value: number | null | undefined, currency: CostingCurrency): string {
  if (value === null || value === undefined || isNaN(value)) return '—'
  const d = currencyDecimals(currency)
  return `${currencyPrefix(currency)} ${formatDisplayNumber(value, d, Math.max(d, MONEY_MAX_DECIMALS))}`
}

/**
 * Relative difference of `cost` against the catalog cost, in percent.
 * null when either is missing or the catalog cost is 0.
 */
export function costVariancePct(cost: number | null | undefined, catalog: number | null | undefined): number | null {
  if (cost === null || cost === undefined || catalog === null || catalog === undefined || catalog === 0) return null
  return ((cost - catalog) / catalog) * 100
}

/**
 * The one currency shared by every given facility, or null when they differ
 * or none has a currency set (callers then fall back to 2 decimals).
 */
export function commonCurrency(settings: Array<CostingSettings | null | undefined>): CostingCurrency | null {
  const set = new Set(settings.map(s => s?.currency).filter((c): c is CostingCurrency => !!c && c in CURRENCY_FORMAT))
  return set.size === 1 ? [...set][0] : null
}

/**
 * DecimalPipe digitsInfo for amounts the user typed (catalog cost / prices):
 * no forced trailing zeros, and the cents shown as typed in any currency
 * (CLP 46,3 stays 46,3) → always '1.0-2'.
 */
export function enteredAmountDigits(_currency?: CostingCurrency | null): string {
  return `1.0-${MONEY_MAX_DECIMALS}`
}
