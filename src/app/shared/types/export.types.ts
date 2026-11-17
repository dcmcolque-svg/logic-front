import { Observable } from 'rxjs'
import { ShColumnDef } from './table.types'

/** Output formats supported by TableExportService. */
export type TableExportFormat = 'csv' | 'xlsx'

/**
 * One page of rows fetched from the API while an export is running.
 * Mirrors the shape every `*ListResponse` already exposes
 * (`data` + `meta_data.total_records`).
 */
export interface TableExportPage<TRow = unknown> {
  data: TRow[]
  /** Total records matching the current filters (across all pages). */
  total: number
}

/** Progress callback payload — one emission per fetched batch. */
export interface TableExportProgress {
  /** Rows collected so far. */
  loaded: number
  /** Total rows the export expects to collect (0 until the first page lands). */
  total: number
  phase: 'fetching' | 'building' | 'done'
}

/**
 * Everything TableExportService needs to produce a file.
 *
 * Either `rows` (already-loaded data, e.g. the current page or the current
 * selection) or `fetchPage` (server paging over every filtered record) must be
 * provided. When both are present `fetchPage` wins.
 */
export interface TableExportRequest<TRow = unknown> {
  /** Base file name without extension — a timestamp and the extension are appended. */
  filename: string
  format: TableExportFormat
  /**
   * Columns to write, in order. Pass the view's `selectedCols` so the export
   * mirrors exactly what the user chose in the column selector.
   * Columns with `visible === false` or `exportable === false` are skipped.
   */
  columns: ShColumnDef[]
  /** Pre-loaded rows. Used when `fetchPage` is not supplied. */
  rows?: TRow[]
  /**
   * Fetches one page of rows with the table's current filters and sort applied.
   * `page` is 1-indexed. The service calls it repeatedly until every matching
   * record is collected (or `maxRows` is reached).
   */
  fetchPage?: (page: number, rows: number) => Observable<TableExportPage<TRow>>
  /** Rows per API call while paging. Default 500 (the backend clamp). */
  batchSize?: number
  /** Hard ceiling on exported rows. Default 50 000. */
  maxRows?: number
  /** Worksheet name for xlsx. Default 'Data'. */
  sheetName?: string
  /**
   * When true (default) each column `header` is run through TranslateService,
   * so the file uses the labels currently shown in the table.
   */
  translateHeaders?: boolean
  onProgress?: (progress: TableExportProgress) => void
}

/** Summary returned once the browser download has been triggered. */
export interface TableExportResult {
  /** Rows written to the file (header row excluded). */
  rows: number
  /** Final file name, timestamp and extension included. */
  filename: string
  /** True when the export stopped at `maxRows` and the file is incomplete. */
  truncated: boolean
}

/** Value types a single exported cell can hold. */
export type TableExportCellValue = string | number | boolean | Date | null
