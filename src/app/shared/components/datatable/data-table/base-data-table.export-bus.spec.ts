import { computed, provideZonelessChangeDetection, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideTranslateService } from '@ngx-translate/core'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { ScopeFacility } from '@/app/core/types/facility.types'
import { TableColumnsBus } from '../../../services/table-columns.bus'
import { ShColumnDef } from '../../../types/table.types'
import { BaseDataTable } from './base-data-table.component'

/**
 * What the table tells the header's export menu: the columns it renders and
 * how many records Export would write. The menu has no other way to know — it
 * is a sibling, often in another structural block.
 *
 * The count is not the page on screen. With server paging the file holds the
 * whole filtered result, so the total governs; the rows in hand only answer
 * for a table that holds everything it has.
 */

const MIAMI: ScopeFacility = { id: 'f1', name: 'Miami' }

class ScopeStub {
  readonly all = signal<ScopeFacility[]>([MIAMI])
  readonly selectedIds = signal<string[]>([])
  readonly isSingle = computed(() => this.selectedIds().length === 1)
  readonly inScope = computed(() => this.all())
  load(): void {}
}

const COLUMNS: ShColumnDef[] = [
  { field: 'tracking', header: 'labels.tracking' },
  { field: 'status', header: 'labels.status' },
]

function rows(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: i }))
}

describe('BaseDataTable — what it publishes to the export menu', () => {
  let bus: TableColumnsBus

  function create(
    data: unknown[],
    opts: { total?: number; loading?: boolean; columns?: ShColumnDef[] } = {}
  ) {
    const fixture = TestBed.createComponent(BaseDataTable)
    fixture.componentRef.setInput('columns', opts.columns ?? COLUMNS)
    fixture.componentRef.setInput('data', data)
    fixture.componentRef.setInput('loading', opts.loading ?? false)
    fixture.componentRef.setInput('pagination', {
      page: 1,
      limit: 15,
      total: opts.total ?? 0,
    })
    fixture.detectChanges()
    TestBed.tick()
    return fixture
  }

  beforeEach(() => {
    spyOn(console, 'log') // the component logs on init; keep the run quiet
    TestBed.configureTestingModule({
      imports: [BaseDataTable],
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService(),
        { provide: FacilityScopeService, useClass: ScopeStub },
        TableColumnsBus,
      ],
    })
    TestBed.overrideComponent(BaseDataTable, {
      set: { template: '', imports: [], styleUrl: undefined, styles: [] },
    })
    bus = TestBed.inject(TableColumnsBus)
  })

  it('publishes the columns it renders', () => {
    create(rows(1))
    expect(bus.columns().map((c) => c.field)).toEqual(['tracking', 'status'])
  })

  it('publishes the rows it holds when nothing else says otherwise', () => {
    create(rows(3))
    expect(bus.rowCount()).toBe(3)
  })

  it('reports the whole filtered result, not the page on screen', () => {
    create(rows(15), { total: 94 })
    expect(bus.rowCount()).toBe(94)
  })

  // Deleting or batch-processing the last rows of the page you are standing on
  // leaves the table empty over a result that is not.
  it('survives an empty page of a non-empty result', () => {
    create([], { total: 20 })
    expect(bus.rowCount()).toBe(20)
  })

  it('reports zero when the result itself is empty, so Export can go dead', () => {
    create([], { total: 0 })
    expect(bus.rowCount()).toBe(0)
  })

  // Zero here disabled the ⋮ on every mount, tooltipped "No data to export",
  // until the first response landed.
  it('says nothing while a request is in flight', () => {
    create([], { loading: true })
    expect(bus.rowCount()).toBeNull()
  })

  // The file is written from the view's own columns when the table publishes
  // none, and the mobile layout renders rows regardless, so hiding every
  // column is not an empty result.
  it('does not tie the count to which columns are visible', () => {
    create(rows(2), {
      columns: [{ field: 'tracking', header: 'labels.tracking', visible: false }],
    })
    expect(bus.rowCount()).toBe(2)
  })

  it('follows the data: a filter that returns nothing drops the count', () => {
    const fixture = create(rows(2), { total: 2 })
    expect(bus.rowCount()).toBe(2)

    fixture.componentRef.setInput('data', [])
    fixture.componentRef.setInput('pagination', { page: 1, limit: 15, total: 0 })
    fixture.detectChanges()
    TestBed.tick()

    expect(bus.rowCount()).toBe(0)
  })

  // In History the menu sits outside the `@if` that holds the table, so it is
  // still on screen after the table goes — and the same events are still
  // exportable from the timeline. Reporting zero there would read as "empty
  // result" and kill an export that works, so the table reports nothing at all.
  it('stops reporting when the table is destroyed, rather than claiming zero', () => {
    const fixture = create(rows(2), { total: 2 })
    expect(bus.rowCount()).toBe(2)

    fixture.destroy()

    expect(bus.rowCount()).toBeNull()
  })
})
