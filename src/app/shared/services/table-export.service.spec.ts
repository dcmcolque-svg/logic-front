import { TestBed } from '@angular/core/testing'
import { LOCALE_ID } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { of } from 'rxjs'
import { TableExportService } from './table-export.service'
import { ShColumnDef } from '../types/table.types'

/** Captures the blob the service hands to the browser, instead of downloading. */
function captureDownload(): { blobs: Blob[]; names: string[]; restore: () => void } {
  const blobs: Blob[] = []
  const names: string[] = []
  const createObjectURL = URL.createObjectURL
  const revokeObjectURL = URL.revokeObjectURL
  const createElement = document.createElement.bind(document)

  URL.createObjectURL = (blob: Blob) => {
    blobs.push(blob)
    return 'blob:captured'
  }
  URL.revokeObjectURL = () => undefined
  spyOn(document, 'createElement').and.callFake((tag: string) => {
    const el = createElement(tag) as HTMLElement
    if (tag === 'a') {
      const anchor = el as HTMLAnchorElement
      spyOnProperty(anchor, 'download', 'set').and.callFake(n => names.push(n))
      spyOn(anchor, 'click').and.stub()
    }
    return el
  })

  return {
    blobs,
    names,
    restore: () => {
      URL.createObjectURL = createObjectURL
      URL.revokeObjectURL = revokeObjectURL
    },
  }
}

describe('TableExportService', () => {
  let service: TableExportService
  let capture: ReturnType<typeof captureDownload>

  const columns: ShColumnDef[] = [
    { field: 'code', header: 'labels.code' },
    { field: 'nested.name', header: 'labels.name' },
    {
      field: 'tracking_number',
      header: 'labels.tracking',
      exportValue: (row: { shipment?: { shipment_id?: string } }) =>
        row.shipment?.shipment_id ?? null,
    },
  ]

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TableExportService,
        { provide: LOCALE_ID, useValue: 'en-US' },
        {
          provide: TranslateService,
          useValue: { instant: (key: string) => key },
        },
      ],
    })
    service = TestBed.inject(TableExportService)
    capture = captureDownload()
  })

  afterEach(() => capture.restore())

  async function csvOf(rows: unknown[], cols = columns): Promise<string> {
    await service.export({ filename: 'test', format: 'csv', columns: cols, rows })
    return capture.blobs[0].text()
  }

  it('writes a column that reads its value off a nested field (the blank Tracking # bug)', async () => {
    const csv = await csvOf([
      { code: 'A1', nested: { name: 'first' }, shipment: { shipment_id: 'TRK-001' } },
    ])
    const [header, row] = csv.replace('﻿', '').trim().split('\r\n')

    expect(header).toBe('labels.code,labels.name,labels.tracking')
    expect(row).toBe('A1,first,TRK-001')
  })

  it('writes only the columns it is given (WYSIWYG)', async () => {
    const csv = await csvOf(
      [{ code: 'A1', nested: { name: 'first' }, shipment: { shipment_id: 'TRK-001' } }],
      [columns[0]]
    )
    expect(csv.replace('﻿', '').trim()).toBe('labels.code\r\nA1')
  })

  it('skips columns hidden or marked unexportable', async () => {
    const csv = await csvOf(
      [{ code: 'A1', secret: 'x', hidden: 'y' }],
      [
        columns[0],
        { field: 'secret', header: 'labels.secret', exportable: false },
        { field: 'hidden', header: 'labels.hidden', visible: false },
      ]
    )
    expect(csv.replace('﻿', '').trim()).toBe('labels.code\r\nA1')
  })

  it('keeps a multi-line cell on one CSV record', async () => {
    const csv = await csvOf([{ code: 'Packages: 1\nSKUs: 2\nItems: 3' }], [columns[0]])
    const lines = csv.replace('\ufeff', '').trim().split('\r\n')

    expect(lines.length).toBe(2) // header + one record, not four
    expect(lines[1]).toBe('Packages: 1 | SKUs: 2 | Items: 3')
  })

  it('keeps the line breaks in xlsx, where a record is not a line', async () => {
    await service.export({
      filename: 'test',
      format: 'xlsx',
      columns: [columns[0]],
      rows: [{ code: 'Packages: 1\nSKUs: 2' }],
    })

    // Read the workbook back: the break must still be there, and the column
    // wrapped, or Excel shows the two values run together on one line.
    const imported = (await import('exceljs')) as unknown as {
      default?: { Workbook: new () => import('exceljs').Workbook }
    }
    const Workbook = imported.default!.Workbook
    const book = new Workbook()
    await book.xlsx.load(await capture.blobs[0].arrayBuffer())

    const sheet = book.worksheets[0]
    expect(sheet.getCell('A2').value).toBe('Packages: 1\nSKUs: 2')
    expect(sheet.getColumn(1).alignment?.wrapText).toBeTrue()
  })

  it('neutralizes a cell that a spreadsheet would read as a formula', async () => {
    const csv = await csvOf([{ code: '=1+1' }], [columns[0]])
    expect(csv).toContain("'=1+1")
  })

  it('quotes separators and escapes quotes', async () => {
    const csv = await csvOf([{ code: 'a,b "c"' }], [columns[0]])
    expect(csv).toContain('"a,b ""c"""')
  })

  it('pages the API until every matching record is collected', async () => {
    const pages = [
      { data: [{ code: 'A' }, { code: 'B' }], total: 3 },
      { data: [{ code: 'C' }], total: 3 },
    ]
    const asked: number[] = []

    const result = await service.export({
      filename: 'test',
      format: 'csv',
      columns: [columns[0]],
      batchSize: 2,
      fetchPage: page => {
        asked.push(page)
        return of(pages[page - 1])
      },
    })

    expect(asked).toEqual([1, 2])
    expect(result.rows).toBe(3)
    expect((await capture.blobs[0].text()).trim().split('\r\n').length).toBe(4)
  })

  it('builds a real xlsx workbook (the "Workbook is not a constructor" bug)', async () => {
    await service.export({
      filename: 'test',
      format: 'xlsx',
      columns: [columns[0]],
      rows: [{ code: 'A1' }],
    })

    const bytes = new Uint8Array(await capture.blobs[0].arrayBuffer())
    // A .xlsx is a zip: it must start with the PK signature.
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK')
    expect(capture.names[0]).toMatch(/^test_\d{8}_\d{4}\.xlsx$/)
  })
})
