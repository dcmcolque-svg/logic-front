import { signal } from '@angular/core'
import HistoryComponent from './history.component'
import { KardexFlowItem } from '../types/warehouse.types'

// The "event number" column (table, timeline and export) shows the 12-char
// event_code. Rows written before event_code existed fall back to the business
// reference, then to the uuid. Pure logic: the component is not rendered.

const UUID = '01a0d00b-1111-7222-8333-444455556666'

function flow(overrides: Partial<KardexFlowItem>): KardexFlowItem {
  return {
    id: UUID,
    event_code: null,
    shipment_number: null,
    order_number: null,
    ...overrides,
  } as KardexFlowItem
}

function component(): HistoryComponent {
  const c = Object.create(HistoryComponent.prototype) as HistoryComponent
  c.historySource = signal('tracecard') as HistoryComponent['historySource']
  return c
}

describe('HistoryComponent event reference', () => {
  it('shows the event_code over every other reference', () => {
    const item = flow({ event_code: 'S6DPHJR2X8X9', shipment_number: 'RCV-22103421', order_number: 'OS-1' })
    expect(component().getEventReference(item)).toBe('S6DPHJR2X8X9')
  })

  it('shows the event_code for a recount, instead of a truncated uuid', () => {
    expect(component().getEventReference(flow({ event_code: 'FAWQHDKHGM3L' }))).toBe('FAWQHDKHGM3L')
  })

  it('falls back to the receiving / order number on rows without event_code', () => {
    expect(component().getEventReference(flow({ shipment_number: 'RCV-22103421' }))).toBe('RCV-22103421')
    expect(component().getEventReference(flow({ order_number: 'OS-2026095115719' }))).toBe('OS-2026095115719')
  })

  it('falls back to a truncated uuid when there is nothing else', () => {
    expect(component().getEventReference(flow({}))).toBe('01a0d00b…')
  })

  describe('column', () => {
    const column = () => component().buildColumns().find(c => c.header === 'labels.number_event')!

    it('filters and sorts on event_code', () => {
      expect(column().field).toBe('event_code')
      expect(column().filterable).toBeTrue()
      expect(column().sortable).toBeTrue()
    })

    it('exports the event_code, and the whole uuid when there is no reference', () => {
      expect(column().exportValue!(flow({ event_code: 'S6DPHJR2X8X9' }))).toBe('S6DPHJR2X8X9')
      expect(column().exportValue!(flow({}))).toBe(UUID)
    })
  })
})
