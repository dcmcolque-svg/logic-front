/**
 * Formats a Date object to a full ISO 8601 string with the local timezone offset.
 * e.g. "2026-05-22T00:00:00.000-04:00" (Bolivia, UTC-4)
 *
 * Uses the local date components (year/month/day/time) and appends the
 * browser's timezone offset so the backend receives the exact local time
 * without any UTC shift.
 */
export function formatDateForBackend(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  const hours = String(value.getHours()).padStart(2, '0')
  const minutes = String(value.getMinutes()).padStart(2, '0')
  const seconds = String(value.getSeconds()).padStart(2, '0')
  const ms = String(value.getMilliseconds()).padStart(3, '0')

  // getTimezoneOffset() returns minutes WEST of UTC (positive = behind UTC)
  const offsetMinutes = value.getTimezoneOffset()
  const sign = offsetMinutes <= 0 ? '+' : '-'
  const absOffset = Math.abs(offsetMinutes)
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, '0')
  const offsetMins = String(absOffset % 60).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}${sign}${offsetHours}:${offsetMins}`
}

/**
 * Parses a YYYY-MM-DD string back into a Date object in the local timezone.
 */
export function parseDateFromBackend(val: string | null | undefined): Date | null {
  if (!val) return null
  const dateStr = val.includes('T') ? val : `${val}T00:00:00`
  const d = new Date(dateStr)
  return Number.isNaN(d.getTime()) ? null : d
}
