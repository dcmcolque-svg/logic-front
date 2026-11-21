import { provideZonelessChangeDetection, signal, Type } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { provideTranslateService } from '@ngx-translate/core'
import { firstValueFrom, of } from 'rxjs'

import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { ScopeFacility } from '@/app/core/types/facility.types'
import { LocationService } from '@/app/features/preferences/locations/location.service'
import { FilterPresetService } from '@/app/shared/services/filter-preset.service'
import { TableStateService } from '@/app/shared/services/table-state.service'
import { ActiveFilterChip, ShTableEvent } from '@/app/shared/types/table.types'
import { OUT_OF_SCOPE_FACILITY_ID } from '@/app/shared/utils/facility-scope.util'

import AllordersComponent from '../allorders/allorders.component'
import BackordersComponent from '../backorders/backorders.component'
import { OrderService } from '../order.service'
import ProcessingComponent from '../processing/processing.component'
import { OrderFilter } from '../types/order.types'
import { OrderListBase } from './order-list.base'
import { ScopedOrderListBase } from './scoped-order-list.base'

/**
 * Covers how the three outbound lists follow the global facility scope: what
 * reaches the list endpoint, what the facility column filter offers, and what
 * a scope change clears. The template is stubbed out — the table's own part is
 * covered in base-data-table.facility-scope.spec.ts.
 */

const MIAMI: ScopeFacility = { id: 'f1', name: 'Miami' }
const DALLAS: ScopeFacility = { id: 'f2', name: 'Dallas' }

/** Minimal stand-in for FacilityScopeService, driven from the test. */
class ScopeStub {
  readonly selectedIds = signal<string[]>([])
  readonly inScope = signal<ScopeFacility[]>([MIAMI, DALLAS])
  readonly apiValue = signal<(string | null)[] | null>(null)
  readonly zone = () => 'America/La_Paz'
  readonly zoneOf = () => 'America/La_Paz'
  load(): void {}
}

/** A list with its chips, whichever base declares them. */
type OrderList = OrderListBase & { activeFilters: () => ActiveFilterChip[] }

const LISTS: { name: string; component: Type<OrderListBase>; status?: string }[] = [
  { name: 'Processing', component: ProcessingComponent, status: 'PROCESSING' },
  { name: 'Backorders', component: BackordersComponent, status: 'BACKORDER' },
  { name: 'All Orders', component: AllordersComponent },
]

describe('Outbound lists — global facility scope', () => {
  let scope: ScopeStub
  let orders: jasmine.SpyObj<OrderService>

  beforeEach(() => {
    scope = new ScopeStub()
    orders = jasmine.createSpyObj<OrderService>('OrderService', ['listOrders'])
    orders.listOrders.and.returnValue(
      of({ data: [], meta_data: { total_records: 0, page: 1, rows: 15 } })
    )
    const tableState = jasmine.createSpyObj('TableStateService', ['load', 'save', 'clear'])
    tableState.load.and.returnValue(null)
    const locations = jasmine.createSpyObj('LocationService', ['listMyFacilities'])
    locations.listMyFacilities.and.returnValue(of({ data: [MIAMI, DALLAS] }))

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideTranslateService(),
        { provide: FacilityScopeService, useValue: scope },
        { provide: OrderService, useValue: orders },
        { provide: LocationService, useValue: locations },
        { provide: TableStateService, useValue: tableState },
        {
          provide: FilterPresetService,
          useValue: {
            presets: signal([]),
            lastAppliedPresetId: signal(null),
            loadPresets: jasmine.createSpy('loadPresets'),
            clearLastApplied: jasmine.createSpy('clearLastApplied'),
          },
        },
      ],
    })
  })

  function create(component: Type<OrderListBase>): OrderList {
    TestBed.overrideComponent(component, {
      set: { template: '', imports: [], styleUrl: undefined, styles: [] },
    })
    const fixture: ComponentFixture<OrderListBase> = TestBed.createComponent(component)
    fixture.detectChanges()
    return fixture.componentInstance as OrderList
  }

  const sentFilter = (): OrderFilter => orders.listOrders.calls.mostRecent().args[0].filter

  for (const { name, component, status } of LISTS) {
    describe(name, () => {
      it('sends no facility filter while the scope is "all"', () => {
        create(component)
        expect(sentFilter().facility_id).toBeUndefined()
      })

      it('asks only for the facility ticked in the topbar', () => {
        scope.apiValue.set(['f1'])
        create(component)
        expect(sentFilter().facility_id).toEqual({ value: ['f1'], match_mode: 'in' })
      })

      it('asks for records without a facility when that is what is ticked', () => {
        scope.apiValue.set([null])
        create(component)
        expect(sentFilter().facility_id).toEqual({ value: [null], match_mode: 'in' })
      })

      if (status) {
        it(`keeps its own ${status} status filter next to the scope`, () => {
          scope.apiValue.set(['f1'])
          create(component)
          expect(sentFilter().status).toEqual({ match_mode: 'eq', value: status })
        })
      }

      it('lets the column filter refine the scope, never widen it', () => {
        scope.apiValue.set(['f1'])
        const list = create(component)

        list.onMultiselectApply('facility_id', ['f2'])

        expect(sentFilter().facility_id).toEqual({
          value: [OUT_OF_SCOPE_FACILITY_ID],
          match_mode: 'in',
        })
      })

      it('offers only the facilities in scope in the column filter', () => {
        scope.inScope.set([DALLAS])
        const list = create(component)
        expect(list.facilityFilterOptions()).toEqual([DALLAS])
      })

      it('on a scope change, drops the column filter, its widget and its chip', () => {
        const list = create(component)
        list.onMultiselectApply('facility_id', ['f2'])
        expect(list.activeFilters().map((c) => c.field)).toContain('facility_id')

        scope.apiValue.set(['f1'])
        const event: ShTableEvent = {
          pagination: { page: 1, limit: 15, total: 0 },
          filters: {},
          facilityScopeChanged: true,
        }
        list.onTableStateChange(event)

        expect(list.getActiveFilterValue('facility_id')).toBeNull()
        expect(list.facilityFilter()).toEqual([])
        expect(list.activeFilters().map((c) => c.field)).not.toContain('facility_id')
        expect(sentFilter().facility_id).toEqual({ value: ['f1'], match_mode: 'in' })
      })

      it('on a scope change, also drops a facility filter the table still carries', () => {
        const list = create(component)

        scope.apiValue.set(['f1'])
        list.onTableStateChange({
          pagination: { page: 1, limit: 15, total: 0 },
          filters: { facility_id: { value: ['f2'], matchMode: 'in' } },
          facilityScopeChanged: true,
        })

        expect(sentFilter().facility_id).toEqual({ value: ['f1'], match_mode: 'in' })
      })
    })
  }

  describe('export', () => {
    for (const { name, component } of LISTS.filter((l) => l.name !== 'Processing')) {
      it(`${name} exports only what the table shows: the facility in scope`, async () => {
        scope.apiValue.set(['f1'])
        const list = create(component) as unknown as ScopedOrderListBase

        await firstValueFrom(list.fetchExportPage(1, 100))

        expect(sentFilter().facility_id).toEqual({ value: ['f1'], match_mode: 'in' })
      })
    }
  })
})
