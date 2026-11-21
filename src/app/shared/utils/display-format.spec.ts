import { dateFormat, formatDisplayDate, formatDisplayNumber } from './display-format'
import { formatInZone } from './time-zone.util'

describe('display-format', () => {
  it('resolves named formats and passes patterns through', () => {
    expect(dateFormat('dateTime')).toBe('yyyy-MM-dd HH:mm')
    expect(dateFormat('date')).toBe('yyyy-MM-dd')
    expect(dateFormat('time')).toBe('HH:mm')
    expect(dateFormat('yyyyMMdd')).toBe('yyyyMMdd')
  })

  it('writes dates as ISO, 24 h, never mm/dd', () => {
    expect(formatDisplayDate('2026-11-20T15:45:00Z', 'dateTime', 'UTC')).toBe('2026-11-20 15:45')
    expect(formatInZone('2026-11-20T19:45:00Z', 'dateTime', 'America/La_Paz')).toBe('2026-11-20 15:45')
  })

  it('keeps a date-only value on its day with UTC', () => {
    expect(formatDisplayDate('2026-03-01', 'date', 'UTC')).toBe('2026-03-01')
  })

  it('returns empty for missing or invalid values', () => {
    expect(formatDisplayDate(null)).toBe('')
    expect(formatDisplayDate('nope')).toBe('')
  })

  it('writes numbers with dot thousands and comma decimals', () => {
    expect(formatDisplayNumber(1234.5, 2)).toBe('1.234,50')
    expect(formatDisplayNumber(1234567)).toBe('1.234.567')
    expect(formatDisplayNumber(0.123456, 0, 6)).toBe('0,123456')
  })
})
