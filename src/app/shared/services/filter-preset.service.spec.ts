import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { of, Subject, throwError } from 'rxjs'
import { FilterPreset } from '@/app/shared/types/filter-preset.types'
import { FilterPresetApiStorage } from './filter-preset-api.storage'
import { FILTER_PRESETS_ENABLED, FilterPresetService } from './filter-preset.service'

/**
 * Covers FilterPresetService: loading and ordering a page's presets, the
 * per-page "last applied" memory in localStorage, and the refresh after every
 * mutation.
 */

const STORAGE_KEY = 'logic:preset:lastApplied'

function preset(id: string, position: number, updatedAt = '2026-09-01T00:00:00Z', extra: Partial<FilterPreset> = {}): FilterPreset {
  return {
    id,
    name: id,
    page_key: 'parcels',
    conditions: [],
    position,
    is_default: false,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: updatedAt,
    ...extra,
  }
}

describe('FilterPresetService', () => {
  let service: FilterPresetService
  let storage: jasmine.SpyObj<FilterPresetApiStorage>
  let pages: Record<string, FilterPreset[]>

  function storedMap(): Record<string, string> {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  }

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY)
    spyOn(console, 'error') // failure paths log; keep the run quiet
    pages = {
      parcels: [preset('b', 2), preset('a', 1), preset('c', 2, '2026-09-05T00:00:00Z')],
      allorders: [preset('o1', 0, undefined, { page_key: 'allorders' })],
    }
    storage = jasmine.createSpyObj<FilterPresetApiStorage>('FilterPresetApiStorage', [
      'list',
      'save',
      'update',
      'delete',
      'invalidateCache',
    ])
    storage.list.and.callFake((pageKey: string) => of(pages[pageKey] ?? []))
    storage.save.and.returnValue(of(preset('new', 9)))
    storage.update.and.returnValue(of(preset('a', 1)))
    storage.delete.and.returnValue(of(undefined))

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: FilterPresetApiStorage, useValue: storage },
        { provide: FILTER_PRESETS_ENABLED, useValue: true },
      ],
    })
    service = TestBed.inject(FilterPresetService)
  })

  afterEach(() => localStorage.removeItem(STORAGE_KEY))

  describe('loadPresets', () => {
    it('loads the page and orders by position, then most recently updated', () => {
      service.loadPresets('parcels')

      expect(storage.list).toHaveBeenCalledWith('parcels')
      expect(service.presets().map((p) => p.id)).toEqual(['a', 'c', 'b'])
      expect(service.currentPageKey()).toBe('parcels')
      expect(service.loading()).toBeFalse()
    })

    it('puts the last applied preset of the page first', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ parcels: 'b' }))

      service.loadPresets('parcels')

      expect(service.lastAppliedPresetId()).toBe('b')
      expect(service.presets().map((p) => p.id)).toEqual(['b', 'a', 'c'])
    })

    it('restores the last applied id per page, not globally', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ parcels: 'b' }))

      service.loadPresets('allorders')

      expect(service.lastAppliedPresetId()).toBeNull()
    })

    it('clears the previous page’s presets while the request is in flight', () => {
      service.loadPresets('parcels')
      const pending = new Subject<FilterPreset[]>()
      storage.list.and.returnValue(pending)

      service.loadPresets('allorders')

      expect(service.presets()).toEqual([])
      expect(service.loading()).toBeTrue()
      pending.next(pages['allorders'])
      expect(service.presets().map((p) => p.id)).toEqual(['o1'])
      expect(service.loading()).toBeFalse()
    })

    it('falls back to no presets when the API fails, so the table loads unfiltered', () => {
      storage.list.and.returnValue(throwError(() => new Error('500')))

      service.loadPresets('parcels')

      expect(service.presets()).toEqual([])
      expect(service.loading()).toBeFalse()
    })

    it('tolerates a corrupt localStorage entry', () => {
      localStorage.setItem(STORAGE_KEY, '{not json')

      service.loadPresets('parcels')

      expect(service.lastAppliedPresetId()).toBeNull()
      expect(service.presets().length).toBe(3)
    })
  })

  describe('last applied preset', () => {
    beforeEach(() => service.loadPresets('parcels'))

    it('setLastApplied() keeps it in the signal and in the per-page map', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ allorders: 'o1' }))

      service.setLastApplied('c')

      expect(service.lastAppliedPresetId()).toBe('c')
      expect(storedMap()).toEqual({ allorders: 'o1', parcels: 'c' })
    })

    it('clearLastApplied() forgets only the current page', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ allorders: 'o1', parcels: 'c' }))

      service.clearLastApplied()

      expect(service.lastAppliedPresetId()).toBeNull()
      expect(storedMap()).toEqual({ allorders: 'o1' })
    })

    it('ignores localStorage write failures (private mode, quota)', () => {
      spyOn(localStorage, 'setItem').and.throwError('QuotaExceededError')

      expect(() => service.setLastApplied('a')).not.toThrow()
      expect(service.lastAppliedPresetId()).toBe('a')
    })
  })

  describe('mutations', () => {
    beforeEach(() => {
      service.loadPresets('parcels')
      storage.list.calls.reset()
    })

    it('savePreset() sends the create input and refreshes the active page bypassing the cache', () => {
      const conditions = [{ field: 'data_status', matchMode: 'in', value: ['late'], operator: 'and' as const, position: 1 }]

      let saved: FilterPreset | undefined
      service
        .savePreset('parcels', 'Urgentes', { field: 'created_at', order: 'desc' }, {
          description: 'Late parcels',
          color: '#ef4444',
          conditions,
        })
        .subscribe((p) => (saved = p))

      expect(storage.save).toHaveBeenCalledWith({
        page_key: 'parcels',
        name: 'Urgentes',
        description: 'Late parcels',
        color: '#ef4444',
        conditions,
        sort_field: 'created_at',
        sort_order: 'desc',
      })
      expect(saved?.id).toBe('new')
      expect(storage.invalidateCache).toHaveBeenCalledWith('parcels')
      expect(storage.list).toHaveBeenCalledWith('parcels')
    })

    it('savePreset() and updatePreset() send nothing until the caller subscribes', () => {
      const pending = new Subject<FilterPreset>()
      storage.save.and.returnValue(pending)

      const save$ = service.savePreset('parcels', 'Lazy')
      service.updatePreset('a', 'Lazy')

      expect(storage.list).not.toHaveBeenCalled()
      save$.subscribe()
      expect(storage.list).not.toHaveBeenCalled()
      pending.next(preset('new', 9))
      expect(storage.list).toHaveBeenCalledOnceWith('parcels')
    })

    it('savePreset() without sort or options sends nulls and an empty condition list', () => {
      service.savePreset('parcels', 'Solo nombre').subscribe()

      expect(storage.save).toHaveBeenCalledWith({
        page_key: 'parcels',
        name: 'Solo nombre',
        description: undefined,
        color: undefined,
        conditions: [],
        sort_field: null,
        sort_order: null,
      })
    })

    it('savePreset() for another page does not refresh the visible one', () => {
      service.savePreset('allorders', 'Otro').subscribe()

      expect(storage.save).toHaveBeenCalled()
      expect(storage.list).not.toHaveBeenCalled()
    })

    it('updatePreset() sends the update input and refreshes', () => {
      service.updatePreset('a', 'Renombrado', undefined, { color: '#22c55e' }).subscribe()

      expect(storage.update).toHaveBeenCalledWith('a', {
        name: 'Renombrado',
        description: undefined,
        color: '#22c55e',
        conditions: [],
        sort_field: null,
        sort_order: null,
      })
      expect(storage.list).toHaveBeenCalledWith('parcels')
    })

    it('deletePreset() deletes and refreshes', () => {
      pages['parcels'] = [preset('a', 1)]

      service.deletePreset('b')

      expect(storage.delete).toHaveBeenCalledWith('b')
      expect(service.presets().map((p) => p.id)).toEqual(['a'])
    })

    it('a failed delete leaves the list as it was', () => {
      storage.delete.and.returnValue(throwError(() => new Error('404')))

      service.deletePreset('b')

      expect(storage.list).not.toHaveBeenCalled()
      expect(service.presets().length).toBe(3)
    })

    it('a failed refresh keeps the current list', () => {
      storage.list.and.returnValue(throwError(() => new Error('500')))

      service.deletePreset('b')

      expect(service.presets().length).toBe(3)
    })

    for (const action of ['savePreset', 'updatePreset'] as const) {
      it(`a failed ${action}() reaches the caller and does not refresh`, () => {
        const err = { status: 409 }
        storage.save.and.returnValue(throwError(() => err))
        storage.update.and.returnValue(throwError(() => err))
        let received: unknown

        const request$ = action === 'savePreset' ? service.savePreset('parcels', 'dup') : service.updatePreset('a', 'dup')
        request$.subscribe({ error: (e) => (received = e) })

        expect(received).toBe(err)
        expect(storage.list).not.toHaveBeenCalled()
      })
    }
  })

  it('does not refresh before any page was loaded', () => {
    service.deletePreset('x')

    expect(storage.invalidateCache).not.toHaveBeenCalled()
    expect(storage.list).not.toHaveBeenCalled()
  })

  it('buildFiltersFromPreset() rebuilds the table filters from the stored conditions', () => {
    const p = preset('a', 1, undefined, {
      conditions: [{ field: 'tracking', matchMode: 'contains', value: '1Z', operator: 'or', position: 2 }],
    })

    expect(service.buildFiltersFromPreset(p)).toEqual({
      tracking: { value: '1Z', matchMode: 'contains', operator: 'or', position: 2 },
    })
    expect(service.buildFiltersFromPreset({ ...p, conditions: undefined as never })).toEqual({})
  })
})
