import { provideZonelessChangeDetection, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { environment } from '@/environments/environment'
import { AuthService } from './auth.service'
import { FacilityScopeService } from './facility-scope.service'
import { NO_FACILITY_ID, ScopeFacility } from '../types/facility.types'

const MIAMI: ScopeFacility = { id: 'f1', name: 'Miami', code: 'MIA' }
const DALLAS: ScopeFacility = { id: 'f2', name: 'Dallas' }
const LA: ScopeFacility = { id: 'f3', name: 'LA' }
const ALL = [MIAMI, DALLAS, LA]

const MY_FACILITIES_URL = environment.URL_API + 'v2/facility/my'
const UID = 'user-42'
const SCOPED_KEY = `${UID}:facility-scope`

/** A selection as the service stores it now. */
const stored = (ids: unknown[]) => JSON.stringify({ v: 2, ids })

describe('FacilityScopeService', () => {
  let service: FacilityScopeService
  let http: HttpTestingController
  let authInfo: ReturnType<typeof signal<{ uid?: string } | null>>

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { authInfo } },
      ],
    })
    service = TestBed.inject(FacilityScopeService)
    http = TestBed.inject(HttpTestingController)
  }

  /** Calls load() and answers the request with the given facilities. */
  function loadWith(facilities: ScopeFacility[]): void {
    service.load()
    http.expectOne(MY_FACILITIES_URL).flush({ data: facilities })
  }

  /** What the topbar selector does on init: restore the persisted scope, then load. */
  function restoreAndLoadWith(facilities: ScopeFacility[]): void {
    service.restoreSelection()
    loadWith(facilities)
  }

  beforeEach(() => {
    localStorage.clear()
    authInfo = signal<{ uid?: string } | null>({ uid: UID })
  })

  afterEach(() => {
    http?.verify()
    localStorage.clear()
  })

  describe('default state', () => {
    beforeEach(setup)

    it('starts unrestricted', () => {
      expect(service.selectedIds()).toEqual([])
      expect(service.isAll()).toBeTrue()
      expect(service.isSingle()).toBeFalse()
      expect(service.isMultiple()).toBeFalse()
      expect(service.apiValue()).toBeNull()
      expect(service.label()).toBeNull()
      expect(service.loaded()).toBeFalse()
    })

    it('offers every facility while unrestricted', () => {
      loadWith(ALL)
      expect(service.inScope()).toEqual(ALL)
    })
  })

  describe('load()', () => {
    beforeEach(setup)

    it("posts for the user's facilities, page 1 of 200", () => {
      service.load()
      const req = http.expectOne(MY_FACILITIES_URL)
      expect(req.request.method).toBe('POST')
      expect(req.request.body).toEqual({
        filter: {},
        config: { page: 1, rows: 200 },
      })
      expect(service.loading()).toBeTrue()

      req.flush({ data: ALL })

      expect(service.all()).toEqual(ALL)
      expect(service.loaded()).toBeTrue()
      expect(service.loading()).toBeFalse()
    })

    it('is a no-op while in flight or once loaded', () => {
      service.load()
      service.load() // in flight
      const req = http.expectOne(MY_FACILITIES_URL)
      req.flush({ data: ALL })

      service.load() // loaded
      http.expectNone(MY_FACILITIES_URL)
      expect(service.all()).toEqual(ALL)
    })

    it('reloads when forced', () => {
      loadWith([MIAMI])
      service.load(true)
      http.expectOne(MY_FACILITIES_URL).flush({ data: ALL })
      expect(service.all()).toEqual(ALL)
    })

    it('treats a missing data array as no facilities', () => {
      service.load()
      http.expectOne(MY_FACILITIES_URL).flush(null)
      expect(service.all()).toEqual([])
      expect(service.loaded()).toBeTrue()
    })

    it('stays retryable when the request fails', () => {
      service.load()
      http
        .expectOne(MY_FACILITIES_URL)
        .flush('boom', { status: 500, statusText: 'Server Error' })

      expect(service.loading()).toBeFalse()
      expect(service.loaded()).toBeFalse()

      service.load()
      http.expectOne(MY_FACILITIES_URL).flush({ data: ALL })
      expect(service.loaded()).toBeTrue()
    })
  })

  describe('selection semantics', () => {
    beforeEach(() => {
      setup()
      loadWith(ALL)
    })

    it('a single facility hides the column and names the trigger', () => {
      service.setSelection(['f2'])
      expect(service.isSingle()).toBeTrue()
      expect(service.isMultiple()).toBeFalse()
      expect(service.isAll()).toBeFalse()
      expect(service.inScope()).toEqual([DALLAS])
      expect(service.apiValue()).toEqual(['f2'])
      expect(service.label()).toBe('Dallas')
    })

    it('several facilities narrow the scope without a name label', () => {
      service.setSelection(['f1', 'f3'])
      expect(service.isMultiple()).toBeTrue()
      expect(service.inScope()).toEqual([MIAMI, LA])
      expect(service.apiValue()).toEqual(['f1', 'f3'])
      expect(service.label()).toBeNull()
    })

    it('ticking every option means "all": no API filter is sent', () => {
      service.setSelection(['f3', NO_FACILITY_ID, 'f1', 'f2'])
      expect(service.isAll()).toBeTrue()
      expect(service.apiValue()).toBeNull()
      expect(service.label()).toBeNull()
    })

    it('every facility without "No facility" still leaves those records out', () => {
      service.setSelection(['f3', 'f1', 'f2'])
      expect(service.isAll()).toBeFalse()
      expect(service.includesNoFacility()).toBeFalse()
      expect(service.apiValue()).toEqual(['f3', 'f1', 'f2'])
    })

    it('removes duplicate ids', () => {
      service.setSelection(['f1', 'f1', 'f2'])
      expect(service.selectedIds()).toEqual(['f1', 'f2'])
    })

    it('treats a null selection as "all"', () => {
      service.setSelection(null as unknown as string[])
      expect(service.selectedIds()).toEqual([])
      expect(service.isAll()).toBeTrue()
    })

    it('clear() goes back to "all"', () => {
      service.setSelection(['f1'])
      service.clear()
      expect(service.selectedIds()).toEqual([])
      expect(service.apiValue()).toBeNull()
    })
  })

  describe('"No facility"', () => {
    beforeEach(() => {
      setup()
      loadWith(ALL)
    })

    it('is in scope while unrestricted', () => {
      expect(service.includesNoFacility()).toBeTrue()
    })

    it('is out of scope once the selection narrows without it', () => {
      service.setSelection(['f1'])
      expect(service.includesNoFacility()).toBeFalse()
    })

    it('travels to the API as null, next to the facilities', () => {
      service.setSelection([NO_FACILITY_ID, 'f2'])
      expect(service.includesNoFacility()).toBeTrue()
      expect(service.apiValue()).toEqual([null, 'f2'])
    })

    it('is not a facility: column-filter options leave it out', () => {
      service.setSelection([NO_FACILITY_ID, 'f2'])
      expect(service.inScope()).toEqual([DALLAS])
      expect(service.isMultiple()).toBeTrue()
    })

    it('alone keeps the facility column, which shows "—" for those records', () => {
      service.setSelection([NO_FACILITY_ID])
      expect(service.isSingle()).toBeFalse()
      expect(service.inScope()).toEqual([])
      expect(service.apiValue()).toEqual([null])
      expect(service.label()).toBeNull()
    })
  })

  describe('isSingleWithoutNulls (tables whose rows can lack a facility)', () => {
    beforeEach(setup)

    it('is single when the topbar narrows to one facility only', () => {
      loadWith(ALL)
      service.setSelection(['f2'])
      expect(service.isSingle()).toBeTrue()
      expect(service.isSingleWithoutNulls()).toBeTrue()
    })

    it('is not single while "No facility" is ticked with one facility', () => {
      loadWith(ALL)
      service.setSelection([NO_FACILITY_ID, 'f2'])
      expect(service.isSingleWithoutNulls()).toBeFalse()
    })

    it('is not single for a user who can reach one facility: "all" brings the rows without one', () => {
      loadWith([MIAMI])
      expect(service.isSingle()).toBeTrue()
      expect(service.isSingleWithoutNulls()).toBeFalse()
    })
  })

  describe('a user who can reach a single facility', () => {
    beforeEach(() => {
      setup()
      loadWith([MIAMI])
    })

    it('is scoped to it with the default empty selection', () => {
      expect(service.selectedIds()).toEqual([])
      expect(service.isSingle()).toBeTrue()
      expect(service.isMultiple()).toBeFalse()
      expect(service.hasSingleFacility()).toBeTrue()
      expect(service.inScope()).toEqual([MIAMI])
      expect(service.label()).toBe('Miami')
    })

    it('still sends no facility filter — the backend already limits to it', () => {
      expect(service.isAll()).toBeTrue()
      expect(service.apiValue()).toBeNull()
    })

    it('stays single when that facility is ticked explicitly', () => {
      service.setSelection(['f1'])
      expect(service.isSingle()).toBeTrue()
      expect(service.apiValue()).toBeNull()
    })

    it('is never narrowed past "all": the locked selector could not undo it', () => {
      // e.g. a selection persisted before the user lost the other facilities;
      // it would hide their operator-level records with no way back.
      service.setSelection(['f1'])
      expect(service.isAll()).toBeTrue()
      expect(service.includesNoFacility()).toBeTrue()
    })
  })

  describe('coverage with several facilities', () => {
    beforeEach(() => {
      setup()
      loadWith(ALL)
    })

    it('"all" covers several facilities: not single, not locked', () => {
      expect(service.isSingle()).toBeFalse()
      expect(service.isMultiple()).toBeTrue()
      expect(service.hasSingleFacility()).toBeFalse()
      expect(service.label()).toBeNull()
    })
  })

  it('is neither single nor multiple before the list loads', () => {
    setup()
    expect(service.isSingle()).toBeFalse()
    expect(service.isMultiple()).toBeFalse()
    expect(service.hasSingleFacility()).toBeFalse()
  })

  describe('isAll before facilities are known', () => {
    it('keeps a restored selection as a restriction until the list loads', () => {
      localStorage.setItem(SCOPED_KEY, stored(['f1']))
      setup()
      service.restoreSelection()
      service.load() // request still pending

      expect(service.selectedIds()).toEqual(['f1'])
      expect(service.isAll()).toBeFalse()
      expect(service.apiValue()).toEqual(['f1'])

      http.expectOne(MY_FACILITIES_URL).flush({ data: ALL })
    })
  })

  describe('persistence', () => {
    it('writes the selection under a key scoped by user uid', () => {
      setup()
      service.setSelection(['f1', 'f2'])
      expect(localStorage.getItem(SCOPED_KEY)).toBe('{"v":2,"ids":["f1","f2"]}')
    })

    it('falls back to the unscoped key when there is no uid', () => {
      authInfo.set(null)
      setup()
      service.setSelection(['f1'])
      expect(localStorage.getItem('facility-scope')).toBe('{"v":2,"ids":["f1"]}')
    })

    it('restores only when asked — not at construction, not on load', () => {
      // The dashboard loads the list without restoring, so a stale scope with
      // no visible control to clear it cannot narrow every table.
      localStorage.setItem(SCOPED_KEY, stored(['f2']))
      setup()
      expect(service.selectedIds()).toEqual([])

      loadWith(ALL)
      expect(service.selectedIds()).toEqual([])

      service.restoreSelection()
      expect(service.selectedIds()).toEqual(['f2'])
    })

    it('restores only once', () => {
      localStorage.setItem(SCOPED_KEY, stored(['f2']))
      setup()
      service.restoreSelection()
      service.clear()

      service.restoreSelection()
      expect(service.selectedIds()).toEqual([])
    })

    it('prunes right away when restoring after the list is already loaded', () => {
      localStorage.setItem(SCOPED_KEY, stored(['f1', 'gone']))
      setup()
      loadWith(ALL)

      service.restoreSelection()
      expect(service.selectedIds()).toEqual(['f1'])
    })

    it('does not leak one user’s scope to another', () => {
      localStorage.setItem('other-user:facility-scope', stored(['f2']))
      setup()
      restoreAndLoadWith(ALL)
      expect(service.selectedIds()).toEqual([])
    })

    it('ignores non-string entries in storage', () => {
      localStorage.setItem(SCOPED_KEY, stored(['f1', 7, null, 'f3']))
      setup()
      restoreAndLoadWith(ALL)
      expect(service.selectedIds()).toEqual(['f1', 'f3'])
    })

    it('starts unrestricted when storage holds garbage', () => {
      localStorage.setItem(SCOPED_KEY, '{not json')
      setup()
      restoreAndLoadWith(ALL)
      expect(service.selectedIds()).toEqual([])
    })

    it('ignores a stored value in an unknown format', () => {
      localStorage.setItem(SCOPED_KEY, JSON.stringify({ ids: ['f1'] }))
      setup()
      restoreAndLoadWith(ALL)
      expect(service.selectedIds()).toEqual([])
    })

    it('keeps the scope in memory when storage is unavailable', () => {
      setup()
      spyOn(localStorage, 'setItem').and.throwError('QuotaExceededError')
      service.setSelection(['f1'])
      expect(service.selectedIds()).toEqual(['f1'])
    })
  })

  describe('prune after load', () => {
    it('drops ids the user no longer has access to, and persists that', () => {
      localStorage.setItem(SCOPED_KEY, stored(['f1', 'gone']))
      setup()
      restoreAndLoadWith(ALL)
      expect(service.selectedIds()).toEqual(['f1'])
      expect(localStorage.getItem(SCOPED_KEY)).toBe('{"v":2,"ids":["f1"]}')
    })

    it('keeps "No facility", which is never in the facility list', () => {
      localStorage.setItem(SCOPED_KEY, stored([NO_FACILITY_ID, 'gone']))
      setup()
      restoreAndLoadWith(ALL)
      expect(service.selectedIds()).toEqual([NO_FACILITY_ID])
    })

    it('falls back to "all" when every stored id is gone', () => {
      localStorage.setItem(SCOPED_KEY, stored(['gone']))
      setup()
      restoreAndLoadWith(ALL)
      expect(service.selectedIds()).toEqual([])
      expect(service.isAll()).toBeTrue()
    })

    it('settles any selection of a user who can reach one facility to "all"', () => {
      localStorage.setItem(SCOPED_KEY, stored([NO_FACILITY_ID]))
      setup()
      restoreAndLoadWith([MIAMI])
      expect(service.selectedIds()).toEqual([])
      expect(localStorage.getItem(SCOPED_KEY)).toBe('{"v":2,"ids":[]}')
    })

    it('leaves storage untouched when nothing is pruned', () => {
      localStorage.setItem(SCOPED_KEY, stored(['f1']))
      setup()
      const setItem = spyOn(localStorage, 'setItem').and.callThrough()
      restoreAndLoadWith(ALL)
      expect(setItem).not.toHaveBeenCalled()
    })
  })

  describe('selection stored before "No facility" (bare array)', () => {
    it('reads one that ticks every facility as "all", and stores that', () => {
      localStorage.setItem(SCOPED_KEY, JSON.stringify(['f1', 'f2', 'f3']))
      setup()
      restoreAndLoadWith(ALL)
      expect(service.selectedIds()).toEqual([])
      expect(service.isAll()).toBeTrue()
      expect(service.includesNoFacility()).toBeTrue()
      expect(localStorage.getItem(SCOPED_KEY)).toBe('{"v":2,"ids":[]}')
    })

    it('migrates it even with a stale id among them', () => {
      localStorage.setItem(SCOPED_KEY, JSON.stringify(['f1', 'gone', 'f2', 'f3']))
      setup()
      restoreAndLoadWith(ALL)
      expect(service.selectedIds()).toEqual([])
    })

    it('keeps a narrower one as it was, rewritten in the current format', () => {
      localStorage.setItem(SCOPED_KEY, JSON.stringify(['f1', 'f3']))
      setup()
      restoreAndLoadWith(ALL)
      expect(service.selectedIds()).toEqual(['f1', 'f3'])
      expect(service.includesNoFacility()).toBeFalse()
      expect(localStorage.getItem(SCOPED_KEY)).toBe('{"v":2,"ids":["f1","f3"]}')
    })

    it('migrates when restored after the list already loaded', () => {
      localStorage.setItem(SCOPED_KEY, JSON.stringify(['f1', 'f2', 'f3']))
      setup()
      loadWith(ALL)
      service.restoreSelection()
      expect(service.selectedIds()).toEqual([])
    })

    it('does not touch a current-format selection of every facility: that leaves "No facility" out on purpose', () => {
      localStorage.setItem(SCOPED_KEY, stored(['f1', 'f2', 'f3']))
      setup()
      restoreAndLoadWith(ALL)
      expect(service.selectedIds()).toEqual(['f1', 'f2', 'f3'])
      expect(service.isAll()).toBeFalse()
      expect(service.includesNoFacility()).toBeFalse()
    })
  })

  describe('nameOf()', () => {
    beforeEach(() => {
      setup()
      loadWith(ALL)
    })

    it('resolves an id to its name', () => {
      expect(service.nameOf('f3')).toBe('LA')
    })

    it('shows a dash for an empty id', () => {
      expect(service.nameOf(null)).toBe('—')
      expect(service.nameOf(undefined)).toBe('—')
      expect(service.nameOf('')).toBe('—')
    })

    it('falls back to the raw id for an unknown facility', () => {
      expect(service.nameOf('f9')).toBe('f9')
    })
  })
})
