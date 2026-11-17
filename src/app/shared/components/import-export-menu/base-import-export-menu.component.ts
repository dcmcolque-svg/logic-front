import {
  Component,
  computed,
  inject,
  input,
  output,
  ViewChild,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { ButtonModule } from 'primeng/button'
import { TieredMenuModule, TieredMenu } from 'primeng/tieredmenu'
import { TooltipModule } from 'primeng/tooltip'
import { MenuItem, MessageService } from 'primeng/api'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { Observable } from 'rxjs'
import { ShColumnDef } from '../../types/table.types'
import {
  TableExportFormat,
  TableExportPage,
} from '../../types/export.types'
import { ImportFileFormat } from '../../types/import.types'
import { TableExportService } from '../../services/table-export.service'
import { TableColumnsBus } from '../../services/table-columns.bus'

/** Pages the view's list endpoint with its current filters and sort applied. */
export type ExportPageFetcher = (
  page: number,
  rows: number
) => Observable<TableExportPage<unknown>>

/**
 * BaseImportExportMenu — the header's ellipsis menu shared by every table view.
 *
 * Renders `Export ▸ .csv / .xlsx` (plus an optional `Import ▸ By .csv / By
 * .xlsx / Logs` submenu) and delegates the export to TableExportService, so a
 * view only has to say which columns to write and how to fetch a page.
 *
 * Usage — export every record matching the current filters:
 * ```html
 * <base-import-export-menu
 *   filename="tracecards"
 *   [columns]="selectedColumns"
 *   [fetchPage]="fetchExportPage"
 *   [sheetName]="'pages.tracecards' | translate"
 * />
 * ```
 * ```ts
 * readonly fetchExportPage: ExportPageFetcher = (page, rows) =>
 *   this.svc.listTracecards({ filter: this.currentFilters(), config: { page, rows, sort_field: [] } })
 *     .pipe(map(r => ({ data: r.data ?? [], total: r.meta_data.total_records })))
 * ```
 *
 * Views without server paging pass their loaded rows instead: `[rows]="lines"`.
 */
@Component({
  selector: 'base-import-export-menu',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    TieredMenuModule,
    TooltipModule,
    TranslateModule,
  ],
  templateUrl: './base-import-export-menu.component.html',
})
export class BaseImportExportMenu {
  private readonly exportSvc = inject(TableExportService)
  private readonly translate = inject(TranslateService)
  /** Optional: views that provide MessageService (+ <p-toast>) get feedback. */
  private readonly messages = inject(MessageService, { optional: true })
  /** Optional: present when the view provides it alongside its table. */
  private readonly columnsBus = inject(TableColumnsBus, { optional: true })

  /** Base file name, without extension or timestamp. */
  filename = input.required<string>()
  /**
   * Columns to write. Only read when the view does not provide a
   * TableColumnsBus — with one, the table's own columns win, so the file can
   * never carry a column the reader cannot see.
   */
  columns = input.required<ShColumnDef[]>()
  /** Server paging source. Preferred: exports every filtered record, not just the page. */
  fetchPage = input<ExportPageFetcher | undefined>(undefined)
  /** Already-loaded rows, for views that hold their data in memory. */
  rows = input<unknown[] | undefined>(undefined)
  /**
   * How many records the view would export, when the view knows better than
   * its table does. It wins over everything else.
   *
   * For a view whose table *is* what gets exported there is nothing to pass:
   * the table reports through TableColumnsBus on its own. This is for a view
   * that renders its data some other way too — History swaps the table for a
   * timeline over the same events — where the table's silence is not an empty
   * result.
   *
   * Three states, the same ones the bus carries: a number, `null` for "this
   * view cannot say" (a request in flight, a load that failed), and absent for
   * "not my business, ask the table". `null` is not the same as leaving it
   * out: it stops the question here and keeps Export enabled, instead of
   * handing it to a table that would answer "empty" for a screen whose answer
   * is "unknown".
   */
  rowCount = input<number | null | undefined>(undefined)
  /** Worksheet name for xlsx — pass the translated page title. */
  sheetName = input('')
  /** Adds the Import submenu — By .csv / By .xlsx / Logs. */
  showImport = input(false)
  /** Button size — matches the neighbouring Clear button. */
  size = input<'small' | 'large' | undefined>('small')
  disabled = input(false)

  /** Emitted when the user picks "By .csv" or "By .xlsx", with the format. */
  importFile = output<ImportFileFormat>()
  /** Emitted when the user picks "Logs" under Import. */
  viewLogs = output<void>()

