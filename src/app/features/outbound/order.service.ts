import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { environment } from '@/environments/environment'
import {
  OrderListRequest,
  OrderListResponse,
  OrderLineDetail,
  EvalResult,
  EvaluateBatchResult,
  ProcessBatchResult,
  PackDetailResult,
  RevertProcessResult,
  RevertProcessBatchResult,
  ArchiveBatchResult,
  CancelBatchResult,
  OrderLabelsResponse,
} from './types/order.types'

/**
 * OrderService — v2 outbound order API.
 *
 * Base path: `{URL_API}v2/outbound/order`
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient)

  private readonly baseUrl = environment.URL_API + 'v2/outbound/order'

  /**
   * List orders with server-side filtering, sorting and pagination.
   * POST /v2/outbound/order/list
   */
  listOrders(req: OrderListRequest): Observable<OrderListResponse> {
    return this.http.post<OrderListResponse>(`${this.baseUrl}/list`, req)
  }

  /**
   * Evaluate a single order (re-check stock, move from BACKORDER to PENDING if possible,
   * or to PROCESSING when the facility has auto-processing).
   * POST /v2/outbound/order/:id/evaluate
   */
  evaluateOrder(id: string): Observable<EvalResult> {
    return this.http.post<EvalResult>(`${this.baseUrl}/${id}/evaluate`, {})
  }

  /**
   * Evaluate multiple orders in a single batch request.
   * POST /v2/outbound/order/evaluate/batch
   */
  evaluateOrdersBatch(orderIds: string[]): Observable<EvaluateBatchResult> {
    return this.http.post<EvaluateBatchResult>(`${this.baseUrl}/evaluate/batch`, { order_ids: orderIds })
  }

  /**
   * Process multiple orders in a single batch request.
   * POST /v2/outbound/order/process/batch
   */
  processOrdersBatch(orderIds: string[]): Observable<ProcessBatchResult> {
    return this.http.post<ProcessBatchResult>(`${this.baseUrl}/process/batch`, { order_ids: orderIds })
  }

  /**
   * Cancel a single order.
   * POST /v2/outbound/order/:id/cancel
   */
  cancelOrder(id: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${id}/cancel`, {})
  }

  /**
   * Cancel multiple orders in a single batch request.
   * POST /v2/outbound/order/_batch/cancel
   */
  cancelOrdersBatch(orderIds: string[]): Observable<CancelBatchResult> {
    return this.http.post<CancelBatchResult>(`${this.baseUrl}/_batch/cancel`, { order_ids: orderIds })
  }

  /**
   * Cancel multiple orders in batch.
   * POST /v2/outbound/order/:id/cancel with { order_ids: [...] }
   */
  cancelOrders(orderIds: string[]): Observable<CancelBatchResult> {
    return this.http.post<CancelBatchResult>(`${this.baseUrl}/${orderIds[0]}/cancel`, { order_ids: orderIds })
  }

  /**
   * Archive a single order.
   * POST /v2/outbound/order/:id/archive
   */
  archiveOrder(id: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${id}/archive`, {})
  }

  /**
   * Archive multiple orders in batch.
   * POST /v2/outbound/order/:id/archive with { order_ids: [...] }
   */
  archiveOrders(orderIds: string[]): Observable<ArchiveBatchResult> {
    return this.http.post<ArchiveBatchResult>(`${this.baseUrl}/${orderIds[0]}/archive`, { order_ids: orderIds })
  }

  /**
   * Revert a single order from ORDER-PROCESSING back to PENDING.
   * Cancels all QUEUED pick tasks. Blocked if any task is IN-PROGRESS or COMPLETED.
   * POST /v2/outbound/order/:id/unrelease
   */
  revertProcess(id: string): Observable<RevertProcessResult> {
    return this.http.post<RevertProcessResult>(
      `${this.baseUrl}/${id}/unrelease`, {}
    )
  }

  /**
   * Revert a single order from PROCESSING → PENDING.
   * POST /v2/outbound/order/:id/unrelease
   */
  unreleaseOrder(id: string): Observable<RevertProcessResult> {
    return this.http.post<RevertProcessResult>(`${this.baseUrl}/${id}/unrelease`, {})
  }

  /**
   * Revert multiple orders in batch.
   * POST /v2/outbound/order/unrelease/batch
   */
  revertProcessBatch(orderIds: string[]): Observable<RevertProcessBatchResult> {
    return this.http.post<RevertProcessBatchResult>(`${this.baseUrl}/unrelease/batch`, { order_ids: orderIds })
  }

  /**
   * Fetch enriched line items for a single order.
   * GET /v2/outbound/order/:id/lines
   */
  getOrderLines(id: string): Observable<OrderLineDetail[]> {
    return this.http.get<OrderLineDetail[]>(`${this.baseUrl}/${id}/lines`)
  }

  /**
   * Fetch pack detail (shipments → packages → items) for a single order.
   * POST /v2/outbound/order/pack/detail
   */
  getPackDetail(orderId: string): Observable<PackDetailResult> {
    return this.http.post<PackDetailResult>(`${this.baseUrl}/pack/detail`, {
      filter: { order_id: { value: orderId, match_mode: 'equals' } },
      config: { page: 1, rows: 100 },
    })
  }

  /**
   * Stored shipping labels (presigned URLs) and tracking numbers of an order.
   * GET /v2/outbound/order/:id/label
   */
  getLabels(orderId: string): Observable<OrderLabelsResponse> {
    return this.http.get<OrderLabelsResponse>(`${this.baseUrl}/${orderId}/label`)
  }

  /**
   * Generate shipping labels with Xenvio. Without shipmentId, every packed
   * shipment that has no label yet is generated.
   * POST /v2/outbound/order/:id/label
   */
  generateLabels(orderId: string, shipmentId?: string, regenerate = false): Observable<OrderLabelsResponse> {
    return this.http.post<OrderLabelsResponse>(`${this.baseUrl}/${orderId}/label`, {
      ...(shipmentId ? { shipment_id: shipmentId } : {}),
      regenerate,
    })
  }
}
