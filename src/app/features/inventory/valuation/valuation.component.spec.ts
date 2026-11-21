import { provideZonelessChangeDetection, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'

import ValuationComponent from './valuation.component'
import { ValuationService } from './valuation.service'
import { AuthService } from '@/app/core/services/auth.service'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'

describe('ValuationComponent', () => {
  let svc: jasmine.SpyObj<ValuationService>

  function setup(role: string, scope: (string | null)[] | null = null) {
    svc = jasmine.createSpyObj('ValuationService', ['listBalances', 'listVariances', 'listLayers'])
    svc.listBalances.and.returnValue(
      of({
        data: [],
        meta_data: { total_records: 0, page: 1, rows: 25 },
        totals: [{ currency: 'BOB', skus: 2, qty: 10, total_value: 150 }],
      })
    )
    svc.listVariances.and.returnValue(of({ data: [], meta_data: { total_records: 0, page: 1, rows: 25 }, totals: [] }))
    svc.listLayers.and.returnValue(of({ data: [], currency: 'BOB' }))
    const apiValue = signal(scope)

    TestBed.configureTestingModule({
      imports: [ValuationComponent, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ValuationService, useValue: svc },
        { provide: AuthService, useValue: { getAuthUserInfo: () => ({ role }) } },
        { provide: FacilityScopeService, useValue: { apiValue, load: () => {}, zone: () => 'America/La_Paz', zoneOf: () => 'America/La_Paz', mixedZones: () => false } },
      ],
    })
    const fixture = TestBed.createComponent(ValuationComponent)
    return { fixture, component: fixture.componentInstance, apiValue }
  }

  afterEach(() => TestBed.resetTestingModule())

  it('never calls the API for non-owners', () => {
    const { component } = setup('RECEIVER')
    component.loadBalances()
    component.loadVariances()
    expect(svc.listBalances).not.toHaveBeenCalled()
    expect(svc.listVariances).not.toHaveBeenCalled()
  })

  it('loads balances with filters and the facility scope', () => {
    const { component } = setup('OWNER', ['fac-1'])
    component.balanceSku = ' A-1 '
    component.balanceMethod = 'FIFO'
    component.applyBalanceFilters()

    const [filter, config] = svc.listBalances.calls.mostRecent().args
    expect(filter.sku).toEqual({ match_mode: 'contains', value: 'A-1' })
    expect(filter.method).toEqual({ match_mode: 'equals', value: 'FIFO' })
    expect(filter.facility_scope).toEqual({ match_mode: 'in', value: ['fac-1'] })
    expect(config.page).toBe(1)
    expect(component.balanceTotals()[0].total_value).toBe(150)
  })

  it('maps the lazy event to page and sort', () => {
    const { component } = setup('OWNER')
    component.onBalanceLazyLoad({ first: 50, rows: 25, sortField: 'total_value', sortOrder: -1 })
    const config = svc.listBalances.calls.mostRecent().args[1]
    expect(config.page).toBe(3)
    expect(config.sort_field).toEqual([{ field: 'total_value', order: -1 }])
  })

  it('loads variances only when their tab is opened', () => {
    const { component } = setup('OWNER')
    expect(svc.listVariances).not.toHaveBeenCalled()
    component.onTabChange('variances')
    expect(svc.listVariances).toHaveBeenCalledTimes(1)
  })

  it('opens the FIFO layers of a row', () => {
    const { component } = setup('OWNER')
    component.openLayers({ facility_id: 'f', sku_id: 's', sku: 'A' } as never)
    expect(svc.listLayers).toHaveBeenCalledWith('f', 's')
    expect(component.layersOf()?.sku).toBe('A')
  })
})
