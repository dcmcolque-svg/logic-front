import { toApiFilter } from './receivings-filter.util'

/** Covers that receivings forwards the AND/OR of custom filters to the API. */
describe('receivings toApiFilter — custom filter combinators', () => {
  it('forwards operator and position, and omits them for plain filters', () => {
    expect(
      toApiFilter({
        doc_number: { value: 'RCV', matchMode: 'contains', operator: 'and', position: 1 },
        qty_received_sum: { value: 0, matchMode: 'equals', operator: 'or', position: 2 },
        status: { value: ['OPEN'], matchMode: 'in' },
        external_ref: { value: '' },
      }),
    ).toEqual({
      doc_number: { value: 'RCV', match_mode: 'contains', position: 1 },
      qty_received_sum: { value: 0, match_mode: 'equals', operator: 'or', position: 2 },
      status: { value: ['OPEN'], match_mode: 'in' },
    })
  })
})
