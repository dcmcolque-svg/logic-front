import { provideZonelessChangeDetection, signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideTranslateService } from '@ngx-translate/core'
import { of, Subject, throwError } from 'rxjs'
import { Confirmation, ConfirmationService } from 'primeng/api'
import { FilterPresetService } from '@/app/shared/services/filter-preset.service'
import { buildFiltersFromConditions, FilterPreset } from '@/app/shared/types/filter-preset.types'
import { ShColumnDef, ShSortConfig } from '@/app/shared/types/table.types'
import { FilterPresetManagerComponent, TableFilterEntry } from './filter-preset-manager.component'

/**
 * Covers the preset manager: the tabs it shows, and the query-builder dialog
 * that creates, edits and applies custom filters (no duplicate fields, AND/OR
 * groups, auto description, validation). The template is stubbed out — only
 * the class logic is under test here; a last block renders the real template.
 */

const COLUMNS: ShColumnDef[] = [
  { field: 'tracking', header: 'labels.tracking', filterable: true },
  { field: 'qty', header: 'labels.qty', filterable: true, filterType: 'numeric' },
  { field: 'created_at', header: 'labels.created_at', filterable: true, filterType: 'date' },
  { field: 'data_status', header: 'labels.status', filterable: true, filterType: 'multiselect' },
  { field: 'notes', header: 'labels.notes' },
]

function preset(id: string, extra: Partial<FilterPreset> = {}): FilterPreset {
  return {
    id,
    name: `Preset ${id}`,
    page_key: 'parcels',
    conditions: [],
    position: 0,
    is_default: false,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...extra,
  }
}

/** Stand-in for FilterPresetService with real signals and spied mutations. */
class PresetServiceStub {
  presets = signal<FilterPreset[]>([])
  lastAppliedPresetId = signal<string | null>(null)
  loading = signal(false)
  currentPageKey = signal('')
  loadPresets = jasmine.createSpy('loadPresets')
  savePreset = jasmine.createSpy('savePreset').and.callFake((pageKey: string, name: string) =>
    of(preset('created', { page_key: pageKey, name })),
  )
  /** Answers like the backend: the stored preset, with the fields sent applied */
  updatePreset = jasmine
    .createSpy('updatePreset')
    .and.callFake((id: string, name: string, sort?: { field: string; order: string }, opts?: Partial<FilterPreset>) =>
      of(
        preset(id, {
          name,
          description: opts?.description,
          color: opts?.color,
          conditions: opts?.conditions ?? [],
          sort_field: sort?.field ?? null,
          sort_order: sort?.order ?? null,
          position: 3,
        }),
      ),
    )
  deletePreset = jasmine.createSpy('deletePreset')
  setLastApplied = jasmine.createSpy('setLastApplied').and.callFake((id: string) => this.lastAppliedPresetId.set(id))
  clearLastApplied = jasmine.createSpy('clearLastApplied').and.callFake(() => this.lastAppliedPresetId.set(null))
}

/** Local midnight `days` ago as ISO — what the table's own date filter sends */
function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

