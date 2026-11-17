import { inject, Injectable, LOCALE_ID, signal } from '@angular/core'
import { formatDate } from '@angular/common'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { ShColumnDef } from '../types/table.types'
import {
  TableExportCellValue,
  TableExportProgress,
  TableExportRequest,
  TableExportResult,
} from '../types/export.types'

/** Rows requested per API call while paging through a filtered result set. */
const DEFAULT_BATCH_SIZE = 500
/** Safety ceiling so a mis-filtered export can't pull the whole database. */
const DEFAULT_MAX_ROWS = 50_000
/** How dates are rendered in CSV and in xlsx date cells. */
const DATE_FORMAT = 'yyyy-MM-dd HH:mm'
const XLSX_DATE_FORMAT = 'yyyy-mm-dd hh:mm'
/** The alignment shape exceljs accepts on a column. */
type ExcelAlignment = {
  horizontal: 'left' | 'center' | 'right'
  vertical: 'top' | 'middle' | 'bottom'
  wrapText: boolean
}

/** What a line break inside a cell becomes in CSV, which is one line per record. */
const CSV_LINE_SEPARATOR = ' | '
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** The constructor exceljs exposes, whichever shape the bundle hands back. */
type WorkbookCtor = typeof import('exceljs').Workbook

/**
 * Resolves exceljs's Workbook across module shapes.
 *
 * The library is CommonJS, and the bundler emits its chunk as
 * `export default require_exceljs_min()` — a namespace with only `default`, no
 * named exports — so reading `.Workbook` off the namespace yields undefined and
 * `new` throws "is not a constructor". Reading through `default` first covers
 * that, and falling back to the namespace covers builds that do re-export the
 * names.
 */
async function loadWorkbook(): Promise<WorkbookCtor> {
  const imported = (await import('exceljs')) as unknown as {
    Workbook?: WorkbookCtor
    default?: { Workbook?: WorkbookCtor }
  }
  const Workbook = imported.default?.Workbook ?? imported.Workbook
  if (!Workbook) {
    throw new Error('[TableExportService] exceljs loaded without Workbook')
  }
  return Workbook
}

/**
 * TableExportService — turns what a `base-data-table` view is showing into a
 * CSV or XLSX download.
 *
 * It takes the same three pieces of state the table already owns:
 * the visible columns (`selectedCols`), the active filters/sort (through the
 * caller's `fetchPage`) and, optionally, rows that are already loaded.
 * Column headers are translated with the active language and each column may
 * override its exported value via `ShColumnDef.exportValue`.
 *
 * Usage — export every record matching the current filters:
 * ```ts
 * await this.exportSvc.export({
 *   filename: 'receivings',
 *   format: 'xlsx',
 *   columns: this.selectedCols,
 *   fetchPage: (page, rows) =>
 *     this.svc.listReceivings({ ...this.dto(), config: { ...this.dto().config, page, rows } })
 *       .pipe(map(r => ({ data: r.data ?? [], total: r.meta_data.total_records }))),
 * })
 * ```
 *
 * Usage — export only what is on screen (or only the selected rows):
 * ```ts
 * await this.exportSvc.export({
 *   filename: 'receivings',
 *   format: 'csv',
 *   columns: this.selectedCols,
 *   rows: this.selected(),
 * })
 * ```
 */
@Injectable({ providedIn: 'root' })
export class TableExportService {
  private readonly translate = inject(TranslateService)
  private readonly locale = inject(LOCALE_ID)

  /** True while an export is running — bind it to the button's [loading]. */
  readonly exporting = signal(false)
  /** Live progress of the running export. */
  readonly progress = signal<TableExportProgress>({
    loaded: 0,
    total: 0,
    phase: 'done',
  })

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Collects the rows, builds the file and triggers the browser download.
   * Rejects when no exportable column is given or when the API paging fails.
   */
  async export<TRow>(
    request: TableExportRequest<TRow>
  ): Promise<TableExportResult> {
    const columns = this.exportableColumns(request.columns)
    if (columns.length === 0) {
      throw new Error('[TableExportService] no exportable columns')
    }

    this.exporting.set(true)
    this.emitProgress(request, { loaded: 0, total: 0, phase: 'fetching' })

    try {
      const maxRows = request.maxRows ?? DEFAULT_MAX_ROWS
      const { rows, truncated } = request.fetchPage
        ? await this.collectRows(request, maxRows)
        : this.takeRows(request.rows ?? [], maxRows)

      this.emitProgress(request, {
        loaded: rows.length,
        total: rows.length,
        phase: 'building',
      })

      const headers = this.buildHeaders(columns, request.translateHeaders !== false)
      const matrix = rows.map((row) =>
        columns.map((col) => this.resolveCell(row, col))
      )

      const filename = this.buildFilename(request.filename, request.format)
      const blob =
        request.format === 'xlsx'
          ? await this.buildXlsx(headers, matrix, columns, request.sheetName)
          : this.buildCsv(headers, matrix)

      this.download(blob, filename)
      this.emitProgress(request, {
        loaded: rows.length,
        total: rows.length,
        phase: 'done',
      })
      return { rows: rows.length, filename, truncated }
    } finally {
      this.exporting.set(false)
    }
  }

