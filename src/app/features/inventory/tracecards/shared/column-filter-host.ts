import {
  BackendFilters,
  activeFilterMatchMode,
  activeFilterValue,
  withColumnFilter,
  withTimestampFilter,
} from './tracecards-filters.util'

/**
 * Column-filter plumbing shared by the tracecards list and its history page:
 * the filter row inputs read their current value/match mode from here and
 * report changes back, and each page decides how to apply the new filters.
 */
export abstract class ColumnFilterHost {
  /** Column filters the user applied: `{ [field]: { value, matchMode } }`. */
  protected abstract activeBackendFilters: BackendFilters

  /** Stores the new column filters and reloads the page's data. */
  protected abstract commitFilters(filters: BackendFilters): void

  // `any`: bound in templates to filter inputs that each expect their own value type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getActiveFilterValue(field: string): any {
    return activeFilterValue(this.activeBackendFilters, field)
  }

  getActiveFilterMatchMode(field: string): string | null {
    return activeFilterMatchMode(this.activeBackendFilters, field)
  }

  onColumnFilterChange(field: string, event: unknown) {
    this.commitFilters(withColumnFilter(this.activeBackendFilters, field, event))
  }

  /** Date filter on a timestamp column — see withTimestampFilter. */
  onTimestampFilterChange(field: string, event: unknown) {
    this.commitFilters(withTimestampFilter(this.activeBackendFilters, field, event))
  }
}
