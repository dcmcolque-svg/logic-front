import { signal } from '@angular/core'
import { Observable } from 'rxjs'

/**
 * Lazily loaded, per-row detail (e.g. the lines or shipments shown when a
 * table row is expanded). Each row id is fetched once; while the request is
 * in flight `isLoading(id)` is true.
 */
export class RowDetailCache<T> {
  private readonly data = signal<Record<string, T>>({})
  private readonly loading = signal<Record<string, boolean>>({})

  /**
   * Fetches the detail for `id` unless it is already cached. A `null` result
   * is not cached; on error `errorValue` is cached when given.
   */
  load(id: string, request: () => Observable<T | null>, errorValue?: T): void {
    if (this.data()[id]) return
    this.setLoading(id, true)
    request().subscribe({
      next: (value) => {
        if (value !== null) this.data.update(s => ({ ...s, [id]: value }))
        this.setLoading(id, false)
      },
      error: () => {
        if (errorValue !== undefined) this.data.update(s => ({ ...s, [id]: errorValue }))
        this.setLoading(id, false)
      },
    })
  }

  get(id: string): T | undefined {
    return this.data()[id]
  }

  isLoading(id: string): boolean {
    return !!this.loading()[id]
  }

  private setLoading(id: string, value: boolean): void {
    this.loading.update(s => ({ ...s, [id]: value }))
  }
}
