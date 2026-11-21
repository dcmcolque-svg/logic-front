import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { provideRouter } from '@angular/router'
import { provideTranslateService } from '@ngx-translate/core'
import { providePrimeNG } from 'primeng/config'
import { MessageService } from 'primeng/api'
import { AuthService } from '@/app/core/services/auth.service'
import { BrandThemeService } from '@/app/layout/service/brand-theme.service'
import { DEFAULT_BRAND_THEME } from '@/app/layout/service/brand-theme'
import AppearanceComponent from './appearance.component'

function setup(role: string) {
  TestBed.configureTestingModule({
    imports: [AppearanceComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideTranslateService(),
      providePrimeNG(),
      MessageService,
      { provide: AuthService, useValue: { getAuthUserInfo: () => ({ role }), getOperatorId: () => 'op-1' } },
    ],
  })
  const fixture = TestBed.createComponent(AppearanceComponent)
  fixture.detectChanges()
  return fixture
}

describe('AppearanceComponent', () => {
  it('is locked for roles other than OWNER', () => {
    const fixture = setup('DISPATCHER')
    expect(fixture.nativeElement.querySelector('.pi-lock')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('p-selectbutton')).toBeNull()
  })

  it('previews a change and puts the stored look back when left unsaved', () => {
    const fixture = setup('OWNER')
    const brand = TestBed.inject(BrandThemeService)
    const apply = spyOn(brand, 'apply').and.callThrough()

    fixture.componentInstance.set('primary', 'teal')
    expect(fixture.componentInstance.dirty()).toBeTrue()
    expect(apply).toHaveBeenCalledWith(jasmine.objectContaining({ primary: 'teal' }))

    fixture.destroy()
    expect(apply).toHaveBeenCalledWith(DEFAULT_BRAND_THEME)
  })

  it('ignores a select button cleared by a second click', () => {
    const fixture = setup('OWNER')
    fixture.componentInstance.set('menuMode', null as never)
    expect(fixture.componentInstance.draft().menuMode).toBe(DEFAULT_BRAND_THEME.menuMode)
  })
})
