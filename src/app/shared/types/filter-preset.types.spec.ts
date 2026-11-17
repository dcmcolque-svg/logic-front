import { buildFiltersFromConditions, FilterCondition, presetCombinator } from './filter-preset.types'

describe('buildFiltersFromConditions', () => {
  it('returns an empty record for no conditions', () => {
    expect(buildFiltersFromConditions([])).toEqual({})
  })

  it('keys each condition by field and keeps value, matchMode, operator and position', () => {
    const conditions: FilterCondition[] = [
      { field: 'data_status', matchMode: 'in', value: ['late'], operator: 'and', position: 1 },
      { field: 'tracking', matchMode: 'contains', value: '1Z', operator: 'or', position: 2 },
    ]

    expect(buildFiltersFromConditions(conditions)).toEqual({
      data_status: { value: ['late'], matchMode: 'in', operator: 'and', position: 1 },
      tracking: { value: '1Z', matchMode: 'contains', operator: 'or', position: 2 },
    })
  })

  it('defaults a missing operator to AND and a missing position to the 1-based index', () => {
    const filters = buildFiltersFromConditions([
      { field: 'a', matchMode: 'equals', value: 1 },
      { field: 'b', matchMode: 'equals', value: 2 },
    ])

    expect(filters['a']).toEqual({ value: 1, matchMode: 'equals', operator: 'and', position: 1 })
    expect(filters['b']).toEqual({ value: 2, matchMode: 'equals', operator: 'and', position: 2 })
  })

  it('keeps an explicit position even when it differs from the index', () => {
    const filters = buildFiltersFromConditions([{ field: 'a', matchMode: 'equals', value: 1, position: 5 }])
    expect(filters['a'].position).toBe(5)
  })

  it('lets a later condition on the same field win', () => {
    const filters = buildFiltersFromConditions([
      { field: 'a', matchMode: 'equals', value: 1 },
      { field: 'a', matchMode: 'gte', value: 2 },
    ])
    expect(filters).toEqual({ a: { value: 2, matchMode: 'gte', operator: 'and', position: 2 } })
  })

  it('does not copy falsy-but-valid values away', () => {
    const filters = buildFiltersFromConditions([{ field: 'qty', matchMode: 'equals', value: 0 }])
    expect(filters['qty'].value).toBe(0)
  })
})

describe('presetCombinator', () => {
  it('forwards OR and a valid position', () => {
    expect(presetCombinator({ operator: 'or', position: 2 })).toEqual({ operator: 'or', position: 2 })
  })

  it('does not send AND, the default', () => {
    expect(presetCombinator({ operator: 'and', position: 1 })).toEqual({ position: 1 })
  })

  it('drops missing, zero, negative, fractional and "unpositioned" positions', () => {
    for (const position of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER, NaN]) {
      expect(presetCombinator({ operator: 'or', position })).withContext(String(position)).toEqual({ operator: 'or' })
    }
  })

  it('tolerates filters without combinator', () => {
    expect(presetCombinator(undefined)).toEqual({})
    expect(presetCombinator(null)).toEqual({})
    expect(presetCombinator({})).toEqual({})
  })
})
