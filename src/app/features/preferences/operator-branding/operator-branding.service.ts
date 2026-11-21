import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { environment } from '@/environments/environment'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OperatorBranding {
  id: string
  operator_id: string
  theme_name: string
  logo_light_url: string | null
  logo_dark_url: string | null
  ui_settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface BrandingCreateInput {
  operator_id: string
  theme_name?: string
  logo_light_url?: string | null
  logo_dark_url?: string | null
  ui_settings?: Record<string, unknown>
}

export interface BrandingUpdateInput {
  theme_name?: string
  logo_light_url?: string | null
  logo_dark_url?: string | null
  /** Replaces the whole object: send it merged with the stored one. */
  ui_settings?: Record<string, unknown>
}

/** Shape of the R2 upload result returned by POST /v2/operator-branding/logo/upload */
export interface LogoUploadResult {
  url: string
  ref?: string
  key?: string
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class OperatorBrandingService {
  private readonly http = inject(HttpClient)
  private readonly base = `${environment.URL_API}v2/operator-branding`

  /** Fetch the branding record for the authenticated operator (JWT-resolved). */
  getMyBranding(): Observable<OperatorBranding> {
    return this.http.get<OperatorBranding>(`${this.base}/me`)
  }

  /** Fetch branding by explicit operator UUID (for admin/owner flows). */
  getByOperatorId(operatorId: string): Observable<OperatorBranding> {
    return this.http.get<OperatorBranding>(`${this.base}/operator/${operatorId}`)
  }

  /** Create a new branding record */
  create(input: BrandingCreateInput): Observable<OperatorBranding> {
    return this.http.post<OperatorBranding>(this.base, input)
  }

  /** Update an existing branding record by its ID */
  update(id: string, input: BrandingUpdateInput): Observable<OperatorBranding> {
    return this.http.put<OperatorBranding>(`${this.base}/${id}`, input)
  }

  /** Delete a branding record */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`)
  }

  /**
   * Upload a logo image (light or dark slot).
   * Returns the public R2 URL to persist in logo_light_url / logo_dark_url.
   */
  uploadLogo(
    file: File,
    operatorId: string,
    slot: 'light' | 'dark'
  ): Observable<LogoUploadResult> {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('operator_id', operatorId)
    fd.append('slot', slot)
    return this.http.post<LogoUploadResult>(`${this.base}/logo/upload`, fd)
  }
}
