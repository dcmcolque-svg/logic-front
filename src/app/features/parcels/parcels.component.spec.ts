import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { signal } from '@angular/core'
import { of } from 'rxjs'
import { TranslateModule } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'

import ParcelsComponent from './parcels.component'
import { ParcelService } from './parcel.service'
import { LocationService } from '@/app/features/preferences/locations/location.service'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { TableStateService } from '@/app/shared/services/table-state.service'
import { FilterApplyService } from '@/app/shared/components/filter-clear/filter-apply.service'
import { FilterPresetService } from '@/app/shared/services/filter-preset.service'
import { ShColumnDef } from '@/app/shared/types/table.types'
import { BaseDataTable } from '@/app/shared/components/datatable/data-table/base-data-table.component'
import { BaseImportExportMenu } from '@/app/shared/components/import-export-menu/base-import-export-menu.component'

import { Parcel } from './types/parcel.types'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Minimal Parcel stub with a configurable tracking number. */
function parcel(tracking: string, overrides: Partial<Parcel> = {}): Parcel {
  return {
    id: '1',
    order_detail: { order_number: 'ORD-001' },
    external_channel: { channel: 'Shopify' },
    customer: {},
    meta_data: { order_status: 'SHIP PREPARED', created_at: '2026-03-15T14:30:00Z' },
    operator: {},
    shipment: {
      shipment_id: tracking,
      delivery_detail: { date_shipped: '2026-03-16T09:45:00Z' },
    },
    ...overrides,
  } as Parcel
}

const EMPTY_LIST = {
  data: [],
  meta_data: { page: 1, rows: 15, total_records: 0 },
}

const LONG_TRACKING = '1Z999AA10123456784FEDEX9876543210ABCDEFGHIJKLMNOP'

// ── Test suite ─────────────────────────────────────────────────────────────

