import { FacilityDatePipe } from '@/app/shared/pipes/facility-date.pipe'
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core'
import { CommonModule, DatePipe } from '@angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { DialogModule } from 'primeng/dialog'
import { TagModule } from 'primeng/tag'
import { TooltipModule } from 'primeng/tooltip'
import { MessageService } from 'primeng/api'
import { BaseDataTable } from '../datatable/data-table/base-data-table.component'
import {
  BaseImportExportMenu,
  ExportPageFetcher,
} from '../import-export-menu/base-import-export-menu.component'
import { ShColumnDef, ShPaginationConfig, ShTableEvent } from '../../types/table.types'
import { ImportService } from '../../services/import.service'
import { TableExportService } from '../../services/table-export.service'
import { TableExportFormat } from '../../types/export.types'
import {
  buildImportReport,
  importReportFilename,
} from '../../utils/import-report.util'
import { map } from 'rxjs'
import {
  ImportLog,
  ImportLogStatus,
  ImportLogSummary,
  ImportModule,
} from '../../types/import.types'

/** Severity of the status tag, by upload outcome. */
const STATUS_SEVERITY: Record<ImportLogStatus, 'success' | 'warn' | 'danger'> = {
  COMPLETED: 'success',
  COMPLETED_WITH_ERRORS: 'warn',
  FAILED: 'danger',
}

/**
 * BaseUploadLogs — the Upload Logs table for one module.
 *
 * Lists every CSV upload with its totals and lets the reader open one to see
 * exactly which rows failed and why. The list endpoint omits the error rows, so
 * a page of logs stays small; the detail is fetched when a row is opened.
 *
 * Usage: `<base-upload-logs module="parcels" />`
 */
