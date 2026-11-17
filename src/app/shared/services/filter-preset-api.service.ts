import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable, map } from 'rxjs'
import { environment } from '@/environments/environment'
import { FilterPreset, CreatePresetInput, UpdatePresetInput } from '@/app/shared/types/filter-preset.types'

/**
 * FilterPresetApiService — HTTP client for the filter-preset CRUD API.
 *
 * Base path: `{URL_API}v2/filter-preset`
 *
 * All endpoints are tenant-scoped: operator_id is injected from the JWT
 * by the backend. The client does not need to send it.
 */
@Injectable({ providedIn: 'root' })
export class FilterPresetApiService {
  private readonly http = inject(HttpClient)
  private readonly baseUrl = environment.URL_API + 'v2/filter-preset'

  /**
   * List all filter presets for the given page.
   * Returns an empty array when no presets exist.
   */
  list(pageKey: string): Observable<FilterPreset[]> {
    return this.http.get<FilterPreset[]>(`${this.baseUrl}/${pageKey}`).pipe(
      map(data => data ?? [])
    )
  }

  /**
   * Create a new filter preset.
   */
  create(input: CreatePresetInput): Observable<FilterPreset> {
    return this.http.post<FilterPreset>(this.baseUrl, input)
  }

  /**
   * Update an existing filter preset (partial update).
   */
  update(id: string, input: UpdatePresetInput): Observable<FilterPreset> {
    return this.http.put<FilterPreset>(`${this.baseUrl}/${id}`, input)
  }

  /**
   * Delete a filter preset by ID.
   */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`)
  }
}
