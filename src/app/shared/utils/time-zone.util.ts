import { formatDate } from '@angular/common'
import { DateFormatName, DISPLAY_LOCALE, dateFormat } from './display-format'

/**
 * Time zones of the facilities.
 *
 * The backend stores instants; each facility has an IANA zone
 * (core_facilities.time_zone) that decides its local day and the time people
 * see. These helpers do that math in an arbitrary IANA zone, not the
 * browser's: an OWNER in Santiago looking at a La Paz store sees La Paz time.
 */

/** Zone of a facility without one, and of records without a facility. Same as the backend. */
export const DEFAULT_TIME_ZONE = 'America/La_Paz'

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatters.set(timeZone, f)
  }
  return f
}

/** True when the runtime knows `timeZone` as an IANA zone. */
export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false
  try {
    partsFormatter(timeZone)
    return true
  } catch {
    return false
  }
}

/** `timeZone` when valid, DEFAULT_TIME_ZONE otherwise. */
export function zoneOrDefault(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE
}

/** Wall-clock fields of `instant` in `timeZone`. */
function wallParts(instant: Date, timeZone: string) {
  const out: Record<string, number> = {}
  for (const p of partsFormatter(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return { y: out['year'], m: out['month'], d: out['day'], h: out['hour'], min: out['minute'], s: out['second'] }
}

/** Minutes east of UTC of `timeZone` at `instant` (La Paz: -240). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const w = wallParts(instant, timeZone)
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s)
  const whole = Math.floor(instant.getTime() / 1000) * 1000
  return Math.round((asUtc - whole) / 60000)
}

/** Offset as Angular's formatDate expects it: '-0400', '+0530'. */
function angularOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`
}

/**
 * Formats an instant in `timeZone` with a named format of display-format
 * ('dateTime', 'date', 'time', …) or an Angular pattern. The offset is taken at that instant, so a zone
 * with daylight saving time (America/Santiago) is right on both sides of the
 * change.
 */
export function formatInZone(
  value: string | number | Date | null | undefined,
  format: DateFormatName | string,
  timeZone: string
): string {
  if (value === null || value === undefined || value === '') return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const zone = zoneOrDefault(timeZone)
  return formatDate(date, dateFormat(format), DISPLAY_LOCALE, angularOffset(zoneOffsetMinutes(date, zone)))
}

/** A picked day (its local year/month/day) as yyyy-mm-dd, the day the backend resolves per facility. */
export function toApiDay(day: Date): string {
  const m = String(day.getMonth() + 1).padStart(2, '0')
  const d = String(day.getDate()).padStart(2, '0')
  return `${day.getFullYear()}-${m}-${d}`
}

/**
 * Today in `timeZone`, as a local-midnight Date of that calendar day, ready
 * for a date picker or for day arithmetic (setDate) before toApiDay.
 */
export function todayInZone(timeZone: string, now: Date = new Date()): Date {
  const w = wallParts(now, zoneOrDefault(timeZone))
  return new Date(w.y, w.m - 1, w.d)
}

/** IANA zones the runtime knows, for a zone picker. */
export function supportedTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  const zones = intl.supportedValuesOf?.('timeZone') ?? []
  return zones.length ? zones : [DEFAULT_TIME_ZONE, 'America/Santiago', 'UTC']
}

/** Short label of a zone: 'America/La_Paz' → 'La Paz'. */
export function zoneLabel(timeZone: string): string {
  const city = timeZone.split('/').pop() ?? timeZone
  return city.replace(/_/g, ' ')
}

/**
 * The calendar day a filter value stands for, when it is a picked day: a Date
 * or an ISO string at local midnight (what date pickers and the old
 * `formatDateForBackend` / `toISOString` paths produce). Anything else — a
 * yyyy-mm-dd of a date-only column, a datetime with a time, text — is null.
 */
function pickedDay(value: unknown): Date | null {
  let d: Date | null = null
  if (value instanceof Date) d = value
  else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) d = new Date(value)
  if (!d || Number.isNaN(d.getTime())) return null
  const midnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0
  return midnight ? d : null
}

/**
 * Sends the picked days of an outgoing API filter (`{ field: { value, … } }`)
 * as yyyy-mm-dd. The backend reads a yyyy-mm-dd on a facility timestamp as
 * that day in the zone of each row's facility (ApplyWhereDateIn), so a list
 * that mixes La Paz and Santiago, or a day with a daylight saving change, is
 * counted right. On a date-only column it is simply that date.
 *
 * Filter state on the page keeps the picker's value, so the date picker still
 * shows the day that was picked; call this only on the request. Idempotent.
 * Returns a new object; never mutates the input.
 */
export function facilityDayFilters<T extends object>(filter: T): T {
  const out: Record<string, unknown> = {}
  for (const [field, entry] of Object.entries(filter as Record<string, unknown>)) {
    const day =
      entry && typeof entry === 'object' && !Array.isArray(entry) && 'value' in entry
        ? pickedDay((entry as { value: unknown }).value)
        : null
    out[field] = day ? { ...(entry as object), value: toApiDay(day) } : entry
  }
  return out as T
}
