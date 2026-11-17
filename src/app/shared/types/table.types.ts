/**
 * Column definition for ShDataTable.
 * Declarative configuration for each column in the table.
 */
export interface ShColumnDef {
  /** Data field key from the row object */
  field: string
  /** Column header — i18n translation key (e.g. 'labels.order_id') */
  header: string
  /** Enable sorting on this column */
  sortable?: boolean
  /** Enable filtering on this column */
  filterable?: boolean
  /** Filter input type */
  filterType?: 'text' | 'numeric' | 'date' | 'multiselect' | 'boolean'
  /** Options for multiselect filter */
  filterOptions?: { label: string; value: any }[]
  /** CSS width (e.g. '12rem') */
  width?: string
  /** Freeze column on horizontal scroll */
  frozen?: boolean
  /** Named template reference for custom cell rendering */
  template?: string
  /** Whether the column is visible (default true) */
  visible?: boolean
  /** Show this field in mobile card view */
  mobileVisible?: boolean
  /** Use this field as the card title in mobile */
  mobileLabel?: boolean
  /** Text alignment */
  align?: 'left' | 'center' | 'right'
  /**
   * Overrides the value written to CSV/XLSX for this column.
   * Use it when the cell template shows something other than the raw field —
   * e.g. `exportValue: row => this.facilityName(row.facility_id)`.
   * Return a Date or number to keep the native type in xlsx.
   */
  exportValue?: (row: any) => string | number | boolean | Date | null | undefined
  /** Set to false to keep the column in the table but out of exported files. */
  exportable?: boolean
}

/**
 * Pagination state for ShDataTable.
 */
export interface ShPaginationConfig {
  /** Current page (1-indexed) */
  page: number
  /** Rows per page */
  limit: number
  /** Total number of records */
  total: number
  /** Available page size options */
  rows_per_page?: number[]
}

/**
 * Sort state for ShDataTable.
 */
export interface ShSortConfig {
  /** Field to sort by */
  field: string
  /** Sort direction */
  order: 'asc' | 'desc'
}

/**
 * Composite event emitted by ShDataTable on any state change.
 */
export interface ShTableEvent {
  pagination: ShPaginationConfig
  sort?: ShSortConfig
  filters?: Record<string, any>
  /**
   * Set when the emit was caused by the global facility selector moving.
   *
   * The table clears its own facility column filter at that moment, but every
   * module also keeps its own copy of the filters and merges it *over* this
   * event — so without this flag the stale local facility filter survives and
   * silently re-enters the request as soon as the scope is released.
   * Modules should drop their facility keys with `dropFacilityFilters()`.
   */
  facilityScopeChanged?: boolean
}

/**
 * Represents an active filter displayed as a removable chip.
 * Shared across all data-table orchestrator components.
 */
export interface ActiveFilterChip {
  /** Column field key (used to identify which filter to remove) */
  field: string
  /** Human-readable column label (already translated) */
  label: string
  /** Human-readable value(s) for display */
  displayValue: string
  /** Logical operator: how this filter combines with the previous one ('and' default, 'or') */
  operator?: 'and' | 'or'
  /** Position in the filter sequence — used to sort chips in the user-defined order */
  position?: number
}
