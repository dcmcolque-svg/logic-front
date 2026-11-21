import { TooltipModule } from 'primeng/tooltip'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
  ViewChild,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { DisplayDatePipe } from '@/app/shared/pipes/display-date.pipe'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MenuItem, MessageService } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { Menu, MenuModule } from 'primeng/menu'
import { TagModule } from 'primeng/tag'
import { ToggleSwitchModule } from 'primeng/toggleswitch'

import { BaseDataTable } from '@/app/shared/components/datatable/data-table/base-data-table.component'
import { FilterDateInputComponent } from '@/app/shared/components/filter-date-input/filter-date-input.component'
import { FilterMultiselectPanelComponent } from '@/app/shared/components/filter-multiselect-panel/filter-multiselect-panel.component'
import { FilterTextInputComponent } from '@/app/shared/components/filter-text-input/filter-text-input.component'
import { TableStateService } from '@/app/shared/services/table-state.service'
import { ActiveFilterChip, ShColumnDef, ShPaginationConfig, ShTableEvent } from '@/app/shared/types/table.types'
import { buildFilterChipsFromColumns } from '@/app/shared/utils/filter-chips.util'
import { CostingCurrency } from '@/app/shared/utils/costing.util'
import { ColumnToggleComponent } from '../../shared/column-toggle/column-toggle.component'
import {
  persistedConfigOverrides,
  pickColumns,
  removedColumnFields,
  TranslatedColumnDef,
  translateColumnDefs,
} from '../../shared/list-columns.util'
import { RawColumnFilter, toApiFilter, toListConfig } from '../../inbound/receivings/receivings-filter.util'
import { SalesService } from '../sales.service'
import { CompanyOption, Customer, CustomerFilter, CustomerInput, CustomerListRequest } from '../sales.types'
import { money, salesErrorMessages } from '../sales.util'
import { CustomerFormDialogComponent } from '../shared/customer-form-dialog.component'
import { CustomerStatementDialogComponent } from './customer-statement-dialog.component'

const ROWS_PER_PAGE = [15, 30, 50, 100]
/** Opens on the active customers; the user can widen it from the status column. */
const DEFAULT_FILTERS: Record<string, RawColumnFilter> = { is_active: { value: [true], matchMode: 'in' } }

/**
 * Customers of the operator's companies (POS) with their debt per currency.
 * Same base-data-table as the other lists: one MatchModel filter per column,
 * chips, column toggle and persisted state. "Only debtors" narrows to the
 * accounts receivable. Customers are deactivated, never deleted.
 */
@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [
    TooltipModule,
    CommonModule,
    DisplayDatePipe,
    FormsModule,
    TranslateModule,
    ButtonModule,
    MenuModule,
    TagModule,
    ToggleSwitchModule,
    BaseDataTable,
    ColumnToggleComponent,
    FilterDateInputComponent,
    FilterMultiselectPanelComponent,
    FilterTextInputComponent,
    CustomerFormDialogComponent,
    CustomerStatementDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customers.component.html',
})
export default class CustomersComponent implements OnInit {
  private readonly svc = inject(SalesService)
  private readonly translate = inject(TranslateService)
  private readonly toast = inject(MessageService)
  private readonly tableState = inject(TableStateService)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly STATE_KEY = 'logic:sales-customers'

  @ViewChild(BaseDataTable) private readonly baseTable?: BaseDataTable
  @ViewChild(CustomerStatementDialogComponent) private readonly statementDialog?: CustomerStatementDialogComponent

  // ── List state ────────────────────────────────────────────────────────────
  readonly customers = signal<Customer[]>([])
  readonly companies = signal<CompanyOption[]>([])
  readonly loading = signal(false)
  readonly pagination = signal<ShPaginationConfig>({ page: 1, limit: 15, total: 0, rows_per_page: ROWS_PER_PAGE })
  private readonly dto = signal<CustomerListRequest>({
    filter: toApiFilter<CustomerFilter>(DEFAULT_FILTERS),
    config: { page: 1, rows: 15, sort_field: [] },
  })
  private request = 0

