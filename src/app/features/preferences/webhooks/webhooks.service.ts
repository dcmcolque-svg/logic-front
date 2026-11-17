import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { environment } from '../../../../environments/environment'
import {
  Webhook,
  WebhookCreateUpdateDto,
  WebhookFilterDto,
  WebhookLogFilterDto,
  WebhookLogResp,
  WebhookResp,
} from './webhooks.types'

@Injectable({
  providedIn: 'root',
})
export class WebhookService {
  private readonly http = inject(HttpClient)

  private readonly baseUrl = environment.URL_API + 'v2/integration/webhook'
  private readonly logsUrl = environment.URL_API + 'v2/integration/webhook/log'

  postListFilterWebhooks(filterDto: WebhookFilterDto): Observable<WebhookResp> {
    return this.http.post<WebhookResp>(`${this.baseUrl}/list`, filterDto)
  }

  postCreateWebhook(webhook: WebhookCreateUpdateDto): Observable<Webhook> {
    return this.http.post<Webhook>(this.baseUrl, webhook)
  }

  putUpdateWebhook(webhook: WebhookCreateUpdateDto): Observable<Webhook> {
    return this.http.put<Webhook>(`${this.baseUrl}/${webhook.id}`, webhook)
  }

  deleteWebhook(webhookId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${webhookId}`)
  }

  patchActivateWebhook(webhookId: string): Observable<any> {
    return this.http.patch(`${this.baseUrl}/active/${webhookId}`, {})
  }

  patchDeactivateWebhook(webhookId: string): Observable<any> {
    return this.http.patch(`${this.baseUrl}/inactive/${webhookId}`, {})
  }

  postListWebhookLogs(
    filterDto: WebhookLogFilterDto
  ): Observable<WebhookLogResp> {
    return this.http.post<WebhookLogResp>(`${this.logsUrl}/list`, filterDto)
  }
}
