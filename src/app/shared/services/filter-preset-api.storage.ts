import { inject, Injectable } from '@angular/core'
import { Observable, of, tap } from 'rxjs'
import { FilterPresetApiService } from './filter-preset-api.service'
import {
  FilterPreset,
  FilterPresetStorage,
  CreatePresetInput,
  UpdatePresetInput,
} from '@/app/shared/types/filter-preset.types'

/**
 * FilterPresetApiStorage — Backend-backed implementation of FilterPresetStorage.
 *
 * Wraps FilterPresetApiService HTTP calls and maintains a per-page cache
 * so subsequent list() calls can return cached data when available.
 *
 * When the API returns an empty array, the consuming table simply loads
 * without any filters applied (graceful empty state).
 */
@Injectable({ providedIn: 'root' })
export class FilterPresetApiStorage extends FilterPresetStorage {
  private readonly api = inject(FilterPresetApiService)

  /** In-memory cache keyed by pageKey for instant re-reads after mutations */
  private readonly cache = new Map<string, FilterPreset[]>()

  /**
   * List all presets for a page. Returns cached data if available,
   * otherwise fetches from the API and caches the result.
   */
  list(pageKey: string): Observable<FilterPreset[]> {
    const cached = this.cache.get(pageKey)
    if (cached) {
      return of(cached)
    }
    return this.api.list(pageKey).pipe(
      tap(presets => this.cache.set(pageKey, presets))
    )
  }

  /**
   * Create a new preset and invalidate the cache for its page.
   */
  save(input: CreatePresetInput): Observable<FilterPreset> {
    return this.api.create(input).pipe(
      tap(created => {
        this.invalidateCache(created.page_key)
      })
    )
  }

  /**
   * Delete a preset by ID and invalidate all caches.
   */
  delete(presetId: string): Observable<void> {
    return this.api.delete(presetId).pipe(
      tap(() => this.cache.clear())
    )
  }

  /**
   * Update a preset and invalidate all caches.
   */
  update(id: string, input: UpdatePresetInput): Observable<FilterPreset> {
    return this.api.update(id, input).pipe(
      tap(() => this.cache.clear())
    )
  }

  /** Force-clear cache for a page (or all pages) so next list() hits the API */
  invalidateCache(pageKey?: string): void {
    if (pageKey) {
      this.cache.delete(pageKey)
    } else {
      this.cache.clear()
    }
  }
}
