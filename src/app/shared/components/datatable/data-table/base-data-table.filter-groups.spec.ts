import { computed, provideZonelessChangeDetection, signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideTranslateService } from '@ngx-translate/core'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { ActiveFilterChip } from '../../../types/table.types'
import { BaseDataTable } from './base-data-table.component'

/**
 * Covers how BaseDataTable groups the filter chips of a custom filter: an OR
 * chip opens a new parenthesized group, AND chips join the current one. The
 * template is stubbed out — only the class logic is under test here.
 */

/** A chip from a custom filter (with position) or, without position, typed in the table */
function chip(field: string, operator?: 'and' | 'or', position?: number): ActiveFilterChip {
  return { field, label: field, displayValue: field, operator, position }
}

describe('BaseDataTable — AND/OR chip groups', () => {
  let fixture: ComponentFixture<BaseDataTable>
  let table: BaseDataTable

  function withChips(chips: ActiveFilterChip[]): void {
    fixture.componentRef.setInput('activeFilterChips', chips)
  }

  function groups(): string[][] {
    return table.chipGroups().map((g) => g.map((c) => c.field))
  }

  beforeEach(() => {
    spyOn(console, 'log') // the component logs on init; keep the run quiet
    const scope = {
      all: signal([]),
      selectedIds: signal<string[]>([]),
      isSingle: computed(() => false),
      inScope: computed(() => []),
      load: () => {},
    }
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
    fixture = TestBed.createComponent(BaseDataTable)
    table = fixture.componentInstance
    fixture.componentRef.setInput('columns', [])
  })

  function ungrouped(): string[] {
    return table.ungroupedChips().map((c) => c.field)
  }

  it('has no groups and no OR badge without chips', () => {
    withChips([])
    expect(table.chipGroups()).toEqual([])
    expect(table.ungroupedChips()).toEqual([])
    expect(table.hasAnyOrFilter()).toBeFalse()
  })

  it('keeps AND-only chips in a single row', () => {
    withChips([chip('a', 'and', 1), chip('b', 'and', 2), chip('c')])
    expect(groups()).toEqual([['a', 'b', 'c']])
    expect(ungrouped()).toEqual([])
    expect(table.hasAnyOrFilter()).toBeFalse()
  })

  it('opens a new group at every OR', () => {
    withChips([chip('a', 'and', 1), chip('b', 'and', 2), chip('c', 'or', 3), chip('d', 'and', 4), chip('e', 'or', 5)])
    expect(groups()).toEqual([['a', 'b'], ['c', 'd'], ['e']])
    expect(table.hasAnyOrFilter()).toBeTrue()
  })

  it('ignores OR on the first chip, as the backend does: there is nothing before it to split from', () => {
    withChips([chip('a', 'or', 1), chip('b', 'and', 2)])
    expect(groups()).toEqual([['a', 'b']])
    expect(table.hasAnyOrFilter()).toBeFalse()
  })

  it('shows chips without position outside the OR groups, since they narrow the whole result', () => {
    withChips([
      chip('a', 'and', 1),
      chip('b', 'or', 2),
      chip('inline'), // typed in the table after applying the preset
      chip('scope', 'and', Number.MAX_SAFE_INTEGER), // how the chips util marks "no position"
    ])
    expect(groups()).toEqual([['a'], ['b']])
    expect(ungrouped()).toEqual(['inline', 'scope'])
  })

  it('an OR on a chip without position has no effect', () => {
    withChips([chip('a', 'and', 1), chip('b', 'or')])
    expect(groups()).toEqual([['a', 'b']])
    expect(ungrouped()).toEqual([])
  })

  it('follows the chips input when it changes', () => {
    withChips([chip('a', 'and', 1), chip('b', 'or', 2)])
    expect(groups()).toEqual([['a'], ['b']])

    withChips([chip('a', 'and', 1), chip('b', 'and', 2)])
    expect(groups()).toEqual([['a', 'b']])
  })
})
