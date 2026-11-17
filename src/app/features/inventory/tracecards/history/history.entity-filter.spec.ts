import { signal } from '@angular/core'
import HistoryComponent, { HistorySource } from './history.component'
import TracecardsComponent from '../warehouse.component'
import { TracecardItem } from '../types/warehouse.types'

// Tracecard codes, SKUs and even location/container ids repeat across
// facilities. A history opened from a Tracecards row is pinned to that row's
// facility, and a tracecard is looked up by kardex id, never by code.
// Pure logic: neither component is rendered.

const KARDEX = '01a16953-5df7-7953-bb9e-0e35eba46c20'
const FACILITY = '01a16950-0000-7000-8000-000000000002'

type FilterBuilder = { buildEntityFilter(field: 'id' | 'kardex_id'): Record<string, unknown> }

function history(source: HistorySource, facilityId = FACILITY): FilterBuilder {
  const c = Object.create(HistoryComponent.prototype) as HistoryComponent
  c.historySource = signal(source) as HistoryComponent['historySource']
  c.entityId = KARDEX
  c.facilityId = facilityId
  return c as unknown as FilterBuilder
}

const eq = (value: string) => ({ match_mode: 'equals', value })

describe('History entity filter', () => {
  it('looks the tracecard card up by kardex id within its facility', () => {
    expect(history('tracecard').buildEntityFilter('id')).toEqual({ id: eq(KARDEX), facility_id: eq(FACILITY) })
  })

  it('lists the tracecard flow by kardex id within its facility', () => {
    expect(history('tracecard').buildEntityFilter('kardex_id')).toEqual({
      kardex_id: eq(KARDEX),
      facility_id: eq(FACILITY),
    })
  })

  it('pins the location, bin and sku histories to the facility too', () => {
    expect(history('location').buildEntityFilter('kardex_id')).toEqual({
      location_id: eq(KARDEX),
      facility_id: eq(FACILITY),
    })
    expect(history('bin').buildEntityFilter('kardex_id')).toEqual({
      container_id: eq(KARDEX),
      facility_id: eq(FACILITY),
    })
    expect(history('sku').buildEntityFilter('kardex_id')).toEqual({ sku_id: eq(KARDEX), facility_id: eq(FACILITY) })
  })

  it('spans every facility when opened without one (catalog SKU history)', () => {
    expect(history('sku', '').buildEntityFilter('kardex_id')).toEqual({ sku_id: eq(KARDEX) })
  })
})

describe('Tracecards navigateToHistory', () => {
  const row = {
    id: KARDEX,
    facility_id: FACILITY,
    location_id: 'loc-1',
    container_id: 'ctr-1',
    sku_id: 'sku-1',
  } as TracecardItem

  function navigate(source: HistorySource) {
    const c = Object.create(TracecardsComponent.prototype) as TracecardsComponent
    const router = jasmine.createSpyObj('Router', ['navigate'])
    ;(c as unknown as { router: unknown }).router = router
    c.navigateToHistory(row, source)
    return router.navigate.calls.mostRecent().args
  }

  it('passes the entity id and the row facility for every source', () => {
    const expected: Record<HistorySource, string> = {
      tracecard: KARDEX,
      location: 'loc-1',
      bin: 'ctr-1',
      sku: 'sku-1',
    }
    for (const [source, id] of Object.entries(expected) as [HistorySource, string][]) {
      expect(navigate(source)).toEqual([
        ['/app/inventory/tracecards/history', id],
        { queryParams: { source, facility: FACILITY } },
      ])
    }
  })
})
