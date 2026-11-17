import { provideZonelessChangeDetection, signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { provideRouter } from '@angular/router'
import { provideTranslateService } from '@ngx-translate/core'
import { EMPTY, of, Subject } from 'rxjs'
import { environment } from '@/environments/environment'
import { AuthService } from '@/app/core/services/auth.service'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { NO_FACILITY_ID, ScopeFacility } from '@/app/core/types/facility.types'
import { ParcelService } from '@/app/features/parcels/parcel.service'
import { ParcelDashboardSummary } from '@/app/features/parcels/types/parcel.types'
import { DashboardComponent } from './dashboard.component'

/**
 * Covers how the dashboard follows the global facility scope. The facility
 * select pins or locks depending on what the topbar has in scope, and its
 * "All" never asks for more than that scope. Runs against the real FacilityScopeService,
 * with only the facility list request answered by the test.
 */

const MIAMI: ScopeFacility = { id: 'f1', name: 'Miami' }
const DALLAS: ScopeFacility = { id: 'f2', name: 'Dallas' }
const LA: ScopeFacility = { id: 'f3', name: 'LA' }
const ALL = [MIAMI, DALLAS, LA]

const MY_FACILITIES_URL = environment.URL_API + 'v2/facility/my'

const SUMMARY: ParcelDashboardSummary = {
  shipped: { total: 7, deliveries: 5, customer_pickups: 2 },
  ship_prepared: { total: 3, ready: 2, missing_data: 1 },
}

describe('DashboardComponent — global facility scope', () => {
  let fixture: ComponentFixture<DashboardComponent>
  let component: DashboardComponent
  let scope: FacilityScopeService
  let http: HttpTestingController
  let parcels: jasmine.SpyObj<ParcelService>

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    parcels = jasmine.createSpyObj<ParcelService>('ParcelService', [
      'getDashboardSummary',
      'getOrderDashboardSummary',
      'getInventoryDashboardSummary',
      'getLocationDashboardSummary',
      'getBestSellingItems',
    ])
    parcels.getDashboardSummary.and.returnValue(of(SUMMARY))
    parcels.getOrderDashboardSummary.and.returnValue(EMPTY)
    parcels.getInventoryDashboardSummary.and.returnValue(EMPTY)
    parcels.getLocationDashboardSummary.and.returnValue(EMPTY)
    parcels.getBestSellingItems.and.returnValue(of([]))

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTranslateService(),
        { provide: AuthService, useValue: { authInfo: signal({ uid: 'u-1' }) } },
        { provide: ParcelService, useValue: parcels },
      ],
    })
    scope = TestBed.inject(FacilityScopeService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    http.verify()
    localStorage.clear()
    sessionStorage.clear()
  })

  /** Mounts the dashboard (which loads the facility list) and answers that request. */
  async function create(facilities: ScopeFacility[] = ALL): Promise<void> {
    fixture = TestBed.createComponent(DashboardComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
    http.expectOne(MY_FACILITIES_URL).flush({ data: facilities })
    await settle()
  }

  async function settle(): Promise<void> {
    TestBed.tick()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  async function moveScope(ids: string[]): Promise<void> {
    scope.setSelection(ids)
    await settle()
  }

  const requestedFacilities = () =>
    parcels.getDashboardSummary.calls.mostRecent().args[0]?.facilityIds

  const emptyState = () =>
    (fixture.nativeElement as HTMLElement).querySelector('#dashboard-no-facility')

  describe('only "No facility" in the topbar', () => {
    it('requests nothing and says why instead of showing every facility', async () => {
      scope.setSelection([NO_FACILITY_ID])
      await create()

      expect(component.noFacilityOnly()).toBeTrue()
      expect(parcels.getDashboardSummary).not.toHaveBeenCalled()
      expect(parcels.getOrderDashboardSummary).not.toHaveBeenCalled()
      expect(component.loading()).toBeFalse()
      expect(emptyState()).not.toBeNull()
    })

    it('locks the select on "No facility" rather than "All"', async () => {
      scope.setSelection([NO_FACILITY_ID])
      await create()

      expect(component.facilitiesWithAll().map((f) => f.id)).toEqual([NO_FACILITY_ID])
      expect(component.shownFacility().id).toBe(NO_FACILITY_ID)
      expect(component.facilitySelectDisabled()).toBeTrue()
    })

    it('stops on the way in, dropping a reply still in flight', async () => {
      const pending = new Subject<ParcelDashboardSummary>()
      parcels.getDashboardSummary.and.returnValue(pending)
      await create()
      expect(component.loading()).toBeTrue()

      await moveScope([NO_FACILITY_ID])
      pending.next(SUMMARY)

      expect(component.loading()).toBeFalse()
      expect(component.summary().shipped.total).toBe(0)
      expect(emptyState()).not.toBeNull()
    })

    it('keeps the facility picked here for when the topbar widens again', async () => {
      await create()
      component.selectedFacility.set(DALLAS)

      await moveScope([NO_FACILITY_ID])
      expect(component.selectedFacility().id).toBe('f2')

      await moveScope([])
      expect(component.shownFacility().id).toBe('f2')
      expect(requestedFacilities()).toEqual(['f2'])
      expect(emptyState()).toBeNull()
    })

    it('is not the case once "All" is the scope', async () => {
      await create()
      expect(component.noFacilityOnly()).toBeFalse()
      expect(parcels.getDashboardSummary).toHaveBeenCalledTimes(1)
      expect(requestedFacilities()).toBeUndefined()
    })
  })

  describe('"No facility" plus one facility', () => {
    it('pins to that facility: there are no metrics for records without one', async () => {
      await create()

      await moveScope([NO_FACILITY_ID, 'f2'])

      expect(component.noFacilityOnly()).toBeFalse()
      expect(component.facilitiesWithAll()).toEqual([DALLAS])
      expect(component.facilitySelectDisabled()).toBeTrue()
      expect(component.selectedFacility().id).toBe('f2')
      expect(requestedFacilities()).toEqual(['f2'])
    })
  })

  describe('one facility in the topbar', () => {
    it('pins to it, like "No facility" plus that facility', async () => {
      await create()

      await moveScope(['f3'])

      expect(component.facilitiesWithAll()).toEqual([LA])
      expect(component.facilitySelectDisabled()).toBeTrue()
      expect(requestedFacilities()).toEqual(['f3'])
    })
  })

  describe('several facilities in the topbar', () => {
    it('offers "All" plus those, unlocked', async () => {
      await create()

      await moveScope([NO_FACILITY_ID, 'f1', 'f3'])

      expect(component.facilitiesWithAll().map((f) => f.id)).toEqual(['', 'f1', 'f3'])
      expect(component.facilitySelectDisabled()).toBeFalse()
    })

    it('asks "All" for those facilities only, not every one the user can reach', async () => {
      await create()

      await moveScope([NO_FACILITY_ID, 'f1', 'f3'])

      expect(component.selectedFacility().id).toBe('')
      expect(requestedFacilities()).toEqual(['f1', 'f3'])
      const calls = [
        parcels.getOrderDashboardSummary,
        parcels.getInventoryDashboardSummary,
        parcels.getLocationDashboardSummary,
        parcels.getBestSellingItems,
      ]
      for (const call of calls) {
        expect(call.calls.mostRecent().args[0]?.facilityIds).toEqual(['f1', 'f3'])
      }
    })

    it('waits for the facility list when the narrowed scope was restored', async () => {
      scope.setSelection(['f1', 'f3'])
      fixture = TestBed.createComponent(DashboardComponent)
      component = fixture.componentInstance
      fixture.detectChanges()

      // Without the list there are no ids to send, and sending none means everything.
      expect(parcels.getDashboardSummary).not.toHaveBeenCalled()

      http.expectOne(MY_FACILITIES_URL).flush({ data: ALL })
      await settle()

      expect(parcels.getDashboardSummary).toHaveBeenCalledTimes(1)
      expect(requestedFacilities()).toEqual(['f1', 'f3'])
    })

    it('still sends one facility once one is picked here', async () => {
      await create()
      await moveScope(['f1', 'f3'])

      component.selectedFacility.set(LA)
      component.loadSummary()

      expect(requestedFacilities()).toEqual(['f3'])
    })
  })
})
