import { provideZonelessChangeDetection, signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { provideTranslateService } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'
import { DialogService } from 'primeng/dynamicdialog'
import { of } from 'rxjs'

import PackagingComponent from './packaging.component'
import { PackagingService } from './packaging.service'
import { FacilitiesService } from '../facilities/facilities.service'
import { Facility } from '../facilities/facilities.types'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { OUT_OF_SCOPE_FACILITY_ID } from '@/app/shared/utils/facility-scope.util'
import { TableStateService } from '../../../shared/services/table-state.service'
import { TranslateLanService } from '../../../core/services/translate-lan.service'
import { AuthService } from '../../../core/services/auth.service'
import { ShColumnDef } from '../../../shared/types/table.types'

/** Exposes the protected / template-bound API used in tests */
interface PackagingInternals {
    activeRawFilters: Record<string, { value: unknown; match_mode: string }>
    facilityFilter: ReturnType<typeof signal<string[]>>
    containerProfileFilter: ReturnType<typeof signal<string[]>>
    activeFilters: ReturnType<typeof signal<unknown[]>>
    packagingDto: ReturnType<typeof signal>
    onFacilityFilterChange(ids: string[]): void
    onContainerProfileFilterChange(ids: string[]): void
    onColumnSelectionChange(cols: (ShColumnDef & { translatedHeader?: string })[]): void
    baseTable?: { clearFiltersForFields: jasmine.Spy }
    columnDefs: ShColumnDef[]
    selectedCols: ShColumnDef[]
    translatedColumnDefs: (ShColumnDef & { translatedHeader: string })[]
}

describe('PackagingComponent', () => {
    let component: PackagingComponent
    let internals: PackagingInternals
    let fixture: ComponentFixture<PackagingComponent>
    let http: HttpTestingController
    let tableStateSpy: jasmine.SpyObj<TableStateService>
    let packagingSpy: jasmine.SpyObj<PackagingService>
    let facilitiesSpy: jasmine.SpyObj<FacilitiesService>

    beforeEach(async () => {
        tableStateSpy = jasmine.createSpyObj('TableStateService', ['load', 'save', 'clear'])
        tableStateSpy.load.and.returnValue(null)

        packagingSpy = jasmine.createSpyObj('PackagingService', [
            'listPackaging',
            'listContainerProfiles',
        ])
        packagingSpy.listPackaging.and.returnValue(
            of({ data: [], total_records: 0, page: 1, rows: 15 }),
        )
        packagingSpy.listContainerProfiles.and.returnValue(
            of({ data: [], meta_data: { total_records: 0, page: 1, rows: 50 } }),
        )

        facilitiesSpy = jasmine.createSpyObj('FacilitiesService', ['getFacilities'])
        facilitiesSpy.getFacilities.and.returnValue(
            of({ data: [], meta_data: { total_records: 0, page: 1, rows: 1000 } }),
        )

        await TestBed.configureTestingModule({
            imports: [PackagingComponent],
            providers: [
                provideZonelessChangeDetection(),
                provideHttpClient(),
                provideHttpClientTesting(),
                provideTranslateService(),
                DialogService,
                MessageService,
                { provide: PackagingService, useValue: packagingSpy },
                { provide: FacilitiesService, useValue: facilitiesSpy },
                { provide: TableStateService, useValue: tableStateSpy },
                { provide: TranslateLanService, useValue: { changeLanguage: signal('en') } },
                { provide: AuthService, useValue: { authInfo: signal({ uid: 'test-user' }) } },
            ],
        }).compileComponents()

        http = TestBed.inject(HttpTestingController)
        fixture = TestBed.createComponent(PackagingComponent)
        component = fixture.componentInstance
        internals = component as unknown as PackagingInternals
    })

    afterEach(() => {
        // The table loads the facility scope list on creation; tests that
        // care flush it themselves.
        http.match((r) => r.url.endsWith('v2/facility/my'))
        http.verify()
    })

    // ── Global facility scope ───────────────────────────────────────────────

    describe('global facility scope', () => {
        const MIAMI = { id: 'f1', name: 'Miami' }
        const DALLAS = { id: 'f2', name: 'Dallas' }
        let scope: FacilityScopeService

        const sentFilter = () => packagingSpy.listPackaging.calls.mostRecent().args[0].filter

        function loadFacilityList(): void {
            scope.load()
            http.expectOne((r) => r.url.endsWith('v2/facility/my')).flush({ data: [MIAMI, DALLAS] })
        }

        beforeEach(() => {
            scope = TestBed.inject(FacilityScopeService)
        })

        afterEach(() => localStorage.clear())

        it('sends no facility filter while the scope is "all"', () => {
            component.loadData()
            expect(sentFilter().facility_id).toBeUndefined()
        })

        it('asks only for the facility ticked in the topbar', () => {
            scope.setSelection(['f1'])
            component.loadData()
            expect(sentFilter().facility_id).toEqual({ value: ['f1'], match_mode: 'in' })
            expect(sentFilter().is_packaging).toEqual({ value: true, match_mode: 'equals' })
        })

        it('lets the column filter refine the scope, never widen it', () => {
            scope.setSelection(['f1'])
            internals.activeRawFilters = { facility_id: { value: ['f2'], match_mode: 'in' } }
            component.onTableStateChange({ pagination: { page: 1, limit: 15, total: 0 }, filters: {} })
            component.loadData()
            expect(sentFilter().facility_id).toEqual({
                value: [OUT_OF_SCOPE_FACILITY_ID],
                match_mode: 'in',
            })
        })

        it('on a scope change, drops the column filter, its widget and its chip', () => {
            internals.activeRawFilters = { facility_id: { value: ['f2'], match_mode: 'in' } }
            internals.facilityFilter.set(['f2'])

            component.onTableStateChange({
                pagination: { page: 1, limit: 15, total: 0 },
                filters: {},
                facilityScopeChanged: true,
            })

            expect(internals.activeRawFilters).toEqual({})
            expect(internals.facilityFilter()).toEqual([])
            expect(component.activeFilters()).toEqual([])
        })

        // Code review: a facility filter restored from localStorage lives under
        // `facility_id`, while the table only clears its `facility` column — so
        // the table's own event brought it back after the scope moved.
        it('on a scope change after a reload, drops the restored facility filter the table re-emits', () => {
            const restored = { facility_id: { value: ['f2'], match_mode: 'in' } }
            tableStateSpy.load.and.returnValue({ filters: restored, page: 1 })
            // A fresh page, as after a reload: the constructor reads the saved state.
            fixture = TestBed.createComponent(PackagingComponent)
            component = fixture.componentInstance
            internals = component as unknown as PackagingInternals
            component.ngOnInit()
            expect(internals.facilityFilter()).toEqual(['f2'])

            scope.setSelection(['f1'])
            component.onTableStateChange({
                pagination: { page: 1, limit: 15, total: 0 },
                filters: { ...restored, package_type: { value: 'BOX', matchMode: 'contains' } },
                facilityScopeChanged: true,
            })
            component.loadData()

            expect(internals.activeRawFilters['facility_id']).toBeUndefined()
            expect(internals.activeRawFilters['package_type']).toBeDefined()
            expect(internals.facilityFilter()).toEqual([])
            expect(component.activeFilters().map((c) => c.field)).not.toContain('facility_id')
            expect(sentFilter().facility_id)
                .withContext('the new scope, not the out-of-scope sentinel')
                .toEqual({ value: ['f1'], match_mode: 'in' })
        })

        it('without a scope change, keeps the facility filter the table emits', () => {
            component.onTableStateChange({
                pagination: { page: 2, limit: 15, total: 0 },
                filters: { facility_id: { value: ['f2'], matchMode: 'in' } },
            })

            expect(internals.activeRawFilters['facility_id']).toBeDefined()
        })

        it('offers only the facilities in scope in the column filter', () => {
            loadFacilityList()
            scope.setSelection(['f2'])
            expect(component.getFacilityOptions()).toEqual([{ label: 'Dallas', value: 'f2' }])
        })

        it('falls back to its own list until the scope has loaded', () => {
            fixture.detectChanges()
            facilitiesSpy.getFacilities.and.returnValue(
                of({ data: [MIAMI as Facility], meta_data: { total_records: 1, page: 1, rows: 1000 } }),
            )
            component.loadFacilities()
            expect(component.getFacilityOptions()).toEqual([{ label: 'Miami', value: 'f1' }])
        })
    })

    // ── removeFilterChip ────────────────────────────────────────────────────

    describe('removeFilterChip', () => {
        beforeEach(() => {
            internals.activeRawFilters = {
                facility_id: { value: ['fac-1'], match_mode: 'in' },
                container_profile_id: { value: ['cp-1'], match_mode: 'in' },
                sku_name: { value: 'Test', match_mode: 'contains' },
            }
            internals.facilityFilter.set(['fac-1'])
            internals.containerProfileFilter.set(['cp-1'])
        })

        it('should reset facilityFilter signal and remove the filter from the DTO', () => {
            component.removeFilterChip('facility_id')

            expect(internals.facilityFilter()).toEqual([])
            expect(internals.activeRawFilters['facility_id']).toBeUndefined()
        })

        it('should reset containerProfileFilter signal and remove the filter from the DTO', () => {
            component.removeFilterChip('container_profile_id')

            expect(internals.containerProfileFilter()).toEqual([])
            expect(internals.activeRawFilters['container_profile_id']).toBeUndefined()
        })

        it('should not reset dropdown signals when a text filter chip is removed', () => {
            component.removeFilterChip('sku_name')

            expect(internals.facilityFilter()).toEqual(['fac-1'])
            expect(internals.containerProfileFilter()).toEqual(['cp-1'])
            expect(internals.activeRawFilters['sku_name']).toBeUndefined()
        })

        it('should persist state after removing a chip', () => {
            tableStateSpy.save.calls.reset()

            component.removeFilterChip('facility_id')

            expect(tableStateSpy.save).toHaveBeenCalledWith(
                'logic:packaging',
                jasmine.objectContaining({ filters: jasmine.any(Object) }),
            )
        })

        it('should exclude the removed field from the resulting packagingDto filter', async () => {
            // First, load facility_id into the DTO so we know it's there
            internals.onFacilityFilterChange(['fac-1'])
            await fixture.whenStable()

            const dtoBefore = internals.packagingDto() as { filter: Record<string, unknown> }
            expect(dtoBefore.filter['facility_id']).toBeDefined()

            // Now remove it and verify it's gone
            component.removeFilterChip('facility_id')
            await fixture.whenStable()

            const dtoAfter = internals.packagingDto() as { filter: Record<string, unknown> }
            expect(dtoAfter.filter['facility_id']).toBeUndefined()
            // is_packaging must always be present
            expect(dtoAfter.filter['is_packaging']).toBeDefined()
        })

        it('should reload the list after removing a chip', async () => {
            packagingSpy.listPackaging.calls.reset()

            component.removeFilterChip('facility_id')
            await fixture.whenStable()

            expect(packagingSpy.listPackaging).toHaveBeenCalledTimes(1)
        })
    })

    // ── clearFilters ────────────────────────────────────────────────────────

    describe('clearFilters', () => {
        beforeEach(() => {
            internals.activeRawFilters = {
                facility_id: { value: ['fac-1'], match_mode: 'in' },
                container_profile_id: { value: ['cp-1'], match_mode: 'in' },
            }
            internals.facilityFilter.set(['fac-1'])
            internals.containerProfileFilter.set(['cp-1'])
            internals.activeFilters.set([
                { field: 'facility_id', label: 'Facility', displayValue: 'Test', operator: 'and', position: 0 },
            ])
        })

        it('should reset all filter signals, raw filters, and call tableState.clear', () => {
            component.clearFilters()

            expect(internals.facilityFilter()).toEqual([])
            expect(internals.containerProfileFilter()).toEqual([])
            expect(internals.activeFilters()).toEqual([])
            expect(Object.keys(internals.activeRawFilters).length).toBe(0)
            expect(tableStateSpy.clear).toHaveBeenCalledWith('logic:packaging')
        })

        it('should reload the list after clearing all filters', async () => {
            packagingSpy.listPackaging.calls.reset()

            component.clearFilters()
            await fixture.whenStable()

            expect(packagingSpy.listPackaging).toHaveBeenCalledTimes(1)
        })
    })

    // ── clearFiltersForHiddenColumns (via onColumnSelectionChange) ────────

    describe('clearFiltersForHiddenColumns', () => {
        beforeEach(async () => {
            // Load a facility filter into the DTO so it's actually present
            internals.onFacilityFilterChange(['fac-1'])
            await fixture.whenStable()

            // Ensure the column defs include both facility and package_type
            internals.selectedCols = [...internals.columnDefs]
            internals.translatedColumnDefs = internals.columnDefs.map(c => ({
                ...c,
                translatedHeader: c.header,
            }))
        })

        it('should clear facility_id filter when the facility column is hidden', async () => {
            const dtoBefore = internals.packagingDto() as { filter: Record<string, unknown> }
            expect(dtoBefore.filter['facility_id']).toBeDefined()

            packagingSpy.listPackaging.calls.reset()

            // Hide the facility column
            const withoutFacility = internals.translatedColumnDefs.filter(c => c.field !== 'facility')
            internals.onColumnSelectionChange(withoutFacility)
            await fixture.whenStable()

            expect(internals.facilityFilter()).toEqual([])
            expect(internals.activeRawFilters['facility_id']).toBeUndefined()

            const dtoAfter = internals.packagingDto() as { filter: Record<string, unknown> }
            expect(dtoAfter.filter['facility_id']).toBeUndefined()
        })

        it('should clear container_profile_id filter when the package_type column is hidden', async () => {
            // Also load a container profile filter
            internals.onContainerProfileFilterChange(['cp-1'])
            await fixture.whenStable()

            const dtoBefore = internals.packagingDto() as { filter: Record<string, unknown> }
            expect(dtoBefore.filter['container_profile_id']).toBeDefined()

            packagingSpy.listPackaging.calls.reset()

            // Hide the package_type column
            const withoutPackageType = internals.translatedColumnDefs.filter(c => c.field !== 'package_type')
            internals.onColumnSelectionChange(withoutPackageType)
            await fixture.whenStable()

            expect(internals.containerProfileFilter()).toEqual([])
            expect(internals.activeRawFilters['container_profile_id']).toBeUndefined()

            const dtoAfter = internals.packagingDto() as { filter: Record<string, unknown> }
            expect(dtoAfter.filter['container_profile_id']).toBeUndefined()
        })

        it('should not touch filters when a non-filterable column is hidden', async () => {
            const dtoBefore = internals.packagingDto() as { filter: Record<string, unknown> }
            const facilityBefore = dtoBefore.filter['facility_id']

            packagingSpy.listPackaging.calls.reset()

            // Hide the barcode column (no filter associated)
            const withoutBarcode = internals.translatedColumnDefs.filter(c => c.field !== 'barcode')
            internals.onColumnSelectionChange(withoutBarcode)
            await fixture.whenStable()

            // facility_id filter should remain untouched
            expect(internals.facilityFilter()).toEqual(['fac-1'])
            const dtoAfter = internals.packagingDto() as { filter: Record<string, unknown> }
            expect(dtoAfter.filter['facility_id']).toEqual(facilityBefore)
        })
    })
})
