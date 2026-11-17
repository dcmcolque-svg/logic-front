import { ScopeFacility } from '@/app/core/types/facility.types'
import { ShColumnDef } from '../types/table.types'
import {
  FACILITY_COLUMN_FIELDS,
  OUT_OF_SCOPE_FACILITY_ID,
  dropFacilityFilters,
  facilityFieldsIn,
  isFacilityColumn,
  scopeApiFilter,
  scopeColumns,
  FACILITY_SCOPE_FIELD,
} from './facility-scope.util'

/** Loose filter payload, as modules build it — keeps jasmine's typing honest. */
type Filters = Record<string, unknown>

const MIAMI: ScopeFacility = { id: 'f1', name: 'Miami' }
const DALLAS: ScopeFacility = { id: 'f2', name: 'Dallas' }
const LA: ScopeFacility = { id: 'f3', name: 'LA' }

function cols(): ShColumnDef[] {
  return [
    { field: 'tracking', header: 'labels.tracking' },
    {
      field: 'facility_id',
      header: 'labels.facility',
      filterable: true,
      filterType: 'multiselect',
      filterOptions: [{ label: 'stale', value: 'f9' }],
    },
    { field: 'status', header: 'labels.status' },
  ]
}

describe('facility-scope.util', () => {
  describe('isFacilityColumn / facilityFieldsIn', () => {
    it('recognises both naming conventions used across the app', () => {
      expect(isFacilityColumn({ field: 'facility_id', header: '' })).toBe(true)
      expect(isFacilityColumn({ field: 'facility_name', header: '' })).toBe(true)
      expect(isFacilityColumn({ field: 'name', header: '' })).toBe(false)
    })

    it("recognises webhooks' plain `facility` column", () => {
      expect(isFacilityColumn({ field: 'facility', header: '' })).toBe(true)
      expect(FACILITY_COLUMN_FIELDS).toContain('facility')
    })

    it('lists the facility fields present in a column set', () => {
      expect(facilityFieldsIn(cols())).toEqual(['facility_id'])
      expect(facilityFieldsIn([{ field: 'sku', header: '' }])).toEqual([])
    })
  })

  describe('scopeColumns', () => {
    it('drops the facility column when a single facility is in scope', () => {
      const result = scopeColumns(cols(), { isSingle: true, inScope: [MIAMI] })
      expect(result.map((c) => c.field)).toEqual(['tracking', 'status'])
    })

    it('keeps the column and narrows its options when several are in scope', () => {
      const result = scopeColumns(cols(), {
        isSingle: false,
        inScope: [MIAMI, DALLAS],
      })
      const facility = result.find((c) => c.field === 'facility_id')!
      expect(facility.filterOptions).toEqual([
        { label: 'Miami', value: 'f1' },
        { label: 'Dallas', value: 'f2' },
      ])
    })

    it('offers every facility when the scope is unrestricted', () => {
      const result = scopeColumns(cols(), {
        isSingle: false,
        inScope: [MIAMI, DALLAS, LA],
      })
      const facility = result.find((c) => c.field === 'facility_id')!
      expect(facility.filterOptions?.length).toBe(3)
    })

    it("preserves parcels' __NULL__ sentinel while narrowing real facilities", () => {
      const withSentinel: ShColumnDef[] = [
        {
          field: 'facility_id',
          header: 'labels.facility',
          filterable: true,
          filterOptions: [
            { label: 'No facility', value: '__NULL__' },
            { label: 'stale', value: 'f9' },
          ],
        },
      ]
      const result = scopeColumns(withSentinel, {
        isSingle: false,
        inScope: [MIAMI],
      })
      expect(result[0].filterOptions).toEqual([
        { label: 'No facility', value: '__NULL__' },
        { label: 'Miami', value: 'f1' },
      ])
    })

    it('does not mutate the columns it is given', () => {
      const input = cols()
      const snapshot = JSON.stringify(input)
      scopeColumns(input, { isSingle: false, inScope: [MIAMI] })
      expect(JSON.stringify(input)).toBe(snapshot)
    })

    it('returns the original array when there is no facility column', () => {
      const plain: ShColumnDef[] = [{ field: 'sku', header: '' }]
      expect(scopeColumns(plain, { isSingle: true, inScope: [] })).toBe(plain)
    })

    it('leaves non-filterable facility columns untouched when multiple', () => {
      const readOnly: ShColumnDef[] = [
        { field: 'facility_id', header: '', filterable: false },
      ]
      const result = scopeColumns(readOnly, { isSingle: false, inScope: [MIAMI] })
      expect(result[0].filterOptions).toBeUndefined()
    })
  })

  describe('dropFacilityFilters', () => {
    it('removes every facility key and keeps the rest', () => {
      const result = dropFacilityFilters<Filters>({
        facility_id: { value: ['f1'] },
        facility_name: { value: 'Miami' },
        facility: { value: 'f2' },
        status: { value: 'open' },
      })
      expect(result).toEqual({ status: { value: 'open' } })
    })

    it('catches rotations, whose facility_name column stores facility_id', () => {
      expect(dropFacilityFilters<Filters>({ facility_id: { value: 'f1' } })).toEqual({})
    })

    it('returns a new object and leaves the input intact', () => {
      const filters: Filters = { facility_id: { value: 'f1' }, sku: { value: 'X' } }
      const result = dropFacilityFilters(filters)
      expect(result).not.toBe(filters)
      expect(Object.keys(filters)).toEqual(['facility_id', 'sku'])
    })

    it('is harmless on a filter set with no facility key', () => {
      expect(dropFacilityFilters({})).toEqual({})
    })
  })

  describe('scopeApiFilter', () => {
    it('injects the scope as an "in" match', () => {
      expect(scopeApiFilter({}, ['f1', 'f2'])).toEqual({
        facility_id: { value: ['f1', 'f2'], match_mode: 'in' },
      })
    })

    it('keeps only the local values the scope allows', () => {
      const result = scopeApiFilter(
        { facility_id: { value: ['f1', 'f9'], match_mode: 'in' } },
        ['f1', 'f2']
      )
      expect(result.facility_id).toEqual({ value: ['f1'], match_mode: 'in' })
    })

    it('returns an impossible filter when nothing survives, never an open one', () => {
      // Dropping the facility key here would widen the query back to the whole
      // scope; an empty array would make the backend drop the clause entirely.
      const result = scopeApiFilter(
        { facility_id: { value: ['f9'], match_mode: 'in' } },
        ['f1']
      )
      expect(result.facility_id).toEqual({
        value: [OUT_OF_SCOPE_FACILITY_ID],
        match_mode: 'in',
      })
    })

    it('keeps a local "no facility" when the scope includes it', () => {
      const result = scopeApiFilter(
        { facility_id: { value: [null, 'f9'], match_mode: 'in' } },
        ['f1', null]
      )
      expect(result.facility_id).toEqual({ value: [null], match_mode: 'in' })
    })

    it('drops a local "no facility" the scope excludes, like any facility', () => {
      const result = scopeApiFilter(
        { facility_id: { value: [null, 'f1'], match_mode: 'in' } },
        ['f1']
      )
      expect(result.facility_id).toEqual({ value: ['f1'], match_mode: 'in' })
    })

    it('passes the scope\'s own "no facility" through to the API', () => {
      expect(scopeApiFilter({}, ['f1', null])).toEqual({
        facility_id: { value: ['f1', null], match_mode: 'in' },
      })
    })

    it('never adds a null the scope did not ask for', () => {
      // Operator-level webhooks and API keys used to ride along with any
      // narrowed scope; now they need the topbar's "No facility" entry.
      expect(scopeApiFilter({}, ['f1'])).toEqual({
        facility_id: { value: ['f1'], match_mode: 'in' },
      })
    })

    it('leaves other filters alone', () => {
      const result = scopeApiFilter(
        { status: { value: 'open', match_mode: 'eq' } },
        ['f1']
      )
      expect(result.status).toEqual({ value: 'open', match_mode: 'eq' })
    })

    it('is a no-op when the scope is unrestricted', () => {
      const filter = { status: { value: 'open', match_mode: 'eq' } }
      expect(scopeApiFilter(filter, null)).toBe(filter)
      expect(scopeApiFilter(filter, [])).toBe(filter)
    })

    it('intersects a scalar local value like a one-element list', () => {
      const result = scopeApiFilter<Filters>(
        { facility_id: { value: 'f2', match_mode: 'eq' } },
        ['f1', 'f2']
      )
      expect(result['facility_id']).toEqual({ value: ['f2'], match_mode: 'in' })
    })

    it('treats a null local value as "no facility"', () => {
      const result = scopeApiFilter<Filters>(
        { facility_id: { value: null, match_mode: 'eq' } },
        [null]
      )
      expect(result['facility_id']).toEqual({ value: [null], match_mode: 'in' })
    })

    it('treats an empty-string local value as no local filter', () => {
      const result = scopeApiFilter<Filters>(
        { facility_id: { value: '', match_mode: 'eq' } },
        ['f1']
      )
      expect(result['facility_id']).toEqual({ value: ['f1'], match_mode: 'in' })
    })

    it('ignores non-string junk inside a local list', () => {
      const result = scopeApiFilter<Filters>(
        { facility_id: { value: ['f1', 7, undefined], match_mode: 'in' } },
        ['f1']
      )
      expect(result['facility_id']).toEqual({ value: ['f1'], match_mode: 'in' })
    })

    it('closes the query when only a local "no facility" is left and the scope excludes it', () => {
      const result = scopeApiFilter<Filters>(
        { facility_id: { value: [null], match_mode: 'in' } },
        ['f1']
      )
      expect(result['facility_id']).toEqual({
        value: [OUT_OF_SCOPE_FACILITY_ID],
        match_mode: 'in',
      })
    })

    it('honours a custom API field name', () => {
      const result = scopeApiFilter({}, ['f1'], { field: 'warehouse_id' })
      expect(result).toEqual({
        warehouse_id: { value: ['f1'], match_mode: 'in' },
      })
    })

    it('does not mutate the filter it is given', () => {
      const filter = { status: { value: 'open', match_mode: 'eq' } }
      scopeApiFilter(filter, ['f1'])
      expect(Object.keys(filter)).toEqual(['status'])
    })
  })
})

