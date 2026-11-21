import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { map, Observable } from 'rxjs'
import { environment } from '../../../../environments/environment'
import {
  ReceivingCreateInput,
  ReceivingResult,
  ReceivingListRequest,
  ReceivingListResponse,
  Receiving,
  MakeReceivingInput,
  MakeReceivingResult,
  ReceivingLineListRequest,
  ReceivingLineListResponse,
  ArchiveReceivingResult,
  CompanyListResponse,
  ReceivingSkuOption,
  ReceivingLocationOption,
  ReceivingContainerOption,
  ReceivingContainerTreeNode,
} from './receivings.types'
import { CostingSettings } from '@/app/shared/utils/costing.util'

@Injectable({ providedIn: 'root' })
export class ReceivingService {
  private readonly http = inject(HttpClient)
  private readonly baseUrl = `${environment.URL_API}v2/inbound`

  // ── Receiving Header (Inbound) ──────────────────────────────────────────

  /**
   * Create a new receiving with expected lines atomically.
   * POST /v2/inbound/receiving/create
   */
  createReceiving(input: ReceivingCreateInput): Observable<ReceivingResult> {
    return this.http.post<ReceivingResult>(
      `${this.baseUrl}/receiving/create`,
      input
    )
  }

  /**
   * Replace header + expected lines of an IN-TRANSIT receiving (full replacement).
   * PUT /v2/inbound/receiving/:id
   */
  updateReceiving(receivingId: string, input: ReceivingCreateInput): Observable<ReceivingResult> {
    return this.http.put<ReceivingResult>(
      `${this.baseUrl}/receiving/${receivingId}`,
      input
    )
  }

  /**
   * List receivings with filters and pagination.
   * POST /v2/inbound/receiving/list
   */
  listReceivings(
    request: ReceivingListRequest
  ): Observable<ReceivingListResponse> {
    return this.http.post<ReceivingListResponse>(
      `${this.baseUrl}/receiving/list`,
      request
    )
  }

  /**
   * Start a receiving (IN-TRANSIT → IN-WAREHOUSE).
   * PATCH /v2/inbound/receiving/:id/start
   */
  startReceiving(receivingId: string): Observable<Receiving> {
    return this.http.patch<Receiving>(
      `${this.baseUrl}/receiving/${receivingId}/start`,
      {}
    )
  }

  /**
   * Cancel a receiving (IN-TRANSIT → CANCELLED).
   * PATCH /v2/inbound/receiving/:id/cancel
   */
  cancelReceiving(receivingId: string): Observable<Receiving> {
    return this.http.patch<Receiving>(
      `${this.baseUrl}/receiving/${receivingId}/cancel`,
      {}
    )
  }

  /**
   * Make / process a receiving (register physical receipt of goods).
   * POST /v2/inbound/receiving/make
   */
  makeReceiving(input: MakeReceivingInput): Observable<MakeReceivingResult> {
    return this.http.post<MakeReceivingResult>(
      `${this.baseUrl}/receiving/make`,
      input
    )
  }

