import { provideZonelessChangeDetection, signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideTranslateService } from '@ngx-translate/core'
import { of } from 'rxjs'
import { TableExportService } from '../../services/table-export.service'
import { TableColumnsBus } from '../../services/table-columns.bus'
import { ShColumnDef } from '../../types/table.types'
import {
  BaseImportExportMenu,
  ExportPageFetcher,
} from './base-import-export-menu.component'

/**
 * Covers when the menu refuses to export. An empty table has nothing to write,
 * and a file carrying a header row and no data is a support ticket: QA asked
 * for the button to be dead instead.
 *
 * The template is stubbed out — this is about the class logic, and the view
 * only reads the signals asserted here.
 */

const COLUMNS: ShColumnDef[] = [{ field: 'sku_code', header: 'labels.sku' }]

/** Stand-in for the real service: the menu only reads `exporting` here. */
class ExportStub {
  readonly exporting = signal(false)
  export = jasmine.createSpy('export').and.resolveTo({
    rows: 0,
    filename: 'x.csv',
    truncated: false,
  })
}

const fetcher: ExportPageFetcher = () => of({ data: [], total: 0 })

describe('BaseImportExportMenu — nothing to export', () => {
  let fixture: ComponentFixture<BaseImportExportMenu>
  let menu: BaseImportExportMenu
  let bus: TableColumnsBus | null

  /**
   * `withBus` mirrors a view that provides TableColumnsBus next to its table;
   * without it the menu has no table to ask.
   */
  function create(opts: {
    withBus: boolean
    fetchPage?: ExportPageFetcher
    rows?: unknown[]
    rowCount?: number | null
    showImport?: boolean
  }): void {
    TestBed.configureTestingModule({
      imports: [BaseImportExportMenu],
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService(),
        { provide: TableExportService, useClass: ExportStub },
        ...(opts.withBus ? [TableColumnsBus] : []),
      ],
    })
    TestBed.overrideComponent(BaseImportExportMenu, {
      set: { template: '', imports: [], styleUrl: undefined, styles: [] },
    })

    fixture = TestBed.createComponent(BaseImportExportMenu)
    menu = fixture.componentInstance
    bus = opts.withBus ? TestBed.inject(TableColumnsBus) : null
    fixture.componentRef.setInput('filename', 'receivings')
    fixture.componentRef.setInput('columns', COLUMNS)
    fixture.componentRef.setInput('fetchPage', opts.fetchPage)
    fixture.componentRef.setInput('rows', opts.rows)
    fixture.componentRef.setInput('rowCount', opts.rowCount)
    fixture.componentRef.setInput('showImport', opts.showImport ?? false)
    fixture.detectChanges()
  }

  /** What the table reports to the menu. */
  function tableShows(rows: number): void {
    bus!.publish(COLUMNS)
    bus!.publishRowCount(rows)
  }

  /** The Export entry of the menu the trigger builds. */
  function exportItem() {
    menu.open(new Event('click'))
    return menu.menuItems[0]
  }

  describe('a view that pages from the server', () => {
    it('disables the button while the table shows no rows', () => {
      create({ withBus: true, fetchPage: fetcher })
      tableShows(0)

      expect(menu.nothingToExport()).toBe(true)
      expect(menu.triggerDisabled()).toBe(true)
      expect(exportItem().disabled).toBe(true)
    })

    it('enables it as soon as the table has rows', () => {
      create({ withBus: true, fetchPage: fetcher })
      tableShows(12)

      expect(menu.nothingToExport()).toBe(false)
      expect(menu.triggerDisabled()).toBe(false)
      expect(exportItem().disabled).toBe(false)
    })

    it('follows the table: a filter that returns nothing kills Export again', () => {
      create({ withBus: true, fetchPage: fetcher })
      tableShows(12)
      tableShows(0)

      expect(menu.triggerDisabled()).toBe(true)
    })

    // A bus nobody has published into answers nothing, not zero.
    it('stays enabled while no table has reported yet', () => {
      create({ withBus: true, fetchPage: fetcher })

      expect(menu.nothingToExport()).toBe(false)
      expect(menu.triggerDisabled()).toBe(false)
    })

    it('stays enabled again once the table goes away', () => {
      create({ withBus: true, fetchPage: fetcher })
      tableShows(12)
      bus!.publishRowCount(null)

      expect(menu.triggerDisabled()).toBe(false)
    })

    // The menu would rather allow an export than block one that works.
    it('stays enabled when the view provides no bus, because it cannot know', () => {
      create({ withBus: false, fetchPage: fetcher })

      expect(menu.nothingToExport()).toBe(false)
      expect(menu.triggerDisabled()).toBe(false)
    })
  })

  describe('a view holding its rows in memory', () => {
    it('disables Export with an empty list', () => {
      create({ withBus: false, rows: [] })

      expect(menu.nothingToExport()).toBe(true)
      expect(exportItem().disabled).toBe(true)
    })

    it('enables it with rows', () => {
      create({ withBus: false, rows: [{ id: 1 }] })

      expect(menu.nothingToExport()).toBe(false)
      expect(exportItem().disabled).toBe(false)
    })
  })

  // An empty table is exactly when someone wants to import into it.
  describe('a view that also imports', () => {
    it('keeps the button alive and only greys out Export', () => {
      create({ withBus: true, fetchPage: fetcher, showImport: true })
      tableShows(0)

      expect(menu.triggerDisabled()).toBe(false)
      expect(exportItem().disabled).toBe(true)
      expect(menu.menuItems.length).toBe(2) // Export + Import
    })
  })

  // History swaps its table for a timeline over the same events: the table is
  // gone, the export still works, and only the view knows it.
  describe('a view that states its own count', () => {
    it('stays enabled while its table is gone, against a silent bus', () => {
      create({ withBus: true, fetchPage: fetcher, rowCount: 40 })
      bus!.publishRowCount(null)

      expect(menu.nothingToExport()).toBe(false)
      expect(menu.triggerDisabled()).toBe(false)
    })

    it('wins over a table that is showing rows', () => {
      create({ withBus: true, fetchPage: fetcher, rowCount: 0 })
      tableShows(12)

      expect(menu.nothingToExport()).toBe(true)
    })

    it('disables Export when it has nothing', () => {
      create({ withBus: true, fetchPage: fetcher, rowCount: 0 })

      expect(menu.triggerDisabled()).toBe(true)
    })

    // null ends the question. Falling through to the table would get "empty"
    // for a screen whose honest answer is "not known yet".
    it('keeps Export alive when the view says it cannot tell, over a table that says empty', () => {
      create({ withBus: true, fetchPage: fetcher, rowCount: null })
      tableShows(0)

      expect(menu.nothingToExport()).toBe(false)
      expect(menu.triggerDisabled()).toBe(false)
    })
  })

  describe('tooltip', () => {
    it('says why the button is dead', () => {
      create({ withBus: true, fetchPage: fetcher })
      tableShows(0)

      expect(menu.tooltipKey()).toBe('labels.nothing_to_export')
    })

    it('goes back to naming the action once there is data', () => {
      create({ withBus: true, fetchPage: fetcher })
      tableShows(3)

      expect(menu.tooltipKey()).toBe('buttons.export')
    })
  })

  describe('while a file is being written', () => {
    it('disables Export even with rows on screen', () => {
      create({ withBus: true, fetchPage: fetcher })
      tableShows(3)
      ;(TestBed.inject(TableExportService) as unknown as ExportStub).exporting.set(true)

      expect(exportItem().disabled).toBe(true)
    })
  })
})
