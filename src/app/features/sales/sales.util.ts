/**
 * Sales module — pure helpers. The cart math mirrors
 * logic-back/src/api/v2/sales/sales.calc.go so the POS shows exactly what
 * the server will charge (the server recomputes and rejects any mismatch).
 */
import { TranslateService } from '@ngx-translate/core'
import { CostingCurrency, currencyDecimals, formatCost } from '@/app/shared/utils/costing.util'
import { CatalogItem, PaymentKind, PriceList } from './sales.types'

export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

/** Rounds to what the currency can actually be paid in (CLP has no cents). */
export function roundCurrency(v: number, currency: CostingCurrency): number {
  const f = 10 ** currencyDecimals(currency)
  return Math.round((v + Number.EPSILON) * f) / f
}

export function money(value: number | null | undefined, currency: CostingCurrency): string {
  return formatCost(value, currency)
}

// ── Cart ──────────────────────────────────────────────────────────────────

export interface CartLine {
  item: CatalogItem
  qty: number
  /** Charged price (editable). */
  unit_price: number
  /** Catalog price of the active price list, to flag edited prices. */
  list_price: number
  /** Amount off this line. */
  discount: number
}

export interface CartTotals {
  /** Σ qty × price, before any discount. */
  gross: number
  lineDiscounts: number
  /** Σ line totals (after line discounts). */
  subtotal: number
  discount: number
  discountTotal: number
  total: number
  units: number
  lines: number
}

export function priceOf(item: CatalogItem, list: PriceList): number {
  const p = list === 'WHOLESALE' ? item.wholesale_price : item.retail_price
  return p > 0 ? p : item.retail_price
}

export function lineGross(l: Pick<CartLine, 'qty' | 'unit_price'>): number {
  return round2(l.qty * l.unit_price)
}

export function lineTotal(l: Pick<CartLine, 'qty' | 'unit_price' | 'discount'>): number {
  return round2(lineGross(l) - round2(l.discount || 0))
}

export function cartTotals(lines: CartLine[], saleDiscount: number): CartTotals {
  let gross = 0
  let lineDiscounts = 0
  let subtotal = 0
  let units = 0
  for (const l of lines) {
    gross += lineGross(l)
    lineDiscounts += round2(l.discount || 0)
    subtotal += lineTotal(l)
    units += l.qty
  }
  subtotal = round2(subtotal)
  const discount = Math.min(round2(saleDiscount || 0), subtotal)
  return {
    gross: round2(gross),
    lineDiscounts: round2(lineDiscounts),
    subtotal,
    discount,
    discountTotal: round2(lineDiscounts + discount),
    total: round2(Math.max(subtotal - discount, 0)),
    units,
    lines: lines.length,
  }
}

/** Discount in percent of an amount → amount, rounded to cents. */
export function percentOf(amount: number, pct: number): number {
  return round2((amount * Math.min(Math.max(pct, 0), 100)) / 100)
}

// ── Cash ──────────────────────────────────────────────────────────────────

/** Bills / coins per currency, ascending. */
const DENOMINATIONS: Record<CostingCurrency, number[]> = {
  BOB: [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200],
  CLP: [10, 50, 100, 500, 1000, 2000, 5000, 10000, 20000],
  USD: [0.01, 0.05, 0.1, 0.25, 1, 5, 10, 20, 50, 100],
}

export function denominations(currency: CostingCurrency): number[] {
  return DENOMINATIONS[currency] ?? DENOMINATIONS.BOB
}

/**
 * Quick-tender buttons for a cash charge: the exact amount plus the next few
 * round amounts a customer typically hands over (e.g. 37.50 → 40, 50, 100).
 */
export function quickTenders(amount: number, currency: CostingCurrency, max = 4): number[] {
  if (amount <= 0) return []
  // The exact amount as is (CLP 46,30 stays 46,30): rounding it could leave it short.
  const out = new Set<number>([round2(amount)])
  const bills = denominations(currency).filter(d => d >= 1 || currency === 'USD')
  for (const b of bills) {
    if (b < amount / 10) continue
    const next = Math.ceil(amount / b - 1e-9) * b
    if (next >= amount) out.add(round2(next))
    if (out.size >= max) break
  }
  return [...out].sort((a, b) => a - b).slice(0, max)
}

// ── Identity ──────────────────────────────────────────────────────────────

/** RFC 4122 v4 uuid for the checkout idempotency key. */
export function newClientRef(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ── Presentation ──────────────────────────────────────────────────────────

export const KIND_ICON: Record<PaymentKind, string> = {
  CASH: 'pi pi-money-bill',
  CARD: 'pi pi-credit-card',
  QR: 'pi pi-qrcode',
  TRANSFER: 'pi pi-building-columns',
  CREDIT: 'pi pi-book',
  OTHER: 'pi pi-wallet',
}

export function kindIcon(kind: PaymentKind | string): string {
  return KIND_ICON[kind as PaymentKind] ?? KIND_ICON.OTHER
}

interface ApiErrorLike {
  code?: string
  message?: string
  errors?: { field: string; rule: string; context?: Record<string, unknown> }[]
  meta?: Record<string, unknown>
}

/**
 * Human messages for a v2 error of the sales API: one per validation detail
 * (translated by rule, with its context), or the error code's message.
 * Falls back to the server's English text, never to nothing.
 */
export function salesErrorMessages(err: unknown, translate: TranslateService): string[] {
  const body = ((err as { error?: ApiErrorLike })?.error ?? err) as ApiErrorLike
  const code = body?.code ?? ''
  const tr = (key: string, params?: Record<string, unknown>): string | null => {
    const v = translate.instant(key, params)
    return v && v !== key ? v : null
  }
  const details = body?.errors ?? []
  if (details.length > 0) {
    return details.map(d => {
      const ctx = { ...(d.context ?? {}), field: d.field }
      return (
        tr(`sales.rules.${d.rule}`, ctx) ??
        tr(`forms_validation.${d.rule}`, ctx) ??
        `${d.field}: ${d.rule}`
      )
    })
  }
  if (code) {
    const params = Object.fromEntries(
      Object.entries(body.meta ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v])
    )
    const msg = tr(`sales.errors.${code}`, params) ?? tr(`errors.${code}`, params)
    if (msg) return [msg]
  }
  return [body?.message || tr('sales.errors.UNKNOWN') || 'Error']
}
