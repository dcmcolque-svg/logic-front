import { provideZonelessChangeDetection, signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { provideTranslateService } from '@ngx-translate/core'
import { providePrimeNG } from 'primeng/config'
import { provideRouter } from '@angular/router'
import { AuthService } from '@/app/core/services/auth.service'
import { TranslateLanService } from '@/app/core/services/translate-lan.service'
import { AuthUser } from './user-account.types'
import UserAccountComponent from './user-account.component'

describe('UserAccountComponent – isInviteExpired', () => {
  let fixture: ComponentFixture<UserAccountComponent>
  let component: UserAccountComponent

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserAccountComponent],
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
          useValue: { changeLanguage: signal('en') },
        },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(UserAccountComponent)
    component = fixture.componentInstance
  })

  const makeUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
    id: 'test-id',
    user_status: 'invited',
    ...overrides,
  })

  it('should return true when invite_metadata.expires_at is in the past', () => {
    const row = makeUser({
      invite_metadata: { code: 'ABC123', expires_at: '2020-01-01T00:00:00Z' },
    })
    expect(component.isInviteExpired(row)).toBeTrue()
  })

  it('should return false when invite_metadata.expires_at is in the future', () => {
    const row = makeUser({
      invite_metadata: { code: 'ABC123', expires_at: '2099-12-31T23:59:59Z' },
    })
    expect(component.isInviteExpired(row)).toBeFalse()
  })

  it('should return true when invite_code_expires_at is in the past (no invite_metadata)', () => {
    const row = makeUser({
      invite_code_expires_at: '2020-06-15T12:00:00Z',
    })
    expect(component.isInviteExpired(row)).toBeTrue()
  })

  it('should return false when invite_code_expires_at is in the future (no invite_metadata)', () => {
    const row = makeUser({
      invite_code_expires_at: '2099-06-15T12:00:00Z',
    })
    expect(component.isInviteExpired(row)).toBeFalse()
  })

  it('should return false when no expiration date is present', () => {
    const row = makeUser()
    expect(component.isInviteExpired(row)).toBeFalse()
  })

  it('should prefer invite_metadata.expires_at over invite_code_expires_at', () => {
    const row = makeUser({
      invite_metadata: { code: 'ABC123', expires_at: '2020-01-01T00:00:00Z' },
      invite_code_expires_at: '2099-12-31T23:59:59Z',
    })
    // invite_metadata.expires_at (past) takes priority → expired
    expect(component.isInviteExpired(row)).toBeTrue()
  })
})
