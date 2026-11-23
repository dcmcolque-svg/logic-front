import {
  Component,
  input,
  output,
  computed,
  signal,
  contentChild,
  TemplateRef,
  inject,
  OnInit,
  OnDestroy,
  ViewChild,
  DestroyRef,
  effect,
  untracked,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { CommonModule } from '@angular/common'
import { Table, TableModule } from 'primeng/table'
import { PaginatorModule } from 'primeng/paginator'
import { CheckboxModule } from 'primeng/checkbox'
import { ChipModule } from 'primeng/chip'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { FormsModule } from '@angular/forms'
import { InputTextModule } from 'primeng/inputtext'
import { InputNumberModule } from 'primeng/inputnumber'
import { SelectModule } from 'primeng/select'
import { DatePickerModule } from 'primeng/datepicker'
import { ButtonModule } from 'primeng/button'
import { TooltipModule } from 'primeng/tooltip'
import {
  ShColumnDef,
  ShPaginationConfig,
  ShSortConfig,
  ShTableEvent,
  ActiveFilterChip,
} from '../../../types/table.types'
import { ShActionItem } from '../../../types/api.types'
import { TableColumnsBus } from '../../../services/table-columns.bus'
import { BaseTableSkeleton } from '../table-skeleton/base-table-skeleton.component'
import { BaseDataTableMobile } from '../data-table-mobile/base-data-table-mobile.component'
import { BaseActionMenu } from '../../actions/action-menu/base-action-menu.component'
import { FilterTextInputComponent } from '../../filter-text-input/filter-text-input.component'
import { FilterDateInputComponent } from '../../filter-date-input/filter-date-input.component'
import { filterConfigMatchModes } from '../../../config/filter-column.config'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { facilityFieldsIn, scopeColumns } from '../../../utils/facility-scope.util'

/**
 * ShDataTable — Universal responsive data table.
 * Equivalent to agetic's CustomDataTable (router between Desktop and Mobile).
 *
 * Features:
 * - Auto-switches between p-table (desktop) and card view (mobile) at 768px
 * - Skeleton loading when loading=true
 * - Declarative columns via ShColumnDef[]
 * - Named template slots for custom cell rendering
 * - Checkbox selection (single or multi)
 * - Server-side pagination, sorting, filtering
 * - Slot for toolbar/filters above the table
 *
 * Usage:
 * ```html
 * <sh-data-table
 *   [columns]="columns"
 *   [data]="orders"
 *   [loading]="isLoading"
 *   [pagination]="pagination"
 *   [selectable]="true"
 *   [(selection)]="selectedItems"
 *   [disableMobileView]="true"
 *   (stateChange)="onTableChange($event)"
 * >
 *   <ng-template #toolbar>
 *     <sh-form-field type="text" ... />
 *   </ng-template>
 *
 *   <ng-template #cell let-row let-col="col">
 *     @if (col.template === 'status') {
 *       <sh-status-badge [value]="row.status" />
 *     }
 *   </ng-template>
 *
 *   <ng-template #actions let-row>
 *     <sh-action-menu [items]="getActions(row)" />
 *   </ng-template>
 * </sh-data-table>
 * ```
 */
/** A single PrimeNG column filter constraint as stored in `columnFilters`. */
type ColumnFilterEntry = { value?: unknown; matchMode?: string }

/** Chips that come from a custom filter carry a position (chips without one sort last with MAX_SAFE_INTEGER). */
function isPositionedChip(chip: ActiveFilterChip): boolean {
  return typeof chip.position === 'number' && chip.position > 0 && chip.position < Number.MAX_SAFE_INTEGER
}

@Component({
  selector: 'base-data-table',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    PaginatorModule,
    CheckboxModule,
    ChipModule,
    TranslateModule,
    FormsModule,
    BaseTableSkeleton,
    BaseDataTableMobile,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    DatePickerModule,
    ButtonModule,
    TooltipModule,
    BaseActionMenu,
    FilterTextInputComponent,
    FilterDateInputComponent,
  ],
  templateUrl: './base-data-table.component.html',
  styleUrl: './base-data-table.component.scss',
})
export class BaseDataTable implements OnInit, OnDestroy {
  private readonly translate = inject(TranslateService)
  private readonly facilityScope = inject(FacilityScopeService)
  /**
   * Optional: when the view provides it, the columns being rendered are
   * published so the header's export menu writes exactly these.
   */
  private readonly columnsBus = inject(TableColumnsBus, { optional: true })

