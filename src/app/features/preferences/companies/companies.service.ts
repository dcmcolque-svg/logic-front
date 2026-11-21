import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { environment } from '../../../../environments/environment'
import { Company, CompanyInput, CompanyListRequest, CompanyListResponse } from './companies.types'

/** CRUD of the operator's client companies (/v2/company — OWNER only). */
@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly http = inject(HttpClient)
  private readonly baseUrl = `${environment.URL_API}v2/company`

  /** POST /v2/company/list */
  list(request: CompanyListRequest): Observable<CompanyListResponse> {
    return this.http.post<CompanyListResponse>(`${this.baseUrl}/list`, request)
  }

  /** POST /v2/company */
  create(input: CompanyInput): Observable<Company> {
    return this.http.post<Company>(this.baseUrl, input)
  }

  /** PUT /v2/company/:id */
  update(id: string, input: CompanyInput): Observable<Company> {
    return this.http.put<Company>(`${this.baseUrl}/${id}`, input)
  }

  /** DELETE /v2/company/:id — refused (409) while the company has data or is the last one. */
  delete(id: string): Observable<{ status: string }> {
    return this.http.delete<{ status: string }>(`${this.baseUrl}/${id}`)
  }
}
