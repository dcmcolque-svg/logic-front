import { computed, inject, Injectable, signal } from '@angular/core'
import { Router } from '@angular/router'
import { HttpClient } from '@angular/common/http'
import { environment } from '../../../environments/environment'
import {
  AuthInformationData,
  AuthResponse,
  Activity,
} from '../types/auth.types'
import { catchError, of, tap } from 'rxjs'
import {
  APP_MENU,
  APP_MENU_TOPBAR,
} from '@/app/layout/config/app.menu.config'

interface RouteItem {
  label: string
  route: string
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly ACTIVITIES = 'activities'
  private readonly AVATAR = 'avatar'
  private readonly USER_PHONE = 'user_phone'
  private readonly USER_IMG = 'user_img'
  private readonly USER_NAME = 'user_name'
  private readonly USER_EMAIL = 'user_email'

  private readonly http = inject(HttpClient)
  private readonly router = inject(Router)

  // === Reactive state (signals)
  authInfo = signal<AuthResponse | null>(null)
  isLoggedIn = computed(() => !!this.authInfo()?.status?.success)

  // === Navigation
  redirectTologin(): void {
    // Already on the login page: nothing to do (avoids a reload loop).
    if (globalThis.location.pathname === '/login') return
    // Clear DOM immediately to avoid flash of protected content
    document.body.innerHTML = ''
    // Full reload so no in-memory state from the previous session survives.
    globalThis.location.href = '/login'
  }

  /**
   * Email + password login. The backend sets the `access_token` (HttpOnly)
   * and `payload` cookies; the session is then read from the payload cookie.
   */
  login(email: string, password: string) {
    return this.http
      .post<AuthResponse>(
        `${environment.URL_API}login`,
        { email, password },
        { withCredentials: true }
      )
      .pipe(tap(() => this.loadAuthInfo()))
  }

  goToMainPage() {
    this.router.navigate(['/app'])
  }

  goToRootPage() {
    this.router.navigate(['/'])
  }

  goToErrorPage() {
    this.router.navigate(['/error'])
  }

  goToNoPermissionsPage() {
    this.router.navigate(['/no-permissions'])
  }

  // === Authentication
  isAuthenticated(): boolean {
    return this.isLoggedIn()
  }

  getAccountName(): string {
    return this.isLoggedIn() ? (this.authInfo()?.setting?.account_name ?? '') : ''
  }

  getTypeAccount(): string {
    return this.isLoggedIn() ? (this.authInfo()?.setting?.type_acc ?? '') : ''
  }

  // === Auth info from cookie
  async getAuthInfo(): Promise<AuthResponse | null> {
    const payload = this.getCookie('payload')
    if (!payload) return null

    try {
      return JSON.parse(atob(payload))
    } catch (e) {
      console.error('Error parsing auth cookie', e)
      return null
    }
  }

  async loadAuthInfo(): Promise<void> {
    this.authInfo.set(await this.getAuthInfo())
  }

  private getCookie(name: string): string | null {
    const cookies = document.cookie.split('; ')
    const cookie = cookies.find((c) => c.startsWith(`${name}=`))
    return cookie?.split('=')[1] ?? null
  }

  /**
   * Extract operator_id from the access_token JWT cookie.
   * The JWT payload contains `operatorid` (set by the backend auth middleware).
   */
  getOperatorId(): string {
    const token = this.getCookie('access_token')
    if (!token) return ''
    try {
      const payload = token.split('.')[1]
      const decoded = JSON.parse(atob(payload))
      return decoded.operator_id || decoded.operatorid || ''
    } catch {
      return ''
    }
  }

  // === Permission-based routing
  /**
   * Returns the first route the user has access to based on their activities,
   * or null if no matching route is found (no permissions).
   */
  getFirstAvailableRoute(): string | null {
    const activities = this.getActivities()
    if (!activities?.length) return null

    const routes = [
      ...this.extractRoutes(APP_MENU),
      ...this.extractRoutes(APP_MENU_TOPBAR),
    ]

    const match = routes.find((route) =>
      activities.some(
        (activity) =>
          activity.activity.toLowerCase() === route.label.toLowerCase()
      )
    )

    return match?.route ?? null
  }

  extractRoutes(menu: any[]): RouteItem[] {
    const result: RouteItem[] = []

    const traverse = (items: any[]) => {
      for (const item of items) {
        if (item.routerLink?.length) {
          result.push({ label: item.label, route: item.routerLink[0] })
        }
        if (item.items?.length) {
          traverse(item.items)
        }
      }
    }

    traverse(menu)
    return result
  }

  // === Logout
  private baseLogout(userId: string | number) {
    return this.http.get(`${environment.URL_API}logout/${userId}`, {
      withCredentials: true,
    })
  }

