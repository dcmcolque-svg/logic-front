import { inject, Injectable } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Observable } from 'rxjs'
import { environment } from '@/environments/environment'
import {
  ParcelListRequest,
  ParcelListResponse,
  Parcel,
  ParcelDashboardSummary,
  ParcelItemsResponse,
  UpdateCustomerInfoDTO,
  OrderDashboardSummary,
  InventoryDashboardSummary,
  LocationDashboardSummary,
  BestSellingItem,
} from './types/parcel.types'

/**
 * ParcelService — Angular HttpClient service for v2 outbound box endpoints.
 *
 * Base path: `{URL_API}manifest/v2/parcel/...`
 */
@Injectable({ providedIn: 'root' })
export class ParcelService {
  private readonly http = inject(HttpClient)

  // private readonly baseUrl = environment.URL_API + 'manifest/v2/parcel'
  private readonly baseUrl = environment.URL_API + 'v2/tracking/parcel'
  private readonly orderBaseUrl = environment.URL_API + 'v2/outbound/order'
  private readonly tracecardsBaseUrl = environment.URL_API + 'v2/tracecards'
  private readonly locationBaseUrl = environment.URL_API + 'v2/wms/location'

  /**
   * List parcels (outbound boxes) with server-side filtering, sorting, and pagination.
   * Uses the v2 shipments/list endpoint.
   */
  listParcels(req: ParcelListRequest): Observable<ParcelListResponse> {
    return this.http.post<ParcelListResponse>(
      `${this.baseUrl}/shipments/list`,
      req
    )
  }

  /**
   * Get a single parcel (outbound box) by ID.
   */
  getParcelById(id: string): Observable<Parcel> {
    return this.http.get<Parcel>(
      `${this.baseUrl}/shipments/${id}`
    )
  }

  /**
   * Fetch enriched packages + SKU items for a single parcel.
   * Maps to GET /v2/parcel/shipments/:id/items.
   * Mirrors the legacy /eng/v1/orderitemsproduct/ endpoint.
   */
  getParcelItems(id: string): Observable<ParcelItemsResponse> {
    return this.http.get<ParcelItemsResponse>(
      `${this.baseUrl}/shipments/${id}/items`
    )
  }

  /**
   * Update customer info for a single parcel.
   * Maps to PUT /v2/parcel/shipments/customer
   * The parcel id is sent in the request body.
   */
  updateCustomerInfo(dto: UpdateCustomerInfoDTO): Observable<Parcel> {
    return this.http.put<Parcel>(
      `${this.baseUrl}/shipments/customer`,
      dto
    )
  }

  /**
   * Fetch parcel dashboard summary (shipped + ship_prepared counters).
   * Maps to GET /v2/parcel/dashboard/summary.
   * operator_id is injected server-side from auth; no need to pass it here.
   */
  getDashboardSummary(params?: {
    facilityIds?: string[]
    operatorId?: string
    dateFrom?: string
    dateTo?: string
  }): Observable<ParcelDashboardSummary> {
    let httpParams = new HttpParams()
    if (params?.operatorId) {
      httpParams = httpParams.set('operator_id', params.operatorId)
    }
    httpParams = this.withFacilities(httpParams, params?.facilityIds)
    if (params?.dateFrom) {
      httpParams = httpParams.set('date_from', params.dateFrom)
    }
    if (params?.dateTo) {
      httpParams = httpParams.set('date_to', params.dateTo)
    }
    return this.http.get<ParcelDashboardSummary>(
      `${this.baseUrl}/dashboard/summary`,
      { params: httpParams }
    )
  }

  /**
   * Fetch order dashboard summary (orders shipped + alerts counters).
   * Maps to GET /outbound/order/dashboard/summary.
   * operator_id is injected server-side from auth; no need to pass it here.
   */
  getOrderDashboardSummary(params?: {
    facilityIds?: string[]
    operatorId?: string
    dateFrom?: string
    dateTo?: string
  }): Observable<OrderDashboardSummary> {
    let httpParams = new HttpParams()
    if (params?.operatorId) {
      httpParams = httpParams.set('operator_id', params.operatorId)
    }
    httpParams = this.withFacilities(httpParams, params?.facilityIds)
    if (params?.dateFrom) {
      httpParams = httpParams.set('date_from', params.dateFrom)
    }
    if (params?.dateTo) {
      httpParams = httpParams.set('date_to', params.dateTo)
    }
    return this.http.get<OrderDashboardSummary>(
      `${this.orderBaseUrl}/dashboard/summary`,
      { params: httpParams }
    )
  }

  /**
   * Fetch inventory dashboard summary (total value, SKUs, units, trace cards).
   * Maps to GET /tracecards/dashboard/summary.
   * operator_id is injected server-side from auth; no need to pass it here.
   */
  getInventoryDashboardSummary(params?: {
    facilityIds?: string[]
    operatorId?: string
  }): Observable<InventoryDashboardSummary> {
    let httpParams = new HttpParams()
    if (params?.operatorId) {
      httpParams = httpParams.set('operator_id', params.operatorId)
    }
    httpParams = this.withFacilities(httpParams, params?.facilityIds)
    return this.http.get<InventoryDashboardSummary>(
      `${this.tracecardsBaseUrl}/dashboard/summary`,
      { params: httpParams }
    )
  }

  /**
   * Fetch location dashboard summary (zones, locations, bins).
   * Maps to GET /wms/location/dashboard/summary.
   * operator_id is injected server-side from auth; no need to pass it here.
   */
  getLocationDashboardSummary(params?: {
    facilityIds?: string[]
  }): Observable<LocationDashboardSummary> {
    let httpParams = new HttpParams()
    httpParams = this.withFacilities(httpParams, params?.facilityIds)
    return this.http.get<LocationDashboardSummary>(
      `${this.locationBaseUrl}/dashboard/summary`,
      { params: httpParams }
    )
  }

  /**
   * Fetch best selling items (top 10 SKUs by qty_shipped).
   * Maps to GET /outbound/order/dashboard/best-selling.
   * operator_id is injected server-side from auth; no need to pass it here.
   */
  getBestSellingItems(params?: {
    facilityIds?: string[]
    dateFrom?: string
    dateTo?: string
  }): Observable<BestSellingItem[]> {
    let httpParams = new HttpParams()
    httpParams = this.withFacilities(httpParams, params?.facilityIds)
    if (params?.dateFrom) {
      httpParams = httpParams.set('date_from', params.dateFrom)
    }
    if (params?.dateTo) {
      httpParams = httpParams.set('date_to', params.dateTo)
    }
    return this.http.get<BestSellingItem[]>(
      `${this.orderBaseUrl}/dashboard/best-selling`,
      { params: httpParams }
    )
  }

  /**
   * One facility_id per id. The dashboard endpoints read several as "these
   * facilities"; none means every facility the user can reach.
   */
  private withFacilities(httpParams: HttpParams, ids?: string[]): HttpParams {
    return (ids ?? []).reduce((p, id) => p.append('facility_id', id), httpParams)
  }
}