  // ── Row collection ────────────────────────────────────────────────────────

  /**
   * Pages through `fetchPage` until every matching record is collected.
   * Stops early on an empty page, once `total` is reached, or at `maxRows`.
   */
  private async collectRows<TRow>(
    request: TableExportRequest<TRow>,
    maxRows: number
  ): Promise<{ rows: TRow[]; truncated: boolean }> {
    const batchSize = Math.max(1, request.batchSize ?? DEFAULT_BATCH_SIZE)
    const fetchPage = request.fetchPage!
    const rows: TRow[] = []
    let total = 0
    let page = 1
    // Hard stop: even if the API keeps returning full pages, never loop forever.
    const maxPages = Math.ceil(maxRows / batchSize) + 1

    while (page <= maxPages) {
      const result = await firstValueFrom(fetchPage(page, batchSize))
      const batch = result?.data ?? []
      if (page === 1) total = result?.total ?? batch.length
      rows.push(...batch)
      this.emitProgress(request, {
        loaded: rows.length,
        total: Math.min(total, maxRows),
        phase: 'fetching',
      })

      if (batch.length < batchSize) break
      if (total > 0 && rows.length >= total) break
      if (rows.length >= maxRows) break
      page++
    }

    return this.takeRows(rows, maxRows)
  }

  private takeRows<TRow>(
    rows: TRow[],
    maxRows: number
  ): { rows: TRow[]; truncated: boolean } {
    return rows.length > maxRows
      ? { rows: rows.slice(0, maxRows), truncated: true }
      : { rows, truncated: false }
  }

  // ── Column / cell resolution ──────────────────────────────────────────────

  /** Keeps the caller's order, dropping hidden and opt-out columns. */
  private exportableColumns(columns: ShColumnDef[]): ShColumnDef[] {
    return (columns ?? []).filter(
      (c) => c.visible !== false && c.exportable !== false
    )
  }

  private buildHeaders(columns: ShColumnDef[], translate: boolean): string[] {
    return columns.map((col) => {
      if (!translate) return col.header || col.field
      const label = this.translate.instant(col.header)
      // ngx-translate echoes the key back when there is no translation.
      return label && label !== col.header ? label : col.header || col.field
    })
  }

  /**
   * Resolves one cell: the column's `exportValue` when present, otherwise the
   * (dot-path aware) raw field, normalized to a spreadsheet-friendly type.
   */
  private resolveCell(row: unknown, col: ShColumnDef): TableExportCellValue {
    const raw = col.exportValue
      ? col.exportValue(row)
      : this.getFieldValue(row, col.field)
    return this.normalize(raw, col)
  }

  /** Reads `a.b.c` paths, matching BaseDataTable.getFieldValue(). */
  private getFieldValue(row: unknown, field: string): unknown {
    return field
      .split('.')
      .reduce<unknown>(
        (obj, key) =>
          obj == null ? undefined : (obj as Record<string, unknown>)[key],
        row
      )
  }

