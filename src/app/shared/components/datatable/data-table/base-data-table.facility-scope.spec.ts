import { computed, provideZonelessChangeDetection, signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideTranslateService } from '@ngx-translate/core'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { ScopeFacility } from '@/app/core/types/facility.types'
import { ShColumnDef, ShTableEvent } from '../../../types/table.types'
import { BaseDataTable } from './base-data-table.component'

/**
 * Covers how BaseDataTable applies the global facility scope: hiding or
 * narrowing the facility column inside `visibleColumns`, and the effect that
 * clears the local facility filter and re-emits `stateChange` when the topbar
 * selector moves. The template is stubbed out — only the class logic is under
 * test here.
 */

const MIAMI: ScopeFacility = { id: 'f1', name: 'Miami' }
const DALLAS: ScopeFacility = { id: 'f2', name: 'Dallas' }
const LA: ScopeFacility = { id: 'f3', name: 'LA' }

/** Minimal stand-in for FacilityScopeService, driven from the test. */
class ScopeStub {
  readonly all = signal<ScopeFacility[]>([MIAMI, DALLAS, LA])
  readonly selectedIds = signal<string[]>([])
  /** Coverage, like the real service: "all" of a single facility is single too. */
  readonly isSingle = computed(() => {
    const ids = this.selectedIds()
    return (ids.length === 0 ? this.all().length : ids.length) === 1
  })
  /** "All", or "No facility" ticked. */
  readonly includesNoFacility = computed(() => {
    const ids = this.selectedIds()
    return ids.length === 0 || ids.includes('__NULL__')
  })
  readonly isSingleWithoutNulls = computed(
    () => this.isSingle() && !this.includesNoFacility()
  )
  readonly inScope = computed(() => {
    const ids = this.selectedIds()
    return ids.length === 0
      ? this.all()
      : this.all().filter((f) => ids.includes(f.id))
  })
}

function columns(): ShColumnDef[] {
  return [
    { field: 'tracking', header: 'labels.tracking', filterable: true },
    {
      field: 'facility_id',
      header: 'labels.facility',
      filterable: true,
      filterType: 'multiselect',
    },
    { field: 'hidden', header: 'labels.hidden', visible: false },
  ]
}

