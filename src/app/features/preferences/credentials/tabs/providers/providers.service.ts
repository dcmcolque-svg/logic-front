import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { environment } from '../../../../../../environments/environment'
import { ProviderResponse } from './providers-tab.component'

export interface ProviderListResponse {
  data: ProviderResponse[]
  logo_url: string
  default_templates?: any[]
}

@Injectable({ providedIn: 'root' })
export class ProvidersService {
  private readonly http = inject(HttpClient)

  private readonly baseUrl = `${environment.URL_API}v2/integration/providers`

  list(): Observable<ProviderListResponse> {
    return this.http.get<ProviderListResponse>(this.baseUrl)
  }

  get(name: string): Observable<ProviderResponse> {
    return this.http.get<ProviderResponse>(`${this.baseUrl}/${name}`)
  }

  upsert(name: string, config: Record<string, string>, templates?: any[]): Observable<unknown> {
    return this.http.put(`${this.baseUrl}/${name}`, { config, templates })
  }

  delete(name: string): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/${name}`)
  }

  testEmail(email: string, subject?: string, body?: string, template?: any, api_key?: string, from_email?: string, from_name?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/sendgrid/test-email`, { email, subject, body, template, api_key, from_email, from_name })
  }

  testWhatsApp(phone: string, code?: string, qrImageUrl?: string): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/twilio-whatsapp/test`, {
      phone,
      code,
      qr_image_url: qrImageUrl,
    })
  }
}

