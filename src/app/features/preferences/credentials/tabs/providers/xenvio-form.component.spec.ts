import { provideZonelessChangeDetection } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import { of, throwError } from 'rxjs'
import { ProvidersService } from './providers.service'
import { XenvioFormComponent } from './xenvio-form.component'

const EXISTING = {
  id: '1',
  operator_id: 'op',
  provider_name: 'xenvio',
  config: { url: 'https://x52.shipedge.com', email: 'qa@example.com', api_key: '****' },
  is_active: true,
}

describe('XenvioFormComponent', () => {
  let fixture: ComponentFixture<XenvioFormComponent>
  let component: XenvioFormComponent
  let upsert: jasmine.Spy
  let close: jasmine.Spy

  function setup(existing: typeof EXISTING | null): void {
    upsert = jasmine.createSpy('upsert').and.returnValue(of({ status: 'saved' }))
    close = jasmine.createSpy('close')
    TestBed.configureTestingModule({
      imports: [XenvioFormComponent, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProvidersService, useValue: { upsert } },
        { provide: DynamicDialogConfig, useValue: { data: { existing } } },
        { provide: DynamicDialogRef, useValue: { close } },
      ],
    })
    fixture = TestBed.createComponent(XenvioFormComponent)
    component = fixture.componentInstance
  }

  function fillNewConfig(): void {
    component.form = { url: ' https://x52.shipedge.com ', email: 'qa@example.com', api_key: 'secret' }
  }

  describe('API key when editing', () => {
    beforeEach(() => setup(EXISTING))

    it('does not load the masked key into the form', () => {
      expect(component.form.api_key).toBe('')
    })

    it('shows an empty key input after pressing edit', async () => {
      component.editingKey.set(true)
      fixture.detectChanges()
      await fixture.whenStable()

      const inputs: HTMLInputElement[] = Array.from(fixture.nativeElement.querySelectorAll('input'))
      const keyInput = inputs.find(i => i.placeholder === 'your_api_key')
      expect(keyInput?.value).toBe('')
    })

    it('keeps url and email of the saved config', () => {
      expect(component.form.url).toBe(EXISTING.config.url)
      expect(component.form.email).toBe(EXISTING.config.email)
    })

    it('saves without api_key while the key stays locked', () => {
      expect(component.isValid()).toBeTrue()

      component.save()

      expect(upsert).toHaveBeenCalledOnceWith('xenvio', {
        url: EXISTING.config.url,
        email: EXISTING.config.email,
      })
    })

    it('requires a new key once the field is unlocked', () => {
      component.editingKey.set(true)
      expect(component.isValid()).toBeFalse()

      component.form.api_key = 'new-secret'
      expect(component.isValid()).toBeTrue()

      component.save()
      expect(upsert.calls.mostRecent().args[1]['api_key']).toBe('new-secret')
    })
  })

  describe('connection check on save', () => {
    beforeEach(() => {
      setup(null)
      fillNewConfig()
    })

    it('closes the dialog when the connection is accepted', () => {
      component.save()

      expect(close).toHaveBeenCalledOnceWith(true)
      expect(component.connectionError()).toBeNull()
    })

    const rejected: [string, string][] = [
      ['XENVIO_INVALID_CREDENTIALS', 'preferences.providers.xenvio_invalid_credentials'],
      ['XENVIO_CONNECTION_FAILED', 'preferences.providers.xenvio_connection_failed'],
      ['XENVIO_VALIDATION_ERROR', 'preferences.providers.xenvio_missing_fields'],
    ]
    for (const [code, key] of rejected) {
      it(`stays open and shows the error on ${code}`, async () => {
        upsert.and.returnValue(throwError(() => ({ success: false, code })))

        component.save()
        fixture.detectChanges()
        await fixture.whenStable()

        expect(close).not.toHaveBeenCalled()
        expect(component.saving()).toBeFalse()
        expect(component.connectionError()).toBe(key)
        expect(fixture.nativeElement.querySelector('p-message')?.textContent).toContain(key)
      })
    }

    it('shows nothing inline for other errors, which the interceptor already reports', () => {
      upsert.and.returnValue(throwError(() => ({ success: false, code: 'PROVIDER_DB_FAILED' })))

      component.save()

      expect(component.connectionError()).toBeNull()
      expect(close).not.toHaveBeenCalled()
    })

    it('clears the previous error when saving again', () => {
      upsert.and.returnValue(throwError(() => ({ success: false, code: 'XENVIO_CONNECTION_FAILED' })))
      component.save()

      upsert.and.returnValue(of({ status: 'saved' }))
      component.save()

      expect(component.connectionError()).toBeNull()
      expect(close).toHaveBeenCalledOnceWith(true)
    })
  })
})
