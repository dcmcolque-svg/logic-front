import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { environment } from '@/environments/environment'
import {
  TracecardListRequest,
  TracecardListResponse,
  CompanyListRequest,
  CompanyListResponse,
  KardexFlowListRequest,
  KardexFlowListResponse,
} from './types/warehouse.types'
import {
  FacilityListRequest,
  FacilityListResponse,
  OperationalCategoryListRequest,
  OperationalCategoryListResponse,
} from '@/app/features/preferences/locations/types/location.types'

/**
 * TracecardsService — Angular HttpClient service for v2 tracecards endpoints.
 *
 * Base paths:
 *   {URL_API}v2/tracecards            — tracecards inventory view
 *   {URL_API}v2/company               — company filter dropdown (shared)
 *   {URL_API}v2/facility              — facility filter dropdown (shared)
 *   {URL_API}v2/wms/operational-category — category filter dropdown (shared)
 */
@Injectable({ providedIn: 'root' })
export class TracecardsService {
  private readonly http = inject(HttpClient)

  private readonly tracecardsUrl = environment.URL_API + 'v2/tracecards'
  private readonly companyUrl = environment.URL_API + 'v2/company'
  private readonly facilityUrl = environment.URL_API + 'v2/facility'
  private readonly opCategoryUrl =
    environment.URL_API + 'v2/wms/operational-category'

  // ── Tracecards (aggregated inventory view) ─────────────────

  listTracecards(req: TracecardListRequest): Observable<TracecardListResponse> {
    return this.http.post<TracecardListResponse>(`${this.tracecardsUrl}/list`, req)
  }

  // ── Companies (filter dropdown) ────────────────────────────

  listCompanies(req: CompanyListRequest): Observable<CompanyListResponse> {
    return this.http.post<CompanyListResponse>(`${this.companyUrl}/list`, req)
  }

  // ── Facilities (filter dropdown — scoped to authenticated user) ──

  listMyFacilities(req: FacilityListRequest): Observable<FacilityListResponse> {
    return this.http.post<FacilityListResponse>(`${this.facilityUrl}/my`, req)
  }

  // ── Operational Categories (filter dropdown) ───────────────

  listOperationalCategories(
    req: OperationalCategoryListRequest
  ): Observable<OperationalCategoryListResponse> {
    return this.http.post<OperationalCategoryListResponse>(
      `${this.opCategoryUrl}/list`,
      req
    )
  }

  // ── Kardex Flow (history) ──────────────────────────────────

  listKardexFlow(req: KardexFlowListRequest): Observable<KardexFlowListResponse> {
    return this.http.post<KardexFlowListResponse>(`${this.tracecardsUrl}/flow/list`, req)
  }
}
