import { HttpErrorResponse } from '@angular/common/http'
import { inject, Injectable, signal } from '@angular/core'
import { catchError, map, Observable, of, switchMap, tap, throwError } from 'rxjs'
import {
  OperatorBranding,
  OperatorBrandingService,
} from '@/app/features/preferences/operator-branding/operator-branding.service'
import { AuthService } from '@/app/core/services/auth.service'
import { LayoutService } from './layout.service'
import { applyThemeTokens, BrandTheme, DEFAULT_BRAND_THEME, parseBrandTheme } from './brand-theme'

/**
 * The company's look, shared by all its users. Loaded once by the app layout;
 * Preferences → Appearance previews with apply() and stores with save().
 */
@Injectable({ providedIn: 'root' })
export class BrandThemeService {
  private readonly branding = inject(OperatorBrandingService)
  private readonly layout = inject(LayoutService)
  private readonly auth = inject(AuthService)

  /** The stored theme (what everyone sees), not a preview in progress. */
  readonly saved = signal<BrandTheme>(DEFAULT_BRAND_THEME)

  /**
   * Applies the default right away (no flash of PrimeNG's base preset), then
   * the company's theme once it arrives. Without a record, or when the role
   * may not read it, the default stays: GET errors here are not shown.
   */
  init(): void {
    this.apply(DEFAULT_BRAND_THEME)
    this.fetch().pipe(catchError(() => of(null))).subscribe(record => {
      const theme = themeOf(record)
      this.saved.set(theme)
      this.apply(theme)
    })
  }

  /** Shows a theme in this browser only; save() makes it the company's. */
  apply(theme: BrandTheme): void {
    this.layout.layoutConfig.update(c => ({
      ...c,
      preset: theme.preset,
      primary: theme.primary,
      surface: theme.surface,
      layoutTheme: theme.layoutTheme,
    }))
    if (this.layout.layoutConfig().menuMode !== theme.menuMode) {
      this.layout.changeMenuMode(theme.menuMode)
    }
    applyThemeTokens(theme)
  }

  /**
   * Stores the theme for the whole company (OWNER only; the backend refuses
   * other roles). Other ui_settings keys are kept: the PUT replaces the object.
   */
  save(theme: BrandTheme): Observable<BrandTheme> {
    return this.fetch().pipe(
      switchMap(record => {
        const ui_settings = { ...(record?.ui_settings ?? {}), theme }
        return record
          ? this.branding.update(record.id, { ui_settings })
          : this.branding.create({ operator_id: this.auth.getOperatorId(), ui_settings })
      }),
      map(themeOf),
      tap(stored => {
        this.saved.set(stored)
        this.apply(stored)
      })
    )
  }

  /** The operator's record; null when it has none yet. */
  private fetch(): Observable<OperatorBranding | null> {
    return this.branding.getMyBranding().pipe(catchError(e => (isNotFound(e) ? of(null) : throwError(() => e))))
  }
}

/**
 * "No branding yet": the errorInterceptor rethrows v2 errors as their body
 * ({ code, message }), without the HTTP status; a bare 404 stays an HttpErrorResponse.
 */
function isNotFound(e: unknown): boolean {
  if (e instanceof HttpErrorResponse) return e.status === 404
  return (e as { code?: unknown } | null)?.code === 'BRANDING_NOT_FOUND'
}

function themeOf(record: OperatorBranding | null): BrandTheme {
  return parseBrandTheme(record?.ui_settings?.['theme'])
}
