import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing'
import { SimpleChange } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'

import { OperatorBrandingDialogComponent } from './operator-branding-dialog.component'
import { AuthService } from '@/app/core/services/auth.service'
import { environment } from '@/environments/environment'

describe('OperatorBrandingDialogComponent', () => {
  let component: OperatorBrandingDialogComponent
  let fixture: ComponentFixture<OperatorBrandingDialogComponent>
  let httpMock: HttpTestingController

  const mockAuthService = {
    getOperatorId: () => 'op-123',
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OperatorBrandingDialogComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MessageService,
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(OperatorBrandingDialogComponent)
    component = fixture.componentInstance
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })

  it('should NOT have a dark signal or defaultLogoDark property', () => {
    expect((component as any).dark).toBeUndefined()
    expect((component as any).defaultLogoDark).toBeUndefined()
  })

  it('should have light signal initialized as empty slot', () => {
    const slot = component.light()
    expect(slot.savedUrl).toBeNull()
    expect(slot.previewUrl).toBeNull()
    expect(slot.pendingFile).toBeNull()
  })

  it('should load branding when visible changes to true', () => {
    component.ngOnChanges({
      visible: new SimpleChange(false, true, true),
    })

    const req = httpMock.expectOne(`${environment.URL_API}v2/operator-branding/me`)
    expect(req.request.method).toBe('GET')

    req.flush({
      id: 'b-1',
      operator_id: 'op-123',
      theme_name: '',
      logo_light_url: 'https://cdn.example.com/light.png',
      logo_dark_url: 'https://cdn.example.com/dark.png',
      ui_settings: {},
      created_at: '',
      updated_at: '',
    })

    expect(component.light().savedUrl).toBe('https://cdn.example.com/light.png')
    expect(component.branding()?.id).toBe('b-1')
  })

  it('should handle file selection for light slot', () => {
    const file = new File(['img'], 'logo.png', { type: 'image/png' })
    const mockEvent = {
      target: { files: [file], value: '' } as unknown as HTMLInputElement,
    } as unknown as Event

    component.onFileSelected('light', mockEvent)

    expect(component.light().pendingFile).toBe(file)
    expect(component.light().previewUrl).toBeTruthy()
  })

  it('should clear light slot preview', () => {
    const file = new File(['img'], 'logo.png', { type: 'image/png' })
    const mockEvent = {
      target: { files: [file], value: '' } as unknown as HTMLInputElement,
    } as unknown as Event

    component.onFileSelected('light', mockEvent)
    expect(component.light().previewUrl).toBeTruthy()

    component.clearSlot('light')
    expect(component.light().previewUrl).toBeNull()
    expect(component.light().pendingFile).toBeNull()
  })

  it('should remove backend image for light slot', () => {
    component.light.set({
      savedUrl: 'https://cdn.example.com/light.png',
      previewUrl: null,
      pendingFile: null,
    })

    component.removeBackendImage('light')
    expect(component.light().savedUrl).toBeNull()
  })

  it('should return previewUrl first, then savedUrl, then fallback in previewFor', () => {
    expect(
      component.previewFor(
        { previewUrl: 'preview', savedUrl: 'saved', pendingFile: null },
        'fallback'
      )
    ).toBe('preview')

    expect(
      component.previewFor(
        { previewUrl: null, savedUrl: 'saved', pendingFile: null },
        'fallback'
      )
    ).toBe('saved')

    expect(
      component.previewFor(
        { previewUrl: null, savedUrl: null, pendingFile: null },
        'fallback'
      )
    ).toBe('fallback')
  })

  it('should send empty logo_dark_url on save (update flow)', () => {
    component.branding.set({
      id: 'b-1',
      operator_id: 'op-123',
      theme_name: '',
      logo_light_url: 'https://cdn.example.com/light.png',
      logo_dark_url: 'https://cdn.example.com/dark.png',
      ui_settings: {},
      created_at: '',
      updated_at: '',
    })
    component.light.set({
      savedUrl: 'https://cdn.example.com/light.png',
      previewUrl: null,
      pendingFile: null,
    })

    component.onSave()

    const req = httpMock.expectOne(`${environment.URL_API}v2/operator-branding/b-1`)
    expect(req.request.method).toBe('PUT')
    expect(req.request.body.logo_dark_url).toBe('')
    expect(req.request.body.logo_light_url).toBe('https://cdn.example.com/light.png')

    req.flush({
      id: 'b-1',
      operator_id: 'op-123',
      theme_name: '',
      logo_light_url: 'https://cdn.example.com/light.png',
      logo_dark_url: '',
      ui_settings: {},
      created_at: '',
      updated_at: '',
    })

    expect(component.saving()).toBeFalse()
  })

  it('should send empty logo_dark_url on save (create flow)', () => {
    component.branding.set(null)
    component.light.set({
      savedUrl: null,
      previewUrl: null,
      pendingFile: null,
    })

    component.onSave()

    const req = httpMock.expectOne(`${environment.URL_API}v2/operator-branding`)
    expect(req.request.method).toBe('POST')
    expect(req.request.body.logo_dark_url).toBe('')
    expect(req.request.body.operator_id).toBe('op-123')

    req.flush({
      id: 'b-new',
      operator_id: 'op-123',
      theme_name: '',
      logo_light_url: '',
      logo_dark_url: '',
      ui_settings: {},
      created_at: '',
      updated_at: '',
    })

    expect(component.saving()).toBeFalse()
  })

  it('should handle save error gracefully', () => {
    component.branding.set(null)
    component.light.set({ savedUrl: null, previewUrl: null, pendingFile: null })

    component.onSave()

    const req = httpMock.expectOne(`${environment.URL_API}v2/operator-branding`)
    req.error(new ProgressEvent('error'), { status: 500 })

    expect(component.saving()).toBeFalse()
  })

  it('canSave should be true when not saving and not loading', () => {
    component.saving.set(false)
    component.loadingBranding.set(false)
    expect(component.canSave).toBeTrue()
  })

  it('canSave should be false when saving', () => {
    component.saving.set(true)
    expect(component.canSave).toBeFalse()
  })
})
