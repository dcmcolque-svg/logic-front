import { ShColumnDef } from '../types/table.types'
import { ImportLog, ImportRow } from '../types/import.types'
/** The subset of TranslateService this builder needs. */
export interface ImportTranslator {
  instant: (key: string) => string
}

/** Column names appended to the user's own columns in the annotated file. */
export const IMPORT_STATUS_COLUMN = 'import_status'
export const IMPORT_ERROR_COLUMN = 'import_error'

/** What TableExportService needs to write the annotated file. */
export interface ImportReport {
  columns: ShColumnDef[]
  rows: ImportRow[]
}

/**
 * Rebuilds the uploaded file with two columns appended — `import_status`
 * (OK / ERROR) and `import_error` (the translated reason plus the detail) — so
 * the user gets back the same template they sent, annotated row by row.
 *
 * On a preview the log carries every row; once saved it carries only the
 * failed ones, which is the file someone fixes and re-uploads.
 *
 * `reasonLabel` translates the reason code; the header labels are the raw
 * column names on purpose, so the file round-trips through the importer.
 */
export function buildImportReport(
  log: ImportLog,
  reasonLabel: (reason: string) => string,
  translate?: ImportTranslator
): ImportReport {
  // The data columns keep the names the importer matches on, so the file can
  // be fixed and sent back. The two added ones are output only, so they take
  // the reader's language.
  const label = (key: string, fallback: string) =>
    translate ? translate.instant(key) : fallback
  const statusHeader = label('import.column_status', IMPORT_STATUS_COLUMN)
  const errorHeader = label('import.column_error', IMPORT_ERROR_COLUMN)
  const okValue = label('import.row_ok', 'OK')
  const errorValue = label('import.row_error', 'ERROR')
  const rows = log.rows?.length ? log.rows : (log.failed_rows ?? [])
  const headers = log.headers?.length
    ? log.headers
    : Object.keys(rows[0]?.values ?? {})

  // One entry per line: the first error is what the status column shows, the
  // rest are joined into the same cell so nothing is lost.
  const errorsByLine = new Map<number, string[]>()
  for (const error of log.errors ?? []) {
    const text = `${reasonLabel(error.reason)}: ${error.message}`
    errorsByLine.set(error.row, [...(errorsByLine.get(error.row) ?? []), text])
  }

  const columns: ShColumnDef[] = headers.map((header) => ({
    field: `values.${header}`,
    header,
  }))
  columns.push(
    {
      field: IMPORT_STATUS_COLUMN,
      header: statusHeader,
      exportValue: (row: ImportRow) =>
        errorsByLine.has(row.line) ? errorValue : okValue,
    },
    {
      field: IMPORT_ERROR_COLUMN,
      header: errorHeader,
      exportValue: (row: ImportRow) =>
        errorsByLine.get(row.line)?.join(' | ') ?? '',
    }
  )

  return { columns, rows }
}

/** `<file>_preview` or `<file>_errors`, without the original extension. */
export function importReportFilename(log: ImportLog): string {
  const base = (log.file_name || 'upload').replace(/\.(csv|xlsx)$/i, '')
  return log.preview ? `${base}_preview` : `${base}_errors`
}
