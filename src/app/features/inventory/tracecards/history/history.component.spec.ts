import { provideZonelessChangeDetection } from '@angular/core'
import { AuthService } from '@/app/core/services/auth.service'
import { Location } from '@angular/common'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { NEVER, Observable, of, throwError } from 'rxjs'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { FilterApplyService } from '@/app/shared/components/filter-clear/filter-apply.service'
import { BaseImportExportMenu } from '@/app/shared/components/import-export-menu/base-import-export-menu.component'
import { CatalogService } from '@/app/features/inventory/catalog/catalog.service'
import { TracecardsService } from '../warehouse.service'
import HistoryComponent from './history.component'

/**
 * History shows the same events two ways — a table, or a timeline — behind one
 * toggle, and the export menu sits outside both. Switching to the timeline
 * destroys the table, and the export still works: it pages from the endpoint,
 * not from the table.
 *
 * So the menu must not read the missing table as an empty result. It did, and
 * the ⋮ went dead over a screen full of events.
 */

function flowPage(count: number) {
  return {
    data: Array.from({ length: count }, (_, i) => ({ id: `f${i}` })),
    meta_data: { page: 1, rows: 15, total_records: count },
  }
}

describe('HistoryComponent — Export across the table/timeline toggle', () => {
  let fixture: ComponentFixture<HistoryComponent>
  let history: HistoryComponent

  function create(
    events: number,
    flow: () => Observable<unknown> = () => of(flowPage(events))
  ): void {
    TestBed.configureTestingModule({
      imports: [HistoryComponent, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: TracecardsService,
          useValue: {
            listKardexFlow: flow,
            listTracecards: () => of({ data: [], meta_data: { total_records: 0 } }),
          },
        },
        { provide: CatalogService, useValue: { getSkuListItemById: () => of(null) } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => 'kardex-1' },
              queryParamMap: { get: () => null },
            },
          },
        },
        { provide: Location, useValue: { back: () => undefined } },
        { provide: FilterApplyService, useValue: {} },
        { provide: AuthService, useValue: { getAuthUserInfo: () => ({ role: '' }) } },
        {
          provide: FacilityScopeService,
          useValue: { all: () => [], selectedIds: () => [], isSingle: () => false, inScope: () => [], load: () => {}, zone: () => 'America/La_Paz', zoneOf: () => 'America/La_Paz', mixedZones: () => false },
        },
      ],
    })
    fixture = TestBed.createComponent(HistoryComponent)
    history = fixture.componentInstance
    fixture.detectChanges()
    TestBed.tick()
  }

  function menu(): BaseImportExportMenu {
    const found = fixture.debugElement.query(By.directive(BaseImportExportMenu))
    expect(found).withContext('the export menu is not rendered').toBeTruthy()
    return found.componentInstance as BaseImportExportMenu
  }

  function showTimeline(): void {
    history.toggleView()
    fixture.detectChanges()
    TestBed.tick()
  }

  it('keeps Export alive in the table view', () => {
    create(7)
    expect(menu().triggerDisabled()).toBe(false)
  })

  // The regression: the table is gone, the events are not.
  it('keeps Export alive in the timeline view, where the table is destroyed', () => {
    create(7)
    showTimeline()

    expect(fixture.debugElement.query(By.css('p-timeline'))).toBeTruthy()
    expect(menu().nothingToExport()).toBe(false)
    expect(menu().triggerDisabled()).toBe(false)
  })

  it('disables Export when there are no events at all', () => {
    create(0)
    expect(menu().triggerDisabled()).toBe(true)
  })

  it('disables it in the timeline view too, with nothing to show', () => {
    create(0)
    showTimeline()

    expect(menu().triggerDisabled()).toBe(true)
  })

  // Zero events is an answer; "the request has not come back" is not.
  it('keeps Export alive while the events are still loading', () => {
    create(0, () => NEVER)

    expect(history.loading()).toBe(true)
    expect(menu().nothingToExport()).toBe(false)
  })

  // A failed load leaves flowItems empty without meaning the view is empty.
  // Reading that as "nothing to export" left the ⋮ dead for good.
  it('keeps Export alive after a failed load', () => {
    create(0, () => throwError(() => new Error('boom')))

    expect(history.loading()).toBe(false)
    expect(menu().nothingToExport()).toBe(false)
    expect(menu().triggerDisabled()).toBe(false)
  })
})
