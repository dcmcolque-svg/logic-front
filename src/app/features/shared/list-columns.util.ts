import { TranslateService } from '@ngx-translate/core'

import { TablePersistedConfig } from '../../shared/services/table-state.service'
import { ShColumnDef } from '../../shared/types/table.types'

/** Column definition with its header already translated (used by the column picker). */
export type TranslatedColumnDef = ShColumnDef & { translatedHeader: string }

/** Adds the translated header to every column definition. */
export function translateColumnDefs(
  defs: ShColumnDef[],
  translate: TranslateService
): TranslatedColumnDef[] {
  return defs.map(col => ({
    ...col,
    translatedHeader: translate.instant(col.header),
  }))
}

/** Returns the entries of `all` (keeping their order) whose field is present in `selected`. */
export function pickColumns<T extends ShColumnDef>(all: T[], selected: ShColumnDef[]): T[] {
  return all.filter(def => selected.some(s => s.field === def.field))
}

/** Fields that were in `previous` but are no longer in `next`. */
export function removedColumnFields(previous: ShColumnDef[], next: ShColumnDef[]): string[] {
  const prevFields = new Set(previous.map(c => c.field))
  const newFields = new Set(next.map(c => c.field))
  return [...prevFields].filter(f => !newFields.has(f))
}

/** Page / sort overrides restored from a persisted table state. */
export function persistedConfigOverrides(saved: TablePersistedConfig): {
  page?: number
  sort_field?: { field: string; order: 1 | -1 }[]
} {
  return {
    ...(saved.page ? { page: saved.page } : {}),
    ...(saved.sort
      ? { sort_field: [{ field: saved.sort.field, order: saved.sort.order === 'asc' ? 1 : -1 }] }
      : {}),
  }
}
