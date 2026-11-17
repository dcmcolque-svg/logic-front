import { inject, Injectable } from '@angular/core'
import { FilterMetadata } from 'primeng/api'
import { TranslateService } from '@ngx-translate/core'
import { DatePipe } from '@angular/common'
import { MatchModel } from '../types/api.types'

export interface FilterChip {
  key: string
  value: any
  name: string
  label: string
}

/** Builds the chip value/name for an array filter value. */
function buildArrayChipParts(
  chipValue: unknown[],
  key: string,
  arraysDesc?: Record<string, { nameField: string }>
): { value: string; name: string } {
  if (chipValue.length > 0 && typeof chipValue[0] === 'object') {
    const items = chipValue as Array<Record<string, unknown>>
    const nameField = arraysDesc?.[key]?.nameField ?? 'category'
    const ids = items.map((item) => item['id']).join(', ')
    const names = items.map((item) => item[nameField]).join(', ')
    return { value: ids, name: names || ids }
  }
  const joined = chipValue.join(', ')
  return { value: joined, name: joined }
}

/** Builds the chip value/name for any filter value (date, array or scalar). */
function buildChipParts(
  chipValue: unknown,
  key: string,
  datePipe: DatePipe,
  timezone: string,
  arraysDesc?: Record<string, { nameField: string }>
): { value: unknown; name: string } {
  // Dates
  if (chipValue instanceof Date) {
    const formatted = datePipe.transform(
      new Date(chipValue),
      'yyyy-MM-dd',
      timezone
    )
    return { value: formatted, name: formatted ?? '' }
  }
  // Arrays
  if (Array.isArray(chipValue)) {
    return buildArrayChipParts(chipValue, key, arraysDesc)
  }
  return { value: chipValue, name: String(chipValue) }
}

/**
 * FilterApplyService — Normalizes PrimeNG filter metadata for the backend API.
 * Migrated from edge-frontend's FilterApplyService, adapted for PrimeNG 21.
 */
@Injectable({ providedIn: 'root' })
export class FilterApplyService {
  private readonly translate = inject(TranslateService)

  /**
   * Transforms PrimeNG filter metadata into the backend's expected format.
   * Each filter becomes a MatchModel { match_mode, value }.
   */
  applyFilter(
    filters: Record<string, any>,
    search: Record<string, MatchModel>
  ): Record<string, MatchModel> {
    for (const key in filters) {
      const filterValue = filters[key]

      if (Array.isArray(filterValue)) {
        // Direct array values (multiselect)
        ;(search[key] as any) = filterValue.length > 0 ? filterValue : []
      } else if (filterValue && Array.isArray(filterValue.value)) {
        // FilterMetadata with array value
        const matchMode = filterValue.matchMode || ''
        const value = filterValue.value
          .map((item: any) => item.id || item)
          .filter((val: any) => val !== null && val !== undefined)

        search[key] = {
          match_mode: matchMode,
          value: value.length > 0 ? value : [],
        }
      } else {
        // Single value filter
        search[key] = {
          match_mode: filterValue?.matchMode || '',
          value: filterValue?.value === null ? '' : filterValue?.value,
        }
      }
    }
    return search
  }

  /**
   * Generates human-readable filter chips from active PrimeNG filters.
   * Used to display active filters as removable tags.
   */
  prepareFilterChips(
    filters: Record<string, FilterMetadata | FilterMetadata[] | undefined>,
    arraysDesc?: Record<string, { nameField: string }>
  ): FilterChip[] {
    const chips: FilterChip[] = []
    if (!filters) return chips

    const datePipe = new DatePipe(this.translate.getCurrentLang() || 'en-US')
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

    for (const key of Object.keys(filters)) {
      const filterMeta = filters[key] as FilterMetadata
      if (!filterMeta) continue

      // Normalize empty values
      filterMeta.value =
        filterMeta.value?.length === undefined || filterMeta.value?.length > 0
          ? filterMeta.value
          : null

      if (
        filterMeta.value === null ||
        filterMeta.value === undefined ||
        filterMeta.value === ''
      ) {
        continue
      }

      const { value: chipValue, name: chipName } = buildChipParts(
        filterMeta.value,
        key,
        datePipe,
        timezone,
        arraysDesc
      )

      const translatedLabel = this.translate.instant(`labels.${key}`)

      chips.push({
        value: chipValue,
        key,
        name: chipName,
        label: translatedLabel,
      })
    }

    return chips
  }
}
