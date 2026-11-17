import { inject, Injectable } from '@angular/core'
import { AuthService } from '@/app/core/services/auth.service'

export interface TablePersistedConfig {
  columns?: string[]
  filters?: Record<string, unknown>
  page?:    number
  sort?:    { field: string; order: 'asc' | 'desc' }
}

/**
 * TableStateService — Persists table column/filter state in localStorage.
 * Migrated from edge-frontend's TableStateService with Date/Number serialization.
 *
 * Keys are automatically scoped per user: `{uid}:{key}`.
 * This ensures different accounts on the same browser keep independent state.
 * Falls back to the bare key when no authenticated user is available.
 */
@Injectable({ providedIn: 'root' })
export class TableStateService {
  private readonly auth = inject(AuthService)

  // ---------------------------------------------------------------------------
  // Key scoping
  // ---------------------------------------------------------------------------

  /**
   * Prefixes the given key with the authenticated user's UID so that each
   * account on the same device has isolated filter/sort/page state.
   * Falls back to the raw key when there is no active session.
   */
  private scopedKey(key: string): string {
    const uid = this.auth.authInfo()?.uid
    return uid ? `${uid}:${key}` : key
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  save(key: string, partial: Partial<TablePersistedConfig>): void {
    const scoped = this.scopedKey(key)
    console.log('%c[TableStateService] save() called', 'color:#8b5cf6;font-weight:bold', '| key:', scoped, '| partial:', partial)
    try {
      const current = this.load(key) ?? {}
      const merged = { ...current, ...partial }
      const serialized = JSON.stringify(merged, this.serializer)
      console.log('%c[TableStateService] serialized to save:', 'color:#8b5cf6', serialized)
      localStorage.setItem(scoped, serialized)
      console.log('%c[TableStateService] saved OK. Verify read-back:', 'color:#22c55e', localStorage.getItem(scoped))
    } catch (e) {
      console.error('%c[TableStateService] SAVE FAILED with error:', 'color:#ef4444;font-weight:bold', e)
    }
  }

  load(key: string): TablePersistedConfig | null {
    const scoped = this.scopedKey(key)
    try {
      const raw = localStorage.getItem(scoped)
      console.log('%c[TableStateService] load()', 'color:#8b5cf6', '| key:', scoped, '| raw:', raw)
      const result = raw ? JSON.parse(raw, this.deserializer) : null
      console.log('%c[TableStateService] load() -> parsed result:', 'color:#8b5cf6', result)
      return result
    } catch (e) {
      console.error('%c[TableStateService] LOAD FAILED:', 'color:#ef4444', e)
      return null
    }
  }

  clearFilters(key: string): void {
    const config = this.load(key)
    if (!config) return
    delete config.filters
    try {
      localStorage.setItem(this.scopedKey(key), JSON.stringify(config, this.serializer))
    } catch {
      /* ignore */
    }
  }

  clearFilterByField(key: string, field: string): void {
    const config = this.load(key)
    if (!config) return
    delete config.filters?.[field]
    try {
      localStorage.setItem(this.scopedKey(key), JSON.stringify(config, this.serializer))
    } catch {
      /* ignore */
    }
  }

  clear(key: string): void {
    localStorage.removeItem(this.scopedKey(key))
  }

  resolveColumns<T extends { field: string }>(
    key: string,
    allColumns: T[]
  ): T[] | null {
    const config = this.load(key)
    if (!config?.columns?.length) return null
    const colMap = new Map(allColumns.map((c) => [c.field, c]))
    const resolved = config.columns
      .map((field) => colMap.get(field))
      .filter((c): c is T => !!c)
    return resolved.length > 0 ? resolved : null
  }

  // ---------------------------------------------------------------------------
  // Private serialization helpers
  // ---------------------------------------------------------------------------

  /**
   * Replacer for JSON.stringify.
   * Only converts Dates → { __type:'Date', iso:'...' }
   * Numbers are left as-is (they are valid JSON and wrapping them caused
   * an infinite recursion: JSON.stringify calls the replacer on the returned
   * object's properties too, so { __type:'Number', val:1 } → val:1 → loop).
   */
  private readonly serializer = (_key: string, value: unknown): unknown => {
    if (value instanceof Date) {
      return { __type: 'Date', iso: value.toISOString() }
    }
    return value
  }

  /**
   * Reviver for JSON.parse — inverse of serializer.
   */
  private readonly deserializer = (_key: string, value: unknown): unknown => {
    if (value !== null && typeof value === 'object') {
      const v = value as Record<string, unknown>
      if (v['__type'] === 'Date') {
        return new Date(v['iso'] as string)
      }
      // Legacy: handle old entries that were saved with Number wrapping
      if (v['__type'] === 'Number') {
        return Number(v['val'])
      }
    }
    return value
  }
}
