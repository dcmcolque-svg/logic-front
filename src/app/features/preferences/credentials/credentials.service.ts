import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { map, Observable } from 'rxjs'
import { environment } from '../../../../environments/environment'
import {
  CreateApiKeyDto,
  KeyDTO,
  KeyListResponse,
  OAuth2CredentialRequest,
  OAuth2CredentialResponse,
  OAuth2ListRequest,
  OAuth2ListResponse,
  OAuth2TestResponse,
  OperatorKey,
  UpdateApiKeyDto,
} from './credentials.types'

@Injectable({ providedIn: 'root' })
export class CredentialsService {
  private readonly http = inject(HttpClient)
  private readonly keyUrl = `${environment.URL_API}v2/integration/apikey`
  private readonly oauthUrl = `${environment.URL_API}v2/integration`

  // ── API Keys (──────────────────────────────────────────────────────────

  listKeys(dto: KeyDTO): Observable<KeyListResponse<OperatorKey>> {
    return this.http.post<KeyListResponse<OperatorKey>>(
      `${this.keyUrl}/list`,
      dto
    )
  }

  /** Create a key. If facility_id is set it becomes facility-scoped, otherwise operator-scoped. */
  createKey(dto: CreateApiKeyDto): Observable<OperatorKey> {
    return this.http.post<OperatorKey>(this.keyUrl, dto)
  }

  /** Rename a key. Only name can be changed. */
  updateKey(id: string, dto: UpdateApiKeyDto): Observable<void> {
    return this.http.put<void>(`${this.keyUrl}/${id}`, dto)
  }

  deleteKey(id: string): Observable<void> {
    return this.http.delete<void>(`${this.keyUrl}/${id}`)
  }

  revokeKey(id: string): Observable<void> {
    return this.http.patch<void>(`${this.keyUrl}/${id}/revoke`, {})
  }

  activateKey(id: string): Observable<void> {
    return this.http.patch<void>(`${this.keyUrl}/${id}/activate`, {})
  }

  // ── Aliases kept for backwards compatibility ───────────────────────────
  /** @deprecated use listKeys() */
  getOperatorKeys(dto: KeyDTO): Observable<KeyListResponse<OperatorKey>> {
    return this.listKeys(dto)
  }
  /** @deprecated use createKey() */
  createOperatorKey(dto: CreateApiKeyDto): Observable<OperatorKey> {
    return this.createKey(dto)
  }
  /** @deprecated use createKey() */
  createFacilityKey(dto: CreateApiKeyDto): Observable<OperatorKey> {
    return this.createKey(dto)
  }

  // ── OAuth2 ────────────────────────────────────────────────────────────────

  /** POST /integration/credentials/list → list all providers (paginated, returns data array) */
  listOAuth2(req: OAuth2ListRequest = {}): Observable<OAuth2CredentialResponse[]> {
    return this.http
      .post<OAuth2ListResponse>(`${this.oauthUrl}/credentials/list`, req)
      .pipe(map((r) => r.data))
  }

  /** POST /integration/credentials/list → full paginated response with meta_data */
  listOAuth2Paginated(req: OAuth2ListRequest = {}): Observable<OAuth2ListResponse> {
    return this.http.post<OAuth2ListResponse>(
      `${this.oauthUrl}/credentials/list`,
      req
    )
  }

  /** POST /integration/credentials → create */
  createOAuth2(
    req: OAuth2CredentialRequest,
    provider: string
  ): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(
      `${this.oauthUrl}/credentials`,
      { ...req, provider_name: provider }
    )
  }

  /** PUT /integration/credentials/:provider → update */
  updateOAuth2(
    req: OAuth2CredentialRequest,
    provider: string
  ): Observable<{ status: string }> {
    return this.http.put<{ status: string }>(
      `${this.oauthUrl}/credentials/${provider}`,
      req
    )
  }

  /** DELETE /integrations/credentials/:provider */
  deleteOAuth2(provider: string): Observable<{ status: string }> {
    return this.http.delete<{ status: string }>(
      `${this.oauthUrl}/credentials/${provider}`
    )
  }

  /** POST /integrations/test-token/:provider */
  testOAuth2Token(provider: string): Observable<OAuth2TestResponse> {
    return this.http.post<OAuth2TestResponse>(
      `${this.oauthUrl}/test-token/${provider}`,
      {}
    )
  }
}