describe('BaseDataTable — global facility scope', () => {
  let fixture: ComponentFixture<BaseDataTable>
  let table: BaseDataTable
  let scope: ScopeStub
  let emitted: ShTableEvent[]

  function create(
    cols: ShColumnDef[] = columns(),
    disable = false,
    initialFilters: Record<string, unknown> = {},
    nullable = false
  ): void {
    fixture = TestBed.createComponent(BaseDataTable)
    table = fixture.componentInstance
    fixture.componentRef.setInput('columns', cols)
    fixture.componentRef.setInput('initialFilters', initialFilters)
    fixture.componentRef.setInput('pagination', { page: 3, limit: 25, total: 100 })
    fixture.componentRef.setInput('sort', { field: 'tracking', order: 'asc' })
    fixture.componentRef.setInput('disableFacilityScope', disable)
    fixture.componentRef.setInput('nullableFacility', nullable)
    emitted = []
    table.stateChange.subscribe((e) => emitted.push(e))
    fixture.detectChanges()
    TestBed.tick()
  }

  function moveScope(ids: string[]): void {
    scope.selectedIds.set(ids)
    TestBed.tick()
  }

  beforeEach(() => {
    spyOn(console, 'log') // the component logs on init; keep the run quiet
    scope = new ScopeStub()
    TestBed.configureTestingModule({
      imports: [BaseDataTable],
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService(),
        { provide: FacilityScopeService, useValue: scope },
      ],
    })
    TestBed.overrideComponent(BaseDataTable, {
      set: { template: '', imports: [], styleUrl: undefined, styles: [] },
    })
  })

  describe('visibleColumns', () => {
    it('keeps the caller’s own visible:false filtering', () => {
      create()
      expect(table.visibleColumns().map((c) => c.field)).toEqual([
        'tracking',
        'facility_id',
      ])
    })

    it('drops the facility column when one facility is in scope', () => {
      create()
      moveScope(['f2'])
      expect(table.visibleColumns().map((c) => c.field)).toEqual(['tracking'])
    })

    it('narrows the facility filter options when several are in scope', () => {
      create()
      moveScope(['f1', 'f3'])
      const facility = table.visibleColumns().find((c) => c.field === 'facility_id')
      expect(facility?.filterOptions).toEqual([
        { label: 'Miami', value: 'f1' },
        { label: 'LA', value: 'f3' },
      ])
    })

    it('offers every facility when the scope is "all"', () => {
      create()
      const facility = table.visibleColumns().find((c) => c.field === 'facility_id')
      expect(facility?.filterOptions?.length).toBe(3)
    })

    it('ignores the scope entirely when disableFacilityScope is set', () => {
      create(columns(), true)
      moveScope(['f2'])
      const fields = table.visibleColumns().map((c) => c.field)
      expect(fields).toEqual(['tracking', 'facility_id'])
      expect(table.visibleColumns()[1].filterOptions).toBeUndefined()
    })
  })

  describe('mobileColumns (cards below 768px)', () => {
    it('drops the facility field when one facility is in scope', () => {
      create()
      moveScope(['f2'])
      expect(table.mobileColumns().map((c) => c.field)).toEqual(['tracking', 'hidden'])
    })

    it('keeps it, narrowed, when several facilities are in scope', () => {
      create()
      moveScope(['f1', 'f3'])
      const facility = table.mobileColumns().find((c) => c.field === 'facility_id')
      expect(facility?.filterOptions?.map((o) => o.value)).toEqual(['f1', 'f3'])
    })

    it('still hands the cards columns hidden on desktop — they pick their own fields', () => {
      create()
      expect(table.mobileColumns().map((c) => c.field)).toContain('hidden')
    })

    it('drops it for a user who can reach a single facility', () => {
      scope.all.set([MIAMI])
      create()
      expect(table.mobileColumns().map((c) => c.field)).not.toContain('facility_id')
    })

    it('ignores the scope when the table opted out', () => {
      create(columns(), true)
      moveScope(['f2'])
      expect(table.mobileColumns().map((c) => c.field)).toContain('facility_id')
    })
  })

  describe('scope change effect', () => {
    it('does not emit on first render — the parent loads by itself', () => {
      create()
      expect(emitted).toEqual([])
    })

    it('re-emits stateChange on page 1, flagged as a scope change', () => {
      create()
      moveScope(['f1', 'f2'])

      expect(emitted.length).toBe(1)
      expect(emitted[0].facilityScopeChanged).toBeTrue()
      expect(emitted[0].pagination).toEqual({ page: 1, limit: 25, total: 100 })
      expect(emitted[0].sort).toEqual({ field: 'tracking', order: 'asc' })
    })

    it('clears the local facility filter first, keeping the others', () => {
      create()
      table.columnFilters.set({
        facility_id: { value: ['f9'], matchMode: 'in' },
        tracking: { value: 'ABC', matchMode: 'contains' },
      })

      moveScope(['f1'])

      expect(table.columnFilters()).toEqual({
        tracking: { value: 'ABC', matchMode: 'contains' },
      })
      expect(emitted[0].filters).toEqual({
        tracking: { value: 'ABC', matchMode: 'contains' },
      })
    })

    it('clears every facility naming convention the table declares', () => {
      create([
        { field: 'facility_name', header: '', filterable: true },
        { field: 'sku', header: '', filterable: true },
      ])
      table.columnFilters.set({ facility_name: { value: 'Miami' }, sku: { value: 'X' } })

      moveScope(['f1'])

      expect(table.columnFilters()).toEqual({ sku: { value: 'X' } })
    })

    it('still reloads tables without a facility column', () => {
      create([{ field: 'sku', header: '', filterable: true }])
      table.columnFilters.set({ sku: { value: 'X' } })

      moveScope(['f1'])

      expect(emitted.length).toBe(1)
      expect(table.columnFilters()).toEqual({ sku: { value: 'X' } })
    })

    it('emits once per distinct scope, not per signal write', () => {
      create()
      moveScope(['f1'])
      moveScope(['f1']) // same value, new array
      moveScope(['f1', 'f2'])
      moveScope([])

      expect(emitted.length).toBe(3)
    })

    it('stays silent when the table opted out', () => {
      create(columns(), true)
      table.columnFilters.set({ facility_id: { value: ['f9'] } })

      moveScope(['f1'])

      expect(emitted).toEqual([])
      expect(table.columnFilters()).toEqual({ facility_id: { value: ['f9'] } })
    })
  })

  describe('a user who can reach a single facility', () => {
    it('hides the facility column with the default "all" selection', () => {
      scope.all.set([MIAMI])
      create()
      expect(table.visibleColumns().map((c) => c.field)).toEqual(['tracking'])
    })

    it('hides it once the facility list arrives after mount', () => {
      scope.all.set([])
      create()
      expect(table.visibleColumns().map((c) => c.field)).toContain('facility_id')

      scope.all.set([MIAMI])
      TestBed.tick()

      expect(table.visibleColumns().map((c) => c.field)).toEqual(['tracking'])
    })

    it('drops a facility filter the column was carrying when it gets hidden', () => {
      scope.all.set([])
      create()
      table.columnFilters.set({
        facility_id: { value: ['__NULL__'], matchMode: 'in' },
        tracking: { value: 'ABC', matchMode: 'contains' },
      })

      scope.all.set([MIAMI])
      TestBed.tick()

      expect(table.columnFilters()).toEqual({
        tracking: { value: 'ABC', matchMode: 'contains' },
      })
      expect(emitted.length).toBe(1)
      expect(emitted[0].facilityScopeChanged).toBeTrue()
    })

    it('on mount, clears a restored filter on the hidden column and reloads once', () => {
      scope.all.set([MIAMI])
      create(columns(), false, {
        facility_id: { value: ['__NULL__'], matchMode: 'in' },
        tracking: { value: 'ABC', matchMode: 'contains' },
      })

      expect(table.columnFilters()).toEqual({
        tracking: { value: 'ABC', matchMode: 'contains' },
      })
      expect(emitted.length).toBe(1)
      expect(emitted[0].facilityScopeChanged).toBeTrue()
      expect(emitted[0].pagination.page).toBe(1)
    })

    it('on mount without a facility filter, does not reload', () => {
      scope.all.set([MIAMI])
      create(columns(), false, { tracking: { value: 'ABC', matchMode: 'contains' } })
      expect(emitted).toEqual([])
    })

    it('does not reload when the list arrives after mount — the request is the same', () => {
      scope.all.set([])
      create(columns(), false, { tracking: { value: 'ABC', matchMode: 'contains' } })

      scope.all.set([MIAMI])
      TestBed.tick()

      expect(table.visibleColumns().map((c) => c.field)).toEqual(['tracking'])
      expect(emitted).toEqual([])
    })

    it('keeps showing the column for a user with several facilities', () => {
      create()
      expect(table.visibleColumns().map((c) => c.field)).toContain('facility_id')
      expect(emitted).toEqual([])
    })
  })

  describe('a table whose rows can have no facility (nullableFacility)', () => {
    function createNullable(): void {
      create(columns(), false, {}, true)
    }

    it('keeps the column for a user who can reach a single facility: "all" includes the rows without one', () => {
      scope.all.set([MIAMI])
      createNullable()
      expect(table.visibleColumns().map((c) => c.field)).toContain('facility_id')
      expect(table.mobileColumns().map((c) => c.field)).toContain('facility_id')
    })

    it('keeps it while "No facility" is ticked with one facility', () => {
      createNullable()
      moveScope(['__NULL__', 'f2'])
      expect(table.visibleColumns().map((c) => c.field)).toContain('facility_id')
    })

    it('still hides it when the topbar narrows to one facility only', () => {
      createNullable()
      moveScope(['f2'])
      expect(table.visibleColumns().map((c) => c.field)).toEqual(['tracking'])
    })

    it('keeps a facility filter for that user — the column showing it stays', () => {
      scope.all.set([])
      createNullable()
      table.columnFilters.set({ facility_id: { value: ['__NULL__'], matchMode: 'in' } })

      scope.all.set([MIAMI])
      TestBed.tick()

      expect(table.columnFilters()).toEqual({ facility_id: { value: ['__NULL__'], matchMode: 'in' } })
      expect(emitted).toEqual([])
    })
  })
})
