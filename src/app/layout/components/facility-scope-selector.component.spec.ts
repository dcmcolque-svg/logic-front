import { provideZonelessChangeDetection, signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { provideTranslateService } from '@ngx-translate/core'
import { providePrimeNG } from 'primeng/config'
import { environment } from '@/environments/environment'
import { AuthService } from '@/app/core/services/auth.service'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { TranslateLanService } from '@/app/core/services/translate-lan.service'
import { NO_FACILITY_ID, ScopeFacility } from '@/app/core/types/facility.types'
import { FacilityScopeSelectorComponent } from './facility-scope-selector.component'

const MY_FACILITIES_URL = environment.URL_API + 'v2/facility/my'
const ALL: ScopeFacility[] = [
  { id: 'f1', name: 'Miami' },
  { id: 'f2', name: 'Dallas' },
  { id: 'f3', name: 'LA' },
]

/** The component's protected API, as the template uses it. */
interface SelectorInternals {
  pendingIds(): string[]
  displayedIds(): string[]
  options(): ScopeFacility[]
  selectedItemsLabel(): string
  onPendingChange(ids: string[] | null): void
  onApply(): void
  onClear(): void
  onClearIcon(): void
  onPanelHide(): void
}

describe('FacilityScopeSelectorComponent', () => {
  let fixture: ComponentFixture<FacilityScopeSelectorComponent>
  let selector: SelectorInternals
  let scope: FacilityScopeService
  let http: HttpTestingController

  async function render(facilities: ScopeFacility[]): Promise<void> {
    fixture = TestBed.createComponent(FacilityScopeSelectorComponent)
    selector = fixture.componentInstance as unknown as SelectorInternals
    fixture.detectChanges() // ngOnInit → scope.load()
    http.expectOne(MY_FACILITIES_URL).flush({ data: facilities })
    await fixture.whenStable()
  }

  beforeEach(() => {
    localStorage.clear()
    TestBed.configureTestingModule({
      imports: [FacilityScopeSelectorComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService(),
        providePrimeNG(),
        { provide: AuthService, useValue: { authInfo: signal({ uid: 'u1' }) } },
        { provide: TranslateLanService, useValue: { changeLanguage: signal('en') } },
      ],
    })
    scope = TestBed.inject(FacilityScopeService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    http.verify()
    localStorage.clear()
  })

  describe('rendering', () => {
    it('renders nothing until the facility list arrives', () => {
      fixture = TestBed.createComponent(FacilityScopeSelectorComponent)
      fixture.detectChanges()
      expect(fixture.nativeElement.querySelector('p-multiselect')).toBeNull()
      http.expectOne(MY_FACILITIES_URL).flush({ data: [] })
    })

    it('renders nothing for a user without facilities', async () => {
      await render([])
      expect(fixture.nativeElement.querySelector('p-multiselect')).toBeNull()
    })

    it('stays visible but locked on the only facility a user can reach', async () => {
      await render([ALL[0]])
      // ngModel writes its value in a microtask; let that render land.
      await fixture.whenStable()
      fixture.detectChanges()
      const ms: HTMLElement = fixture.nativeElement.querySelector('p-multiselect')
      expect(ms).not.toBeNull()
      expect(ms.classList).toContain('p-disabled')
      expect(ms.textContent).toContain('Miami')
      expect(selector.displayedIds()).toEqual(['f1'])
    })

    it('keeps the single-facility scope as "all" — nothing is persisted', async () => {
      await render([ALL[0]])
      expect(scope.selectedIds()).toEqual([])
      expect(localStorage.length).toBe(0)
    })

    it('is enabled and shows the buffer when there is more than one facility', async () => {
      await render(ALL)
      const ms: HTMLElement = fixture.nativeElement.querySelector('p-multiselect')
      expect(ms).not.toBeNull()
      expect(ms.classList).not.toContain('p-disabled')

      selector.onPendingChange(['f2'])
      expect(selector.displayedIds()).toEqual(['f2'])
    })
  })

  describe('buffered selection (Clear / Apply)', () => {
    beforeEach(() => render(ALL))

    it('ticking boxes does not touch the global scope', () => {
      selector.onPendingChange(['f1', 'f2'])
      expect(selector.pendingIds()).toEqual(['f1', 'f2'])
      expect(scope.selectedIds()).toEqual([])
    })

    it('Apply commits the buffer to the service', () => {
      selector.onPendingChange(['f2'])
      selector.onApply()
      expect(scope.selectedIds()).toEqual(['f2'])
    })

    it('closing the panel without Apply discards the buffer', () => {
      scope.setSelection(['f1'])
      TestBed.tick()
      selector.onPendingChange(['f1', 'f3'])

      selector.onPanelHide()

      expect(selector.pendingIds()).toEqual(['f1'])
      expect(scope.selectedIds()).toEqual(['f1'])
    })

    it('Clear resets both the buffer and the scope', () => {
      scope.setSelection(['f1'])
      TestBed.tick()
      selector.onPendingChange(['f1', 'f2'])

      selector.onClear()

      expect(selector.pendingIds()).toEqual([])
      expect(scope.selectedIds()).toEqual([])
    })

    it("the trigger's clear icon commits immediately", () => {
      scope.setSelection(['f3'])
      TestBed.tick()

      selector.onClearIcon()

      expect(scope.selectedIds()).toEqual([])
      expect(selector.pendingIds()).toEqual([])
    })

    it('a null model change empties the buffer', () => {
      selector.onPendingChange(['f1'])
      selector.onPendingChange(null)
      expect(selector.pendingIds()).toEqual([])
    })

    it('follows scope changes made elsewhere (restore, prune)', () => {
      scope.setSelection(['f2', 'f3'])
      TestBed.tick()
      expect(selector.pendingIds()).toEqual(['f2', 'f3'])
    })
  })

  describe('selectedItemsLabel', () => {
    beforeEach(() => render(ALL))

    it('offers "No facility" first, then every facility', () => {
      expect(selector.options().map((o) => o.id)).toEqual([NO_FACILITY_ID, 'f1', 'f2', 'f3'])
      expect(selector.options()[0].name).toBe('labels.no_facility_option')
    })

    it('reads "N facilities" for a partial selection', () => {
      selector.onPendingChange(['f1', 'f2'])
      expect(selector.selectedItemsLabel()).toBe('labels.n_facilities')
    })

    it('reads "All facilities" when every option is ticked', () => {
      selector.onPendingChange([NO_FACILITY_ID, 'f1', 'f2', 'f3'])
      expect(selector.selectedItemsLabel()).toBe('labels.all_facilities')
    })

    it('every facility without "No facility" is still a narrowing', () => {
      selector.onPendingChange(['f1', 'f2', 'f3'])
      expect(selector.selectedItemsLabel()).toBe('labels.n_facilities')
    })

    it('names "No facility" when it is the only pick', () => {
      selector.onPendingChange([NO_FACILITY_ID])
      expect(selector.selectedItemsLabel()).toBe('labels.no_facility_option')
    })

    it('reads "All facilities" for an empty selection', () => {
      selector.onPendingChange([])
      expect(selector.selectedItemsLabel()).toBe('labels.all_facilities')
    })

    it('a stale id does not pass as full coverage', () => {
      selector.onPendingChange(['f1', 'f2', 'gone'])
      expect(selector.selectedItemsLabel()).toBe('labels.n_facilities')
    })

    it('reads the facility name — not "1 facilities" — for a single pick', () => {
      selector.onPendingChange(['f2'])
      expect(selector.selectedItemsLabel()).toBe('Dallas')
    })

    it('shows that name on the trigger once applied', async () => {
      selector.onPendingChange(['f3'])
      selector.onApply()
      await fixture.whenStable()
      fixture.detectChanges()
      await fixture.whenStable()

      const ms: HTMLElement = fixture.nativeElement.querySelector('p-multiselect')
      expect(ms.textContent).toContain('LA')
    })
  })

  it('reads the facility name for a user locked on a single facility', async () => {
    await render([ALL[0]])
    expect(selector.selectedItemsLabel()).toBe('Miami')
  })

  it('reads a buffer as a restriction before facilities load', () => {
    fixture = TestBed.createComponent(FacilityScopeSelectorComponent)
    selector = fixture.componentInstance as unknown as SelectorInternals
    fixture.detectChanges()
    selector.onPendingChange(['f1'])

    expect(selector.selectedItemsLabel()).toBe('labels.n_facilities')

    http.expectOne(MY_FACILITIES_URL).flush({ data: ALL })
  })
})
