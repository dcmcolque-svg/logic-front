import { TranslateService } from '@ngx-translate/core'
import { ShColumnDef } from '../types/table.types'
import { buildFilterChipsFromColumns } from './filter-chips.util'

/**
 * Covers the chip bar builder: labels, display values and — added with the
 * custom filters — the AND/OR operator and the user-defined order.
 */
describe('buildFilterChipsFromColumns', () => {
  const translate = { instant: (key: string) => `t(${key})` } as unknown as TranslateService

  const columns: ShColumnDef[] = [
    { field: 'tracking', header: 'labels.tracking', filterable: true },
    {
      field: 'data_status',
      header: 'labels.status',
      filterable: true,
      filterType: 'multiselect',
      filterOptions: [
        { label: 'Late', value: 'late' },
        { label: 'On time', value: 'on_time' },
      ],
    },
    { field: 'created_at', header: 'labels.created_at', filterable: true, filterType: 'date' },
  ]

  it('returns no chips for missing filters', () => {
    expect(buildFilterChipsFromColumns(undefined as never, columns, translate)).toEqual([])
  })

  it('skips empty values', () => {
    const chips = buildFilterChipsFromColumns(
      { tracking: { value: '' }, data_status: { value: null }, created_at: { value: undefined }, x: null },
      columns,
      translate,
    )
    expect(chips).toEqual([])
  })

  it('defaults the operator to AND and sorts chips by position, unpositioned last', () => {
    const chips = buildFilterChipsFromColumns(
      {
        tracking: { value: '1Z' },
        data_status: { value: ['late'], operator: 'or', position: 2 },
        created_at: { value: '2026-09-01', position: 1 },
      },
      columns,
      translate,
    )

    expect(chips.map((c) => [c.field, c.operator, c.position])).toEqual([
      ['created_at', 'and', 1],
      ['data_status', 'or', 2],
      ['tracking', 'and', Number.MAX_SAFE_INTEGER],
    ])
  })

  it('translates the column header, or labels.<field> for unknown columns', () => {
    const chips = buildFilterChipsFromColumns({ tracking: { value: 'a' }, other: { value: 'b' } }, columns, translate)

    expect(chips.map((c) => c.label)).toEqual(['t(labels.tracking)', 't(labels.other)'])
  })

  it('resolves multiselect values through filterOptions, falling back to the raw value', () => {
    const [chip] = buildFilterChipsFromColumns({ data_status: { value: ['late', 'unknown'] } }, columns, translate)
    expect(chip.displayValue).toBe('Late, unknown')
  })

  it('resolves a scalar value through filterOptions', () => {
    const [chip] = buildFilterChipsFromColumns({ data_status: { value: 'on_time' } }, columns, translate)
    expect(chip.displayValue).toBe('On time')
  })

  it('prefers a custom label resolver for arrays and scalars', () => {
    const resolvers = { data_status: (v: unknown) => `<${v}>`, tracking: (v: unknown) => `#${v}` }

    const chips = buildFilterChipsFromColumns(
      { data_status: { value: ['late'] }, tracking: { value: '1Z' } },
      columns,
      translate,
      resolvers,
    )

    expect(chips.map((c) => c.displayValue)).toEqual(['<late>', '#1Z'])
  })

  it('formats dates as yyyy-MM-dd', () => {
    const chips = buildFilterChipsFromColumns(
      {
        created_at: { value: new Date('2026-09-05T15:00:00Z') },
        updated_at: { value: '2026-09-06T08:30:00.000Z' },
      },
      columns,
      translate,
    )
    expect(chips.map((c) => c.displayValue)).toEqual(['2026-09-05', '2026-09-06'])
  })

  it('joins plain arrays and stringifies other scalars', () => {
    const chips = buildFilterChipsFromColumns(
      { ids: { value: [1, 2] }, qty: { value: 0 }, tracking: { value: '2026-09' } },
      columns,
      translate,
    )
    expect(chips.map((c) => c.displayValue)).toEqual(['1, 2', '0', '2026-09'])
  })
})
