import { HistoryContext, HistorySource, buildContextFields } from './history.component'

// The context card above every history (location, bin, tracecard, sku) no
// longer shows the location's operational category.

const SOURCES: HistorySource[] = ['location', 'bin', 'tracecard', 'sku']

// A tracecard row carries category; the card must ignore it.
const item = {
  facility_name: 'edge0202@nuvex.uk',
  location_code: 'A-01-01-01',
  container_lpn: 'LPN-0000001',
  zone_name: 'Z1',
  tracecard: 'TRC-0000001',
  description: 'Mask',
  sku: 'SKU-00213325',
  barcode: '0012345678905',
  image_path: null,
  category: 'STAGED',
} as HistoryContext

const labels = (source: HistorySource) => buildContextFields(item, source).map(f => f.label)

describe('History context card', () => {
  for (const source of SOURCES) {
    it(`shows no category on the ${source} history`, () => {
      expect(labels(source)).not.toContain('labels.category')
      expect(buildContextFields(item, source).map(f => f.value)).not.toContain('STAGED')
    })
  }

  it('keeps the remaining fields', () => {
    expect(labels('location')).toEqual(['labels.facility_name', 'labels.location', 'labels.zone'])
    expect(labels('bin')).toEqual(['labels.facility_name', 'labels.location', 'labels.container', 'labels.zone'])
    expect(labels('tracecard')).toEqual([
      'labels.facility_name',
      'labels.tracecard',
      'labels.description',
      'labels.sku',
      'labels.barcode',
    ])
    expect(labels('sku')).toEqual(['labels.facility_name', 'labels.sku', 'labels.description', 'labels.barcode'])
  })
})
