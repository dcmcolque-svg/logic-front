import { signal } from '@angular/core'
import { AutoCompleteCompleteEvent } from 'primeng/autocomplete'

import { CatalogService } from '../../catalog.service'

/** Key-value pair for custom attributes */
export interface CustomAttr {
  key: string
  value: string
}

/**
 * Editable list of SKU custom attributes (stored under dimensions.custom),
 * plus the key suggestions that feed its autocomplete.
 * Shared by the SKU create and edit dialogs.
 */
export class SkuCustomAttributes {
  readonly items = signal<CustomAttr[]>([])
  /** All distinct attribute keys already in use */
  readonly keySuggestions = signal<string[]>([])
  /** Filtered suggestions for the autocomplete */
  readonly filteredKeys = signal<string[]>([])

  constructor(private readonly catalogService: CatalogService) {}

  loadKeys() {
    this.catalogService.getAttributeKeys().subscribe({
      next: (keys) => this.keySuggestions.set(keys),
      error: () => this.keySuggestions.set([]),
    })
  }

  /** Filter attribute key suggestions for the autocomplete */
  search(event: AutoCompleteCompleteEvent) {
    const query = (event.query || '').toLowerCase().trim()
    const all = this.keySuggestions()
    this.filteredKeys.set(
      query ? all.filter(k => k.toLowerCase().includes(query)) : all
    )
  }

  /** Replaces the list with the entries of a stored custom map */
  setFromMap(customMap: Record<string, unknown>) {
    this.items.set(
      Object.entries(customMap).map(([key, value]) => ({ key, value: String(value) }))
    )
  }

  add() {
    this.items.update(attrs => [...attrs, { key: '', value: '' }])
  }

  remove(index: number) {
    this.items.update(attrs => attrs.filter((_, i) => i !== index))
  }

  updateKey(index: number, value: string) {
    this.items.update(attrs => {
      const copy = [...attrs]
      copy[index] = { ...copy[index], key: value }
      return copy
    })
  }

  updateValue(index: number, value: string) {
    this.items.update(attrs => {
      const copy = [...attrs]
      copy[index] = { ...copy[index], value: value }
      return copy
    })
  }

  /** Converts the list to a Record<string, string>, skipping blank keys. */
  toMap(normalizeKey: (key: string) => string = k => k): Record<string, string> | undefined {
    const attrs = this.items().filter(a => a.key.trim())
    if (attrs.length === 0) return undefined
    const map: Record<string, string> = {}
    for (const a of attrs) {
      map[normalizeKey(a.key.trim())] = a.value
    }
    return map
  }
}
