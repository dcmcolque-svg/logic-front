import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { provideRouter } from '@angular/router'
import { environment } from '@/environments/environment'
import { AuthService } from '@/app/core/services/auth.service'
import { throwError } from 'rxjs'
import { OperatorBrandingService } from '@/app/features/preferences/operator-branding/operator-branding.service'
import { BrandThemeService } from './brand-theme.service'
import { LayoutService } from './layout.service'
import { BrandTheme, DEFAULT_BRAND_THEME, parseBrandTheme } from './brand-theme'

const BASE = `${environment.URL_API}v2/operator-branding`
const TEAL: BrandTheme = { preset: 'Lara', primary: 'teal', surface: 'zinc', menuMode: 'slim', layoutTheme: 'primaryColor' }

describe('parseBrandTheme', () => {
  it('keeps known values', () => {
    expect(parseBrandTheme(TEAL)).toEqual(TEAL)
  })

  it('falls back to the default for missing or unknown values', () => {
    expect(parseBrandTheme(undefined)).toEqual(DEFAULT_BRAND_THEME)
    expect(parseBrandTheme({ preset: 'Material', primary: 'mauve', surface: 'x', menuMode: 'horizontal', layoutTheme: 1 })).toEqual(
      DEFAULT_BRAND_THEME
    )
  })
})

describe('BrandThemeService', () => {
  let service: BrandThemeService
  let http: HttpTestingController
  let layout: LayoutService

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { getOperatorId: () => 'op-1' } },
      ],
    })
    service = TestBed.inject(BrandThemeService)
    http = TestBed.inject(HttpTestingController)
    layout = TestBed.inject(LayoutService)
  })

  afterEach(() => http.verify())

  it('applies the company theme on init', () => {
    service.init()
    http.expectOne(`${BASE}/me`).flush({ id: 'b1', ui_settings: { theme: TEAL } })
    expect(service.saved()).toEqual(TEAL)
    expect(layout.layoutConfig().primary).toBe('teal')
    expect(layout.layoutConfig().menuMode).toBe('slim')
  })

  it('keeps the default when the role may not read the branding', () => {
    service.init()
    http.expectOne(`${BASE}/me`).flush('forbidden', { status: 403, statusText: 'Forbidden' })
    expect(service.saved()).toEqual(DEFAULT_BRAND_THEME)
    expect(layout.layoutConfig().primary).toBe(DEFAULT_BRAND_THEME.primary)
  })

  it('updates the record keeping other ui_settings', () => {
    let stored: BrandTheme | undefined
    service.save(TEAL).subscribe(t => (stored = t))
    http.expectOne(`${BASE}/me`).flush({ id: 'b1', ui_settings: { other: 1 } })
    const put = http.expectOne(`${BASE}/b1`)
    expect(put.request.method).toBe('PUT')
    expect(put.request.body).toEqual({ ui_settings: { other: 1, theme: TEAL } })
    put.flush({ id: 'b1', ui_settings: { other: 1, theme: TEAL } })
    expect(stored).toEqual(TEAL)
    expect(service.saved()).toEqual(TEAL)
  })

  it('creates the record when the operator has none', () => {
    service.save(TEAL).subscribe()
    http.expectOne(`${BASE}/me`).flush('not found', { status: 404, statusText: 'Not Found' })
    const post = http.expectOne(BASE)
    expect(post.request.method).toBe('POST')
    expect(post.request.body).toEqual({ operator_id: 'op-1', ui_settings: { theme: TEAL } })
    post.flush({ id: 'b1', ui_settings: { theme: TEAL } })
  })

  it('creates the record when the interceptor rethrows the v2 not-found body', () => {
    const branding = TestBed.inject(OperatorBrandingService)
    spyOn(branding, 'getMyBranding').and.returnValue(
      throwError(() => ({ success: false, code: 'BRANDING_NOT_FOUND', message: 'Operator branding not found.' }))
    )
    service.save(TEAL).subscribe()
    const post = http.expectOne(BASE)
    expect(post.request.method).toBe('POST')
    post.flush({ id: 'b1', ui_settings: { theme: TEAL } })
    expect(service.saved()).toEqual(TEAL)
  })

  it('does not create a second record when reading fails for another reason', () => {
    let failed = false
    service.save(TEAL).subscribe({ error: () => (failed = true) })
    http.expectOne(`${BASE}/me`).flush('boom', { status: 500, statusText: 'Server Error' })
    expect(failed).toBeTrue()
    expect(service.saved()).toEqual(DEFAULT_BRAND_THEME)
  })
})
