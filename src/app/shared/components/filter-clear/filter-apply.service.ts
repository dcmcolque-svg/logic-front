import { effect, inject, Injectable } from '@angular/core'
import { DatePipe } from '@angular/common'
import { FilterMetadata } from 'primeng/api'
import { TranslateService } from '@ngx-translate/core'
import { TranslateLanService } from '../../../core/services/translate-lan.service'
import { FiltersShip } from '../filter-clear/filters.interface'

type SearchEntry = { match_mode: string; value: unknown }
type FilterLike = { value?: unknown; matchMode?: string }
/** Chip value as stored in FiltersShip (scalar values are passed through untouched). */
type ChipParts = { value: FiltersShip['valor']; name: string }

function isEmptyFilterValue(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

/** Extracts ids from an array of objects (or keeps primitives), dropping null/undefined. */
function extractIds(values: unknown[]): unknown[] {
  return values
    .map((item) => (item as { id?: unknown } | null | undefined)?.id ?? item)
    .filter((x) => x != null)
}

/** PrimeNG 21: column filters come as [{ value, matchMode }] (array) */
function fromColumnFilterArray(filterValue: FilterLike[]): SearchEntry | undefined {
  const first = filterValue[0]
  if (!first) return undefined
  const v = first.value
  const matchMode = first.matchMode ?? 'contains'

  // Skip empty values
  if (isEmptyFilterValue(v)) return undefined
  if (Array.isArray(v) && v.length === 0) return undefined

  // Extract IDs if array of objects, force 'in' match_mode
  if (Array.isArray(v)) {
    return { match_mode: 'in', value: extractIds(v) }
  }
  return { match_mode: matchMode, value: v }
}

/** Converts a single filter (any supported shape) into a backend search entry, or undefined to skip it. */
function toSearchEntry(
  filterValue: FilterLike | FilterLike[] | null | undefined
): SearchEntry | undefined {
  if (Array.isArray(filterValue)) {
    return fromColumnFilterArray(filterValue)
  }
  if (filterValue && Array.isArray(filterValue.value)) {
    // Legacy: { value: [...], matchMode } plain object with array value
    const matchMode = filterValue.matchMode || ''
    const value = filterValue.value
      .map((item) => item?.id ?? item)
      .filter((val) => val !== null && val !== undefined)
    return { match_mode: matchMode, value: value.length > 0 ? value : [] }
  }
  if (filterValue && 'value' in filterValue) {
    // Legacy: { value: scalar, matchMode } plain object
    const v = filterValue.value
    if (isEmptyFilterValue(v)) return undefined
    return { match_mode: filterValue.matchMode ?? 'contains', value: v }
  }
  return undefined
}

/** Builds the chip value/name for an array filter value. */
function arrayChipParts(
  chipValue: unknown[],
  key: string,
  arraysDesc?: Record<string, { nameField: string }>
): ChipParts {
  if (chipValue.length > 0 && typeof chipValue[0] === 'object') {
    const items = chipValue as Array<Record<string, unknown>>
    const campo = 'id'
    const nameField =
      arraysDesc?.[key]?.nameField ??
      (items[0]?.hasOwnProperty('category') ? 'category' : '')

    const ids = items.map((item) => item[campo]).join(', ')
    return { value: ids, name: nameField ? ids : '' }
  }
  const joined = chipValue.join(', ')
  return { value: joined, name: joined }
}

/** Builds the chip value/name for any filter value (date, array or scalar). */
function chipParts(
  chipValue: unknown,
  key: string,
  datePipe: DatePipe,
  timezone: string,
  arraysDesc?: Record<string, { nameField: string }>
): ChipParts {
  if (chipValue instanceof Date) {
    const formatted = datePipe.transform(
      new Date(chipValue),
      'yyyy-MM-dd',
      timezone
    )
    return { value: formatted as string, name: formatted ?? '' }
  }
  if (Array.isArray(chipValue)) {
    return arrayChipParts(chipValue, key, arraysDesc)
  }
  return { value: chipValue as string, name: String(chipValue) }
}

@Injectable({ providedIn: 'root' })
export class FilterApplyService {
  private readonly translate = inject(TranslateService)
  private readonly translateLanService = inject(TranslateLanService)

  constructor() {
    effect(() => {
      const lan = this.translateLanService.changeLanguage()
      this.translate.use(lan)
    })
  }

  applyFilterNew(filters: any, search: any): any {
    for (const key in filters) {
      const entry = toSearchEntry(filters[key])
      if (entry) search[key] = entry
    }
    return search
  }

  preparaFiltersChip(
    filters: { [s: string]: FilterMetadata | FilterMetadata[] | undefined },
    arraysDesc?: Record<string, { nameField: string }>
  ): FiltersShip[] {
    const filterschip: FiltersShip[] = []
    if (!filters) return filterschip

    const datePipe = new DatePipe(this.translate.getCurrentLang() || 'en-US')
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

    for (const key of Object.keys(filters)) {
      const filterMeta = filters[key] as FilterMetadata
      if (!filterMeta) continue

      const val = filterMeta.value
      filterMeta.value =
        val?.length === undefined || val?.length > 0 ? val : null

      if (isEmptyFilterValue(filterMeta.value)) {
        continue
      }

      const chip = chipParts(filterMeta.value, key, datePipe, timezone, arraysDesc)

      filterschip.push({
        valor: chip.value,
        key,
        name: chip.name,
        show: this.translate.instant(`labels.${key}`),
      })
    }

    return filterschip
  }
}
