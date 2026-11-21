/**
 * How dates and numbers are written on screen, in one place.
 *
 * Screens name a format ('dateTime', 'date', 'time', …) instead of writing a
 * pattern, and numbers go through DISPLAY_LOCALE (Angular's LOCALE_ID, see
 * app.config). Moving to a per-user or per-company region later is a change
 * here, not in every screen.
 *
 * Dates are ISO (yyyy-MM-dd, 24 h): unambiguous in Bolivia, Chile and the US.
 * Angular's 'short' / 'medium' formats depend on the locale (en-US prints
 * mm/dd/yy with AM/PM) and are not used for display.
 *
 * Exports (table-export.service) keep their own ISO format and raw numbers on
 * purpose: a file must read the same in any country.
 */
import { formatDate, formatNumber, registerLocaleData } from '@angular/common'
import localeEsBO from '@angular/common/locales/es-BO'

/** Locale for numbers (1.234,56) and Angular's LOCALE_ID. */
export const DISPLAY_LOCALE = 'es-BO'

// Registered on import, so any code (and any spec) that formats through this
// module has the locale data, not only the bootstrapped app.
registerLocaleData(localeEsBO)

export const DATE_FORMATS = {
  date: 'yyyy-MM-dd',
  time: 'HH:mm',
  timeSec: 'HH:mm:ss',
  dateTime: 'yyyy-MM-dd HH:mm',
  dateTimeSec: 'yyyy-MM-dd HH:mm:ss',
} as const

export type DateFormatName = keyof typeof DATE_FORMATS

/** The pattern of a named format; any other string is taken as a pattern. */
export function dateFormat(format: DateFormatName | string): string {
  return (DATE_FORMATS as Record<string, string>)[format] ?? format
}

/** PrimeNG DatePicker pattern for DATE_FORMATS.date (set globally in TranslateLanService). */
export const DATEPICKER_FORMAT = 'yy-mm-dd'

/**
 * A value without a facility, in a named format. `timeZone` is an Angular zone
 * ('UTC', '+0300'); without it, the browser's. Date-only values (yyyy-mm-dd)
 * go with 'UTC' so they do not move to the previous day west of Greenwich.
 */
export function formatDisplayDate(
  value: string | number | Date | null | undefined,
  format: DateFormatName | string = 'dateTime',
  timeZone?: string
): string {
  if (value === null || value === undefined || value === '') return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatDate(date, dateFormat(format), DISPLAY_LOCALE, timeZone)
}

/** A number in DISPLAY_LOCALE with minFraction..maxFraction decimals: 1.234,5. */
export function formatDisplayNumber(value: number, minFraction = 0, maxFraction = minFraction): string {
  return formatNumber(value, DISPLAY_LOCALE, `1.${minFraction}-${Math.max(minFraction, maxFraction)}`)
}
