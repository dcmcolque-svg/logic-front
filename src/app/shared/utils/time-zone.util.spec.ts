import {
  DEFAULT_TIME_ZONE,
  facilityDayFilters,
  formatInZone,
  isValidTimeZone,
  todayInZone,
  toApiDay,
  zoneLabel,
  zoneOffsetMinutes,
  zoneOrDefault,
} from './time-zone.util'

describe('time-zone.util', () => {
  describe('zoneOffsetMinutes', () => {
    it('reads a fixed zone and both sides of a DST change', () => {
      expect(zoneOffsetMinutes(new Date('2026-11-19T12:00:00Z'), 'America/La_Paz')).toBe(-240)
      expect(zoneOffsetMinutes(new Date('2026-11-19T12:00:00Z'), 'America/Santiago')).toBe(-180)
      expect(zoneOffsetMinutes(new Date('2026-07-01T12:00:00Z'), 'America/Santiago')).toBe(-240)
    })
  })

  describe('toApiDay', () => {
    it('sends the picked calendar day, whatever the browser zone', () => {
      expect(toApiDay(new Date(2026, 10, 19))).toBe('2026-11-19')
      expect(toApiDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    })
  })

  describe('formatInZone', () => {
    it('formats the instant in the facility zone', () => {
      const v = '2026-11-19T12:00:00Z'
      expect(formatInZone(v, 'dateTime', 'America/La_Paz')).toBe('2026-11-19 08:00')
      expect(formatInZone(v, 'dateTime', 'America/Santiago')).toBe('2026-11-19 09:00')
    })

    it('moves the date across midnight', () => {
      expect(formatInZone('2026-11-20T02:30:00Z', 'yyyy-MM-dd', 'America/La_Paz')).toBe('2026-11-19')
    })

    it('returns empty for empty or invalid values', () => {
      expect(formatInZone(null, 'short', 'America/La_Paz')).toBe('')
      expect(formatInZone('nope', 'short', 'America/La_Paz')).toBe('')
    })
  })

  describe('todayInZone', () => {
    it('is the calendar day of the facility', () => {
      const now = new Date('2026-11-20T03:30:00Z') // 23:30 in La Paz, 00:30 in Santiago
      const lpz = todayInZone('America/La_Paz', now)
      const scl = todayInZone('America/Santiago', now)
      expect([lpz.getFullYear(), lpz.getMonth(), lpz.getDate()]).toEqual([2026, 10, 19])
      expect([scl.getFullYear(), scl.getMonth(), scl.getDate()]).toEqual([2026, 10, 20])
    })
  })

  it('validates zones and builds labels', () => {
    expect(isValidTimeZone('America/Santiago')).toBeTrue()
    expect(isValidTimeZone('Mars/Base')).toBeFalse()
    expect(isValidTimeZone('')).toBeFalse()
    expect(zoneOrDefault(undefined)).toBe(DEFAULT_TIME_ZONE)
    expect(zoneLabel('America/La_Paz')).toBe('La Paz')
  })
})

describe('facilityDayFilters', () => {
  const day = new Date(2026, 10, 19) // local midnight of the browser running the tests

  it('sends picked days as yyyy-mm-dd and leaves the rest', () => {
    const out: Record<string, { value: unknown; match_mode?: string }> = facilityDayFilters({
      created_at: { value: day, match_mode: 'gte' },
      updated_at: { value: day.toISOString(), match_mode: 'lte' },
      expir: { value: '2026-11-19', match_mode: 'equals' },
      status: { value: 'OPEN', match_mode: 'equals' },
      facility_id: { value: ['a', 'b'], match_mode: 'in' },
    })
    expect(out['created_at']).toEqual({ value: '2026-11-19', match_mode: 'gte' })
    expect(out['updated_at']).toEqual({ value: '2026-11-19', match_mode: 'lte' })
    expect(out['expir'].value).toBe('2026-11-19')
    expect(out['status'].value).toBe('OPEN')
    expect(out['facility_id'].value).toEqual(['a', 'b'])
  })

  it('leaves a datetime with a time alone and is idempotent', () => {
    const at = new Date(2026, 10, 19, 15, 30)
    expect(facilityDayFilters({ t: { value: at } })['t'].value).toBe(at)
    const once = facilityDayFilters({ d: { value: day } })
    expect(facilityDayFilters(once)).toEqual(once)
  })
})
