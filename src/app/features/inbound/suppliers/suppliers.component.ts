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
import { BaseDialog } from '@/app/shared/components'
import { InputTextModule } from 'primeng/inputtext'
import { Menu, MenuModule } from 'primeng/menu'
import { MessageModule } from 'primeng/message'
import { SelectModule } from 'primeng/select'
import { TagModule } from 'primeng/tag'
import { TextareaModule } from 'primeng/textarea'
import { ToggleSwitchModule } from 'primeng/toggleswitch'

import { BaseDataTable } from '@/app/shared/components/datatable/data-table/base-data-table.component'
import { FilterDateInputComponent } from '@/app/shared/components/filter-date-input/filter-date-input.component'
import { FilterMultiselectPanelComponent } from '@/app/shared/components/filter-multiselect-panel/filter-multiselect-panel.component'
import { FilterTextInputComponent } from '@/app/shared/components/filter-text-input/filter-text-input.component'
import { resolveErrorMessage } from '@/app/shared/components/form/field-error/field-error.component'
import { TableStateService } from '@/app/shared/services/table-state.service'
import { ActiveFilterChip, ShColumnDef, ShPaginationConfig, ShTableEvent } from '@/app/shared/types/table.types'
import { buildFilterChipsFromColumns } from '@/app/shared/utils/filter-chips.util'
import { ColumnToggleComponent } from '../../shared/column-toggle/column-toggle.component'
import {
  persistedConfigOverrides,
  pickColumns,
  removedColumnFields,
  TranslatedColumnDef,
  translateColumnDefs,
} from '../../shared/list-columns.util'
import { RawColumnFilter, toApiFilter, toListConfig } from '../receivings/receivings-filter.util'
import { ReceivingService } from '../receivings/receivings.service'
import { CompanyItem } from '../receivings/receivings.types'
import { SupplierService } from './suppliers.service'
import { Supplier, SupplierFilter, SupplierInput, SupplierListRequest } from './suppliers.types'

interface SupplierForm {
  company_id: string | null
  code: string
  name: string
  tax_id: string
  contact_name: string
  email: string
  phone: string
  address: string
  notes: string
  is_active: boolean
}

const EMPTY: SupplierForm = {
  company_id: null, code: '', name: '', tax_id: '', contact_name: '',
  email: '', phone: '', address: '', notes: '', is_active: true,
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROWS_PER_PAGE = [15, 30, 50, 100]
/** Opens on the active suppliers; the user can widen it from the status column. */
const DEFAULT_FILTERS: Record<string, RawColumnFilter> = { is_active: { value: [true], matchMode: 'in' } }

/**
 * Suppliers of the operator's companies, in the same base-data-table as the
 * other lists: one MatchModel filter per column, chips, column toggle and
 * persisted state. Suppliers are deactivated, never deleted.
 */
@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [
    TooltipModule,
    CommonModule,
    DisplayDatePipe,
    FormsModule,
    TranslateModule,
    ButtonModule,
    BaseDialog,
    InputTextModule,
    MenuModule,
    MessageModule,
    SelectModule,
    TagModule,
    TextareaModule,
    ToggleSwitchModule,
    BaseDataTable,
    ColumnToggleComponent,
    FilterDateInputComponent,
    FilterMultiselectPanelComponent,
    FilterTextInputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './suppliers.component.html',
})
export default class SuppliersComponent implements OnInit {
  private readonly svc = inject(SupplierService)
  private readonly receivingSvc = inject(ReceivingService)
  private readonly translate = inject(TranslateService)
  private readonly toast = inject(MessageService)
  private readonly tableState = inject(TableStateService)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly STATE_KEY = 'logic:suppliers'

  @ViewChild(BaseDataTable) private readonly baseTable?: BaseDataTable

