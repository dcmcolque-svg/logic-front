import { formatInZone } from '@/app/shared/utils/time-zone.util'
import { formatDisplayDate } from '@/app/shared/utils/display-format'
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

/**
 * Date for display (yyyy-MM-dd), or an em dash when empty. An instant is shown
 * in `timeZone` (the order's facility zone); a date-only value (yyyy-mm-dd)
 * has no zone and is shown as is.
 */
export function formatOrderDate(dateStr: string | undefined | null, timeZone?: string): string {
  if (!dateStr) return '—'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
  const out = dateOnly
    ? formatDisplayDate(dateStr, 'date', 'UTC')
    : timeZone
      ? formatInZone(dateStr, 'date', timeZone)
      : formatDisplayDate(dateStr, 'date')
  return out || dateStr
}

/** Keeps date values as real dates so xlsx gets date cells, not strings. */
export function toExportDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