  // ── Filters ───────────────────────────────────────────────────────────────
  activeFilters = signal<ActiveFilterChip[]>([])
  protected activeRawFilters: Record<string, RawColumnFilter> = { ...DEFAULT_FILTERS }

  // ── Columns ───────────────────────────────────────────────────────────────
  readonly columnDefs: ShColumnDef[] = (<ShColumnDef[]>[
    { field: 'name',          header: 'sales.customers.name',          width: '16rem', sortable: true, filterable: true, filterType: 'text', mobileVisible: true, mobileLabel: true },
    { field: 'doc',           header: 'sales.customers.doc',           width: '10rem', sortable: true, filterable: true, filterType: 'text', mobileVisible: true },
    { field: 'business_name', header: 'sales.customers.business_name', width: '14rem', sortable: true, filterable: true, filterType: 'text', visible: false },
    // Filters by company_id ("in"); sorts by company name (backend columnMap).
    { field: 'company_id',    header: 'labels.company',                width: '12rem', sortable: true, filterable: true, filterType: 'multiselect' },
    { field: 'phone',         header: 'sales.customers.phone',         width: '10rem', sortable: true, filterable: true, filterType: 'text' },
    { field: 'email',         header: 'sales.customers.email',         width: '14rem', sortable: true, filterable: true, filterType: 'text', visible: false },
    {
      field: 'has_balance', header: 'sales.customers.debt', width: '11rem', sortable: false, filterable: true, filterType: 'multiselect',
      filterOptions: [{ label: 'sales.customers.with_debt', value: true }],
      mobileVisible: true,
    },
    { field: 'sales_count',   header: 'sales.customers.sales_count',   width: '8rem',  sortable: true, filterable: false },
    { field: 'last_sale_at',  header: 'sales.customers.last_sale_at',  width: '11rem', sortable: true, filterable: false },
    {
      field: 'is_active', header: 'labels.status', width: '9rem', sortable: true, filterable: true, filterType: 'multiselect',
      filterOptions: [
        { label: 'sales.customers.active', value: true },
        { label: 'sales.customers.inactive', value: false },
      ],
    },
    { field: 'created_at',    header: 'labels.created_at',             width: '12rem', sortable: true, filterable: true, filterType: 'date', visible: false },
    // base-data-table only hands a cell to the #cell template when the column
    // names one; every column does, so the template's @switch (col.field) renders all.
  ]).map(c => ({ ...c, template: c.field }))
  selectedCols: ShColumnDef[] = this.columnDefs.filter(c => c.visible !== false)
  translatedColumnDefs: TranslatedColumnDef[] = []

  // ── Row menu / dialogs ────────────────────────────────────────────────────
  menuItems: MenuItem[] = []
  readonly formVisible = signal(false)
  readonly editing = signal<Customer | null>(null)
  readonly statementVisible = signal(false)
  readonly statementId = signal<string | null>(null)

  constructor() {
    this.restoreSavedState()
    effect(() => {
      this.dto()
      untracked(() => this.load())
    })
  }