  // ── List state ────────────────────────────────────────────────────────────
  readonly suppliers = signal<Supplier[]>([])
  readonly companies = signal<CompanyItem[]>([])
  readonly loading = signal(false)
  readonly pagination = signal<ShPaginationConfig>({ page: 1, limit: 15, total: 0, rows_per_page: ROWS_PER_PAGE })
  private readonly dto = signal<SupplierListRequest>({
    filter: toApiFilter<SupplierFilter>(DEFAULT_FILTERS),
    config: { page: 1, rows: 15, sort_field: [] },
  })
  private request = 0

  // ── Filters ───────────────────────────────────────────────────────────────
  activeFilters = signal<ActiveFilterChip[]>([])
  protected activeRawFilters: Record<string, RawColumnFilter> = { ...DEFAULT_FILTERS }

  // ── Columns ───────────────────────────────────────────────────────────────
  readonly columnDefs: ShColumnDef[] = (<ShColumnDef[]>[
    { field: 'name',         header: 'suppliers.name',         width: '16rem', sortable: true, filterable: true, filterType: 'text', mobileVisible: true, mobileLabel: true },
    { field: 'code',         header: 'suppliers.code',         width: '9rem',  sortable: true, filterable: true, filterType: 'text', mobileVisible: true },
    { field: 'tax_id',       header: 'suppliers.tax_id',       width: '10rem', sortable: true, filterable: true, filterType: 'text' },
    // Filters by company_id ("in"); sorts by company name (backend columnMap).
    { field: 'company_id',   header: 'labels.company',         width: '12rem', sortable: true, filterable: true, filterType: 'multiselect' },
    { field: 'contact_name', header: 'suppliers.contact_name', width: '12rem', sortable: true, filterable: true, filterType: 'text' },
    { field: 'phone',        header: 'suppliers.phone',        width: '10rem', sortable: true, filterable: true, filterType: 'text' },
    { field: 'email',        header: 'suppliers.email',        width: '14rem', sortable: true, filterable: true, filterType: 'text' },
    { field: 'address',      header: 'suppliers.address',      width: '14rem', sortable: true, filterable: true, filterType: 'text', visible: false },
    {
      field: 'is_active', header: 'labels.status', width: '9rem', sortable: true, filterable: true, filterType: 'multiselect',
      filterOptions: [
        { label: 'suppliers.active', value: true },
        { label: 'suppliers.inactive', value: false },
      ],
      mobileVisible: true,
    },
    { field: 'created_at',   header: 'labels.created_at',      width: '12rem', sortable: true, filterable: true, filterType: 'date', visible: false },
    // base-data-table only hands a cell to the #cell template when the column
    // names one; every column does, so the template's @switch (col.field) renders all.
  ]).map(c => ({ ...c, template: c.field }))
  selectedCols: ShColumnDef[] = this.columnDefs.filter(c => c.visible !== false)
  translatedColumnDefs: TranslatedColumnDef[] = []

