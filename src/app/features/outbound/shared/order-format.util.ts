import { Order } from '../types/order.types'

/** Recipient full name from the ship-to address, or an em dash when empty. */
export function orderRecipientName(order: Order | null | undefined): string {
  const a = order?.ship_to_address
  if (!a) return '—'
  return [a.first_name, a.last_name].filter(Boolean).join(' ') || '—'
}

/** Recipient plus city/country, mirroring the two-line ship_to cell. */
export function orderShipToLabel(order: Order): string {
  const name = orderRecipientName(order)
  const place = [order.ship_to_address?.city, order.ship_to_address?.country]
    .filter(Boolean)
    .join(', ')
  return place ? `${name} (${place})` : name
}

/** Short `Mon DD, YYYY` date for display, or an em dash when empty. */
export function formatOrderDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    })
  } catch {
    return dateStr
  }
}

/** Keeps date values as real dates so xlsx gets date cells, not strings. */
export function toExportDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
