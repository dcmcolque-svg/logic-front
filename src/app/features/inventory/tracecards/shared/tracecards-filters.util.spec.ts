import { toApiFilter, withColumnFilter, withTimestampFilter } from './tracecards-filters.util'

/** Covers that tracecards forwards the AND/OR of custom filters to the API. */
describe('tracecards toApiFilter — custom filter combinators', () => {
  it('forwards operator and position through the field map, and omits them for plain filters', () => {
    expect(
      toApiFilter(
        {
          sku: { value: 'SKU-1', matchMode: 'contains', operator: 'and', position: 1 },
          facility_name: { value: ['f1'], matchMode: 'in', operator: 'or', position: 2 },
          lot: { value: 'L9', match_mode: 'equals' },
          uom: { value: null },
        },
        { facility_name: 'facility_id' },
      ),
    ).toEqual({
      sku: { value: 'SKU-1', match_mode: 'contains', position: 1 },
      facility_id: { value: ['f1'], match_mode: 'in', operator: 'or', position: 2 },
      lot: { value: 'L9', match_mode: 'equals' },
    })
  })
})

// The history's Fecha/Hora filter is on a timestamp: the picked day has to reach
// the backend as the instant of its local midnight, which ApplyWhereDate turns
// into [midnight, midnight + 24h). A bare yyyy-mm-dd would be read as a UTC day.

describe('withTimestampFilter', () => {
  // Local midnight, whatever zone the browser running the tests is in.
  const picked = new Date(2026, 9, 22)

  it('sends the picked day as the instant of its local midnight', () => {
    const filters = withTimestampFilter({}, 'created_at', { value: picked, matchMode: 'equals' })

    expect(filters['created_at']).toEqual({ value: picked.toISOString(), matchMode: 'equals' })
    expect(toApiFilter<Record<string, unknown>>(filters)['created_at']).toEqual({
      value: picked.toISOString(),
      match_mode: 'equals',
    })
  })

  it('keeps the range match modes', () => {
    expect(withTimestampFilter({}, 'created_at', { value: picked, matchMode: 'gte' })['created_at']?.matchMode).toBe('gte')
    expect(withTimestampFilter({}, 'created_at', { value: picked, matchMode: 'lte' })['created_at']?.matchMode).toBe('lte')
  })

  it('defaults to equals, not the text default contains', () => {
    expect(withTimestampFilter({}, 'created_at', picked)['created_at']).toEqual({
      value: picked.toISOString(),
      matchMode: 'equals',
    })
  })

  it('clears the filter and leaves the others alone', () => {
    const others = { transaction_type: { value: 'OUTBOUND', matchMode: 'contains' } }
    const filtered = withTimestampFilter(others, 'created_at', { value: picked, matchMode: 'equals' })

    expect(withTimestampFilter(filtered, 'created_at', null)).toEqual(others)
  })

  it('leaves date-only columns on yyyy-mm-dd', () => {
    const filters = withColumnFilter({}, 'expir', { value: picked, matchMode: 'equals' })
    expect(filters['expir']?.value).toBe(picked.toISOString().split('T')[0])
  })
})
