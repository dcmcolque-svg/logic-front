import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { environment } from '../../../environments/environment'

export interface GatewayIntentData {
  token: string
  expires_at: string
  gateway_url: string
  ion_url: string
  ion_bin_url: string
  gateway_id: string
}

export interface Company {
  id: string
  operator_id: string
  name: string
  tax_id?: string
  created_at?: string
  organization_id?: string
}

interface ApiResponse<T> {
  data: T
}

interface CompanyListResponse {
  data: Company[]
  meta_data: { total_records: number; page: number; rows: number }
}

@Injectable({
  providedIn: 'root',
})
export class GatewayService {
  private readonly http = inject(HttpClient)

  /**
   * Lists all companies for the current operator.
   * Uses the existing POST /v2/company/list endpoint.
   */
  getCompanies(): Observable<CompanyListResponse> {
    return this.http.post<CompanyListResponse>(
      `${environment.URL_API}v2/company/list`,
      { filter: {}, config: { page: 1, rows: 100 } },
      { withCredentials: true }
    )
  }

  /**
   * Fetches a short-lived intent token scoped to the given company.
   * The backend performs the OAuth client_credentials flow server-side
   * and auto-provisions credentials from env vars if needed.
   */
  getIntentToken(companyId: string): Observable<GatewayIntentData> {
    return this.http.get<GatewayIntentData>(
      `${environment.URL_API}v2/gateway/intent?company_id=${companyId}`,
      { withCredentials: true }
    )
  }
}