  constructor() {
    effect(() => this.columnsBus?.publish(this.visibleColumns()))
    // How many records Export would write — which is not the page on screen.
    // With server paging it collects the whole filtered result, so the total
    // governs; `data().length` answers for a table holding everything it has,
    // and covers a view that never binds `pagination`. Taking the page instead
    // killed Export on an empty page of a non-empty result.
    //
    // While a request is in flight nobody can say yet: null, not zero. Zero
    // there disabled the button on every mount, tooltipped "No data to export"
    // until the first response landed.
    effect(() => {
      const bus = this.columnsBus
      if (!bus) return
      bus.publishRowCount(
        this.loading()
          ? null
          : Math.max(this.pagination().total, this.data().length)
      )
    })
  }

  // === Inputs ===
  /** Column definitions */
  columns = input<ShColumnDef[]>([])
  /** Row data */
  data = input<any[]>([])
  /** Loading state */
  loading = input(false)
  /** Pagination config */
  pagination = input<ShPaginationConfig>({ page: 1, limit: 10, total: 0 })
  /** Sort config */
  sort = input<ShSortConfig | undefined>(undefined)
  /** Enable row selection */
  selectable = input(false)
  /** Draw cell borders (PrimeNG gridlines). On by default; pass false to opt out. */
  bordered = input(true)
  /** Title displayed above the table */
  title = input('')
  /** Bulk action items shown in the filter-row ellipsis menu when rows are selected */
  bulkActions = input<ShActionItem[]>([])
  /** When true, disables the automatic mobile card view and always renders the desktop table */
  disableMobileView = input(false)
  /** Optional callback to determine if a specific row can be selected. Defaults to all rows selectable. */
  rowSelectable = input<(row: any) => boolean>(() => true)
  /** Optional callback to determine if a specific row can be expanded. Defaults to all rows expandable. */
  rowExpandable = input<(row: any) => boolean>(() => true)
  /**
   * Persisted filter values to restore when the table mounts.
   * Pass the saved Record<field, {value, matchMode}> from TableStateService.
   * The table will seed columnFilters with these values so filters appear
   * visually on mount (after navigation back to this view).
   */
  initialFilters = input<Record<string, any>>({})
  /**
   * tengo la mision de crear filtros personalizados, guardarlos, nombrarlos, eliminarlos, etc.
El problema es que cuando se sale de la pagina y se vuelve hay que volver a introducir los filtros manualmente, se requiere una forma
   * Active filter chips to display above the table.
   * Compute these in the parent using `buildFilterChipsFromColumns` and pass them in.
   * The table renders each chip and emits `chipRemoved(field)` when one is dismissed.
   */
  activeFilterChips = input<ActiveFilterChip[]>([])
  /**
   * Set of expanded row keys (matching `dataKey`, default 'id').
   * Controls which rows show the expandedRow template below them.
   */
  expandedRowKeys = input<Record<string, boolean>>({})
  /**
   * Opts this table out of the global facility scope: the facility column is
   * neither hidden nor narrowed, and a scope change triggers no reload.
   *
   * Intended for screens that *administer* facilities rather than being scoped
   * by them, where the facility column is the subject of the screen. No caller
   * sets it yet — every table that declares a facility column today is meant to
   * follow the scope — so it exists as the escape hatch for the first screen
   * that needs to opt out.
   */
  disableFacilityScope = input(false)

  /**
   * Rows can have no facility (parcels before check-in, operator-level API
   * keys). While those are in scope the facility column stays, so they show
   * "—" instead of blending in with the facility's own rows.
   */
  nullableFacility = input(false)

  // === Outputs ===
  /** Emitted on page/sort/filter change */
  stateChange = output<ShTableEvent>()
  /** Emitted when selection changes */
  selectionChange = output<any[]>()
  /** Emitted when a row is expanded — payload is the row data object */
  rowExpand = output<any>()
  /** Emitted when the user removes a filter chip — parent should clear the corresponding filter */
  chipRemoved = output<string>()
  /** Emitted when a row's expand toggle is clicked — parent decides which rows are expanded */
  toggleRowExpansion = output<any>()
  /** "Clear filters" in the empty state: the parent resets its own filters and reloads */
  clearAllFilters = output<void>()