  // ── Row menu / dialog ─────────────────────────────────────────────────────
  menuItems: MenuItem[] = []
  readonly dialogVisible = signal(false)
  readonly editingId = signal<string | null>(null)
  readonly saving = signal(false)
  readonly errors = signal<string[]>([])
  form: SupplierForm = { ...EMPTY }

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
    this.receivingSvc.listCompanies().subscribe({
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
      filter: toApiFilter<SupplierFilter>(merged),
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
    this.dto.update(d => ({ filter: toApiFilter<SupplierFilter>(filters), config: { ...d.config, page: 1 } }))
    this.saveState()
  }

  private buildFilterChips(): void {
    const companyName = new Map(this.companies().map(c => [c.id, c.name]))
    this.activeFilters.set(
      buildFilterChipsFromColumns(this.activeRawFilters, this.columnDefs, this.translate, {
        company_id: (id: string) => companyName.get(id) ?? id.substring(0, 8),
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
      filter: toApiFilter<SupplierFilter>(this.activeRawFilters),
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
    this.svc.list(this.dto()).subscribe({
      next: res => {
        if (request !== this.request) return
        this.suppliers.set(res.data ?? [])
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
        this.suppliers.set([])
        this.loading.set(false)
      },
    })
  }

  // ── Row actions ───────────────────────────────────────────────────────────

  openRowMenu(event: Event, row: Supplier, menu: Menu): void {
    this.menuItems = [
      { label: this.translate.instant('buttons.edit'), icon: 'pi pi-pencil', command: () => this.edit(row) },
      {
        label: this.translate.instant(row.is_active ? 'suppliers.deactivate' : 'suppliers.activate'),
        icon: row.is_active ? 'pi pi-ban' : 'pi pi-check-circle',
        command: () => this.toggleActive(row),
      },
    ]
    menu.toggle(event)
  }

  private toggleActive(row: Supplier): void {
    this.svc.update(row.id, { ...this.inputOf(row), is_active: !row.is_active }).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: this.translate.instant('suppliers.saved') })
        this.load()
      },
      error: e => this.toast.add({ severity: 'error', summary: this.errorMessage(e) }),
    })
  }

  private inputOf(row: Supplier): SupplierInput {
    return {
      company_id: row.company_id,
      code: row.code ?? null,
      name: row.name,
      tax_id: row.tax_id ?? null,
      contact_name: row.contact_name ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      address: row.address ?? null,
      notes: row.notes ?? null,
      is_active: row.is_active,
    }
  }

  // ── Create / edit ─────────────────────────────────────────────────────────

  edit(row: Supplier | null): void {
    this.errors.set([])
    this.editingId.set(row?.id ?? null)
    const companies = this.companies()
    this.form = row
      ? {
          company_id: row.company_id,
          code: row.code ?? '',
          name: row.name,
          tax_id: row.tax_id ?? '',
          contact_name: row.contact_name ?? '',
          email: row.email ?? '',
          phone: row.phone ?? '',
          address: row.address ?? '',
          notes: row.notes ?? '',
          is_active: row.is_active,
        }
      : { ...EMPTY, company_id: companies.length === 1 ? companies[0].id : null }
    this.dialogVisible.set(true)
  }

  save(): void {
    if (this.saving() || !this.form.company_id || !this.form.name.trim()) return
    const email = this.form.email.trim()
    if (email && !EMAIL_RE.test(email)) {
      this.errors.set([this.translate.instant('suppliers.invalid_email')])
      return
    }
    const opt = (v: string): string | null => v.trim() || null
    const input: SupplierInput = {
      company_id: this.form.company_id,
      code: opt(this.form.code)?.toUpperCase() ?? null,
      name: this.form.name.trim(),
      tax_id: opt(this.form.tax_id),
      contact_name: opt(this.form.contact_name),
      email: email || null,
      phone: opt(this.form.phone),
      address: opt(this.form.address),
      notes: opt(this.form.notes),
      is_active: this.form.is_active,
    }
    const id = this.editingId()
    this.saving.set(true)
    this.errors.set([])
    const req$ = id ? this.svc.update(id, input) : this.svc.create(input)
    req$.subscribe({
      next: () => {
        this.saving.set(false)
        this.dialogVisible.set(false)
        this.toast.add({ severity: 'success', summary: this.translate.instant('suppliers.saved') })
        this.load()
      },
      error: e => {
        this.saving.set(false)
        this.errors.set([this.errorMessage(e)])
      },
    })
  }

  private errorMessage(err: unknown): string {
    const body = ((err as { error?: unknown })?.error ?? err) as {
      code?: string
      meta?: { field?: string }
      errors?: Array<{ field: string; rule: string }>
    }
    if (body?.code === 'SUPPLIER_DUPLICATE') {
      return this.translate.instant(body.meta?.field === 'code' ? 'suppliers.duplicate_code' : 'suppliers.duplicate_name')
    }
    if (body?.errors?.length) {
      return body.errors
        .map(d => `${this.translate.instant('suppliers.' + d.field)}: ${this.translate.instant('forms_validation.' + d.rule)}`)
        .join(' · ')
    }
    return resolveErrorMessage(err, this.translate)
  }
}