@Component({
  selector: 'base-upload-logs',
  standalone: true,
  imports: [
    FacilityDatePipe,
    CommonModule,
    DatePipe,
    TranslateModule,
    ButtonModule,
    DialogModule,
    TagModule,
    TooltipModule,
    BaseDataTable,
    BaseImportExportMenu,
  ],
  templateUrl: './base-upload-logs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BaseUploadLogs implements OnInit {
  private readonly importSvc = inject(ImportService)
  private readonly exportSvc = inject(TableExportService)
  private readonly translate = inject(TranslateService)
  private readonly messages = inject(MessageService, { optional: true })

  /** Which module's uploads to list. */
  module = input.required<ImportModule>()
  /** Opens this log's detail as soon as the table loads (e.g. right after an upload). */
  initialLogId = input<string | null>(null)

  logs = signal<ImportLogSummary[]>([])
  loading = signal(true)
  pagination = signal<ShPaginationConfig>({
    page: 1,
    limit: 15,
    total: 0,
    rows_per_page: [15, 30, 50, 100],
  })

  /** Log currently open in the detail dialog. */
  selectedLog = signal<ImportLog | null>(null)
  loadingDetail = signal(false)

  /** Tag severity for an upload outcome; unknown codes fall back to info. */
  severityFor(status: string): 'success' | 'warn' | 'danger' | 'info' {
    return STATUS_SEVERITY[status as ImportLogStatus] ?? 'info'
  }

  columns: ShColumnDef[] = [
    { field: 'file_name', header: 'import.file_name', width: '18rem', template: 'file_name' },
    { field: 'created_at', header: 'import.uploaded_at', width: '13rem', sortable: true, filterType: 'date', template: 'created_at' },
    { field: 'username', header: 'import.user', width: '12rem', template: 'username' },
    { field: 'total_records', header: 'import.total_records', width: '9rem', align: 'right' },
    { field: 'success_count', header: 'import.successful', width: '9rem', align: 'right', template: 'success' },
    { field: 'failed_count', header: 'import.failed', width: '9rem', align: 'right', template: 'failed' },
    { field: 'status', header: 'labels.status', width: '12rem', template: 'status', exportValue: row => this.statusLabel(row.status) },
  ]

  /** Whether the open log can hand back its failed rows as a file. */
  get hasFailedRows(): boolean {
    return (this.selectedLog()?.failed_rows?.length ?? 0) > 0
  }

  /**
   * Downloads the failed rows of the open log as the original file — same
   * columns, in file order — with `import_status` / `import_error` appended,
   * ready to fix and re-upload.
   */
  async downloadReport(format: TableExportFormat): Promise<void> {
    const log = this.selectedLog()
    if (!log) return
    const report = buildImportReport(log, r => this.reasonLabel(r), this.translate)
    if (report.rows.length === 0) return
    try {
      await this.exportSvc.export({
        filename: importReportFilename(log),
        format,
        columns: report.columns,
        rows: report.rows,
        // The headers are the file's own column names — they must round-trip.
        translateHeaders: false,
        sheetName: this.translate.instant('import.errors'),
      })
    } catch (err) {
      console.error('[BaseUploadLogs] report export failed', err)
      this.messages?.add({
        severity: 'error',
        summary: this.translate.instant('messages.error'),
        detail: this.translate.instant('messages.export_error'),
        life: 4000,
      })
    }
  }

  /**
   * Feeds the header's export menu: pages the log list with the same module
   * filter the table uses, so the file covers every upload, not just this page.
   */
  readonly fetchExportPage: ExportPageFetcher = (page, rows) =>
    this.importSvc
      .listLogs({
        config: {
          page,
          rows,
          sort_field: [{ field: 'created_at', order: -1 }],
        },
        filter: { module: { value: this.module(), match_mode: 'equals' } },
      })
      .pipe(
        map(resp => ({
          data: resp.data ?? [],
          total: resp.meta_data?.total_records ?? 0,
        }))
      )

  ngOnInit(): void {
    this.load()
    const id = this.initialLogId()
    if (id) this.openDetail(id)
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  load(): void {
    this.loading.set(true)
    const page = this.pagination()
    this.importSvc
      .listLogs({
        config: {
          page: page.page,
          rows: page.limit,
          sort_field: [{ field: 'created_at', order: -1 }],
        },
        filter: { module: { value: this.module(), match_mode: 'equals' } },
      })
      .subscribe({
        next: resp => {
          this.logs.set(resp.data ?? [])
          this.pagination.update(p => ({
            ...p,
            total: resp.meta_data?.total_records ?? 0,
          }))
          this.loading.set(false)
        },
        error: () => {
          this.loading.set(false)
          this.messages?.add({
            severity: 'error',
            summary: this.translate.instant('messages.error'),
            detail: this.translate.instant('messages.load_error'),
            life: 4000,
          })
        },
      })
  }

  onTableStateChange(event: ShTableEvent): void {
    this.pagination.update(p => ({
      ...p,
      page: event.pagination.page,
      limit: event.pagination.limit,
    }))
    this.load()
  }

  // ── Detail ────────────────────────────────────────────────────────────────

  openDetail(id: string): void {
    this.loadingDetail.set(true)
    this.importSvc.getLog(id).subscribe({
      next: log => {
        this.selectedLog.set(log)
        this.loadingDetail.set(false)
      },
      error: () => {
        this.loadingDetail.set(false)
        this.messages?.add({
          severity: 'error',
          summary: this.translate.instant('messages.error'),
          detail: this.translate.instant('messages.load_error'),
          life: 4000,
        })
      },
    })
  }

  closeDetail(): void {
    this.selectedLog.set(null)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Translated status label, falling back to the raw code. */
  statusLabel(status: string): string {
    const key = `import.status.${status}`
    const label = this.translate.instant(key)
    return label === key ? status : label
  }

  /** Translated failure reason, falling back to the raw code. */
  reasonLabel(reason: string): string {
    const key = `import.reason.${reason}`
    const label = this.translate.instant(key)
    return label === key ? reason : label
  }
}