  private normalize(value: unknown, col: ShColumnDef): TableExportCellValue {
    if (value === null || value === undefined || value === '') return null
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'boolean') return value
    if (Array.isArray(value)) {
      return value.map((v) => this.stringifyPrimitive(v)).join(', ')
    }
    if (typeof value === 'string') {
      // Date columns arrive as ISO strings — keep the native type for xlsx.
      if (col.filterType === 'date') {
        const parsed = new Date(value)
        if (!Number.isNaN(parsed.getTime())) return parsed
      }
      return value
    }
    return this.stringifyPrimitive(value)
  }

  private stringifyPrimitive(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (value instanceof Date) return this.formatDateCell(value)
    if (typeof value === 'object') return this.stringifyObject(value)
    if (typeof value === 'string') return value
    // number | boolean | bigint | symbol | function — each has its own toString()
    return (value as number | boolean | bigint | symbol).toString()
  }

  private stringifyObject(value: object): string {
    try {
      return JSON.stringify(value)
    } catch {
      // Circular / BigInt payloads: fall back to the object's own conversion.
      return String(value as { toString(): string })
    }
  }

  private formatDateCell(value: Date): string {
    try {
      return formatDate(value, DATE_FORMAT, this.locale)
    } catch {
      return value.toISOString()
    }
  }

  // ── CSV ───────────────────────────────────────────────────────────────────

  /** RFC 4180 CSV, UTF-8 BOM so Excel opens accents correctly. */
  private buildCsv(
    headers: string[],
    matrix: TableExportCellValue[][]
  ): Blob {
    const lines = [headers.map((h) => this.escapeCsv(h)).join(',')]
    for (const row of matrix) {
      lines.push(row.map((cell) => this.escapeCsv(cell)).join(','))
    }
    return new Blob(['﻿' + lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    })
  }

  private escapeCsv(value: TableExportCellValue): string {
    if (value === null) return ''
    let text =
      value instanceof Date ? this.formatDateCell(value) : String(value)
    // A cell that shows several lines on screen is flattened here: a CSV record
    // that spans physical lines is valid but breaks every line-oriented tool
    // that reads it — grep, wc, a diff, a naive parser. xlsx keeps the lines.
    text = text.replace(/\r?\n/g, CSV_LINE_SEPARATOR)
    // Neutralize spreadsheet formula injection (=cmd|'...', +, -, @, tab, CR).
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
    if (/[",\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`
    return text
  }

  // ── XLSX ──────────────────────────────────────────────────────────────────

  /**
   * Builds a real .xlsx with exceljs, loaded on demand so it stays out of the
   * initial bundle — nothing is downloaded until the user exports to Excel.
   */
  private async buildXlsx(
    headers: string[],
    matrix: TableExportCellValue[][],
    columns: ShColumnDef[],
    sheetName?: string
  ): Promise<Blob> {
    const workbook = new (await loadWorkbook())()
    workbook.created = new Date()
    const sheet = workbook.addWorksheet(this.safeSheetName(sheetName))

    sheet.addRow(headers)
    for (const row of matrix) sheet.addRow(row)

    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.alignment = { vertical: 'middle' }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    }

    headers.forEach((header, i) => {
      const column = sheet.getColumn(i + 1)
      column.width = this.columnWidth(header, matrix, i)
      if (columns[i]?.filterType === 'date') column.numFmt = XLSX_DATE_FORMAT

      const alignment: Partial<ExcelAlignment> = {}
      if (columns[i]?.align) alignment.horizontal = columns[i].align
      // A column whose cells carry line breaks is shown wrapped, the way the
      // table shows them — Excel would otherwise collapse them into one line.
      if (this.columnWraps(matrix, i)) {
        alignment.wrapText = true
        alignment.vertical = 'top'
      }
      if (Object.keys(alignment).length > 0) column.alignment = alignment
    })

    const buffer = await workbook.xlsx.writeBuffer()
    return new Blob([buffer], { type: XLSX_MIME })
  }

  /** Whether any cell of the column carries a line break. */
  private columnWraps(matrix: TableExportCellValue[][], index: number): boolean {
    const sample = Math.min(matrix.length, 200)
    for (let r = 0; r < sample; r++) {
      const cell = matrix[r][index]
      if (typeof cell === 'string' && cell.includes('\n')) return true
    }
    return false
  }

  /** Widest cell in the column (sampling the first 200 rows), clamped to 10–60. */
  private columnWidth(
    header: string,
    matrix: TableExportCellValue[][],
    index: number
  ): number {
    let widest = header.length
    const sample = Math.min(matrix.length, 200)
    for (let r = 0; r < sample; r++) {
      const length = this.cellLength(matrix[r][index])
      if (length > widest) widest = length
    }
    return Math.min(60, Math.max(10, widest + 2))
  }

  /** Display length of a cell; dates use the export format's length. */
  private cellLength(cell: TableExportCellValue): number {
    if (cell === null) return 0
    if (cell instanceof Date) return DATE_FORMAT.length
    return String(cell).length
  }

  /** Excel rejects sheet names over 31 chars or containing : \ / ? * [ ] */
  private safeSheetName(name?: string): string {
    const cleaned = (name || 'Data').replaceAll(/[:\\/?*[\]]/g, ' ').trim()
    return (cleaned || 'Data').substring(0, 31)
  }

  // ── Download ──────────────────────────────────────────────────────────────

  /** `receivings_20260908_1432.csv` */
  private buildFilename(base: string, format: string): string {
    const safeBase =
      this.trimUnderscores((base || 'export').replaceAll(/[^\w.-]+/g, '_')) ||
      'export'
    const stamp = formatDate(new Date(), 'yyyyMMdd_HHmm', this.locale)
    return `${safeBase}_${stamp}.${format}`
  }

  /**
   * Strips leading/trailing underscores with a linear scan (equivalent to
   * `replace(/^_+|_+$/g, '')` without the regex's super-linear backtracking).
   */
  private trimUnderscores(text: string): string {
    let start = 0
    let end = text.length
    while (start < end && text[start] === '_') start++
    while (end > start && text[end - 1] === '_') end--
    return text.slice(start, end)
  }

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Give the browser a tick to start the download before dropping the blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  private emitProgress<TRow>(
    request: TableExportRequest<TRow>,
    progress: TableExportProgress
  ): void {
    this.progress.set(progress)
    request.onProgress?.(progress)
  }
}
