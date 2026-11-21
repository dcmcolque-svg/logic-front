import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { map, Observable } from 'rxjs'
import { environment } from '@/environments/environment'
import {
  TracecardListRequest,
  TracecardListResponse,
  CompanyListRequest,
  CompanyListResponse,
  KardexFlowListRequest,
  KardexFlowListResponse,
  MoveInput,
  MoveResult,
  RecountInput,
  RecountResult,
  BlockInput,
  BlockResult,
  UnblockInput,
  UnblockResult,
  LocationOption,
  ContainerOption,
  ContainerTreeNode,
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
  private readonly inventoryUrl = environment.URL_API + 'v2/inventory'
  private readonly locationUrl = environment.URL_API + 'v2/wms/location'
  private readonly containerUrl = environment.URL_API + 'v2/wms/container'

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

  // ── Stock operations ───────────────────────────────────────

  /** POST /v2/inventory/move — moves stock of one tracecard to another location/container. */
  move(input: MoveInput): Observable<MoveResult> {
    return this.http.post<MoveResult>(`${this.inventoryUrl}/move`, input)
  }

  /** POST /v2/inventory/recount — adds `qty` (positive or negative) to qty_on_hand. */
  recount(input: RecountInput): Observable<RecountResult> {
    return this.http.post<RecountResult>(`${this.inventoryUrl}/recount`, input)
  }

  /** POST /v2/inventory/block — blocks the whole tracecard (not sellable, not movable). */
  block(input: BlockInput): Observable<BlockResult> {
    return this.http.post<BlockResult>(`${this.inventoryUrl}/block`, input)
  }

  /** POST /v2/inventory/unblock — releases the active hold; backorders are re-evaluated. */
  unblock(input: UnblockInput): Observable<UnblockResult> {
    return this.http.post<UnblockResult>(`${this.inventoryUrl}/unblock`, input)
  }

  // ── Destination lookup (move dialog) ───────────────────────

  /**
   * Active locations of a facility whose code contains `query`. The move
   * resolves the target code inside the source's facility, so the search is
   * scoped the same way. POST /v2/wms/location/list
   */
  searchLocations(facilityId: string, query: string, rows = 20): Observable<LocationOption[]> {
    const filter: Record<string, { match_mode: string; value: unknown }> = {
      facility_id: { match_mode: 'equals', value: facilityId },
      is_active: { match_mode: 'equals', value: true },
    }
    if (query) filter['location_code'] = { match_mode: 'contains', value: query }
    return this.http
      .post<{ data: LocationOption[] }>(`${this.locationUrl}/list`, {
        filter,
        config: { page: 1, rows, sort_field: [{ field: 'location_code', order: 1 }] },
      })
      .pipe(map((res) => res.data ?? []))
  }

  /** Containers stored in a location, flattened depth-first. POST /v2/wms/container/tree */
  listLocationContainers(locationId: string): Observable<ContainerOption[]> {
    const flatten = (nodes: ContainerTreeNode[], depth: number): ContainerOption[] =>
      nodes.flatMap((n) => [
        { id: n.id, lpn_code: n.lpn_code, type: n.type, content_units: n.content_units ?? 0, depth },
        ...flatten(n.children ?? [], depth + 1),
      ])
    return this.http
      .post<ContainerTreeNode[] | null>(`${this.containerUrl}/tree`, { location_id: locationId })
      .pipe(map((res) => flatten(res ?? [], 0)))
  }
}