  // === Template refs ===
  toolbarTemplate = contentChild<TemplateRef<any>>('toolbar')
  cellTemplate = contentChild<TemplateRef<any>>('cell')
  actionsTemplate = contentChild<TemplateRef<any>>('actions')
  /** Optional fully-custom filter row. Receives { columns } context. */
  filterRowTemplate = contentChild<TemplateRef<any>>('filterRow')
  /** Optional content for the paginator's left side (e.g., column toggle). */
  paginatorLeftTemplate = contentChild<TemplateRef<any>>('paginatorLeft')
  /**
   * Optional row expansion template. When provided, a chevron toggle column
   * is automatically prepended. Receives { $implicit: row } context.
   * Usage: <ng-template #rowExpansion let-row> ... </ng-template>
   */
  rowExpansionTemplate = contentChild<TemplateRef<any>>('rowExpansion')

  // === Internal state ===
  /** Reference to PrimeNG's internal Table — used by clearSort() */
  @ViewChild(Table) private readonly _pt!: Table

  isMobile = signal(false)
  internalSelection: any[] = []
  /** Current filter values keyed by column field */
  columnFilters = signal<Record<string, any>>({})

  /**
   * Partitions activeFilterChips into visual groups, mirroring how the backend
   * combines them (database.Filters): among the chips that come from a custom
   * filter (they have a position), OR starts a new group and AND continues it.
   * Example: [A(and), B(or), C(and)] → [[A], [B, C]].
   * Without an effective OR every chip is shown in a single AND row.
   */
  /** True when any chip or column filter narrows the rows (picks the empty-state message) */
  hasActiveFilters = computed(
    () =>
      this.activeFilterChips().length > 0 ||
      Object.values(this.columnFilters()).some((f) => {
        const v = Array.isArray(f) ? f[0]?.value : f?.value ?? f
        return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
      })
  )

  chipGroups = computed(() => {
    const chips = this.activeFilterChips()
    const groups: ActiveFilterChip[][] = []
    let current: ActiveFilterChip[] = []

    for (const chip of chips.filter(isPositionedChip)) {
      if (current.length > 0 && chip.operator === 'or') {
        groups.push(current)
        current = []
      }
      current.push(chip)
    }
    if (current.length > 0) groups.push(current)
    return groups.length > 1 ? groups : chips.length > 0 ? [chips] : []
  })

  /** True when the chips form more than one OR group — triggers the bordered group rendering */
  hasAnyOrFilter = computed(() => this.chipGroups().length > 1)

  /**
   * Chips without position (typed in the table after applying a custom filter,
   * or a scope). With an OR in play they don't belong to any group: the
   * backend ANDs them with the whole OR expression, so they render after it.
   */
  ungroupedChips = computed(() =>
    this.hasAnyOrFilter() ? this.activeFilterChips().filter(c => !isPositionedChip(c)) : []
  )

  /** Mutable copies — labels get translated on init and lang change */
  matchModesText = filterConfigMatchModes.matchmodesOnlyContains.map((m) => ({
    ...m,
  }))
  matchModesNumeric = filterConfigMatchModes.matchmodes.map((m) => ({ ...m }))

  private resizeObserver: (() => void) | null = null
  private readonly destroyRef = inject(DestroyRef)

  // === Computed ===
  /** Columns after the caller's own `visible` flag, before the facility scope. */
  private readonly declaredColumns = computed(() =>
    this.columns().filter((c) => c.visible !== false)
  )

  /**
   * Columns actually rendered.
   *
   * Applying the global facility scope here — rather than in each of the seven
   * feature components — is what keeps this feature non-invasive: `visibleColumns`
   * was already a computed, so tables react to the topbar selector for free and
   * no module has to convert its plain `cols` array into a signal.
   */
  visibleColumns = computed(() => this.applyFacilityScope(this.declaredColumns()))

  /**
   * Columns handed to the mobile cards.
   *
   * Every declared column, not `visibleColumns`: the cards pick their fields
   * with their own `mobileVisible` / `mobileLabel` rules and have always
   * received hidden columns too. Only the facility scope is applied, so a card
   * drops the facility field exactly when the desktop table drops the column.
   */
  mobileColumns = computed(() => this.applyFacilityScope(this.columns()))

  /** Whether the scope hides this table's facility column. */
  private readonly scopeIsSingle = computed(() =>
    this.nullableFacility()
      ? this.facilityScope.isSingleWithoutNulls()
      : this.facilityScope.isSingle()
  )

