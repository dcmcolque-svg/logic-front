import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { environment } from '@/environments/environment'
import {
  Location,
  LocationCreateInput,
  LocationUpdateInput,
  LocationListRequest,
  LocationListResponse,
  LocationGenerateInput,
  LocationGenerateResponse,
  LocationProfileListRequest,
  LocationProfileListResponse,
  Zone,
  ZoneCreateInput,
  ZoneListRequest,
  ZoneListResponse,
  OperationalCategoryListRequest,
  OperationalCategoryListResponse,
  FacilityListRequest,
  FacilityListResponse,
  ContainerTreeNode,
  ContainerCreateInput,
  ContainerUpdateInput,
  Container,
  ContainerProfileListResponse,
  LayoutResponse,
  LayoutSyncInput,
  LocationBatchPositionItem,
  LocationBatchPositionResponse,
  BatchCreateContainerInput,
  BatchCreateContainerResponse,
  BinLayout,
  BinLayoutSaveInput,
} from './types/location.types'

/**
 * LocationService — Angular HttpClient service for v2 WMS location endpoints.
 *
 * Base path: `{URL_API}v2/wms/...`
 *
 * Provides methods for:
 * - Location CRUD + bulk generation
 * - Location Profile listing
 * - Zone listing + creation (auxiliary dropdown data)
 * - Operational Category listing (auxiliary dropdown data)
 */
@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly http = inject(HttpClient)

  private readonly baseUrl = environment.URL_API + 'v2/wms/location'
  private readonly zoneUrl = environment.URL_API + 'v2/wms/zone'
  private readonly containerUrl = environment.URL_API + 'v2/wms/container'
  private readonly opCategoryUrl =
    environment.URL_API + 'v2/wms/operational-category'
  private readonly facilityUrl = environment.URL_API + 'v2/facility'

  // ── Location ─────────────────────────────────────────────────────────

  listLocations(req: LocationListRequest): Observable<LocationListResponse> {
    return this.http.post<LocationListResponse>(`${this.baseUrl}/list`, req)
  }

  getLocation(id: string): Observable<Location> {
    return this.http.get<Location>(`${this.baseUrl}/${id}`)
  }

  createLocation(input: LocationCreateInput): Observable<Location> {
    return this.http.post<Location>(`${this.baseUrl}/create`, input)
  }

  updateLocation(id: string, input: LocationUpdateInput): Observable<Location> {
    return this.http.put<Location>(`${this.baseUrl}/${id}`, input)
  }

  deleteLocation(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`)
  }

  generateLocations(
    input: LocationGenerateInput
  ): Observable<LocationGenerateResponse> {
    return this.http.post<LocationGenerateResponse>(
      `${this.baseUrl}/generate`,
      input
    )
  }

  batchCreateLocations(inputs: LocationCreateInput[]): Observable<Location[]> {
    return this.http.post<Location[]>(`${this.baseUrl}/batch`, inputs)
  }

  batchDeleteLocations(ids: string[]): Observable<{ deleted: number }> {
    return this.http.post<{ deleted: number }>(`${this.baseUrl}/batch-delete`, { ids })
  }

  // ── Layout ────────────────────────────────────────────────────────────

  getWarehouseLayout(facilityId: string): Observable<LayoutResponse> {
    return this.http.get<LayoutResponse>(
      `${environment.URL_API}v2/wms/warehouse/layout/${facilityId}`
    )
  }

  syncWarehouseLayout(input: LayoutSyncInput): Observable<void> {
    return this.http.put<void>(
      `${environment.URL_API}v2/wms/warehouse/layout/sync`,
      input
    )
  }

  batchUpdatePositions(items: LocationBatchPositionItem[]): Observable<LocationBatchPositionResponse> {
    return this.http.put<LocationBatchPositionResponse>(
      `${environment.URL_API}v2/wms/location/batch-positions`,
      { items }
    )
  }

  // ── Location Profile ─────────────────────────────────────────────────

  listLocationProfiles(
    req: LocationProfileListRequest
  ): Observable<LocationProfileListResponse> {
    return this.http.post<LocationProfileListResponse>(
      `${this.baseUrl}/profile/list`,
      req
    )
  }

  // ── Zone ──────────────────────────────────────────────────────────────

  listZones(req: ZoneListRequest): Observable<ZoneListResponse> {
    return this.http.post<ZoneListResponse>(`${this.zoneUrl}/list`, req)
  }

  createZone(input: ZoneCreateInput): Observable<Zone> {
    return this.http.post<Zone>(`${this.zoneUrl}/create`, input)
  }

  // ── Operational Category ──────────────────────────────────────────────

  listOperationalCategories(
    req: OperationalCategoryListRequest
  ): Observable<OperationalCategoryListResponse> {
    return this.http.post<OperationalCategoryListResponse>(
      `${this.opCategoryUrl}/list`,
      req
    )
  }

  // ── Facility ──────────────────────────────────────────────────────────

  listFacilities(req: FacilityListRequest): Observable<FacilityListResponse> {
    return this.http.post<FacilityListResponse>(`${this.facilityUrl}/list`, req)
  }

  /**
   * List facilities assigned to the authenticated user.
   * Scoped server-side by operator_id + user_id from the JWT.
   */
  listMyFacilities(req: FacilityListRequest): Observable<FacilityListResponse> {
    return this.http.post<FacilityListResponse>(`${this.facilityUrl}/my`, req)
  }

  // === Container (bin) ===

  getContainerTree(locationId: string): Observable<ContainerTreeNode[]> {
    return this.http.post<ContainerTreeNode[]>(`${this.containerUrl}/tree`, {
      location_id: locationId,
    })
  }

  createContainer(input: ContainerCreateInput): Observable<Container> {
    return this.http.post<Container>(`${this.containerUrl}/create`, input)
  }

  updateContainer(
    id: string,
    input: ContainerUpdateInput
  ): Observable<Container> {
    return this.http.put<Container>(`${this.containerUrl}/${id}`, input)
  }

  deleteContainer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.containerUrl}/${id}`)
  }

  listContainerProfiles(): Observable<ContainerProfileListResponse> {
    return this.http.post<ContainerProfileListResponse>(
      `${this.containerUrl}/profile/list`,
      { filter: {}, config: { page: 1, rows: 200 } }
    )
  }

  batchCreateContainers(
    input: BatchCreateContainerInput
  ): Observable<BatchCreateContainerResponse> {
    return this.http.post<BatchCreateContainerResponse>(
      `${this.containerUrl}/batch-create`,
      input
    )
  }

  // ── Bin Layout ─────────────────────────────────────────────────────────

  private readonly binLayoutUrl = environment.URL_API + 'v2/wms/bin-layout'

  saveBinLayout(input: BinLayoutSaveInput): Observable<BinLayout> {
    return this.http.post<BinLayout>(`${this.binLayoutUrl}/save`, input)
  }

  getBinLayout(locationId: string): Observable<BinLayout> {
    return this.http.get<BinLayout>(`${this.binLayoutUrl}/${locationId}`)
  }
}
