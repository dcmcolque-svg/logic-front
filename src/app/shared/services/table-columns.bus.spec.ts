import { TableColumnsBus } from './table-columns.bus'
import { ShColumnDef } from '../types/table.types'

describe('TableColumnsBus', () => {
  const columns: ShColumnDef[] = [
    { field: 'sku_code', header: 'labels.sku' },
    { field: 'name', header: 'labels.name' },
  ]

  it('starts empty, so a view with no table falls back to its own input', () => {
    expect(new TableColumnsBus().columns()).toEqual([])
  })

  it('hands the export menu what the table published', () => {
    const bus = new TableColumnsBus()
    bus.publish(columns)
    expect(bus.columns()).toEqual(columns)
  })

  it('reflects the latest selection, so unchecking a column reaches the file', () => {
    const bus = new TableColumnsBus()
    bus.publish(columns)
    bus.publish([columns[0]])
    expect(bus.columns().map(c => c.field)).toEqual(['sku_code'])
  })

  describe('rowCount', () => {
    it('starts as null: no table has reported yet', () => {
      expect(new TableColumnsBus().rowCount()).toBeNull()
    })

    it('carries what the table is rendering, so Export can refuse an empty file', () => {
      const bus = new TableColumnsBus()
      bus.publishRowCount(25)
      expect(bus.rowCount()).toBe(25)
    })

    it('drops to zero when a filter leaves the table empty', () => {
      const bus = new TableColumnsBus()
      bus.publishRowCount(25)
      bus.publishRowCount(0)
      expect(bus.rowCount()).toBe(0)
    })

    // Zero is "a table with no rows"; null is "no table". Collapsing the two
    // turned History's timeline into an empty table and killed its export.
    it('goes back to null when the table stops reporting', () => {
      const bus = new TableColumnsBus()
      bus.publishRowCount(25)
      bus.publishRowCount(null)
      expect(bus.rowCount()).toBeNull()
    })
  })
})