  private applyFacilityScope(cols: ShColumnDef[]): ShColumnDef[] {
    if (this.disableFacilityScope()) return cols
    return scopeColumns(cols, {
      isSingle: this.scopeIsSingle(),
      inScope: this.facilityScope.inScope(),
    })
  }

  /** Facility columns declared by the parent, regardless of current scope. */
  private readonly declaredFacilityFields = computed(() =>
    facilityFieldsIn(this.declaredColumns())
  )

  /** Last observed global scope, so the effect's first run doesn't double-load. */
  private lastScope: { ids: string; single: boolean } | null = null

  /**
   * Reacts to the global facility selector.
   *
   * Clearing the column filter first is deliberate: a facility the user picked
   * locally may no longer be in scope, and leaving it in `columnFilters` would
   * either contradict the global selection or silently survive as an invisible
   * filter once the column is hidden. Clear, then let the parent re-query.
   *
   * Re-emitting `stateChange` means feature components need no reload wiring of
   * their own — their existing `(stateChange)` handler already refetches.
   *
   * Only a change in the ticked ids reloads. Whether the column hides is
   * tracked too — for a user who can reach only one facility the selection
   * stays `[]` while the scope turns single once the facility list arrives —
   * but that alone sends the same request, so it reloads only to clear a
   * filter left on the column it hides.
   */
  private readonly facilityScopeEffect = effect(() => {
    const scope = {
      ids: this.facilityScope.selectedIds().join(','),
      single: this.scopeIsSingle(),
    }

    const last = this.lastScope
    if (last?.ids === scope.ids && last.single === scope.single) return
    this.lastScope = scope
    if (untracked(() => this.disableFacilityScope())) return

    untracked(() => {
      const fields = this.declaredFacilityFields()
      // On mount the parent loads by itself; don't fire a duplicate request —
      // unless a restored filter sits on a facility column the scope hides,
      // which would narrow the rows with no visible control to clear it.
      const idsMoved = last !== null && last.ids !== scope.ids
      if (!idsMoved && !this.hidesFilteredFacilityColumn(fields)) return

      if (fields.length > 0) this.clearFiltersForFields(fields)

      this.stateChange.emit({
        pagination: { ...this.pagination(), page: 1 },
        sort: this.sort(),
        filters: this.columnFilters(),
        // Clearing columnFilters above is not enough: modules merge their own
        // filter copy over this event. Tell them to drop it too.
        facilityScopeChanged: true,
      })
    })
  })

  /** True when the scope hides a facility column that still carries a filter value. */
  private hidesFilteredFacilityColumn(fields: string[]): boolean {
    if (!this.scopeIsSingle()) return false
    const filters = this.columnFilters()
    return fields.some((f) => f in filters)
  }

  hasFilterableColumns = computed(() =>
    this.visibleColumns().some((c) => c.filterable)
  )

  totalColumnCount = computed(() => {
    let count = this.visibleColumns().length
    if (this.selectable()) count++
    if (this.actionsTemplate()) count++
    if (this.rowExpansionTemplate()) count++ // expand toggle column
    return count
  })