  logout(userId: string | number) {
    return this.baseLogout(userId).pipe(
      tap(() => {
        this.clearSessionStorage()
        this.clearCookies()
        this.router.navigate(['/login'])
      }),
      catchError((err) => {
        this.clearSessionStorage()
        this.clearCookies()
        this.router.navigate(['/login'])
        return of(err)
      })
    )
  }

  logoutWithoutRedirection(userId: string | number) {
    return this.baseLogout(userId).pipe(
      tap(() => {
        this.clearSessionStorage()
        this.clearCookies()
      }),
      catchError((err) => {
        this.clearSessionStorage()
        this.clearCookies()
        return of(err)
      })
    )
  }

  /**
   * Manually clears the auth cookies on the client side.
   * This acts as a fallback if the backend fails to clear them or if there are domain mismatch issues.
   */
  clearCookies(): void {
    const domain = globalThis.location.hostname
    const rootDomain = domain.includes('.') ? domain.substring(domain.indexOf('.')) : domain

    // Clear without domain
    document.cookie = 'access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;'
    document.cookie = 'payload=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;'

    // Clear with specific domain
    document.cookie = `access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain};`
    document.cookie = `payload=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain};`

    // Clear with root domain (e.g. .shipedge.com)
    if (rootDomain !== domain) {
      document.cookie = `access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${rootDomain};`
      document.cookie = `payload=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${rootDomain};`
    }

    // Clear signal state
    this.authInfo.set(null)
  }

  /**
   * Clears all auth-related keys from localStorage on logout.
   * Prevents session data from leaking between different users on the same browser.
   */
  private clearSessionStorage(): void {
    localStorage.removeItem(this.ACTIVITIES)
    localStorage.removeItem(this.AVATAR)
    localStorage.removeItem(this.USER_PHONE)
    localStorage.removeItem(this.USER_IMG)
    localStorage.removeItem(this.USER_NAME)
    localStorage.removeItem(this.USER_EMAIL)
  }

  // === User information data
  saveInformationData(data: AuthInformationData) {
    localStorage.setItem(this.ACTIVITIES, JSON.stringify(data.activities))
    localStorage.setItem(this.AVATAR, JSON.stringify(data.avatar))
    if (data.email) {
      localStorage.setItem(this.USER_EMAIL, JSON.stringify(data.email))
    }
  }

  getActivities(): Activity[] {
    const data = localStorage.getItem(this.ACTIVITIES)
    return data ? JSON.parse(data) : []
  }

  getAvatar(): string {
    const data = localStorage.getItem(this.AVATAR)
    return data ? JSON.parse(data) : ''
  }

  getUserPhone(): string {
    const data = localStorage.getItem(this.USER_PHONE)
    return data ? JSON.parse(data) : (this.authInfo()?.user_phone ?? '')
  }

  getUserEmail(): string {
    const data = localStorage.getItem(this.USER_EMAIL)
    return data ? JSON.parse(data) : ''
  }

  getUserImg(): string {
    const data = localStorage.getItem(this.USER_IMG)
    return data ? JSON.parse(data) : (this.authInfo()?.user_img ?? '')
  }

  getInformationData(userUId: string) {
    return this.http.get<AuthInformationData>(
      `${environment.URL_API}edge/auth/info/data/${userUId}`
    )
  }

  getAuthUserInfo() {
    return this.authInfo()
  }

  getCompleteUserInfo() {
    const authInfo = this.authInfo()
    return {
      ...authInfo,
      user_name: this.getUserName() || authInfo?.user_name,
      user_phone: this.getUserPhone() || authInfo?.user_phone,
      user_img: this.getUserImg() || authInfo?.user_img || this.getAvatar(),
    }
  }

  updateUserProfile(updates: {
    user_name?: string
    user_phone?: string
    user_img?: string
  }) {
    const currentInfo = this.authInfo()
    if (currentInfo) {
      const updatedInfo = {
        ...currentInfo,
        user_name: updates.user_name ?? currentInfo.user_name,
      }
      this.authInfo.set(updatedInfo)

      // Persist name to localStorage so it survives page reloads
      if (updates.user_name !== undefined) {
        localStorage.setItem(this.USER_NAME, JSON.stringify(updates.user_name))
      }

      if (updates.user_phone !== undefined) {
        localStorage.setItem(this.USER_PHONE, JSON.stringify(updates.user_phone))
      }

      if (updates.user_img) {
        localStorage.setItem(this.USER_IMG, JSON.stringify(updates.user_img))
        localStorage.setItem(this.AVATAR, JSON.stringify(updates.user_img))
      }
    }
  }

  getUserName(): string {
    const data = localStorage.getItem(this.USER_NAME)
    return data ? JSON.parse(data) : (this.authInfo()?.user_name ?? '')
  }
}
