/**
 * Printable sale receipt and cash-register report (80 mm thermal friendly).
 * Rendered as standalone HTML in a hidden iframe, so printing never depends
 * on the app layout or its styles.
 */
import { CostingCurrency } from '@/app/shared/utils/costing.util'
import { DEFAULT_TIME_ZONE, formatInZone } from '@/app/shared/utils/time-zone.util'
import { CustomerPaymentResult, SaleDetail, SessionSummary } from '../sales.types'
import { money } from '../sales.util'

export interface PrintLabels {
  [key: string]: string
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const STYLE = `
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; color: #000; margin: 0; padding: 8px; width: 80mm; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 2px; }
  .c { text-align: center; } .r { text-align: right; } .b { font-weight: 700; }
  .muted { color: #444; font-size: 11px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .big { font-size: 16px; font-weight: 700; }
  @page { size: 80mm auto; margin: 0; }
`

function printHtml(title: string, body: string): void {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  if (!doc) return
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`)
  doc.close()
  const win = iframe.contentWindow
  setTimeout(() => {
    win?.focus()
    win?.print()
    setTimeout(() => iframe.remove(), 1000)
  }, 50)
}

/**
 * Date and time of an instant in the facility's zone (a receipt shows the
 * store's time), as yyyy-MM-dd HH:mm whatever the UI language: a locale
 * format reads as mm/dd in English, which is ambiguous in Bolivia and Chile.
 */
function fmtDate(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return ''
  return formatInZone(iso, 'dateTime', timeZone) || iso
}

/** timeZone: the sale's facility zone (FacilityScopeService.zoneOf). */
export function printReceipt(sale: SaleDetail, t: PrintLabels, timeZone = DEFAULT_TIME_ZONE): void {
  const cur = sale.currency as CostingCurrency
  const m = (v: number) => esc(money(v, cur))
  const lines = sale.items
    .map(
      l => `<tr><td colspan="2">${esc(l.sku_name || l.sku_code)}</td></tr>
        <tr><td class="muted">${esc(l.qty)} × ${m(l.unit_price)}${l.discount > 0 ? ` − ${m(l.discount)}` : ''}</td>
        <td class="r">${m(l.line_total)}</td></tr>`
    )
    .join('')
  const pays = sale.payments
    .map(
      p => `<tr><td>${esc(p.method_name)}${p.reference ? ` <span class="muted">#${esc(p.reference)}</span>` : ''}</td>
        <td class="r">${m(p.amount)}</td></tr>
        ${p.received > p.amount ? `<tr><td class="muted">${esc(t['received'])}</td><td class="r muted">${m(p.received)}</td></tr>` : ''}`
    )
    .join('')
  // The invoicing name (razón social) when the customer has one.
  const customerName = sale.customer_business_name || sale.customer_name
  const customer = customerName
    ? `<div>${esc(t['customer'])}: ${esc(customerName)}${sale.customer_doc ? ` · ${esc(sale.customer_doc)}` : ''}</div>`
    : ''
  const body = `
    <h1>${esc(sale.facility_name)}</h1>
    <div class="c muted">${esc(t['receipt'])} ${esc(sale.sale_number)}</div>
    <div class="c muted">${esc(fmtDate(sale.created_at, timeZone))}</div>
    <hr>
    <div>${esc(t['cashier'])}: ${esc(sale.user_name ?? '')} · ${esc(sale.session_number)}</div>
    ${customer}
    <hr>
    <table>${lines}</table>
    <hr>
    <table>
      <tr><td>${esc(t['subtotal'])}</td><td class="r">${m(sale.subtotal)}</td></tr>
      ${sale.discount_total > 0 ? `<tr><td>${esc(t['discount'])}</td><td class="r">− ${m(sale.discount_total)}</td></tr>` : ''}
      <tr class="big"><td>${esc(t['total'])}</td><td class="r">${m(sale.total)}</td></tr>
    </table>
    <hr>
    <table>${pays}</table>
    ${sale.change_amount > 0 ? `<table><tr class="b"><td>${esc(t['change'])}</td><td class="r">${m(sale.change_amount)}</td></tr></table>` : ''}
    <hr>
    <div class="c muted">${esc(sale.units)} ${esc(t['units'])}</div>
    <div class="c">${esc(t['thanks'])}</div>`
  printHtml(`${t['receipt']} ${sale.sale_number}`, body)
}

/** timeZone: the session's facility zone (FacilityScopeService.zoneOf). */
export function printSessionReport(s: SessionSummary, t: PrintLabels, timeZone = DEFAULT_TIME_ZONE): void {
  const cur = s.session.currency as CostingCurrency
  const m = (v: number | null | undefined) => esc(money(v ?? 0, cur))
  const methods = s.methods
    .map(x => `<tr><td>${esc(x.method_name)} <span class="muted">(${esc(x.payments)})</span></td><td class="r">${m(x.amount)}</td></tr>`)
    .join('')
  const moves = s.movements
    .map(
      x => `<tr><td>${x.kind === 'IN' ? '+' : '−'} ${esc(x.reason)}</td><td class="r">${m(x.amount)}</td></tr>`
    )
    .join('')
  const collections = (s.collections ?? [])
    .map(x => `<tr><td>${esc(x.method_name)} <span class="muted">(${esc(x.payments)})</span></td><td class="r">${m(x.amount)}</td></tr>`)
    .join('')
  const closed = s.session.status === 'CLOSED'
  const body = `
    <h1>${esc(s.session.facility_name)}</h1>
    <div class="c b">${esc(t['report'])} ${esc(s.session.session_number)}</div>
    <div class="c muted">${esc(s.session.user_name ?? '')}</div>
    <div class="c muted">${esc(fmtDate(s.session.opened_at, timeZone))}${closed ? ` → ${esc(fmtDate(s.session.closed_at, timeZone))}` : ''}</div>
    <hr>
    <table>
      <tr><td>${esc(t['sales'])}</td><td class="r">${esc(s.sales_count)}</td></tr>
      <tr><td>${esc(t['total_sold'])}</td><td class="r">${m(s.sales_total)}</td></tr>
      <tr><td>${esc(t['discounts'])}</td><td class="r">${m(s.discounts)}</td></tr>
    </table>
    <hr>
    <div class="b">${esc(t['by_method'])}</div>
    <table>${methods || `<tr><td class="muted">—</td></tr>`}</table>
    ${collections ? `<hr><div class="b">${esc(t['collections'])}</div><table>${collections}</table>` : ''}
    <hr>
    <div class="b">${esc(t['drawer'])}</div>
    <table>
      <tr><td>${esc(t['opening'])}</td><td class="r">${m(s.session.opening_amount)}</td></tr>
      <tr><td>+ ${esc(t['cash_sales'])}</td><td class="r">${m(s.cash_sales)}</td></tr>
      ${s.cash_collections ? `<tr><td>+ ${esc(t['cash_collections'])}</td><td class="r">${m(s.cash_collections)}</td></tr>` : ''}
      <tr><td>+ ${esc(t['cash_in'])}</td><td class="r">${m(s.cash_in)}</td></tr>
      <tr><td>− ${esc(t['cash_out'])}</td><td class="r">${m(s.cash_out)}</td></tr>
      <tr class="b"><td>${esc(t['expected'])}</td><td class="r">${m(s.expected)}</td></tr>
      ${closed ? `<tr><td>${esc(t['counted'])}</td><td class="r">${m(s.session.counted_amount)}</td></tr>
      <tr class="b"><td>${esc(t['difference'])}</td><td class="r">${m(s.session.difference)}</td></tr>` : ''}
    </table>
    ${moves ? `<hr><div class="b">${esc(t['movements'])}</div><table>${moves}</table>` : ''}
    ${s.session.closing_note ? `<hr><div class="muted">${esc(s.session.closing_note)}</div>` : ''}
    <br><br><div class="c">______________________</div><div class="c muted">${esc(t['signature'])}</div>`
  printHtml(`${t['report']} ${s.session.session_number}`, body)
}

/** Receipt of a payment towards a customer's debt. */
export function printPaymentReceipt(r: CustomerPaymentResult, t: PrintLabels, timeZone = DEFAULT_TIME_ZONE): void {
  const p = r.payment
  const m = (v: number | null | undefined) => esc(money(v ?? 0, p.currency))
  const body = `
    <h1>${esc(p.facility_name)}</h1>
    <div class="c b">${esc(t['payment_receipt'])}</div>
    <div class="c muted">${esc(fmtDate(p.created_at, timeZone))}</div>
    <hr>
    <div>${esc(t['customer'])}: ${esc(p.customer_name)}${p.customer_doc ? ` · ${esc(p.customer_doc)}` : ''}</div>
    <div>${esc(t['cashier'])}: ${esc(p.user_name ?? '')}${p.session_number ? ` · ${esc(p.session_number)}` : ''}</div>
    <hr>
    <table>
      <tr class="big"><td>${esc(t['paid'])}</td><td class="r">${m(p.amount)}</td></tr>
      <tr><td>${esc(p.method_name)}${p.reference ? ` <span class="muted">#${esc(p.reference)}</span>` : ''}</td><td class="r">${m(p.received)}</td></tr>
      ${p.change_amount > 0 ? `<tr class="b"><td>${esc(t['change'])}</td><td class="r">${m(p.change_amount)}</td></tr>` : ''}
    </table>
    <hr>
    <table><tr class="b"><td>${esc(t['balance_after'])}</td><td class="r">${m(r.balance_after)}</td></tr></table>
    ${p.note ? `<div class="muted">${esc(p.note)}</div>` : ''}
    <br><br><div class="c">______________________</div><div class="c muted">${esc(t['signature'])}</div>`
  printHtml(t['payment_receipt'], body)
}

/** i18n keys used by the printouts, resolved once by the caller. */
export const RECEIPT_KEYS = ['receipt', 'cashier', 'customer', 'subtotal', 'discount', 'total', 'received', 'change', 'units', 'thanks']
export const REPORT_KEYS = [
  'report', 'sales', 'total_sold', 'discounts', 'by_method', 'drawer', 'opening', 'cash_sales',
  'cash_in', 'cash_out', 'expected', 'counted', 'difference', 'movements', 'signature',
  'collections', 'cash_collections',
]
export const PAYMENT_RECEIPT_KEYS = ['payment_receipt', 'customer', 'cashier', 'paid', 'change', 'balance_after', 'signature']

export function printLabels(keys: string[], instant: (k: string) => string): PrintLabels {
  return Object.fromEntries(keys.map(k => [k, instant(`sales.print.${k}`)]))
}