  ngOnInit() {
    this.checkMobile()
    const handler = () => this.checkMobile()
    window.addEventListener('resize', handler)
    this.resizeObserver = () => window.removeEventListener('resize', handler)

    // Translate match mode labels on load and on language changes
    this.translateMatchModes()
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.translateMatchModes())
    this.translate.onFallbackLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.translateMatchModes())

    const persisted = this.initialFilters()
    console.log('%c[BaseDataTable] ngOnInit', 'color:#6366f1;font-weight:bold',
      '| initialFilters:', persisted
    )

    // Seed internal columnFilters with any persisted filters passed by the parent.
    if (Object.keys(persisted).length > 0) {
      console.log('%c[BaseDataTable] seeding columnFilters from initialFilters', 'color:#f59e0b', persisted)
      this.columnFilters.set(persisted)
    }
  }

  ngOnDestroy() {
    this.resizeObserver?.()
    // The header's menu outlives the table in views that render it inside an
    // `@if` — History swaps it for a timeline — so the count goes back to
    // "nobody is reporting" rather than to zero. Zero would claim an empty
    // table that is no longer there and kill an export that still works.
    // The columns are left as last published: they describe the same view, and
    // nothing here rebuilds them while the table is away.
    this.columnsBus?.publishRowCount(null)
  }

  private checkMobile() {
    this.isMobile.set(!this.disableMobileView() && window.innerWidth < 768)
  }

  private translateMatchModes() {
    ;[...this.matchModesText, ...this.matchModesNumeric].forEach((m) => {
      m.label = this.translate.instant(m.original)
    })
  }

  // === Event handlers ===

  onRowExpandInternal(event: { data: any }) {
    this.rowExpand.emit(event.data)
  }

  onPageChange(event: any) {
    const newPage = Math.floor(event.first / event.rows) + 1
    console.log('%c[BaseDataTable] onPageChange', 'color:#10b981', '| page:', newPage, '| rows:', event.rows)
    this.stateChange.emit({
      pagination: { ...this.pagination(), page: newPage, limit: event.rows },
      sort: this.sort(),
      filters: this.columnFilters(),
    })
  }

  onSort(event: any) {
    console.log('%c[BaseDataTable] onSort', 'color:#10b981', event.field, event.order)
    this.stateChange.emit({
      pagination: this.pagination(),
      sort: { field: event.field, order: event.order === 1 ? 'asc' : 'desc' },
      filters: this.columnFilters(),
    })
  }

  /** Buffer filter value without emitting — call applyFilters() to search */
  onFilterChange(field: string, value: any) {
    this.columnFilters.update((f) => ({ ...f, [field]: value }))
  }

  /** Select/dropdown filter — stores { value, matchMode } and emits immediately */
  onSelectFilter(field: string, value: any) {
    const updated = { ...this.columnFilters() }
    if (value !== null && value !== undefined && value !== '') {
      updated[field] = { value, matchMode: 'equals' }
    } else {
      delete updated[field]
    }
    this.columnFilters.set(updated)
    console.log('%c[BaseDataTable] onSelectFilter', 'color:#10b981', field, '=', value, '| all filters:', updated)
    this.stateChange.emit({
      pagination: { ...this.pagination(), page: 1 },
      sort: this.sort(),
      filters: updated,
    })
  }

  /** Called by p-columnFilter's (onFilter) event — merges PrimeNG filter metadata into columnFilters and emits */
  onColumnFilter(event: any) {
    const current = this.columnFilters()
    const merged: Record<string, any> = { ...current }
    let changed = false

    if (event.filters) {
      for (const field of Object.keys(event.filters)) {
        if (this.mergeColumnFilter(field, event.filters[field], current, merged)) {
          changed = true
        }
      }
    }

    // Guard: if PrimeNG echoes back the same state we just set, skip to avoid loops
    if (!changed) return

    this.columnFilters.set(merged)
    console.log('%c[BaseDataTable] onColumnFilter (PrimeNG fired)', 'color:#10b981', '| merged filters:', merged)
    this.stateChange.emit({
      pagination: { ...this.pagination(), page: 1 },
      sort: this.sort(),
      filters: merged,
    })
  }

  /**
   * Merges a single PrimeNG column filter into `merged` (adds/updates when it has a
   * value that differs from `current`, removes it when cleared).
   * Returns true when `merged` was changed.
   */
  private mergeColumnFilter(
    field: string,
    constraints: ColumnFilterEntry | ColumnFilterEntry[] | undefined,
    current: Record<string, ColumnFilterEntry | undefined>,
    merged: Record<string, ColumnFilterEntry>
  ): boolean {
    const first = Array.isArray(constraints) ? constraints[0] : constraints
    const hasValue =
      first?.value !== null &&
      first?.value !== undefined &&
      first?.value !== ''

    if (hasValue) {
      const cur = current[field]
      if (
        !cur ||
        JSON.stringify(cur.value) !== JSON.stringify(first.value) ||
        cur.matchMode !== first.matchMode
      ) {
        merged[field] = { value: first.value, matchMode: first.matchMode }
        return true
      }
      return false
    }
    if (current[field]) {
      delete merged[field]
      return true
    }
    return false
  }

  /** Emit stateChange with all current buffered filters (page resets to 1) */
  applyFilters() {
    this.stateChange.emit({
      pagination: { ...this.pagination(), page: 1 },
      sort: this.sort(),
      filters: this.columnFilters(),
    })
  }

  /**
   * Removes the given field keys from the internal columnFilters signal.
   * Called by parent components when a column is hidden, so stale filter values
   * don't resurface on the next page/sort stateChange emission.
   * Does NOT emit stateChange - the parent handles the reload itself.
   */
  clearFiltersForFields(fields: string[]): void {
    const current = this.columnFilters()
    const toRemove = fields.filter(f => f in current)
    if (toRemove.length === 0) return
    const updated = { ...current }
    toRemove.forEach(f => delete updated[f])
    this.columnFilters.set(updated)
  }

  clearFilters() {
    console.log('%c[BaseDataTable] clearFilters', 'color:#ef4444')
    this.columnFilters.set({})
    this.clearSort()
    this.stateChange.emit({
      pagination: { ...this.pagination(), page: 1 },
      sort: this.sort(),
      filters: {},
    })
  }

  /**
   * Clears internal column filter state and sort WITHOUT emitting stateChange.
   * Use this when the parent already handles the reload (e.g. its own clearFilters button).
   */
  resetColumnFilters(): void {
    this.columnFilters.set({})
    this.clearSort()
  }

  /**
   * Resets PrimeNG's internal sort state so column headers revert to the
   * neutral ↑↓ icon. Uses TableService.onSort(null) — the same signal that
   * p-sortIcon subscribes to — instead of the [sortField] input binding
   * (which does NOT notify sort icons).
   * Call this from parent components when their "Clear" button is clicked.
   */
  clearSort(): void {
    if (this._pt?.tableService) {
      // IMPORTANT: set _sortField=undefined BEFORE emitting onSort(null).
      // SortIcon.updateSortState() runs synchronously on the RxJS emission and
      // calls isSorted(field)→ uses this._sortField. If _sortField still holds
      // the old value, isSorted() returns true and sortOrder captures the active
      // order (not 0), leaving the icon blue. Clearing first guarantees that
      // isSorted() returns false so sortOrder=0 (grey/neutral) is captured.
      ; (this._pt as any)._sortField = undefined
        ; (this._pt as any)._sortOrder = 1
      this._pt.tableService.onSort(null)
    }
  }

  // === Selection ===

  isAllSelected(): boolean {
    const selectableRows = this.data().filter(r => this.rowSelectable()(r));
    return (
      selectableRows.length > 0 &&
      this.internalSelection.length === selectableRows.length
    )
  }

  isRowSelected(row: any): boolean {
    return this.internalSelection.some((s) => s.id === row.id)
  }

  toggleSelectAll(checked: boolean) {
    this.internalSelection = checked ? this.data().filter(r => this.rowSelectable()(r)) : []
    this.selectionChange.emit(this.internalSelection)
  }

  toggleRowSelection(row: any, checked: boolean) {
    if (checked) {
      this.internalSelection = [...this.internalSelection, row]
    } else {
      this.internalSelection = this.internalSelection.filter(
        (s) => s.id !== row.id
      )
    }
    this.selectionChange.emit(this.internalSelection)
  }

  /** Programmatically clear all selected rows (used after bulk actions) */
  clearSelection(): void {
    this.internalSelection = []
    this.selectionChange.emit(this.internalSelection)
  }

  // === Helpers ===

  getFieldValue(row: any, field: string): any {
    return field.split('.').reduce((obj, key) => obj?.[key], row) ?? '—'
  }

  /**
   * The value of one cell: the column's own `exportValue` when it declares
   * one, the raw field otherwise.
   *
   * It is the same function the export calls, so a column that computes its
   * value — a name resolved from an id, a business reference instead of a uuid
   * — shows on screen exactly what the file will carry, with no second
   * definition to keep in step.
   */
  cellValue(row: any, col: ShColumnDef): any {
    if (!col.exportValue) return this.getFieldValue(row, col.field)
    const value = col.exportValue(row)
    return value === null || value === undefined || value === '' ? '—' : value
  }

  /** Template string for PrimeNG's showCurrentPageReport — translated at call time */
  get currentPageReportTpl(): string {
    const showing = this.translate.instant('labels.showing')
    const of = this.translate.instant('labels.of')
    return `${showing} {first} – {last} ${of} {totalRecords}`
  }

  /**
   * Cells cut their text with an ellipsis: on hover, a cut cell gets its full
   * text as a native title so it can still be read.
   */
  showOverflowTitle(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement
    if (el.scrollWidth > el.clientWidth) el.title = el.textContent?.trim() ?? ''
    else el.removeAttribute('title')
  }

  min(a: number, b: number): number {
    return Math.min(a, b)
  }
}
