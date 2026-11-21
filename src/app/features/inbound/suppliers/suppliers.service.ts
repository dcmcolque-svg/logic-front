import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { map, Observable } from 'rxjs'
import { environment } from '../../../../environments/environment'
import { Supplier, SupplierInput, SupplierListRequest, SupplierListResponse } from './suppliers.types'

@Injectable({ providedIn: 'root' })
export class SupplierService {
  private readonly http = inject(HttpClient)
  private readonly baseUrl = `${environment.URL_API}v2/inbound/supplier`

  /** POST /v2/inbound/supplier/list */
  list(request: SupplierListRequest): Observable<SupplierListResponse> {
    return this.http.post<SupplierListResponse>(`${this.baseUrl}/list`, request)
  }

  /** Active suppliers of one company — the options of the receiving form. */
  listActiveByCompany(companyId: string): Observable<Supplier[]> {
    return this.list({
      filter: {
        company_id: { match_mode: 'equals', value: companyId },
        is_active: { match_mode: 'equals', value: true },
      },
      config: { page: 1, rows: 200, sort_field: [{ field: 'name', order: 1 }] },
    }).pipe(map(res => res.data ?? []))
  }

  /** POST /v2/inbound/supplier/create */
  create(input: SupplierInput): Observable<Supplier> {
    return this.http.post<Supplier>(`${this.baseUrl}/create`, input)
  }

  /** PUT /v2/inbound/supplier/:id */
  update(id: string, input: SupplierInput): Observable<Supplier> {
    return this.http.put<Supplier>(`${this.baseUrl}/${id}`, input)
  }
}
