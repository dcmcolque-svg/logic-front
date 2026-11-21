import { inject, Injectable } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Observable } from 'rxjs'
import { environment } from '@/environments/environment'
import {
  CatalogItem,
  CheckoutInput,
  CompanyOption,
  Customer,
  CustomerInput,
  CustomerListRequest,
  CustomerListResponse,
  CustomerPaymentInput,
  CustomerPaymentResult,
  CustomerStatement,
  CurrentSessionResponse,
  ListConfig,
  MovementKind,
  PaymentMethod,
  PaymentMethodInput,
  SaleDetail,
  SaleFilter,
  SaleListResponse,
  SessionFilter,
  SessionScope,
  SessionListResponse,
  SessionSummary,
  SalesDashboardSummary,
} from './sales.types'

/** Sales module (POS) — `{URL_API}v2/sales`. */
@Injectable({ providedIn: 'root' })
export class SalesService {
  private readonly http = inject(HttpClient)
  private readonly url = `${environment.URL_API}v2/sales`

  // ── Point of sale ─────────────────────────────────────────────────────────

  /** GET /v2/sales/catalog/search — sellable SKUs by barcode, code or name. */
  searchCatalog(facilityId: string, q: string): Observable<{ data: CatalogItem[] }> {
    const params = new HttpParams().set('facility_id', facilityId).set('q', q)
    return this.http.get<{ data: CatalogItem[] }>(`${this.url}/catalog/search`, { params })
  }

  /** GET /v2/sales/dashboard/summary — POS sales per currency, previous period, open registers, per day. */
  getDashboardSummary(params: { facilityIds?: string[]; dateFrom?: string; dateTo?: string }): Observable<SalesDashboardSummary> {
    let p = (params.facilityIds ?? []).reduce((acc, id) => acc.append('facility_id', id), new HttpParams())
    if (params.dateFrom) p = p.set('date_from', params.dateFrom)
    if (params.dateTo) p = p.set('date_to', params.dateTo)
    return this.http.get<SalesDashboardSummary>(`${this.url}/dashboard/summary`, { params: p })
  }

  /** POST /v2/sales/checkout — charge: order + stock + payments in one transaction. */
  checkout(input: CheckoutInput): Observable<SaleDetail> {
    return this.http.post<SaleDetail>(`${this.url}/checkout`, input)
  }

  // ── Cash register ─────────────────────────────────────────────────────────

  /** GET /v2/sales/register/current — the open drawer the caller sells on in a facility (or null).
   *  Facility-shared drawer wins; otherwise the caller's personal one. */
  currentSession(facilityId: string): Observable<CurrentSessionResponse> {
    const params = new HttpParams().set('facility_id', facilityId)
    return this.http.get<CurrentSessionResponse>(`${this.url}/register/current`, { params })
  }

  openSession(facilityId: string, scope: SessionScope, openingAmount: number, note: string): Observable<SessionSummary> {
    return this.http.post<SessionSummary>(`${this.url}/register/open`, {
      facility_id: facilityId,
      scope,
      opening_amount: openingAmount,
      note,
    })
  }

  sessionSummary(id: string): Observable<SessionSummary> {
    return this.http.get<SessionSummary>(`${this.url}/register/${id}/summary`)
  }

  addMovement(id: string, kind: MovementKind, amount: number, reason: string): Observable<SessionSummary> {
    return this.http.post<SessionSummary>(`${this.url}/register/${id}/movement`, { kind, amount, reason })
  }

  closeSession(id: string, countedAmount: number, note: string): Observable<SessionSummary> {
    return this.http.post<SessionSummary>(`${this.url}/register/${id}/close`, { counted_amount: countedAmount, note })
  }

  listSessions(filter: SessionFilter, config: ListConfig): Observable<SessionListResponse> {
    return this.http.post<SessionListResponse>(`${this.url}/register/list`, { filter, config })
  }

  // ── Payment methods ───────────────────────────────────────────────────────

  listPaymentMethods(onlyActive: boolean): Observable<{ data: PaymentMethod[] }> {
    return this.http.post<{ data: PaymentMethod[] }>(`${this.url}/payment-method/list`, { only_active: onlyActive })
  }

  createPaymentMethod(input: PaymentMethodInput): Observable<PaymentMethod> {
    return this.http.post<PaymentMethod>(`${this.url}/payment-method/create`, input)
  }

  updatePaymentMethod(id: string, input: PaymentMethodInput): Observable<PaymentMethod> {
    return this.http.put<PaymentMethod>(`${this.url}/payment-method/${id}`, input)
  }

  // ── Customers & accounts receivable ───────────────────────────────────────

  /** GET /v2/sales/companies — companies that sell (non-host). */
  listCompanies(): Observable<{ data: CompanyOption[] }> {
    return this.http.get<{ data: CompanyOption[] }>(`${this.url}/companies`)
  }

  /** GET /v2/sales/customer/search — POS lookup by NIT/CI, name or phone (exact doc first). */
  searchCustomers(q: string, companyId?: string | null): Observable<{ data: Customer[] }> {
    let params = new HttpParams().set('q', q)
    if (companyId) params = params.set('company_id', companyId)
    return this.http.get<{ data: Customer[] }>(`${this.url}/customer/search`, { params })
  }

  listCustomers(req: CustomerListRequest): Observable<CustomerListResponse> {
    return this.http.post<CustomerListResponse>(`${this.url}/customer/list`, req)
  }

  createCustomer(input: CustomerInput): Observable<Customer> {
    return this.http.post<Customer>(`${this.url}/customer/create`, input)
  }

  updateCustomer(id: string, input: CustomerInput): Observable<Customer> {
    return this.http.put<Customer>(`${this.url}/customer/${id}`, input)
  }

  customerStatement(id: string): Observable<CustomerStatement> {
    return this.http.get<CustomerStatement>(`${this.url}/customer/${id}/statement`)
  }

  /** POST /v2/sales/customer/:id/payment — payment towards the debt (cash goes into the open drawer). */
  registerCustomerPayment(id: string, input: CustomerPaymentInput): Observable<CustomerPaymentResult> {
    return this.http.post<CustomerPaymentResult>(`${this.url}/customer/${id}/payment`, input)
  }

  // ── Sales history ─────────────────────────────────────────────────────────

  listSales(filter: SaleFilter, config: ListConfig): Observable<SaleListResponse> {
    return this.http.post<SaleListResponse>(`${this.url}/list`, { filter, config })
  }

  getSale(id: string): Observable<SaleDetail> {
    return this.http.get<SaleDetail>(`${this.url}/${id}`)
  }
}
