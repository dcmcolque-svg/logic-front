import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { provideTranslateService } from '@ngx-translate/core'
import { of } from 'rxjs'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { TranslateLanService } from '../../../core/services/translate-lan.service'
import { FilterPresetService } from '@/app/shared/services/filter-preset.service'
import { TableStateService } from '../../../shared/services/table-state.service'
import { FilterPreset } from '@/app/shared/types/filter-preset.types'
import { ShTableEvent } from '@/app/shared/types/table.types'
import { ReceivingService } from './receivings.service'
import { Receivings } from './receivings.component'

/**
 * Covers how Receivings applies a custom filter: the preset's filters are also
 * handed to the table's column filters, because the table re-emits its own on
 * every page/sort change and they replace the page's — without that, paging
 * after applying a preset dropped it. The template is stubbed out — only the
 * class logic is under test here.
 */

type TableStub = { columnFilters: WritableSignal<Record<string, unknown>> }

/** The parts of Receivings this spec drives that are not public API. */
type ReceivingsInternals = { baseTable: TableStub }

const OR_PRESET: FilterPreset = {
  id: 'p1',
  name: 'Abiertos o sin recibir',
  color: '#3b82f6',
  page_key: 'receivings',
  conditions: [
    { field: 'status', matchMode: 'in', value: ['OPEN'], operator: 'and', position: 1 },
    { field: 'qty_received_sum', matchMode: 'equals', value: 0, operator: 'or', position: 2 },
  ],
  position: 0,
  is_default: false,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}

describe('Receivings — custom filter presets', () => {
  let cmp: Receivings
  let table: TableStub
  let listReceivings: jasmine.Spy
  let scopeValue: WritableSignal<(string | null)[] | null>

  beforeEach(() => {
    spyOn(console, 'log') // the page logs on load; keep the run quiet
    listReceivings = jasmine
      .createSpy('listReceivings')
      .and.returnValue(of({ data: [], meta_data: { page: 1, rows: 15, total_records: 0 } }))
    scopeValue = signal<(string | null)[] | null>(null)
    TestBed.configureTestingModule({
      imports: [Receivings],
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService(),
        provideRouter([]),
        {
          provide: FacilityScopeService,
          useValue: { inScope: signal([]), apiValue: scopeValue, all: signal([]), selectedIds: signal([]), load: () => {}, zone: () => 'America/La_Paz', zoneOf: () => 'America/La_Paz', mixedZones: () => false },
        },
        {
          provide: ReceivingService,
          useValue: {
            listReceivings,
            listCompanies: () => of([]),
          },
        },
        { provide: TranslateLanService, useValue: { changeLanguage: signal('es') } },
        { provide: TableStateService, useValue: { load: () => null, save: () => undefined, clear: () => undefined } },
        {
          provide: FilterPresetService,
          useValue: {
            presets: signal<FilterPreset[]>([]),
            lastAppliedPresetId: signal<string | null>(null),
            loadPresets: () => undefined,
            clearLastApplied: () => undefined,
          },
        },
      ],
    })
    TestBed.overrideComponent(Receivings, { set: { template: '', imports: [] } })
    cmp = TestBed.createComponent(Receivings).componentInstance
    table = { columnFilters: signal<Record<string, unknown>>({}) }
    ;(cmp as unknown as ReceivingsInternals).baseTable = table
  })

  it('applying a preset hands its filters, AND/OR included, to the table', () => {
    cmp.onPresetSelected(OR_PRESET)

    expect(table.columnFilters()).toEqual({
      status: { value: ['OPEN'], matchMode: 'in', operator: 'and', position: 1 },
      qty_received_sum: { value: 0, matchMode: 'equals', operator: 'or', position: 2 },
    })
  })

  it('the request keeps the preset, OR included, after the table re-emits on a page change', () => {
    cmp.onPresetSelected(OR_PRESET)

    // What the table emits on "next page": its own column filters.
    const event: ShTableEvent = {
      pagination: { page: 2, limit: 15, total: 40 },
      filters: table.columnFilters(),
    }
    cmp.onTableStateChange(event)

    expect(cmp.dto().filter).toEqual(
      jasmine.objectContaining({
        status: { value: ['OPEN'], match_mode: 'in', position: 1 },
        qty_received_sum: { value: 0, match_mode: 'equals', operator: 'or', position: 2 },
      }),
    )
  })

  it('sends the global selector as facility_scope, and the facility filter of the preset with its OR', () => {
    scopeValue.set(['f1', null])
    cmp.onPresetSelected({
      ...OR_PRESET,
      conditions: [
        { field: 'status', matchMode: 'in', value: ['OPEN'], operator: 'and', position: 1 },
        { field: 'facility_id', matchMode: 'in', value: ['f2'], operator: 'or', position: 2 },
      ],
    })

    cmp.load()

    const filter = listReceivings.calls.mostRecent().args[0].filter
    expect(filter['facility_scope']).toEqual({ value: ['f1', null], match_mode: 'in' })
    expect(filter['facility_id']).toEqual({ value: ['f2'], match_mode: 'in', operator: 'or', position: 2 })
  })
})