  /** True while a file is being generated. */
  readonly exporting = this.exportSvc.exporting

  /**
   * What actually gets written: the columns the table is rendering when the
   * view provides the bus, the `columns` input otherwise (a view with no table
   * of its own, or one that has not opted in).
   */
  private readonly exportColumns = computed(() => {
    const published = this.columnsBus?.columns() ?? []
    return published.length > 0 ? published : this.columns()
  })

  /**
   * True when there is nothing to write. Export then disables itself: a file
   * with a header row and no data is a support ticket.
   *
   * Four answers, in order of who knows best:
   *
   * 1. `rowCount`, when the view states it. It knows what it would export.
   * 2. The `rows` input, for a view with no `fetchPage`: those rows *are* the
   *    file.
   * 3. The table, through the bus — with `fetchPage` the file holds what the
   *    list endpoint returns for the active filters, which is what the table
   *    reports.
   * 4. Nothing. No bus, or a bus with no table reporting into it.
   *
   * Anyone can answer `null` instead of a number, and that ends it: Export
   * stays enabled. The menu cannot tell an empty result from a question
   * nobody can answer, and blocking an export that would have worked is the
   * worse failure of the two.
   */
  readonly nothingToExport = computed(() => {
    const declared = this.rowCount()
    if (declared !== undefined) return declared === null ? false : declared === 0

    if (!this.fetchPage()) return (this.rows() ?? []).length === 0

    const published = this.columnsBus?.rowCount() ?? null
    return published === null ? false : published === 0
  })

  /**
   * The trigger stays enabled while Import is available — an empty table is
   * exactly when someone wants to import into it — and only Export greys out.
   * With nothing but Export in the menu, the button itself goes.
   */
  readonly triggerDisabled = computed(
    () => this.disabled() || (this.nothingToExport() && !this.showImport())
  )

  /** Tooltip for the trigger: says why it is dead when it is. */
  readonly tooltipKey = computed(() => {
    if (this.showImport()) return 'labels.import_export'
    return this.nothingToExport() ? 'labels.nothing_to_export' : 'buttons.export'
  })

  menuItems: MenuItem[] = []
  @ViewChild('menuRef') menuRef!: TieredMenu

  /**
   * Rebuilt on every open so labels follow the active language and Export
   * disables itself while a file is still generating, or when the table has
   * nothing to write.
   */
  open(event: Event): void {
    const items: MenuItem[] = [
      {
        label: this.translate.instant('buttons.export'),
        icon: 'pi pi-download',
        disabled: this.exporting() || this.nothingToExport(),
        items: [
          {
            label: '.csv',
            icon: 'pi pi-file',
            command: () => {
              void this.runExport('csv')
            },
          },
          {
            label: '.xlsx',
            icon: 'pi pi-file-excel',
            command: () => {
              void this.runExport('xlsx')
            },
          },
        ],
      },
    ]
    if (this.showImport()) {
      items.push({
        label: this.translate.instant('buttons.import'),
        icon: 'pi pi-upload',
        items: [
          {
            label: this.translate.instant('buttons.import_by_csv'),
            icon: 'pi pi-file',
            command: () => this.importFile.emit('csv'),
          },
          {
            label: this.translate.instant('buttons.import_by_xlsx'),
            icon: 'pi pi-file-excel',
            command: () => this.importFile.emit('xlsx'),
          },
          {
            label: this.translate.instant('buttons.import_logs'),
            icon: 'pi pi-history',
            command: () => this.viewLogs.emit(),
          },
        ],
      })
    }
    this.menuItems = items
    this.menuRef?.toggle(event)
  }

  private async runExport(format: TableExportFormat): Promise<void> {
    try {
      const result = await this.exportSvc.export({
        filename: this.filename(),
        format,
        columns: this.exportColumns(),
        sheetName: this.sheetName() || undefined,
        fetchPage: this.fetchPage(),
        rows: this.rows(),
      })
      this.messages?.add({
        severity: 'success',
        summary: this.translate.instant('messages.success'),
        detail: `${result.rows} ${this.translate.instant('labels.rows_exported')}`,
        life: 3000,
      })
    } catch (err) {
      console.error('[BaseImportExportMenu] export failed', err)
      this.messages?.add({
        severity: 'error',
        summary: this.translate.instant('messages.error'),
        detail: this.translate.instant('messages.export_error'),
        life: 3000,
      })
    }
  }
}
