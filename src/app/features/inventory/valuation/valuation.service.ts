import { inject, Injectable } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Observable } from 'rxjs'
import { environment } from '@/environments/environment'
import {
  BalanceFilter,
  BalanceListResponse,
  LayerListResponse,
  ValuationConfig,
  VarianceFilter,
  VarianceListResponse,
} from './valuation.types'

/** Inventory valuation — OWNER-only endpoints (backend answers 403 otherwise). */
@Injectable({ providedIn: 'root' })
export class ValuationService {
  private readonly http = inject(HttpClient)
  private readonly url = `${environment.URL_API}v2/inventory/valuation`

  /** POST /v2/inventory/valuation/list — valued stock per facility + SKU */
  listBalances(filter: BalanceFilter, config: ValuationConfig): Observable<BalanceListResponse> {
    return this.http.post<BalanceListResponse>(`${this.url}/list`, { filter, config })
  }

  /** POST /v2/inventory/valuation/variances/list — STANDARD variances */
  listVariances(filter: VarianceFilter, config: ValuationConfig): Observable<VarianceListResponse> {
    return this.http.post<VarianceListResponse>(`${this.url}/variances/list`, { filter, config })
  }

  /** GET /v2/inventory/valuation/layers — open FIFO layers of one SKU, oldest first */
  listLayers(facilityId: string, skuId: string): Observable<LayerListResponse> {
    const params = new HttpParams().set('facility_id', facilityId).set('sku_id', skuId)
    return this.http.get<LayerListResponse>(`${this.url}/layers`, { params })
  }
}
