/** Modules that accept a CSV import. Must match the backend's module ids. */
export type ImportModule = 'parcels' | 'receivings' | 'catalog'

/** File formats the importer accepts. */
export type ImportFileFormat = 'csv' | 'xlsx'

/** One parsed row of the uploaded file: normalized header → cell value. */
export interface ImportRow {
  /** 1-based line in the file, header excluded — matches ImportLogError.row. */
  line: number
  values: Record<string, string>
}

/** Why one row was rejected. Stable codes — the UI maps them to a label. */
export type ImportErrorReason =
  | 'MISSING_REQUIRED_FIELD'
  | 'DUPLICATE_TRACKING_NUMBER'
  | 'DUPLICATE_SKU_CODE'
  | 'DUPLICATE_DOC_NUMBER'
  /** The row was valid but its receiving was rejected because another row was not. */
  | 'DOCUMENT_REJECTED'
  | 'INVALID_VALUE'
  | 'CREATE_FAILED'

/** Outcome of a whole upload. */
export type ImportLogStatus =
  | 'COMPLETED'
  | 'COMPLETED_WITH_ERRORS'
  | 'FAILED'

/** One rejected row of an upload. */
export interface ImportLogError {
  /** 1-based line in the file, header excluded. */
  row: number
  /** Identifies the record — the tracking number for parcels. */
  reference?: string
  field?: string
  reason: ImportErrorReason
  message: string
}

/** One upload, with its failed rows. Returned by the upload and detail endpoints. */
export interface ImportLog {
  id: string
  module: ImportModule
  file_name: string
  operator_id?: string
  facility_id?: string
  user_id?: string
  username?: string
  total_records: number
  success_count: number
  failed_count: number
  status: ImportLogStatus
  created_at: string
  errors?: ImportLogError[]
  /** True for a dry run: nothing was written and the log was not persisted. */
  preview?: boolean
  /** The file's columns, normalized, in file order. */
  headers?: string[]
  /** Every parsed row — only returned on a preview. */
  rows?: ImportRow[]
  /** The rows that did not land — returned once the upload has been saved. */
  failed_rows?: ImportRow[]
}

/** A log without its error rows — what the list endpoint returns. */
export type ImportLogSummary = Omit<ImportLog, 'errors'>

export interface ImportLogListRequest {
  config: {
    page: number
    rows: number
    sort_field?: { field: string; order: number }[]
  }
  filter: Record<string, { value: unknown; match_mode: string }>
}

export interface ImportLogListResponse {
  data: ImportLogSummary[]
  meta_data: {
    total_records: number
    page: number
    rows: number
  }
}
