import { provideZonelessChangeDetection, signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { provideTranslateService } from '@ngx-translate/core'
import { providePrimeNG } from 'primeng/config'
import { provideRouter } from '@angular/router'
import { AuthService } from '@/app/core/services/auth.service'
import { TranslateLanService } from '@/app/core/services/translate-lan.service'
import { AppTopbar } from './app.topbar'

describe('AppTopbar – itemsApps', () => {
  let fixture: ComponentFixture<AppTopbar>
  let component: AppTopbar

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppTopbar],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService(),
        providePrimeNG(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            authInfo: signal({ uid: 'u1' }),
            getAuthUserInfo: () => ({ id: 'u1', uid: 'u1' }),
          },
        },
        {
          provide: TranslateLanService,
          useValue: { changeLanguage: signal('en'), getLanguage: () => 'en' },
        },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(AppTopbar)
    component = fixture.componentInstance
  })

  it('should only contain Omniorders, Ionflows and Xenvio', () => {
    const labels = component.itemsApps.map((item) => item.label)
    expect(labels).toEqual(['Omniorders', 'Ionflows', 'Xenvio'])
  })

  it('should NOT contain Shelfter', () => {
    const labels = component.itemsApps.map((item) => item.label)
    expect(labels).not.toContain('Shelfter')
  })

  it('should NOT contain Binlogic', () => {
    const labels = component.itemsApps.map((item) => item.label)
    expect(labels).not.toContain('Binlogic')
  })

  it('should NOT contain Templatemaker', () => {
    const labels = component.itemsApps.map((item) => item.label)
    expect(labels).not.toContain('Templatemaker')
  })

  it('should have exactly 3 app items', () => {
    expect(component.itemsApps.length).toBe(3)
  })

  it('every app item should have a non-empty img path', () => {
    for (const item of component.itemsApps) {
      expect(item.img).toBeTruthy()
    }
  })
})
