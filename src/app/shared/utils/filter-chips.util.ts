import { TranslateService } from '@ngx-translate/core'
import { ActiveFilterChip, ShColumnDef } from '../types/table.types'

/**
 * Generic builder for filter chips.
 *
 * Given the current backend filters and the column definitions, produces an
 * array of `ActiveFilterChip` for display in BaseDataTable's chip bar.
 *
 * For array values (multiselect filters), it attempts to resolve display labels
 * from `ShColumnDef.filterOptions` first. If a custom `labelResolvers` map is
 * provided for a field, it takes priority.
 *
 * @param filters       The active backend filters (field → { value, matchMode })
 * @param columns       The current column definitions (used for header + filterOptions)
 * @param translate     TranslateService instance (used to translate header keys)
 * @param labelResolvers Optional map of field → resolver fn for custom display values
 */
export function buildFilterChipsFromColumns(
  filters: Record<string, any>,
  columns: ShColumnDef[],
  translate: TranslateService,
  labelResolvers?: Record<string, (value: any) => string>
): ActiveFilterChip[] {
  if (!filters) return []

  const chips: ActiveFilterChip[] = []

  // Build a quick lookup: field → column def
  const colMap = new Map<string, ShColumnDef>()
  for (const col of columns) {
    colMap.set(col.field, col)
  }

  for (const [field, f] of Object.entries(filters)) {
    if (f?.value === undefined || f.value === null || f.value === '') continue

    // Resolve header label from column definition or fallback to labels.<field>
    const col = colMap.get(field)
    const headerKey = col?.header || `labels.${field}`
    const label = translate.instant(headerKey)

    const raw = f.value
    const displayValue = Array.isArray(raw)
      ? resolveArrayDisplayValue(raw, field, col, labelResolvers)
      : resolveScalarDisplayValue(raw, field, col, labelResolvers)

    chips.push({ field, label, displayValue, operator: f.operator ?? 'and', position: f.position ?? Number.MAX_SAFE_INTEGER })
  }

  // Sort by position so chips match the user-defined order.
  // Filters without position (inline table additions) sort to the end.
  chips.sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))

  return chips
}

type LabelResolvers = Record<string, (value: unknown) => string>

/** Display value for a multiselect (array) filter value. */
function resolveArrayDisplayValue(
  raw: unknown[],
  field: string,
  col: ShColumnDef | undefined,
  labelResolvers?: LabelResolvers
): string {
  // Check for custom resolver first
  if (labelResolvers?.[field]) {
    return raw.map((v) => labelResolvers[field](v)).join(', ')
  }
  if (col?.filterOptions) {
    // Auto-resolve from filterOptions
    const options = col.filterOptions
    return raw
      .map((v) => {
        const opt = options.find((o) => o.value === v)
        return opt?.label ?? String(v)
      })
      .join(', ')
  }
  return raw.join(', ')
}

/** Display value for a scalar filter value. */
function resolveScalarDisplayValue(
  raw: unknown,
  field: string,
  col: ShColumnDef | undefined,
  labelResolvers?: LabelResolvers
): string {
  if (labelResolvers?.[field]) {
    return labelResolvers[field](raw)
  }
  if (col?.filterOptions) {
    const opt = col.filterOptions.find((o) => o.value === raw)
    return opt?.label ?? String(raw)
  }
  if (raw instanceof Date) {
    // Format Date objects as yyyy-MM-dd (strip time/timezone noise)
    return raw.toISOString().slice(0, 10)
  }
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    // Format ISO datetime strings as yyyy-MM-dd
    return raw.slice(0, 10)
  }
  return String(raw)
}
