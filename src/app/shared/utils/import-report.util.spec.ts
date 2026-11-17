import {
  buildImportReport,
  importReportFilename,
  IMPORT_ERROR_COLUMN,
  IMPORT_STATUS_COLUMN,
} from './import-report.util'
import { ImportLog, ImportLogError } from '../types/import.types'

/** Stands in for TranslateService: echoes a Spanish label per key. */
const translate = {
  instant: (key: string) =>
    ({
      'import.column_status': 'estado_importacion',
      'import.column_error': 'error_importacion',
      'import.row_ok': 'OK',
      'import.row_error': 'ERROR',
    })[key] ?? key,
}

const reasonLabel = (reason: string) =>
  reason === 'DUPLICATE_SKU_CODE' ? 'SKU duplicado' : reason

function log(partial: Partial<ImportLog>): ImportLog {
  return {
    id: '1',
    module: 'catalog',
    file_name: 'catalogo.csv',
    total_records: 2,
    success_count: 1,
    failed_count: 1,
    status: 'COMPLETED_WITH_ERRORS',
    created_at: '2026-10-13T10:00:00Z',
    headers: ['sku_code', 'name'],
    ...partial,
  }
}

describe('buildImportReport', () => {
  it('returns the uploaded file with the two audit columns appended', () => {
    const report = buildImportReport(
      log({
        rows: [
          { line: 1, values: { sku_code: 'A1', name: 'first' } },
          { line: 2, values: { sku_code: 'A1', name: 'second' } },
        ],
        errors: [
          {
            row: 2,
            reference: 'A1',
            reason: 'DUPLICATE_SKU_CODE',
            message: 'A SKU with this code already exists.',
          },
        ],
      }),
      reasonLabel,
      translate
    )

    const headers = report.columns.map(c => c.header)
    // The data columns keep the names the importer matches on, so the corrected
    // file can be uploaded again; only the added ones are translated.
    expect(headers).toEqual([
      'sku_code',
      'name',
      'estado_importacion',
      'error_importacion',
    ])

    const status = report.columns[2].exportValue!
    const detail = report.columns[3].exportValue!
    expect(status(report.rows[0])).toBe('OK')
    expect(status(report.rows[1])).toBe('ERROR')
    expect(detail(report.rows[0])).toBe('')
    expect(detail(report.rows[1])).toBe(
      'SKU duplicado: A SKU with this code already exists.'
    )
  })

  it('carries every row on a preview and only the failed ones once saved', () => {
    const rows = [
      { line: 1, values: { sku_code: 'A1' } },
      { line: 2, values: { sku_code: 'A2' } },
    ]
    const errors: ImportLogError[] = [
      { row: 2, reason: 'DUPLICATE_SKU_CODE', message: 'exists' },
    ]

    const preview = buildImportReport(
      log({ preview: true, rows, errors }),
      reasonLabel,
      translate
    )
    const saved = buildImportReport(
      log({ failed_rows: [rows[1]], errors }),
      reasonLabel,
      translate
    )

    expect(preview.rows.length).toBe(2)
    expect(saved.rows.length).toBe(1)
    expect(saved.rows[0].line).toBe(2)
  })

  it('keeps the raw column names when no translator is given', () => {
    const report = buildImportReport(
      log({ rows: [{ line: 1, values: { sku_code: 'A1' } }], errors: [] }),
      reasonLabel
    )
    const headers = report.columns.map(c => c.header)
    expect(headers).toContain(IMPORT_STATUS_COLUMN)
    expect(headers).toContain(IMPORT_ERROR_COLUMN)
  })

  it('joins several errors of one row instead of dropping any', () => {
    const report = buildImportReport(
      log({
        rows: [{ line: 1, values: { sku_code: '' } }],
        errors: [
          { row: 1, reason: 'MISSING_REQUIRED_FIELD', message: "'sku_code' is required." },
          { row: 1, reason: 'INVALID_VALUE', message: "'weight' is not a number." },
        ],
      }),
      reasonLabel,
      translate
    )

    const detail = report.columns[3].exportValue!(report.rows[0]) as string
    expect(detail).toContain("'sku_code' is required.")
    expect(detail).toContain("'weight' is not a number.")
  })

  it('names the file after the upload, by step', () => {
    expect(importReportFilename(log({ preview: true }))).toBe('catalogo_preview')
    expect(importReportFilename(log({}))).toBe('catalogo_errors')
  })
})
