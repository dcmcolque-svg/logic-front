import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  ViewChild,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { DialogModule } from 'primeng/dialog'
import { SelectModule } from 'primeng/select'
import { FileUpload, FileUploadModule } from 'primeng/fileupload'
import { ProgressBarModule } from 'primeng/progressbar'
import { MessageService } from 'primeng/api'
import { ImportService } from '../../services/import.service'
import { TableExportService } from '../../services/table-export.service'
import { TableExportFormat } from '../../types/export.types'
import {
  ImportFileFormat,
  ImportLog,
  ImportModule,
} from '../../types/import.types'
import {
  buildImportReport,
  importReportFilename,
} from '../../utils/import-report.util'

/** One option of the facility or company selector. */
export interface ImportScopeOption {
  id: string
  name: string
}

/** Kept for callers written before the company selector existed. */
export type ImportFacilityOption = ImportScopeOption

/** Largest file the importer accepts — the backend's own limit. */
const MAX_UPLOAD_MB = 5
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

/**
 * Which scope each module's records are created under. Mirrors scopeFor() on
 * the backend, which rejects an upload that arrives without them.
 */
const MODULE_SCOPE: Record<
  ImportModule,
  { facility: boolean; company: boolean }
> = {
  parcels: { facility: true, company: false },
  receivings: { facility: true, company: true },
  catalog: { facility: false, company: true },
}

/** What the dialog is showing. */
type ImportStep = 'form' | 'preview' | 'saved'

/**
 * BaseImportDialog — "Import by csv / xlsx" modal shared by every module that
 * accepts a file upload.
 *
 * Flow: pick the scope and the file → the file is sent to `validate`, which
 * runs every check without writing → the preview shows what would land and
 * what would fail, with the file downloadable annotated row by row → *Save*
 * sends the same file to `upload`, which validates again and writes. Nothing
 * is held server-side between the two steps, so there is nothing to clean up
 * if the user walks away; if the data changed in between, the saved log is
 * the one that counts.
 *
 * Usage:
 * ```html
 * <base-import-dialog
 *   [visible]="showImport()"
 *   (visibleChange)="showImport.set($event)"
 *   module="parcels"
 *   [format]="importFormat()"
 *   [facilities]="facilities()"
 *   (imported)="onImported($event)"
 *   (viewLog)="goToUploadLogs($event)"
 * />
 * ```
 */
