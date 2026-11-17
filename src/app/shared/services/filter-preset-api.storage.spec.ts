import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'
import { FilterPreset } from '@/app/shared/types/filter-preset.types'
import { FilterPresetApiService } from './filter-preset-api.service'
import { FilterPresetApiStorage } from './filter-preset-api.storage'

/** Covers the per-page cache in front of the HTTP client and when it is dropped. */
describe('FilterPresetApiStorage', () => {
  let storage: FilterPresetApiStorage
  let api: jasmine.SpyObj<FilterPresetApiService>

  const parcels = [{ id: 'p1', page_key: 'parcels' }] as FilterPreset[]
  const orders = [{ id: 'o1', page_key: 'allorders' }] as FilterPreset[]

  function list(pageKey: string): FilterPreset[] | undefined {
    let got: FilterPreset[] | undefined
    storage.list(pageKey).subscribe((p) => (got = p))
    return got
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<FilterPresetApiService>('FilterPresetApiService', ['list', 'create', 'update', 'delete'])
    api.list.and.callFake((pageKey: string) => of(pageKey === 'parcels' ? parcels : orders))
    api.create.and.returnValue(of({ id: 'p2', page_key: 'parcels' } as FilterPreset))
    api.update.and.returnValue(of({ id: 'p1', page_key: 'parcels' } as FilterPreset))
    api.delete.and.returnValue(of(undefined))

    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: FilterPresetApiService, useValue: api }],
    })
    storage = TestBed.inject(FilterPresetApiStorage)
  })

  it('fetches a page once and serves the next reads from the cache', () => {
    expect(list('parcels')).toEqual(parcels)
    expect(list('parcels')).toEqual(parcels)
    expect(api.list).toHaveBeenCalledTimes(1)
  })

  it('caches each page separately', () => {
    expect(list('parcels')).toEqual(parcels)
    expect(list('allorders')).toEqual(orders)
    expect(api.list.calls.allArgs()).toEqual([['parcels'], ['allorders']])
  })

  it('save() drops only the cache of the created preset’s page', () => {
    list('parcels')
    list('allorders')

    storage.save({ page_key: 'parcels', name: 'x', conditions: [] }).subscribe()
    list('parcels')
    list('allorders')

    expect(api.list.calls.allArgs()).toEqual([['parcels'], ['allorders'], ['parcels']])
  })

  it('update() and delete() drop every cached page', () => {
    list('parcels')
    list('allorders')

    storage.update('p1', { name: 'y' }).subscribe()
    list('parcels')
    list('allorders')
    storage.delete('p1').subscribe()
    list('parcels')

    expect(api.update).toHaveBeenCalledWith('p1', { name: 'y' })
    expect(api.delete).toHaveBeenCalledWith('p1')
    expect(api.list).toHaveBeenCalledTimes(5)
  })

  it('invalidateCache() drops one page, or all of them without argument', () => {
    list('parcels')
    list('allorders')

    storage.invalidateCache('parcels')
    list('parcels')
    list('allorders')
    expect(api.list).toHaveBeenCalledTimes(3)

    storage.invalidateCache()
    list('parcels')
    list('allorders')
    expect(api.list).toHaveBeenCalledTimes(5)
  })
})
