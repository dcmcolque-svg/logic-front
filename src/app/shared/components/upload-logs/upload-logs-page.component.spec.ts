import { provideZonelessChangeDetection } from '@angular/core'
import { Location } from '@angular/common'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { ImportService } from '../../services/import.service'
import { TableColumnsBus } from '../../services/table-columns.bus'
import { BaseDataTable } from '../datatable/data-table/base-data-table.component'
import { BaseImportExportMenu } from '../import-export-menu/base-import-export-menu.component'
import UploadLogsPageComponent from './upload-logs-page.component'

/**
 * The page holds two siblings: the export menu in the header and
 * `base-upload-logs`, which owns the table. The bus has to be provided by the
 * page — their closest common ancestor — or the menu never sees it.
 *
 * It used to be provided inside `base-upload-logs`. The table published into a
 * bus the menu could not reach, so an empty Upload Logs still exported a file
 * with nothing but a header row. Nothing failed: the menu silently fell back
 * to its own inputs, which is exactly why this is a test and not a comment.
 */

const EMPTY_LOGS = { data: [], meta_data: { page: 1, rows: 15, total_records: 0 } }

class ImportStub {
  listLogs = jasmine.createSpy('listLogs').and.returnValue(of(EMPTY_LOGS))
  getLog = jasmine.createSpy('getLog').and.returnValue(of(null))
}

describe('UploadLogsPageComponent — the export menu reaches the table', () => {
  function create() {
    TestBed.configureTestingModule({
      imports: [UploadLogsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ImportService, useClass: ImportStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { module: 'parcels' },
              queryParamMap: { get: () => null },
            },
          },
        },
        { provide: Location, useValue: { back: () => undefined } },
        {
          provide: FacilityScopeService,
          useValue: { all: () => [], selectedIds: () => [], isSingle: () => false, inScope: () => [] },
        },
      ],
    })
    const fixture = TestBed.createComponent(UploadLogsPageComponent)
    fixture.detectChanges()
    return fixture
  }

  it('gives the menu and the table the same bus', () => {
    const fixture = create()

    const menu = fixture.debugElement.query(By.directive(BaseImportExportMenu))
    const table = fixture.debugElement.query(By.directive(BaseDataTable))
    expect(menu).withContext('the export menu is not rendered').toBeTruthy()
    expect(table).withContext('the logs table is not rendered').toBeTruthy()

    const menuBus = menu.injector.get(TableColumnsBus, null)
    expect(menuBus).withContext('the menu cannot reach a bus').not.toBeNull()
    expect(menuBus).toBe(table.injector.get(TableColumnsBus))
  })

  it('disables Export while the log list is empty', () => {
    const fixture = create()

    const menu = fixture.debugElement
      .query(By.directive(BaseImportExportMenu))
      .componentInstance as BaseImportExportMenu
    expect(menu.nothingToExport()).toBe(true)
    expect(menu.triggerDisabled()).toBe(true)
  })
})