describe('scopeApiFilter — selector in its own field (scopeField)', () => {
  const opts = { scopeField: FACILITY_SCOPE_FIELD }

  it('sends the selector as facility_scope and leaves the facility filter untouched, AND/OR included', () => {
    const filter: Filters = {
      facility_id: { value: ['f3'], match_mode: 'in', operator: 'or', position: 2 },
      status: { value: 'OPEN', match_mode: 'equals', position: 1 },
    }

    expect(scopeApiFilter(filter, ['f1', null], opts)).toEqual({
      ...filter,
      facility_scope: { value: ['f1', null], match_mode: 'in' },
    })
  })

  it('does not intersect: the backend ANDs the selector with the facility filter', () => {
    const filter: Filters = { facility_id: { value: ['f9'], match_mode: 'in' } }

    expect(scopeApiFilter(filter, ['f1'], opts)['facility_id']).toEqual({ value: ['f9'], match_mode: 'in' })
  })

  it('sends nothing when the selector covers every facility', () => {
    const filter: Filters = { status: { value: 'OPEN', match_mode: 'equals' } }

    expect(scopeApiFilter(filter, null, opts)).toBe(filter)
    expect(scopeApiFilter(filter, [], opts)).toBe(filter)
  })

  it('keeps "No facility" as a null in the scope', () => {
    expect(scopeApiFilter<Filters>({}, [null], opts)).toEqual({ facility_scope: { value: [null], match_mode: 'in' } })
  })

  it('does not mutate the input or the scope', () => {
    const filter: Filters = { status: { value: 'OPEN', match_mode: 'equals' } }
    const scope = ['f1']

    const out = scopeApiFilter(filter, scope, opts) as Record<string, { value: unknown }>
    ;(out['facility_scope'].value as string[]).push('x')

    expect(Object.keys(filter)).toEqual(['status'])
    expect(scope).toEqual(['f1'])
  })
})
