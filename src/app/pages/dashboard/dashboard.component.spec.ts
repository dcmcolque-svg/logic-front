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
import { OrderDashboardSummary } from '@/app/features/parcels/types/parcel.types'
import { SalesService } from '@/app/features/sales/sales.service'
import { SalesDashboardSummary } from '@/app/features/sales/sales.types'
import { DashboardComponent, daysBetween, deltaOf } from './dashboard.component'

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

const ORDER_SUMMARY: OrderDashboardSummary = {
  orders_shipped: { orders_shipped: 7, total_revenue: 70 },
  alerts: { back_orders: 1, low_inventory: 2 },
}

const SALES_SUMMARY: SalesDashboardSummary = {
  currencies: [{ currency: 'BOB', sales: 2, total: 150, units: 3, avg_ticket: 75, prev_sales: 1, prev_total: 80 }],
  open_registers: 1,
  daily: [{ day: '2026-11-18', currency: 'BOB', sales: 2, total: 150 }],
}

describe('dashboard helpers', () => {
  it('deltaOf: percent change, "new" without a base, null without a previous period', () => {
    expect(deltaOf(150, 80)).toEqual({ pct: 88, dir: 'up' })
    expect(deltaOf(40, 80)).toEqual({ pct: -50, dir: 'down' })
    expect(deltaOf(5, 5)).toEqual({ pct: 0, dir: 'flat' })
    expect(deltaOf(10, 0)).toEqual({ pct: null, dir: 'up' })
    expect(deltaOf(10, undefined)).toBeNull()
  })

  it('daysBetween: every day, both ends included, across months', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(daysBetween('2026-11-19', '2026-11-19')).toEqual(['2026-11-19'])
  })
})

describe('DashboardComponent — global facility scope', () => {
  let fixture: ComponentFixture<DashboardComponent>
  let component: DashboardComponent
  let scope: FacilityScopeService
  let http: HttpTestingController
  let parcels: jasmine.SpyObj<ParcelService>
  let sales: jasmine.SpyObj<SalesService>
  let activities: { activity: string }[]

  beforeEach(() => {
    activities = []
    sales = jasmine.createSpyObj<SalesService>('SalesService', ['getDashboardSummary'])
    sales.getDashboardSummary.and.returnValue(of(SALES_SUMMARY))
    localStorage.clear()
    sessionStorage.clear()
    parcels = jasmine.createSpyObj<ParcelService>('ParcelService', [
      'getDashboardSummary',
      'getOrderDashboardSummary',
      'getInventoryDashboardSummary',
      'getLocationDashboardSummary',
      'getBestSellingItems',
    ])
    parcels.getOrderDashboardSummary.and.returnValue(of(ORDER_SUMMARY))
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
        {
          provide: AuthService,
          useValue: {
            authInfo: signal({ uid: 'u-1' }),
            getAuthUserInfo: () => ({ user_name: 'Ana' }),
            getActivities: () => activities,
          },
        },
        { provide: ParcelService, useValue: parcels },
        { provide: SalesService, useValue: sales },
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
    parcels.getOrderDashboardSummary.calls.mostRecent().args[0]?.facilityIds

  const emptyState = () =>
    (fixture.nativeElement as HTMLElement).querySelector('#dashboard-no-facility')

  describe('parcel panels (Paquetes Entregados / Paquetes en Red)', () => {
    it('are disabled: the parcel summary is never requested', async () => {
      await create()

      expect(parcels.getDashboardSummary).not.toHaveBeenCalled()
      expect(component.loading()).toBeFalse()
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('#card-shipped-delivery'),
      ).toBeNull()
    })
  })

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
      const pending = new Subject<OrderDashboardSummary>()
      parcels.getOrderDashboardSummary.and.returnValue(pending)
      await create()
      expect(component.loading()).toBeTrue()

      await moveScope([NO_FACILITY_ID])
      pending.next(ORDER_SUMMARY)

      expect(component.loading()).toBeFalse()
      expect(component.ordersShipped.orders_shipped).toBe(0)
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
      expect(parcels.getOrderDashboardSummary).toHaveBeenCalledTimes(1)
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
      expect(parcels.getOrderDashboardSummary).not.toHaveBeenCalled()

      http.expectOne(MY_FACILITIES_URL).flush({ data: ALL })
      await settle()

      expect(parcels.getOrderDashboardSummary).toHaveBeenCalledTimes(1)
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

  describe('POS sales', () => {
    it('are not requested without a sales activity', async () => {
      await create()

      expect(component.canSeeSales).toBeFalse()
      expect(sales.getDashboardSummary).not.toHaveBeenCalled()
      expect(component.loadingSales()).toBeFalse()
    })

    it('are requested for the same facilities and days as the orders', async () => {
      activities = [{ activity: 'Point of Sale' }]
      await create()

      expect(component.canSeeSales).toBeTrue()
      const salesArgs = sales.getDashboardSummary.calls.mostRecent().args[0]
      const orderArgs = parcels.getOrderDashboardSummary.calls.mostRecent().args[0]
      expect(salesArgs).toEqual(orderArgs!)
      expect(component.salesSummary()).toEqual(SALES_SUMMARY)
      // the chart offers the currency with sales first, then orders
      expect(component.chartMetricOptions().map((o) => o.value)).toEqual(['sales:BOB', 'orders'])
      expect(component.activeMetric()).toBe('sales:BOB')
      expect(component.periodDays().length).toBe(7)
    })
  })
})
