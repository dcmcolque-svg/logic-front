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
 * "Bs 10,50", "CLP$ 1.250", "US$ 3,00"; "—" when there is no value. Numbers
 * follow DISPLAY_LOCALE (display-format), not the UI language.
 */
export function formatCost(value: number | null | undefined, currency: CostingCurrency): string {
  if (value === null || value === undefined || isNaN(value)) return '—'
  const d = currencyDecimals(currency)
  return `${currencyPrefix(currency)} ${formatDisplayNumber(value, d, d)}`
}

/**
 * Relative difference of `cost` against the catalog cost, in percent.
 * null when either is missing or the catalog cost is 0.
 */
export function costVariancePct(cost: number | null | undefined, catalog: number | null | undefined): number | null {
  if (cost === null || cost === undefined || catalog === null || catalog === undefined || catalog === 0) return null
  return ((cost - catalog) / catalog) * 100
}
