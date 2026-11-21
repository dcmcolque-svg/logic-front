import { inject, Injectable, InjectionToken, signal } from '@angular/core'
import { Observable, tap } from 'rxjs'
import {
  FilterPreset,
  FilterCondition,
  CreatePresetInput,
  UpdatePresetInput,
  buildFiltersFromConditions,
} from '@/app/shared/types/filter-preset.types'
import { FilterPresetApiStorage } from './filter-preset-api.storage'

/**
 * FilterPresetService — Orchestrator for saved filter presets.
 *
 * Sits between the UI component (FilterPresetManagerComponent) and
 * the storage layer (FilterPresetApiStorage). All mutation methods
 * refresh the reactive `presets` signal so the UI stays in sync.
 *
 * Storage is backend-backed via HTTP API. Presets are shared across
 * all users of the same tenant (operator_id scope).
 */
/** Saved filter presets (tabs above tables). Off for now to save a request per page. */
export const FILTER_PRESETS_ENABLED = new InjectionToken<boolean>('FILTER_PRESETS_ENABLED', {
  providedIn: 'root',
  factory: () => false,
})

@Injectable({ providedIn: 'root' })
export class FilterPresetService {
  readonly enabled = inject(FILTER_PRESETS_ENABLED)
  private readonly storage = inject(FilterPresetApiStorage)

  /** Reactive signal of presets for the currently active page */
  presets = signal<FilterPreset[]>([])

  /** ID of the last preset the user clicked/applied — scoped per page */
  lastAppliedPresetId = signal<string | null>(null)

  /** Whether presets are currently loading from the API */
  loading = signal(false)

  /** The pageKey currently loaded into the `presets` signal */
  currentPageKey = signal<string>('')

  /** Private backing for activePageKey (used by refreshFromApi) */
  private activePageKey = ''

  /** localStorage key for the per-page last-applied map */
  private readonly LAST_APPLIED_STORAGE_KEY = 'logic:preset:lastApplied'

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Load presets for a given page from the backend.
   * Call this in ngOnInit of the consuming component.
   * If the API returns an empty array, the table loads without filters.
   */
  loadPresets(pageKey: string): void {
    this.activePageKey = pageKey
    this.currentPageKey.set(pageKey)

    // Saved filters are turned off for now: no request, no presets.
    if (!this.enabled) {
      this.presets.set([])
      this.lastAppliedPresetId.set(null)
      this.loading.set(false)
      return
    }
    this.loading.set(true)

    // Immediately clear presets to avoid stale data from a previous page
    // being visible while the HTTP call is in-flight.
    this.presets.set([])

    // Restore the per-page lastAppliedPresetId from localStorage
    this.lastAppliedPresetId.set(this.readLastApplied(pageKey))

    this.storage.list(pageKey).subscribe({
      next: (presets) => {
        this.presets.set(this.sortPresets(presets))
        this.loading.set(false)
      },
      error: (err) => {
        console.error('[FilterPresetService] loadPresets failed:', err)
        // On error, set empty presets — table loads without filters
        this.presets.set([])
        this.loading.set(false)
      },
    })
  }

  /**
   * Save a new named preset via the API.
   * Returns the request so the caller decides what to do on success or
   * failure (e.g. a 409 duplicate name); nothing is sent until subscribed.
   * The page's presets are refreshed once the preset is saved.
   */
  savePreset(
    pageKey: string,
    name: string,
    sort?: { field: string; order: 'asc' | 'desc' },
    options?: { description?: string; color?: string; conditions?: FilterCondition[] },
  ): Observable<FilterPreset> {
    const input: CreatePresetInput = {
      page_key: pageKey,
      name,
      description: options?.description,
      color: options?.color,
      conditions: options?.conditions ?? [],
      sort_field: sort?.field ?? null,
      sort_order: sort?.order ?? null,
    }

    return this.storage.save(input).pipe(
      tap(() => {
        if (pageKey === this.activePageKey) this.refreshFromApi()
      }),
    )
  }

  /**
   * Delete a preset by ID via the API.
   */
  deletePreset(presetId: string): void {
    this.storage.delete(presetId).subscribe({
      next: () => this.refreshFromApi(),
      error: (err) => console.error('[FilterPresetService] deletePreset failed:', err),
    })
  }

  /**
   * Update an existing preset via the API.
   * Like savePreset, returns the request for the caller to subscribe to.
   */
  updatePreset(
    presetId: string,
    name: string,
    sort?: { field: string; order: 'asc' | 'desc' },
    options?: { description?: string; color?: string; conditions?: FilterCondition[] },
  ): Observable<FilterPreset> {
    const input: UpdatePresetInput = {
      name,
      description: options?.description,
      color: options?.color,
      conditions: options?.conditions ?? [],
      sort_field: sort?.field ?? null,
      sort_order: sort?.order ?? null,
    }

    return this.storage.update(presetId, input).pipe(tap(() => this.refreshFromApi()))
  }

  /**
   * Mark a preset as the last applied one (client-side only).
   * Called by the component when the user selects a preset.
   * Persists per-page in localStorage — no backend call.
   */
  setLastApplied(presetId: string): void {
    this.lastAppliedPresetId.set(presetId)
    this.writeLastApplied(this.activePageKey, presetId)
  }

  /**
   * Clear the last applied preset for the current page.
   * Called by clearFilters() in consuming components.
   */
  clearLastApplied(): void {
    this.lastAppliedPresetId.set(null)
    this.writeLastApplied(this.activePageKey, null)
  }

  /**
   * Reconstruct the filters Record from a preset's conditions.
   * Called when the user selects a preset to apply.
   */
  buildFiltersFromPreset(preset: FilterPreset): Record<string, any> {
    return buildFiltersFromConditions(preset.conditions ?? [])
  }

  // ---------------------------------------------------------------------------
  // Private — localStorage per-page map
  // ---------------------------------------------------------------------------

  private readLastApplied(pageKey: string): string | null {
    try {
      const raw = localStorage.getItem(this.LAST_APPLIED_STORAGE_KEY)
      if (!raw) return null
      const map = JSON.parse(raw) as Record<string, string>
      return map[pageKey] ?? null
    } catch {
      return null
    }
  }

  private writeLastApplied(pageKey: string, presetId: string | null): void {
    try {
      const raw = localStorage.getItem(this.LAST_APPLIED_STORAGE_KEY)
      const map: Record<string, string> = raw ? JSON.parse(raw) : {}
      if (presetId) {
        map[pageKey] = presetId
      } else {
        delete map[pageKey]
      }
      localStorage.setItem(this.LAST_APPLIED_STORAGE_KEY, JSON.stringify(map))
    } catch {
      // Ignore localStorage errors (private browsing, quota exceeded, etc.)
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Force re-fetch from the API and update the signal.
   */
  private refreshFromApi(): void {
    if (!this.activePageKey) return
    this.storage.invalidateCache(this.activePageKey)
    this.storage.list(this.activePageKey).subscribe({
      next: (presets) => this.presets.set(this.sortPresets(presets)),
      error: (err) => console.error('[FilterPresetService] refresh failed:', err),
    })
  }

  /**
   * Sort presets: last applied first, then by position ASC, then by updated_at desc.
   */
  private sortPresets(presets: FilterPreset[]): FilterPreset[] {
    const lastId = this.lastAppliedPresetId()
    return [...presets].sort((a, b) => {
      if (a.id === lastId && b.id !== lastId) return -1
      if (b.id === lastId && a.id !== lastId) return 1
      if (a.position !== b.position) return a.position - b.position
      return b.updated_at.localeCompare(a.updated_at)
    })
  }
}