  /**
   * Archive receivings in bulk (COMPLETE | CANCELLED | IN-TRANSIT → ARCHIVED).
   * PATCH /v2/inbound/receiving/archive
   */
  archiveReceivings(ids: string[]): Observable<ArchiveReceivingResult> {
    return this.http.patch<ArchiveReceivingResult>(
      `${this.baseUrl}/receiving/archive`,
      { ids }
    )
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  /**
   * Lists the operator's companies — used by the CSV import dialog, since a
   * receiving belongs to a company as well as a facility.
   * POST /v2/company/list
   */
  listCompanies(): Observable<CompanyListResponse> {
    return this.http.post<CompanyListResponse>(
      `${environment.URL_API}v2/company/list`,
      { filter: {}, config: { page: 1, rows: 200 } }
    )
  }

  // ── SKU lookup ─────────────────────────────────────────────────────────────

  /**
   * Free-text SKU search (code, name, barcode, description) within a company —
   * feeds the autocomplete of the create dialog.
   * POST /v2/cat/sku/list
   */
  searchSkus(companyId: string, query: string, rows = 15): Observable<ReceivingSkuOption[]> {
    return this.http
      .post<{ data: ReceivingSkuOption[] }>(`${environment.URL_API}v2/cat/sku/list`, {
        filter: {
          company_id: { match_mode: 'equals', value: companyId },
          search: { match_mode: 'contains', value: query },
          is_active: { match_mode: 'equals', value: true },
        },
        config: { page: 1, rows },
      })
      .pipe(map(res => res.data ?? []))
  }

  // ── Costing ────────────────────────────────────────────────────────────────

  /**
   * Costing settings of one facility (settings.costing), NONE when absent.
   * POST /v2/facility/my filtered by id.
   */
  getFacilityCosting(facilityId: string): Observable<CostingSettings> {
    return this.http
      .post<{ data: Array<{ id: string; settings?: { costing?: CostingSettings } }> }>(
        `${environment.URL_API}v2/facility/my`,
        {
          filter: { id: { match_mode: 'equals', value: facilityId } },
          config: { page: 1, rows: 1, populate_data: false },
        }
      )
      .pipe(map(res => res.data?.find(f => f.id === facilityId)?.settings?.costing ?? { method: 'NONE' }))
  }

  // ── Location lookup ────────────────────────────────────────────────────────

  /**
   * Active locations of a facility whose code contains `query` — the
   * destination picker of the processing screen. make resolves the location
   * by code inside the receiving's facility, so the search is scoped the same way.
   * POST /v2/wms/location/list
   */
  searchLocations(facilityId: string, query: string, rows = 20): Observable<ReceivingLocationOption[]> {
    const filter: Record<string, { match_mode: string; value: unknown }> = {
      facility_id: { match_mode: 'equals', value: facilityId },
      is_active: { match_mode: 'equals', value: true },
    }
    if (query) filter['location_code'] = { match_mode: 'contains', value: query }
    return this.http
      .post<{ data: ReceivingLocationOption[] }>(`${environment.URL_API}v2/wms/location/list`, {
        filter,
        config: { page: 1, rows, sort_field: [{ field: 'location_code', order: 1 }] },
      })
      .pipe(map(res => res.data ?? []))
  }

  /**
   * Containers (bins/LPNs) stored in a location, flattened depth-first so
   * nested containers follow their parent.
   * POST /v2/wms/container/tree
   */
  listLocationContainers(locationId: string): Observable<ReceivingContainerOption[]> {
    const flatten = (nodes: ReceivingContainerTreeNode[], depth: number): ReceivingContainerOption[] =>
      nodes.flatMap(n => [
        {
          id: n.id,
          lpn_code: n.lpn_code,
          type: n.type,
          container_profile_code: n.container_profile_code ?? null,
          content_skus: n.content_skus ?? 0,
          content_units: n.content_units ?? 0,
          depth,
        },
        ...flatten(n.children ?? [], depth + 1),
      ])
    return this.http
      .post<ReceivingContainerTreeNode[] | null>(`${environment.URL_API}v2/wms/container/tree`, {
        location_id: locationId,
        type: 'BIN',
      })
      .pipe(map(res => flatten(res ?? [], 0)))
  }

  // ── Receiving Lines ────────────────────────────────────────────────────────

  /**
   * List receiving lines with filters and pagination.
   * POST /v2/inbound/receiving-line/list
   */
  listReceivingLines(
    request: ReceivingLineListRequest
  ): Observable<ReceivingLineListResponse> {
    return this.http.post<ReceivingLineListResponse>(
      `${this.baseUrl}/receiving-line/list`,
      request
    )
  }

  // ── CSV Import ────────────────────────────────────────────────────────────────
  // TODO: Uncomment when backend endpoints are available

  // /**
  //  * Upload a CSV file to bulk-create receivings for a given operator/account.
  //  * POST /v2/inbound/receiving/upload?operator_id=:id
  //  */
  // uploadCsv(formData: FormData, operatorId: string): Observable<void> {
  //   return this.http.post<void>(
  //     `${this.baseUrl}/receiving/upload?operator_id=${operatorId}`,
  //     formData
  //   )
  // }

  // /**
  //  * Download the CSV template for receivings.
  //  * GET /v2/inbound/receiving/template
  //  */
  // downloadCsvTemplate(): Observable<Blob> {
  //   return this.http.get(
  //     `${this.baseUrl}/receiving/template`,
  //     { responseType: 'blob' }
  //   )
  // }
}
