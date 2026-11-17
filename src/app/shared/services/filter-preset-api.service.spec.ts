import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { environment } from '@/environments/environment'
import { FilterPreset } from '@/app/shared/types/filter-preset.types'
import { FilterPresetApiService } from './filter-preset-api.service'

/**
 * Pins the HTTP contract with /v2/filter-preset. The client never sends
 * operator_id: the backend takes the tenant from the JWT.
 */
describe('FilterPresetApiService', () => {
  const base = environment.URL_API + 'v2/filter-preset'
  let api: FilterPresetApiService
  let http: HttpTestingController

  const preset = { id: 'p1', name: 'Urgentes', page_key: 'parcels' } as FilterPreset

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    })
    api = TestBed.inject(FilterPresetApiService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => http.verify())

  it('lists the presets of a page with GET /filter-preset/:pageKey', () => {
    let got: FilterPreset[] | undefined
    api.list('parcels').subscribe((p) => (got = p))

    const req = http.expectOne(`${base}/parcels`)
    expect(req.request.method).toBe('GET')
    req.flush([preset])

    expect(got).toEqual([preset])
  })

  it('turns a null list body into an empty array', () => {
    let got: FilterPreset[] | undefined
    api.list('parcels').subscribe((p) => (got = p))

    http.expectOne(`${base}/parcels`).flush(null)

    expect(got).toEqual([])
  })

  it('creates with POST /filter-preset and the input as body, without operator_id', () => {
    const input = { page_key: 'parcels', name: 'Urgentes', conditions: [] }
    let got: FilterPreset | undefined
    api.create(input).subscribe((p) => (got = p))

    const req = http.expectOne(base)
    expect(req.request.method).toBe('POST')
    expect(req.request.body).toEqual(input)
    expect(req.request.body.operator_id).toBeUndefined()
    req.flush(preset)

    expect(got).toEqual(preset)
  })

  it('updates with PUT /filter-preset/:id', () => {
    api.update('p1', { name: 'Nuevo' }).subscribe()

    const req = http.expectOne(`${base}/p1`)
    expect(req.request.method).toBe('PUT')
    expect(req.request.body).toEqual({ name: 'Nuevo' })
    req.flush(preset)
  })

  it('deletes with DELETE /filter-preset/:id', () => {
    let done = false
    api.delete('p1').subscribe(() => (done = true))

    const req = http.expectOne(`${base}/p1`)
    expect(req.request.method).toBe('DELETE')
    req.flush(null)

    expect(done).toBeTrue()
  })

  it('propagates HTTP errors such as a duplicate name (409)', () => {
    let status = 0
    api.create({ page_key: 'parcels', name: 'dup', conditions: [] }).subscribe({
      error: (e) => (status = e.status),
    })

    http.expectOne(base).flush({ code: 'FILTER_PRESET_DUPLICATE_NAME' }, { status: 409, statusText: 'Conflict' })

    expect(status).toBe(409)
  })
})