  ngOnInit(): void {
    this.translate
      .get(this.columnDefs.map(c => c.header))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.buildTranslatedColumns())
    this.translate.onLangChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.buildTranslatedColumns()
      this.buildFilterChips()
    })
    this.buildFilterChips()
    this.svc.listCompanies().subscribe({
      next: res => {
        this.companies.set(res.data ?? [])
        this.buildFilterChips()
        this.cdr.markForCheck()
      },
      error: () => this.companies.set([]),
    })
  }

  // ── Columns ───────────────────────────────────────────────────────────────

  private buildTranslatedColumns(): void {
    this.translatedColumnDefs = translateColumnDefs(this.columnDefs, this.translate)
    this.selectedCols = pickColumns(this.translatedColumnDefs, this.selectedCols)
    this.cdr.markForCheck()
  }

  onColumnSelectionChange(cols: ShColumnDef[]): void {
    const previous = this.selectedCols
    this.selectedCols = pickColumns(this.translatedColumnDefs, cols)
    const removed = removedColumnFields(previous, this.selectedCols).filter(f => f in this.activeRawFilters)
    if (removed.length === 0) return
    const filters = { ...this.activeRawFilters }
    for (const f of removed) delete filters[f]
    this.baseTable?.clearFiltersForFields(removed)
    this.applyRawFilters(filters)
  }

  /** Options of the multiselect column filters. */
  multiselectOptions(field: string): { label: string; value: unknown }[] {
    if (field === 'company_id') return this.companies().map(c => ({ label: c.name, value: c.id }))
    const col = this.columnDefs.find(c => c.field === field)
    return (col?.filterOptions ?? []).map(o => ({ ...o, label: this.translate.instant(o.label) }))
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- feeds filter inputs of several value types
  getActiveFilterValue(field: string): any {
    return this.activeRawFilters[field]?.value ?? null
  }

  getActiveFilterMatchMode(field: string): string | null {
    return this.activeRawFilters[field]?.matchMode ?? null
  }

  /** Text/date inputs emit { value, matchMode }; multiselects emit an array ("in"). */
  onColumnFilterChange(field: string, event: unknown): void {
    if (!this.columnDefs.some(c => c.field === field)) return
    const filters = { ...this.activeRawFilters }
    const value = event && typeof event === 'object' && 'value' in event ? (event as { value: unknown }).value : event
    const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
    if (empty) {
      delete filters[field]
    } else {
      const mode = event && typeof event === 'object' && 'matchMode' in event ? (event as { matchMode: string }).matchMode : null
      filters[field] = { value, matchMode: mode ?? (Array.isArray(value) ? 'in' : 'contains') }
    }
    this.applyRawFilters(filters)
  }

  onTableStateChange(event: ShTableEvent): void {
    const merged: Record<string, RawColumnFilter> = { ...this.activeRawFilters, ...(event.filters ?? {}) }
    for (const [k, v] of Object.entries(merged)) {
      if (v?.value === null || v?.value === undefined || v?.value === '') delete merged[k]
    }
    this.activeRawFilters = merged
    this.buildFilterChips()
    const config = toListConfig(event)
    this.dto.set({
      filter: toApiFilter<CustomerFilter>(merged),
      config: { page: config.page, rows: config.rows, sort_field: config.sort_field },
    })
    this.saveState()
  }

  removeFilterChip(field: string): void {
    const filters = { ...this.activeRawFilters }
    delete filters[field]
    this.baseTable?.clearFiltersForFields([field])
    this.applyRawFilters(filters)
  }

  clearFilters(): void {
    this.tableState.clear(this.STATE_KEY)
    this.baseTable?.resetColumnFilters()
    this.applyRawFilters({})
  }

  /** Stores the raw filters, rebuilds the chips and reloads from page 1. */
  private applyRawFilters(filters: Record<string, RawColumnFilter>): void {
    this.activeRawFilters = filters
    this.buildFilterChips()
    this.dto.update(d => ({ filter: toApiFilter<CustomerFilter>(filters), config: { ...d.config, page: 1 } }))
    this.saveState()
  }

  private buildFilterChips(): void {
    const companyName = new Map(this.companies().map(c => [c.id, c.name]))
    this.activeFilters.set(
      buildFilterChipsFromColumns(this.activeRawFilters, this.columnDefs, this.translate, {
        company_id: (id: string) => companyName.get(id) ?? id.substring(0, 8),
        has_balance: () => this.translate.instant('sales.customers.with_debt'),
      })
    )
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private restoreSavedState(): void {
    const saved = this.tableState.load(this.STATE_KEY)
    if (!saved) return
    const known = new Set(this.columnDefs.map(c => c.field))
    const raw = (saved.filters ?? {}) as Record<string, RawColumnFilter>
    this.activeRawFilters = Object.fromEntries(Object.entries(raw).filter(([f]) => known.has(f)))
    this.dto.update(d => ({
      filter: toApiFilter<CustomerFilter>(this.activeRawFilters),
      config: { ...d.config, ...persistedConfigOverrides(saved) },
    }))
    if (saved.page) this.pagination.update(p => ({ ...p, page: saved.page! }))
  }

  private saveState(): void {
    const cfg = this.dto().config
    const sf = cfg.sort_field?.[0]
    this.tableState.save(this.STATE_KEY, {
      filters: this.activeRawFilters as Record<string, unknown>,
      page: cfg.page,
      sort: sf ? { field: sf.field, order: sf.order === 1 ? 'asc' : 'desc' } : undefined,
    })
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  load(): void {
    const request = ++this.request
    this.loading.set(true)
    this.svc.listCustomers(this.normalizedDto()).subscribe({
      next: res => {
        if (request !== this.request) return
        this.customers.set(res.data ?? [])
        this.pagination.set({
          page: res.meta_data.page,
          limit: res.meta_data.rows,
          total: res.meta_data.total_records,
          rows_per_page: ROWS_PER_PAGE,
        })
        this.loading.set(false)
      },
      error: () => {
        if (request !== this.request) return
        this.customers.set([])
        this.loading.set(false)
      },
    })
  }

  /** has_balance is a flag, not a column: the multiselect's [true] becomes { value: true }. */
  private normalizedDto(): CustomerListRequest {
    const d = this.dto()
    const hb = d.filter.has_balance
    if (!hb) return d
    const on = Array.isArray(hb.value) ? hb.value.includes(true) : hb.value === true
    const filter = { ...d.filter }
    delete filter.has_balance
    if (on) filter.has_balance = { match_mode: 'equals', value: true }
    return { ...d, filter }
  }

  // ── Row actions ───────────────────────────────────────────────────────────

  openRowMenu(event: Event, row: Customer, menu: Menu): void {
    this.menuItems = [
      { label: this.translate.instant('sales.customers.statement'), icon: 'pi pi-book', command: () => this.openStatement(row) },
      { label: this.translate.instant('buttons.edit'), icon: 'pi pi-pencil', command: () => this.edit(row) },
      {
        label: this.translate.instant(row.is_active ? 'sales.customers.deactivate' : 'sales.customers.activate'),
        icon: row.is_active ? 'pi pi-ban' : 'pi pi-check-circle',
        command: () => this.toggleActive(row),
      },
    ]
    menu.toggle(event)
  }

  openStatement(row: Customer): void {
    this.statementId.set(row.id)
    this.statementVisible.set(true)
  }

  edit(row: Customer | null): void {
    this.editing.set(row)
    this.formVisible.set(true)
  }

  /** Edit from the statement: close it, edit, and reopen it on save. */
  editFromStatement(): void {
    const c = this.statementDialog?.statement()?.customer ?? this.customers().find(x => x.id === this.statementId())
    this.statementVisible.set(false)
    if (c) this.edit(c)
  }

  onSaved(c: Customer): void {
    this.toast.add({ severity: 'success', summary: this.translate.instant('sales.customers.saved'), detail: c.name })
    this.load()
  }

  private toggleActive(row: Customer): void {
    this.svc.updateCustomer(row.id, { ...this.inputOf(row), is_active: !row.is_active }).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: this.translate.instant('sales.customers.saved') })
        this.load()
      },
      error: e => this.toast.add({ severity: 'error', summary: salesErrorMessages(e, this.translate).join(' · ') }),
    })
  }

  private inputOf(row: Customer): CustomerInput {
    return {
      company_id: row.company_id,
      name: row.name,
      business_name: row.business_name,
      doc: row.doc,
      email: row.email,
      phone: row.phone,
      address: row.address,
      notes: row.notes,
      is_active: row.is_active,
    }
  }

  mc(v: number, currency: CostingCurrency): string {
    return money(v, currency)
  }
}