@Component({
  selector: 'base-import-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    DialogModule,
    SelectModule,
    FileUploadModule,
    ProgressBarModule,
  ],
  templateUrl: './base-import-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BaseImportDialog {
  private readonly importSvc = inject(ImportService)
  private readonly exportSvc = inject(TableExportService)
  private readonly translate = inject(TranslateService)
  /** Optional: hosts that provide MessageService (+ <p-toast>) get feedback. */
  private readonly messages = inject(MessageService, { optional: true })

  /** Which importer to call. */
  module = input.required<ImportModule>()
  /** File type this opening accepts — decides the picker filter and the template. */
  format = input<ImportFileFormat>('csv')
  /** Facilities the user can import into — needed by parcels and receivings. */
  facilities = input<ImportScopeOption[]>([])
  /** Companies the user can import into — needed by receivings and catalog. */
  companies = input<ImportScopeOption[]>([])
  visible = input(false)

  visibleChange = output<boolean>()
  /** Emitted after a successful save with the resulting log. */
  imported = output<ImportLog>()
  /** Emitted when the user asks to see the full log after saving. */
  viewLog = output<ImportLog>()

  @ViewChild('fileUpload') fileUpload?: FileUpload

  selectedFacility = signal<string | null>(null)
  selectedCompany = signal<string | null>(null)
  selectedFile = signal<File | null>(null)

  step = signal<ImportStep>('form')
  /** True while validate or upload is in flight. */
  busy = signal(false)
  downloadingSample = signal(false)
  /** The preview (step 'preview') or the saved log (step 'saved'). */
  result = signal<ImportLog | null>(null)

  /** Whether this module asks for a facility. */
  readonly needsFacility = computed(() => MODULE_SCOPE[this.module()].facility)
  /** Whether this module asks for a company. */
  readonly needsCompany = computed(() => MODULE_SCOPE[this.module()].company)

  /** True once every scope this module requires has been chosen. */
  readonly scopeReady = computed(
    () =>
      (!this.needsFacility() || !!this.selectedFacility()) &&
      (!this.needsCompany() || !!this.selectedCompany())
  )

  /** Picker filter for the chosen format. */
  readonly accept = computed(() =>
    this.format() === 'xlsx'
      ? '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : '.csv,text/csv'
  )

  /** Failed rows, capped: the full list lives in the Upload Logs detail view. */
  readonly visibleErrors = computed(() =>
    (this.result()?.errors ?? []).slice(0, 10)
  )

  /** Rows that would land — what the Save button offers to write. */
  readonly validCount = computed(() => this.result()?.success_count ?? 0)

  /** Columns and rows of the annotated file for the current result. */
  readonly report = computed(() => {
    const log = this.result()
    return log
      ? buildImportReport(log, (r) => this.reasonLabel(r), this.translate)
      : null
  })

  readonly reportFilename = computed(() => {
    const log = this.result()
    return log ? importReportFilename(log) : 'import'
  })

  // ── File selection ────────────────────────────────────────────────────────

  onFileSelect(event: { files: File[] }): void {
    const file = event.files?.[0]
    if (!file) return

    // The backend refuses anything over this anyway; stopping here saves
    // uploading a file that cannot be accepted.
    if (file.size > MAX_UPLOAD_BYTES) {
      this.clearFile()
      this.messages?.add({
        severity: 'error',
        summary: this.translate.instant('messages.error'),
        detail: this.translate.instant('import.file_too_large', {
          max: MAX_UPLOAD_MB,
        }),
        life: 5000,
      })
      return
    }

    // PrimeNG keeps every pick in its list; this dialog takes one file.
    if (this.fileUpload) this.fileUpload.files = [file]
    this.selectedFile.set(file)
    this.validate()
  }

  onFileRemove(): void {
    this.selectedFile.set(null)
    this.result.set(null)
    this.step.set('form')
  }

  /** Changing a scope invalidates the preview — the records would land elsewhere. */
  onFacilityChange(facilityId: string | null): void {
    this.selectedFacility.set(facilityId)
    this.onScopeChanged()
  }

  onCompanyChange(companyId: string | null): void {
    this.selectedCompany.set(companyId)
    this.onScopeChanged()
  }

  private onScopeChanged(): void {
    if (!this.scopeReady()) {
      this.clearFile()
      return
    }
    // Scope still complete but different: the preview has to be redone.
    if (this.selectedFile()) this.validate()
  }

  private clearFile(): void {
    this.selectedFile.set(null)
    this.result.set(null)
    this.step.set('form')
    if (this.fileUpload) this.fileUpload.files = []
  }

  // ── Validate (dry run) ────────────────────────────────────────────────────

  validate(): void {
    const file = this.selectedFile()
    if (!file || !this.scopeReady()) return

    this.busy.set(true)
    this.importSvc.validate(this.module(), file, this.scope()).subscribe({
      next: (log) => {
        this.busy.set(false)
        this.result.set(log)
        this.step.set('preview')
      },
      error: (err) => {
        this.busy.set(false)
        this.clearFile()
        this.toastError(err, 'import.upload_error')
      },
    })
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  /** Sends the same file again; the backend validates once more and writes. */
  save(): void {
    const file = this.selectedFile()
    if (!file || !this.scopeReady() || this.validCount() === 0) return

    this.busy.set(true)
    this.importSvc.upload(this.module(), file, this.scope()).subscribe({
      next: (log) => {
        this.busy.set(false)
        this.result.set(log)
        this.step.set('saved')
        this.imported.emit(log)
        this.messages?.add({
          severity: log.failed_count > 0 ? 'warn' : 'success',
          summary: this.translate.instant(
            log.failed_count > 0 ? 'messages.warning' : 'messages.success'
          ),
          detail: this.translate.instant('import.result_summary', {
            success: log.success_count,
            failed: log.failed_count,
          }),
          life: 4000,
        })
      },
      error: (err) => {
        this.busy.set(false)
        this.toastError(err, 'import.upload_error')
      },
    })
  }

  // ── Annotated file ────────────────────────────────────────────────────────

  /** Downloads the uploaded file with `import_status` / `import_error` appended. */
  async downloadReport(format: TableExportFormat): Promise<void> {
    const report = this.report()
    if (!report || report.rows.length === 0) return
    try {
      await this.exportSvc.export({
        filename: this.reportFilename(),
        format,
        columns: report.columns,
        rows: report.rows,
        // The headers are the file's own column names — they must round-trip.
        translateHeaders: false,
        sheetName: this.translate.instant('import.errors'),
      })
    } catch (err) {
      this.toastError(err, 'messages.export_error')
    }
  }

  // ── Sample ────────────────────────────────────────────────────────────────

  /** Downloads the template in the chosen format, so the user starts from the exact column set. */
  downloadSample(): void {
    this.downloadingSample.set(true)
    this.importSvc.downloadSample(this.module(), this.format()).subscribe({
      next: (blob) => {
        this.downloadingSample.set(false)
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${this.module()}_import_template.${this.format()}`
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      },
      error: (err) => {
        this.downloadingSample.set(false)
        this.toastError(err, 'import.sample_error')
      },
    })
  }

  // ── Close ─────────────────────────────────────────────────────────────────

  close(): void {
    this.visibleChange.emit(false)
    // Reset so the next open starts clean, not on the previous result.
    this.selectedFacility.set(null)
    this.selectedCompany.set(null)
    this.clearFile()
    this.busy.set(false)
  }

  openLog(): void {
    const log = this.result()
    if (log) this.viewLog.emit(log)
    this.close()
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Translated failure reason, falling back to the raw code. */
  reasonLabel(reason: string): string {
    const key = `import.reason.${reason}`
    const label = this.translate.instant(key)
    return label === key ? reason : label
  }

  private scope() {
    return {
      facilityId: this.selectedFacility(),
      companyId: this.selectedCompany(),
    }
  }

  private toastError(err: unknown, fallbackKey: string): void {
    const message = (err as { error?: { message?: string } })?.error?.message
    this.messages?.add({
      severity: 'error',
      summary: this.translate.instant('messages.error'),
      detail: message ?? this.translate.instant(fallbackKey),
      life: 5000,
    })
  }
}