describe('FilterPresetManagerComponent', () => {
  let fixture: ComponentFixture<FilterPresetManagerComponent>
  let cmp: FilterPresetManagerComponent
  let service: PresetServiceStub
  let confirm: jasmine.SpyObj<ConfirmationService>
  let selected: FilterPreset[]

  function create(inputs: { currentFilters?: Record<string, TableFilterEntry>; currentSort?: ShSortConfig } = {}): void {
    fixture = TestBed.createComponent(FilterPresetManagerComponent)
    cmp = fixture.componentInstance
    fixture.componentRef.setInput('pageKey', 'parcels')
    fixture.componentRef.setInput('columns', COLUMNS)
    if (inputs.currentFilters) fixture.componentRef.setInput('currentFilters', inputs.currentFilters)
    if (inputs.currentSort) fixture.componentRef.setInput('currentSort', inputs.currentSort)
    selected = []
    cmp.presetSelected.subscribe((p) => selected.push(p))
    fixture.detectChanges()
  }

  function rows(): { field: string; matchMode: string; value: unknown; operator: string }[] {
    return cmp.dialogConditions()
  }

  beforeEach(() => {
    service = new PresetServiceStub()
    confirm = jasmine.createSpyObj<ConfirmationService>('ConfirmationService', ['confirm'])
    TestBed.configureTestingModule({
      imports: [FilterPresetManagerComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService(),
        { provide: FilterPresetService, useValue: service },
      ],
    })
    TestBed.overrideComponent(FilterPresetManagerComponent, {
      set: {
        template: '',
        imports: [],
        styleUrl: undefined,
        styles: [],
        providers: [{ provide: ConfirmationService, useValue: confirm }],
      },
    })
  })

  describe('tabs', () => {
    it('loads the presets of its page on init', () => {
      create()
      expect(service.loadPresets).toHaveBeenCalledOnceWith('parcels')
    })

    it('shows up to 7 tabs and moves the rest to the overflow list', () => {
      create()
      service.presets.set(Array.from({ length: 9 }, (_, i) => preset(`p${i}`)))

      expect(cmp.presetCount()).toBe(9)
      expect(cmp.visiblePresets().map((p) => p.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
      expect(cmp.overflowPresets().map((p) => p.id)).toEqual(['p7', 'p8'])
      expect(cmp.hasOverflow()).toBeTrue()
    })

    it('has no overflow with 7 presets or fewer', () => {
      create()
      service.presets.set(Array.from({ length: 7 }, (_, i) => preset(`p${i}`)))
      expect(cmp.hasOverflow()).toBeFalse()
      expect(cmp.overflowPresets()).toEqual([])
    })

    it('selecting a preset remembers it and emits it to the page', () => {
      create()
      const p = preset('a')

      cmp.onSelectPreset(p)

      expect(service.setLastApplied).toHaveBeenCalledWith('a')
      expect(selected).toEqual([p])
    })

    it('selecting a preset resolves its "days ago" dates, leaving other values and the stored preset alone', () => {
      create()
      const p = preset('a', {
        conditions: [
          { field: 'created_at', matchMode: 'gte', value: 7, operator: 'and', position: 1 },
          { field: 'qty', matchMode: 'gte', value: 7, operator: 'or', position: 2 },
          { field: 'created_at', matchMode: 'lte', value: '2026-09-01T00:00:00.000Z' },
        ],
      })

      cmp.onSelectPreset(p)

      expect(selected[0].conditions).toEqual([
        { field: 'created_at', matchMode: 'gte', value: daysAgoIso(7), operator: 'and', position: 1 },
        { field: 'qty', matchMode: 'gte', value: 7, operator: 'or', position: 2 },
        { field: 'created_at', matchMode: 'lte', value: '2026-09-01T00:00:00.000Z' },
      ])
      expect(p.conditions[0].value).withContext('the saved preset stays relative').toBe(7)
    })

    it('lastAppliedPreset resolves the remembered id, or null if it no longer exists', () => {
      create()
      service.presets.set([preset('a'), preset('b')])
      expect(cmp.lastAppliedPreset()).toBeNull()

      service.lastAppliedPresetId.set('b')
      expect(cmp.lastAppliedPreset()?.id).toBe('b')

      service.lastAppliedPresetId.set('deleted')
      expect(cmp.lastAppliedPreset()).toBeNull()
    })

    it('a tab responds to the keyboard only when it is the target, and closes the overflow panel', () => {
      create()
      const p = preset('a')
      const panel = jasmine.createSpyObj('Popover', ['hide'])
      const tab = document.createElement('div')
      const inner = document.createElement('button')

      const fromInner = { target: inner, currentTarget: tab, preventDefault: jasmine.createSpy() } as unknown as Event
      cmp.onPresetKeydown(fromInner, p, panel)
      expect(selected).toEqual([])

      const onTab = { target: tab, currentTarget: tab, preventDefault: jasmine.createSpy() } as unknown as Event
      cmp.onPresetKeydown(onTab, p, panel)
      expect(onTab.preventDefault).toHaveBeenCalled()
      expect(selected).toEqual([p])
      expect(panel.hide).toHaveBeenCalled()

      cmp.onPresetKeydown(onTab, p)
      expect(selected.length).toBe(2)
    })

    it('deleting asks for confirmation and deletes only on accept', () => {
      create()
      const target = document.createElement('button')

      cmp.onDeletePreset({ target } as unknown as Event, preset('a'))

      expect(confirm.confirm).toHaveBeenCalledTimes(1)
      const options: Confirmation = confirm.confirm.calls.mostRecent().args[0]
      expect(options.target).toBe(target)
      expect(options.message).toBe('filter_presets.delete_confirm')
      expect(service.deletePreset).not.toHaveBeenCalled()

      options.accept!()
      expect(service.deletePreset).toHaveBeenCalledOnceWith('a')
    })
  })

  describe('create dialog', () => {
    it('opens with one empty row when no filter is active', () => {
      create()

      cmp.openSaveDialog()

      expect(cmp.showSaveDialog()).toBeTrue()
      expect(cmp.editingPresetId).toBeNull()
      expect(cmp.presetName()).toBe('')
      expect(rows()).toEqual([{ field: '', matchMode: '', value: null, operator: 'and' }])
    })

    it('rotates the default color with the number of presets', () => {
      create()
      cmp.openSaveDialog()
      expect(cmp.presetColor()).toBe('#22c55e')

      service.presets.set([preset('a'), preset('b')])
      cmp.openSaveDialog()
      expect(cmp.presetColor()).toBe('#8b5cf6')

      service.presets.set(Array.from({ length: 9 }, (_, i) => preset(`p${i}`)))
      cmp.openSaveDialog()
      expect(cmp.presetColor()).withContext('wraps around the 8-color palette').toBe('#3b82f6')
    })

    it('seeds the rows from the active filters in chip order, skipping empty ones', () => {
      create({
        currentFilters: {
          tracking: { value: '1Z', matchMode: 'equals', position: 2, operator: 'or' },
          qty: { value: 5, match_mode: 'gte', position: 1 },
          data_status: { value: ['late'] },
          notes: { value: '' },
          created_at: { value: null },
        },
      })

      cmp.openSaveDialog()

      expect(rows()).toEqual([
        { field: 'qty', matchMode: 'gte', value: 5, operator: 'and' },
        { field: 'tracking', matchMode: 'equals', value: '1Z', operator: 'or' },
        { field: 'data_status', matchMode: 'contains', value: ['late'], operator: 'and' },
      ])
    })

    it('snaps a date filter to the closest "days ago" option', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString()
      const invalid = 'not a date'
      create({ currentFilters: { created_at: { value: tenDaysAgo, matchMode: 'gte' } } })

      cmp.openSaveDialog()
      expect(rows()[0].value).toBe(7)

      fixture.componentRef.setInput('currentFilters', { created_at: { value: invalid, matchMode: 'gte' } })
      cmp.openSaveDialog()
      expect(rows()[0].value).toBe(invalid)
    })

    it('saves through the service with the valid rows, the sort and the auto description', () => {
      create({ currentSort: { field: 'created_at', order: 'desc' } })
      cmp.openSaveDialog()
      cmp.presetName.set('  Urgentes  ')
      cmp.onFieldChange(0, 'tracking')
      cmp.onValueChange(0, '1Z')
      cmp.addCondition()
      cmp.onFieldChange(1, 'qty')
      cmp.onMatchModeChange(1, 'gte')
      cmp.onOperatorChange(1, 'or')
      cmp.onValueChange(1, 3)
      cmp.addCondition() // left incomplete: must be dropped

      cmp.onSavePreset()

      expect(service.savePreset).toHaveBeenCalledOnceWith(
        'parcels',
        'Urgentes',
        { field: 'created_at', order: 'desc' },
        {
          description: 'labels.tracking ~ 1Z OR labels.qty ≥ 3',
          color: '#22c55e',
          conditions: [
            { field: 'tracking', matchMode: 'contains', value: '1Z', operator: 'and', position: 1 },
            { field: 'qty', matchMode: 'gte', value: 3, operator: 'or', position: 2 },
          ],
        },
      )
      expect(cmp.showSaveDialog()).toBeFalse()
      expect(selected).withContext('a new preset is not applied automatically').toEqual([])
    })

    it('saves a date condition as "days ago" so the preset stays relative', () => {
      create()
      cmp.openSaveDialog()
      cmp.presetName.set('Recientes')
      cmp.onFieldChange(0, 'created_at')
      cmp.onMatchModeChange(0, 'gte')
      cmp.onValueChange(0, 0)

      cmp.onSavePreset()

      expect(service.savePreset.calls.mostRecent().args[3].conditions[0].value).toBe(0)
    })

    it('a duplicate name (409) keeps the dialog open and says so under the name', () => {
      spyOn(console, 'error')
      service.savePreset.and.returnValue(throwError(() => ({ status: 409 })))
      create()
      cmp.openSaveDialog()
      cmp.presetName.set('Existente')

      cmp.onSavePreset()

      expect(cmp.showSaveDialog()).toBeTrue()
      expect(cmp.nameError()).toBe('filter_presets.name_duplicate')
      expect(cmp.saveError()).toBe('')
      expect(cmp.saving()).toBeFalse()
    })

    it('any other failure keeps the dialog open with a generic error', () => {
      spyOn(console, 'error')
      service.savePreset.and.returnValue(throwError(() => ({ status: 500 })))
      create()
      cmp.openSaveDialog()
      cmp.presetName.set('X')

      cmp.onSavePreset()

      expect(cmp.showSaveDialog()).toBeTrue()
      expect(cmp.saveError()).toBe('filter_presets.save_failed')
      expect(cmp.nameError()).toBe('')
      expect(console.error).toHaveBeenCalled()
    })

    it('waits for the backend: the dialog closes only on success and a second save is ignored meanwhile', () => {
      const pending = new Subject<FilterPreset>()
      service.savePreset.and.returnValue(pending)
      create()
      cmp.openSaveDialog()
      cmp.presetName.set('X')

      cmp.onSavePreset()
      cmp.onSavePreset()

      expect(service.savePreset).toHaveBeenCalledTimes(1)
      expect(cmp.saving()).toBeTrue()
      expect(cmp.showSaveDialog()).toBeTrue()

      pending.next(preset('created'))
      expect(cmp.saving()).toBeFalse()
      expect(cmp.showSaveDialog()).toBeFalse()
    })

    it('reopening the dialog clears a previous save error', () => {
      spyOn(console, 'error')
      service.savePreset.and.returnValue(throwError(() => ({ status: 500 })))
      create()
      cmp.openSaveDialog()
      cmp.presetName.set('X')
      cmp.onSavePreset()

      cmp.openSaveDialog()

      expect(cmp.saveError()).toBe('')
    })

    it('uses the description the user typed instead of the auto one', () => {
      create()
      cmp.openSaveDialog()
      cmp.presetName.set('X')
      cmp.onDescriptionInput('  Mi descripción  ')

      cmp.onSavePreset()

      expect(service.savePreset.calls.mostRecent().args[3].description).toBe('Mi descripción')
    })

    it('sends no description when there is nothing to describe', () => {
      create()
      cmp.openSaveDialog()
      cmp.presetName.set('X')

      cmp.onSavePreset()

      expect(service.savePreset.calls.mostRecent().args[3].description).toBeUndefined()
    })

    it('requires a name of at most 50 characters', () => {
      create()
      cmp.openSaveDialog()

      cmp.presetName.set('   ')
      cmp.onSavePreset()
      expect(cmp.nameError()).toBe('filter_presets.name_required')

      cmp.presetName.set('x'.repeat(51))
      cmp.onSavePreset()
      expect(cmp.nameError()).toBe('filter_presets.name_too_long')

      expect(service.savePreset).not.toHaveBeenCalled()
      expect(cmp.showSaveDialog()).toBeTrue()

      cmp.presetName.set('x'.repeat(50))
      cmp.onSavePreset()
      expect(service.savePreset).toHaveBeenCalled()
    })

    it('Enter in the name field saves; other keys do not', () => {
      create()
      cmp.openSaveDialog()
      cmp.presetName.set('X')

      cmp.onNameKeydown(new KeyboardEvent('keydown', { key: 'a' }))
      expect(service.savePreset).not.toHaveBeenCalled()

      const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
      cmp.onNameKeydown(enter)
      expect(enter.defaultPrevented).toBeTrue()
      expect(service.savePreset).toHaveBeenCalled()
    })

    it('cancel closes the dialog without saving', () => {
      create()
      cmp.openSaveDialog()

      cmp.onCancelSave()

      expect(cmp.showSaveDialog()).toBeFalse()
      expect(service.savePreset).not.toHaveBeenCalled()
    })

    it('Apply puts the valid rows on the table as an unsaved preset, without saving', () => {
      create({ currentSort: { field: 'created_at', order: 'desc' } })
      service.lastAppliedPresetId.set('previous')
      cmp.openSaveDialog()
      cmp.presetColor.set('#3b82f6')
      cmp.onFieldChange(0, 'data_status')
      cmp.onValueChange(0, ['late'])
      cmp.addCondition()

      cmp.onApplyPreset()

      expect(selected.length).toBe(1)
      expect(selected[0]).toEqual(
        jasmine.objectContaining({
          id: '',
          name: 'filter_presets.unsaved',
          color: '#3b82f6',
          page_key: 'parcels',
          sort_field: 'created_at',
          sort_order: 'desc',
          conditions: [{ field: 'data_status', matchMode: 'in', value: ['late'], operator: 'and', position: 1 }],
        }),
      )
      // Pages rebuild their filters from the conditions, exactly as for a saved preset.
      expect(buildFiltersFromConditions(selected[0].conditions)).toEqual({
        data_status: { value: ['late'], matchMode: 'in', operator: 'and', position: 1 },
      })
      expect(service.clearLastApplied).withContext('"Edit" must not overwrite the previous preset').toHaveBeenCalled()
      expect(service.savePreset).not.toHaveBeenCalled()
      expect(cmp.showSaveDialog()).toBeFalse()
    })

    it('Apply uses the typed name when there is one', () => {
      create()
      cmp.openSaveDialog()
      cmp.presetName.set('  Borrador  ')

      cmp.onApplyPreset()

      expect(selected[0].name).toBe('Borrador')
    })

    it('Apply resolves "days ago" dates before handing the filters to the table', () => {
      create()
      cmp.openSaveDialog()
      cmp.onFieldChange(0, 'created_at')
      cmp.onMatchModeChange(0, 'gte')
      cmp.onValueChange(0, 30)

      cmp.onApplyPreset()

      expect(selected[0].conditions[0].value).toBe(daysAgoIso(30))
    })
  })

  describe('condition rows', () => {
    beforeEach(() => {
      create()
      cmp.openSaveDialog()
    })

    it('only offers filterable columns', () => {
      expect(cmp.filterableColumns().map((c) => c.field)).toEqual(['tracking', 'qty', 'created_at', 'data_status'])
    })

    it('does not offer a field already used by another row, but keeps the row’s own', () => {
      cmp.onFieldChange(0, 'tracking')
      cmp.addCondition()
      cmp.onFieldChange(1, 'qty')

      expect(cmp.availableFieldsFor(0).map((c) => c.field)).toEqual(['tracking', 'created_at', 'data_status'])
      expect(cmp.availableFieldsFor(1).map((c) => c.field)).toEqual(['qty', 'created_at', 'data_status'])
    })

    it('changing the field resets the value and picks the first match mode of its type, keeping the operator', () => {
      cmp.onOperatorChange(0, 'or')
      cmp.onValueChange(0, 'old')

      cmp.onFieldChange(0, 'qty')

      expect(rows()[0]).toEqual({ field: 'qty', matchMode: 'equals', value: null, operator: 'or' })
    })

    it('offers match modes by filter type, text by default', () => {
      const modes = (field: string) => cmp.getMatchModesForField(field).map((m) => m.value)

      expect(modes('tracking')).toEqual(['contains', 'equals'])
      expect(modes('qty')).toEqual(['equals', 'gte', 'lte'])
      expect(modes('created_at')).toEqual(['equals', 'gte', 'lte'])
      expect(modes('data_status')).toEqual(['in'])
      expect(modes('unknown')).toEqual(['contains', 'equals'])
      expect(cmp.getMatchModesForField('qty')[1].translatedLabel).toBe('components.gte')
      expect(cmp.getFieldType('unknown')).toBe('text')
    })

    it('removes a row', () => {
      cmp.addCondition()
      cmp.onFieldChange(1, 'qty')

      cmp.removeCondition(0)

      expect(rows().map((r) => r.field)).toEqual(['qty'])
    })

    it('groups rows for display: OR opens a new group', () => {
      for (let i = 1; i < 5; i++) cmp.addCondition()
      cmp.onOperatorChange(2, 'or')
      cmp.onOperatorChange(4, 'or')

      expect(cmp.conditionGroups().map((g) => g.items.map((it) => it.idx))).toEqual([[0, 1], [2, 3], [4]])
      expect(cmp.hasMultipleGroups()).toBeTrue()

      cmp.onOperatorChange(2, 'and')
      cmp.onOperatorChange(4, 'and')
      expect(cmp.hasMultipleGroups()).toBeFalse()
    })

    it('the auto description skips incomplete rows and renders dates as days ago', () => {
      cmp.onFieldChange(0, 'created_at')
      cmp.onMatchModeChange(0, 'gte')
      cmp.onValueChange(0, 7)
      cmp.addCondition() // incomplete
      cmp.addCondition()
      cmp.onFieldChange(2, 'data_status')
      cmp.onValueChange(2, ['late', 'lost'])
      cmp.addCondition()
      cmp.onFieldChange(3, 'created_at')
      cmp.onValueChange(3, 0)

      expect(cmp.autoDescription()).toBe(
        'labels.created_at ≥ 7d AND labels.status ∈ late, lost AND labels.created_at = filter_presets.today',
      )
    })

    it('the auto description is empty without rows and falls back to the raw field and mode', () => {
      cmp.dialogConditions.set([])
      expect(cmp.autoDescription()).toBe('')

      cmp.dialogConditions.set([{ field: 'ghost', matchMode: 'between', value: 'x', operator: 'and' }])
      expect(cmp.autoDescription()).toBe('ghost between x')
    })

    it('exposes translated "days ago" options', () => {
      expect(cmp.daysAgoOptions().map((o) => o.value)).toEqual([0, 1, 3, 7, 15, 30, 60, 90])
      expect(cmp.daysAgoOptions()[0].translatedLabel).toBe('filter_presets.today')
    })
  })

  describe('edit dialog', () => {
    const saved = preset('a', {
      name: 'Atrasados',
      description: 'Desc guardada',
      color: '#ef4444',
      conditions: [
        { field: 'tracking', matchMode: 'contains', value: '1Z' },
        { field: 'created_at', matchMode: 'gte', value: '2026-09-01T00:00:00.000Z', operator: 'or' },
      ],
    })

    it('does nothing without a last applied preset', () => {
      create()
      cmp.openEditDialog()
      expect(cmp.showSaveDialog()).toBeFalse()
    })

    it('pre-fills from the preset and shows a stored date as the closest "days ago" option', () => {
      create()
      service.presets.set([{ ...saved, conditions: [saved.conditions[0], { ...saved.conditions[1], value: daysAgoIso(14) }] }])
      service.lastAppliedPresetId.set('a')

      cmp.openEditDialog()

      expect(cmp.editingPresetId).toBe('a')
      expect(cmp.presetName()).toBe('Atrasados')
      expect(cmp.presetDescription()).toBe('Desc guardada')
      expect(cmp.presetColor()).toBe('#ef4444')
      expect(cmp.userEditedDescription()).toBeTrue()
      expect(rows()[0]).toEqual({ field: 'tracking', matchMode: 'contains', value: '1Z', operator: 'and' })
      expect(rows()[1].operator).toBe('or')
      expect(rows()[1].value).withContext('the date select only offers "days ago" options').toBe(15)
    })

    describe('relative dates', () => {
      const lastWeek = preset('w', {
        name: 'Semana',
        conditions: [
          { field: 'created_at', matchMode: 'gte', value: 7, operator: 'and', position: 1 },
          { field: 'tracking', matchMode: 'contains', value: '1Z', operator: 'or', position: 2 },
        ],
      })

      /** Selects the preset and gives the dialog the filters the page builds from it. */
      function applyThenOpenEdit(liveOverride: Record<string, TableFilterEntry> = {}): void {
        create()
        service.presets.set([lastWeek])
        cmp.onSelectPreset(lastWeek)
        const live = { ...buildFiltersFromConditions(selected[0].conditions), ...liveOverride }
        fixture.componentRef.setInput('currentFilters', live)
        cmp.openEditDialog()
      }

      it('editing a preset with a relative date keeps the number of days, even when only the name changes', () => {
        applyThenOpenEdit()
        expect(rows()[0].value).toBe(7)

        cmp.presetName.set('Semana pasada')
        cmp.onSavePreset()

        const sent = service.updatePreset.calls.mostRecent().args[3].conditions
        expect(sent[0]).toEqual(jasmine.objectContaining({ field: 'created_at', value: 7 }))
      })

      it('keeps the saved number even if the preset was applied on an earlier day', () => {
        // Applied yesterday: the table still holds the date resolved back then.
        applyThenOpenEdit({ created_at: { value: daysAgoIso(8), matchMode: 'gte', operator: 'and', position: 1 } })

        expect(rows()[0].value).toBe(7)
      })

      it('a date typed in the column (no position) replaces the saved one, as the closest option', () => {
        const typed = new Date()
        typed.setDate(typed.getDate() - 30)
        applyThenOpenEdit({ created_at: { value: typed, matchMode: 'gte' } })

        expect(rows().find((r) => r.field === 'created_at')?.value).toBe(30)
      })

      it('"today" is still today in the afternoon (calendar days, not hours)', () => {
        jasmine.clock().install()
        jasmine.clock().mockDate(new Date(2026, 10, 3, 18, 30))
        try {
          create({ currentFilters: { created_at: { value: daysAgoIso(0), matchMode: 'gte' } } })
          service.presets.set([preset('t')])
          service.lastAppliedPresetId.set('t')

          cmp.openEditDialog()

          expect(rows()[0].value).toBe(0)
        } finally {
          jasmine.clock().uninstall()
        }
      })

      it('Apply while editing keeps the edited preset as the last applied one', () => {
        applyThenOpenEdit()
        service.clearLastApplied.calls.reset()

        cmp.onApplyPreset()

        expect(selected[1].id).toBe('w')
        expect(service.clearLastApplied).not.toHaveBeenCalled()
        expect(cmp.editingPresetId).toBeNull()
      })
    })

    it('uses the live table filters when there are any, so inline edits are kept', () => {
      create({ currentFilters: { qty: { value: 9, matchMode: 'lte' } } })
      service.presets.set([saved])
      service.lastAppliedPresetId.set('a')

      cmp.openEditDialog()

      expect(rows()).toEqual([{ field: 'qty', matchMode: 'lte', value: 9, operator: 'and' }])
    })

    it('falls back to defaults for a preset without description, color or conditions', () => {
      create({ currentFilters: { tracking: { value: '' } } })
      service.presets.set([preset('b')])
      service.lastAppliedPresetId.set('b')

      cmp.openEditDialog()

      expect(cmp.presetDescription()).toBe('')
      expect(cmp.presetColor()).toBe('#22c55e')
      expect(cmp.userEditedDescription()).toBeFalse()
      expect(rows()).toEqual([{ field: '', matchMode: '', value: null, operator: 'and' }])
    })

    it('keeps an unparseable stored date as it is', () => {
      create()
      service.presets.set([preset('c', { conditions: [{ field: 'created_at', matchMode: 'gte', value: 'yesterday' }] })])
      service.lastAppliedPresetId.set('c')

      cmp.openEditDialog()

      expect(rows()[0].value).toBe('yesterday')
    })

    it('saving updates the preset and re-applies what the backend stored', () => {
      create({ currentSort: { field: 'tracking', order: 'asc' } })
      service.presets.set([saved])
      service.lastAppliedPresetId.set('a')
      cmp.openEditDialog()
      cmp.presetName.set('Renombrado')

      cmp.onSavePreset()

      expect(service.updatePreset).toHaveBeenCalledTimes(1)
      const [id, name, sort, opts] = service.updatePreset.calls.mostRecent().args
      expect([id, name, sort]).toEqual(['a', 'Renombrado', { field: 'tracking', order: 'asc' }])
      expect(opts.description).toBe('Desc guardada')
      expect(service.savePreset).not.toHaveBeenCalled()
      expect(service.setLastApplied).toHaveBeenCalledWith('a')
      expect(selected.length).toBe(1)
      expect(selected[0]).toEqual(
        jasmine.objectContaining({
          id: 'a',
          name: 'Renombrado',
          color: '#ef4444',
          sort_field: 'tracking',
          sort_order: 'asc',
          position: 3,
        }),
      )
      expect(cmp.editingPresetId).toBeNull()
      expect(cmp.showSaveDialog()).toBeFalse()
    })

    it('the re-applied preset has its "days ago" dates resolved', () => {
      create({ currentFilters: { created_at: { value: daysAgoIso(15), matchMode: 'gte' } } })
      service.presets.set([saved])
      service.lastAppliedPresetId.set('a')
      cmp.openEditDialog()

      cmp.onSavePreset()

      expect(service.updatePreset.calls.mostRecent().args[3].conditions[0].value).withContext('stored relative').toBe(15)
      expect(selected[0].conditions[0].value).toBe(daysAgoIso(15))
    })

    it('a failed update keeps the dialog open and applies nothing', () => {
      spyOn(console, 'error')
      service.updatePreset.and.returnValue(throwError(() => ({ status: 409 })))
      create()
      service.presets.set([saved])
      service.lastAppliedPresetId.set('a')
      cmp.openEditDialog()

      cmp.onSavePreset()

      expect(cmp.showSaveDialog()).toBeTrue()
      expect(cmp.editingPresetId).withContext('a retry still updates the same preset').toBe('a')
      expect(cmp.nameError()).toBe('filter_presets.name_duplicate')
      expect(selected).toEqual([])
      expect(service.setLastApplied).not.toHaveBeenCalled()
    })
  })
})

describe('FilterPresetManagerComponent — rendered', () => {
  it('renders one tab per visible preset with its name', async () => {
    const service = new PresetServiceStub()
    service.presets.set([preset('a', { name: 'Urgentes', color: '#ef4444' }), preset('b', { name: 'Atrasados' })])
    TestBed.configureTestingModule({
      imports: [FilterPresetManagerComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService(),
        { provide: FilterPresetService, useValue: service },
      ],
    })
    const fixture = TestBed.createComponent(FilterPresetManagerComponent)
    fixture.componentRef.setInput('pageKey', 'parcels')
    fixture.componentRef.setInput('columns', COLUMNS)

    fixture.detectChanges()
    await fixture.whenStable()

    const text = (fixture.nativeElement as HTMLElement).textContent ?? ''
    expect(text).toContain('Urgentes')
    expect(text).toContain('Atrasados')
  })
})
