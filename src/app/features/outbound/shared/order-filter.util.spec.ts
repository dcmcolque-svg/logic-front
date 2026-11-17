import {
  buildOrderApiFilter,
  hasFilterValue,
  withColumnFilter,
  withMultiselectFilter,
  orderSortField,
  mergeTableFilters,
  UiFilters,
} from './order-filter.util'

describe('order-filter.util', () => {
  // ── hasFilterValue ──────────────────────────────────────────────────────
  describe('hasFilterValue', () => {
    it('should return true for a non-empty string value', () => {
      expect(hasFilterValue({ value: 'abc' })).toBeTrue()
    })

    it('should return false for null value', () => {
      expect(hasFilterValue({ value: null })).toBeFalse()
    })

    it('should return false for undefined value', () => {
      expect(hasFilterValue({ value: undefined })).toBeFalse()
    })

    it('should return false for empty string value', () => {
      expect(hasFilterValue({ value: '' })).toBeFalse()
    })

    it('should return true for a Date value', () => {
      expect(hasFilterValue({ value: new Date('2026-11-30') })).toBeTrue()
    })

    it('should return true for an array value', () => {
      expect(hasFilterValue({ value: ['a', 'b'] })).toBeTrue()
    })

    it('should return false for null input', () => {
      expect(hasFilterValue(null)).toBeFalse()
    })

    it('should return false for undefined input', () => {
      expect(hasFilterValue(undefined)).toBeFalse()
    })
  })

  // ── buildOrderApiFilter ─────────────────────────────────────────────────
  describe('buildOrderApiFilter', () => {
    it('should skip entries with empty values', () => {
      const filters: UiFilters = {
        name: { value: '', matchMode: 'contains' },
        status: { value: null, matchMode: 'eq' },
      }
      const result = buildOrderApiFilter(filters)
      expect(Object.keys(result).length).toBe(0)
    })

    it('should map matchMode (camelCase) to match_mode (snake_case)', () => {
      const filters: UiFilters = {
        status: { value: 'PROCESSING', matchMode: 'eq' },
      }
      const result = buildOrderApiFilter(filters)
      expect(result['status']).toEqual({
        value: 'PROCESSING',
        match_mode: 'eq',
      })
    })

    it('should default match_mode to "contains" when not provided', () => {
      const filters: UiFilters = {
        order_number: { value: '4010' },
      }
      const result = buildOrderApiFilter(filters)
      expect(result['order_number']?.match_mode).toBe('contains')
    })

    it('should NOT format Date values when formatDates is false', () => {
      const date = new Date(2026, 10, 30) // Nov 30, 2026 local time
      const filters: UiFilters = {
        required_delivery_date: { value: date, matchMode: 'equals' },
      }
      const result = buildOrderApiFilter(filters, false)
      expect(result['required_delivery_date']?.value).toBe(date)
    })

    it('should format Date values as yyyy-MM-dd when formatDates is true', () => {
      const date = new Date(2026, 10, 30) // Nov 30, 2026 local time
      const filters: UiFilters = {
        required_delivery_date: { value: date, matchMode: 'equals' },
      }
      const result = buildOrderApiFilter(filters, true)
      // Should use local date components, not UTC
      expect(result['required_delivery_date']?.value).toBe('2026-11-30')
      expect(result['required_delivery_date']?.match_mode).toBe('equals')
    })

    it('should NOT format string values even when formatDates is true', () => {
      const filters: UiFilters = {
        status: { value: 'PROCESSING', matchMode: 'eq' },
      }
      const result = buildOrderApiFilter(filters, true)
      expect(result['status']?.value).toBe('PROCESSING')
    })

    it('should handle multiple filters mixing dates and strings', () => {
      const date = new Date(2026, 0, 15) // Jan 15, 2026
      const filters: UiFilters = {
        status: { value: 'PENDING', matchMode: 'eq' },
        created_at: { value: date, matchMode: 'equals' },
        order_number: { value: '1001', matchMode: 'contains' },
      }
      const result = buildOrderApiFilter(filters, true)
      expect(result['status']?.value).toBe('PENDING')
      expect(result['created_at']?.value).toBe('2026-01-15')
      expect(result['order_number']?.value).toBe('1001')
    })
  })

  // ── withColumnFilter ────────────────────────────────────────────────────
  describe('withColumnFilter', () => {
    it('should add a filter entry from a { value, matchMode } event', () => {
      const result = withColumnFilter({}, 'status', {
        value: 'PROCESSING',
        matchMode: 'eq',
      })
      expect(result['status']).toEqual({
        value: 'PROCESSING',
        matchMode: 'eq',
      })
    })

    it('should remove a filter entry when value is null', () => {
      const existing: UiFilters = {
        status: { value: 'PROCESSING', matchMode: 'eq' },
      }
      const result = withColumnFilter(existing, 'status', { value: null })
      expect(result['status']).toBeUndefined()
    })

    it('should remove a filter entry when value is empty string', () => {
      const existing: UiFilters = {
        order_number: { value: '123', matchMode: 'contains' },
      }
      const result = withColumnFilter(existing, 'order_number', { value: '' })
      expect(result['order_number']).toBeUndefined()
    })

    it('should not mutate the original filters object', () => {
      const original: UiFilters = { status: { value: 'A', matchMode: 'eq' } }
      const result = withColumnFilter(original, 'name', { value: 'B', matchMode: 'contains' })
      expect(original['name']).toBeUndefined()
      expect(result['name']).toBeDefined()
    })

    it('should default to "in" matchMode for array values', () => {
      const result = withColumnFilter({}, 'facility_id', {
        value: ['f1', 'f2'],
      })
      expect(result['facility_id']?.matchMode).toBe('in')
    })

    it('should default to "contains" matchMode for scalar values', () => {
      const result = withColumnFilter({}, 'order_number', { value: '100' })
      expect(result['order_number']?.matchMode).toBe('contains')
    })
  })

  // ── withMultiselectFilter ───────────────────────────────────────────────
  describe('withMultiselectFilter', () => {
    it('should set an "in" filter for non-empty values', () => {
      const result = withMultiselectFilter({}, 'facility_id', ['f1', 'f2'])
      expect(result['facility_id']).toEqual({
        value: ['f1', 'f2'],
        matchMode: 'in',
      })
    })

    it('should remove the filter for empty values', () => {
      const existing: UiFilters = {
        facility_id: { value: ['f1'], matchMode: 'in' },
      }
      const result = withMultiselectFilter(existing, 'facility_id', [])
      expect(result['facility_id']).toBeUndefined()
    })
  })

  // ── orderSortField ──────────────────────────────────────────────────────
  describe('orderSortField', () => {
    it('should return default sort when sort is undefined', () => {
      expect(orderSortField(undefined)).toEqual([
        { field: 'created_at', order: -1 },
      ])
    })

    it('should map "asc" to 1', () => {
      expect(orderSortField({ field: 'order_number', order: 'asc' })).toEqual([
        { field: 'order_number', order: 1 },
      ])
    })

    it('should map "desc" to -1', () => {
      expect(orderSortField({ field: 'created_at', order: 'desc' })).toEqual([
        { field: 'created_at', order: -1 },
      ])
    })
  })
})

/** Covers that the orders lists forward the AND/OR of custom filters to the API. */
describe('buildOrderApiFilter — custom filter combinators', () => {
  it('forwards operator and position, and omits them for plain filters', () => {
    const api = buildOrderApiFilter({
      order_number: { value: 'A1', matchMode: 'contains', operator: 'and', position: 1 },
      status: { value: ['BACKORDER'], matchMode: 'in', operator: 'or', position: 2 },
      priority: { value: 'HIGH', matchMode: 'equals' },
    })

    expect(api).toEqual({
      order_number: { value: 'A1', match_mode: 'contains', position: 1 },
      status: { value: ['BACKORDER'], match_mode: 'in', operator: 'or', position: 2 },
      priority: { value: 'HIGH', match_mode: 'equals' },
    })
  })

  it('a column filter typed over a preset filter replaces it, so it no longer takes part in the OR', () => {
    const merged = mergeTableFilters(
      { status: { value: ['BACKORDER'], matchMode: 'in', operator: 'or', position: 2 } },
      { status: { value: ['NEW'], matchMode: 'in' } },
    )

    expect(buildOrderApiFilter(merged)).toEqual({ status: { value: ['NEW'], match_mode: 'in' } })
  })
})