describe('ParcelsComponent — tracking number visibility', () => {
  let fixture: ComponentFixture<ParcelsComponent>
  let component: ParcelsComponent
  let el: HTMLElement
  let parcelSvc: jasmine.SpyObj<ParcelService>
  let facilityScopeStub: {
    inScope: ReturnType<typeof signal<{ id: string; name: string }[]>>
    includesNoFacility: ReturnType<typeof signal<boolean>>
    [other: string]: unknown
  }

  beforeEach(async () => {
    parcelSvc = jasmine.createSpyObj('ParcelService', ['listParcels'])
    parcelSvc.listParcels.and.returnValue(of(EMPTY_LIST))

    const locationSvc = jasmine.createSpyObj('LocationService', ['listMyFacilities'])
    locationSvc.listMyFacilities.and.returnValue(of({ data: [] }))

    // FacilityScopeService stub — must include selectedIds used by BaseDataTable
    facilityScopeStub = {
      inScope: signal<{ id: string; name: string }[]>([]),
      includesNoFacility: signal(true),
      apiValue: signal(null),
      selectedIds: signal([] as string[]),
      isSingle: signal(false),
      isSingleWithoutNulls: signal(false),
      mode: signal('all'),
    }

    const tableStateSvc = jasmine.createSpyObj('TableStateService', ['load', 'save', 'clear'])
    tableStateSvc.load.and.returnValue(null)

    const filterApplySvc = jasmine.createSpyObj('FilterApplyService', ['applyFilterNew'])
    filterApplySvc.applyFilterNew.and.returnValue({})

    const filterPresetStub = {
      presets: signal([]),
      lastAppliedPresetId: signal(null),
      loadPresets: jasmine.createSpy('loadPresets'),
      clearLastApplied: jasmine.createSpy('clearLastApplied'),
    }

    await TestBed.configureTestingModule({
      imports: [ParcelsComponent, TranslateModule.forRoot()],
      providers: [
        MessageService,
        { provide: ParcelService, useValue: parcelSvc },
        { provide: LocationService, useValue: locationSvc },
        { provide: FacilityScopeService, useValue: facilityScopeStub },
        { provide: TableStateService, useValue: tableStateSvc },
        { provide: FilterApplyService, useValue: filterApplySvc },
        { provide: FilterPresetService, useValue: filterPresetStub },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(ParcelsComponent)
    component = fixture.componentInstance
    el = fixture.nativeElement
  })

  // ── Column definition tests ──────────────────────────────────────────────

  describe('column definition', () => {
    it('sets the tracking_number column width to 16rem', () => {
      fixture.detectChanges()
      const cols: ShColumnDef[] = component.cols
      const trackingCol = cols.find((c: ShColumnDef) => c.field === 'tracking_number')
      expect(trackingCol).toBeTruthy()
      expect(trackingCol!.width).toBe('16rem')
    })

    it('uses the "tracking" template for the tracking_number column', () => {
      fixture.detectChanges()
      const cols: ShColumnDef[] = component.cols
      const trackingCol = cols.find((c: ShColumnDef) => c.field === 'tracking_number')
      expect(trackingCol!.template).toBe('tracking')
    })
  })

  // ── Template / DOM tests ─────────────────────────────────────────────────

  describe('tracking cell template', () => {
    beforeEach(() => {
      parcelSvc.listParcels.and.returnValue(
        of({
          data: [parcel(LONG_TRACKING)],
          meta_data: { page: 1, rows: 15, total_records: 1 },
        })
      )
      fixture.detectChanges()
    })

    it('renders the tracking cell with the "tracking-cell" CSS class', () => {
      const cell = el.querySelector('.tracking-cell')
      expect(cell).toBeTruthy('Expected a .tracking-cell element in the DOM')
    })

    it('displays the full tracking number text without truncation', () => {
      const span = el.querySelector('.tracking-cell .font-bold')
      expect(span?.textContent?.trim()).toBe(LONG_TRACKING)
    })

    it('renders the barcode icon as first child inside the tracking cell', () => {
      const icon = el.querySelector('.tracking-cell > i.pi-barcode')
      expect(icon).toBeTruthy('Expected the barcode icon inside .tracking-cell')
    })
  })

  // ── SCSS / computed style tests ──────────────────────────────────────────

  describe('tracking cell SCSS styles (attached to DOM)', () => {
    beforeEach(() => {
      parcelSvc.listParcels.and.returnValue(
        of({
          data: [parcel(LONG_TRACKING)],
          meta_data: { page: 1, rows: 15, total_records: 1 },
        })
      )
      document.body.appendChild(el)
      fixture.detectChanges()
    })

    afterEach(() => {
      el.remove()
    })

    it('applies white-space: normal to the tracking-cell container', () => {
      const cell = el.querySelector('.tracking-cell') as HTMLElement
      expect(cell).toBeTruthy('tracking-cell not rendered')
      expect(getComputedStyle(cell).whiteSpace).toBe('normal')
    })

    it('applies word-break: break-all to the tracking span', () => {
      const span = el.querySelector('.tracking-cell > span') as HTMLElement
      expect(span).toBeTruthy('tracking span not rendered')
      expect(getComputedStyle(span).wordBreak).toBe('break-all')
    })

    it('sets flex-shrink: 0 on the barcode icon to prevent compression', () => {
      const icon = el.querySelector('.tracking-cell > i') as HTMLElement
      expect(icon).toBeTruthy('tracking icon not rendered')
      expect(getComputedStyle(icon).flexShrink).toBe('0')
    })
  })

  // ── Date format tests ───────────────────────────────────────────────────

  describe('date columns format (yyyy-MM-dd / HH:mm)', () => {
    beforeEach(() => {
      parcelSvc.listParcels.and.returnValue(
        of({
          data: [parcel(LONG_TRACKING)],
          meta_data: { page: 1, rows: 15, total_records: 1 },
        })
      )
      fixture.detectChanges()
    })

    it('renders created_at date in yyyy-MM-dd format', () => {
      const dateSpan = el.querySelector('[class*="text-surface"] ')
      // Find the created_at date cell — look for the date pattern
      const allDateSpans = el.querySelectorAll('.text-surface-400')
      const createdAtDate = Array.from(allDateSpans).find((s) =>
        /^\d{4}-\d{2}-\d{2}$/.test(s.textContent?.trim() ?? '')
      )
      expect(createdAtDate).toBeTruthy('Expected a date span in yyyy-MM-dd format')
      expect(createdAtDate!.textContent?.trim()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('renders created_at time in HH:mm format', () => {
      const allTimeSpans = el.querySelectorAll('.text-primary.text-sm')
      const timeSpan = Array.from(allTimeSpans).find((s) =>
        /^\d{2}:\d{2}$/.test(s.textContent?.trim() ?? '')
      )
      expect(timeSpan).toBeTruthy('Expected a time span in HH:mm format')
      expect(timeSpan!.textContent?.trim()).toMatch(/^\d{2}:\d{2}$/)
    })
  })

  // ── Facility column filter ───────────────────────────────────────────────

  describe('facility column filter', () => {
    it('offers "No facility" first while the topbar scope includes it', () => {
      facilityScopeStub.inScope.set([{ id: 'f1', name: 'Bodega Norte' }])
      expect(component.facilityFilterOptions().map((o) => o.id)).toEqual(['__NULL__', 'f1'])
    })

    it('labels it like the topbar and webhooks do', () => {
      expect(component.facilityFilterOptions()[0].name).toBe('labels.no_facility_option')
    })

    it('tells the table its rows can have no facility, so "—" stays visible', () => {
      fixture.detectChanges()
      const table = fixture.debugElement.query(By.directive(BaseDataTable))
      expect((table.componentInstance as BaseDataTable).nullableFacility()).toBeTrue()
    })

    it('drops it once the topbar narrows to facilities only', () => {
      facilityScopeStub.inScope.set([{ id: 'f1', name: 'Bodega Norte' }])
      facilityScopeStub.includesNoFacility.set(false)
      expect(component.facilityFilterOptions().map((o) => o.id)).toEqual(['f1'])
    })
  })

  // ── Header actions ────────────────────────────────────────────────────────
  //
  // The ⋮ menu was commented out of the template while the filter presets and
  // the facility selector were disabled, and was left behind when those came
  // back — All Parcels lost export and import with nothing failing to say so.
  describe('actions menu', () => {
    beforeEach(() => fixture.detectChanges())

    it('renders the import/export menu in the header', () => {
      expect(el.querySelector('base-import-export-menu')).toBeTruthy(
        'the ⋮ menu is missing from the All Parcels header'
      )
    })

    it('offers the import entries, not export alone', () => {
      const menu = fixture.debugElement.query(By.directive(BaseImportExportMenu))
      expect(menu).toBeTruthy('the ⋮ menu is missing from the All Parcels header')
      expect(menu.componentInstance.showImport()).toBeTrue()
    })

    it('keeps the import dialog wired to the menu', () => {
      expect(el.querySelector('base-import-dialog')).toBeTruthy(
        'the import dialog the menu opens is missing'
      )
    })
  })
})
