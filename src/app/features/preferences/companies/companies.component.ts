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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { InputTextModule } from 'primeng/inputtext'
import { Menu, MenuModule } from 'primeng/menu'
import { MessageModule } from 'primeng/message'
import { TooltipModule } from 'primeng/tooltip'

import { BaseDialog } from '@/app/shared/components'
import { BaseDataTable } from '@/app/shared/components/datatable/data-table/base-data-table.component'
import { FilterDateInputComponent } from '@/app/shared/components/filter-date-input/filter-date-input.component'
import { FilterTextInputComponent } from '@/app/shared/components/filter-text-input/filter-text-input.component'
import { resolveErrorMessage } from '@/app/shared/components/form/field-error/field-error.component'
import { DisplayDatePipe } from '@/app/shared/pipes/display-date.pipe'
import { TableStateService } from '@/app/shared/services/table-state.service'
import { ActiveFilterChip, ShColumnDef, ShPaginationConfig, ShTableEvent } from '@/app/shared/types/table.types'
import { buildFilterChipsFromColumns } from '@/app/shared/utils/filter-chips.util'
import { RawColumnFilter, toApiFilter, toListConfig } from '../../inbound/receivings/receivings-filter.util'
import { ColumnToggleComponent } from '../../shared/column-toggle/column-toggle.component'
import {
  persistedConfigOverrides,
  pickColumns,
  removedColumnFields,
  TranslatedColumnDef,
  translateColumnDefs,
} from '../../shared/list-columns.util'
import { CompanyService } from './companies.service'
import { Company, CompanyFilter, CompanyInput, CompanyListRequest } from './companies.types'

interface CompanyForm {
  name: string
  co_code: string
  tax_id: string
}

const EMPTY: CompanyForm = { name: '', co_code: '', tax_id: '' }
const ROWS_PER_PAGE = [15, 30, 50, 100]

/**
 * Companies (inventory owners) of the operator — OWNER only. Same
 * base-data-table as the other lists. The host company (packaging) is never
 * listed; a company with data, or the last one, cannot be deleted.
 */
@Component({
  selector: 'app-companies',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    ConfirmDialogModule,
    InputTextModule,
    MenuModule,
    MessageModule,
    TooltipModule,
    BaseDialog,
    BaseDataTable,
    ColumnToggleComponent,
    DisplayDatePipe,
    FilterDateInputComponent,
    FilterTextInputComponent,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './companies.component.html',
})
export default class CompaniesComponent implements OnInit {
  private readonly svc = inject(CompanyService)
  private readonly translate = inject(TranslateService)
  private readonly toast = inject(MessageService)
  private readonly confirm = inject(ConfirmationService)
  private readonly tableState = inject(TableStateService)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly STATE_KEY = 'logic:companies'

  @ViewChild(BaseDataTable) private readonly baseTable?: BaseDataTable

  // ── List state ────────────────────────────────────────────────────────────
  readonly companies = signal<Company[]>([])
  readonly loading = signal(false)
  readonly pagination = signal<ShPaginationConfig>({ page: 1, limit: 15, total: 0, rows_per_page: ROWS_PER_PAGE })
  private readonly dto = signal<CompanyListRequest>({ filter: {}, config: { page: 1, rows: 15, sort_field: [] } })
  private request = 0

  // ── Filters ───────────────────────────────────────────────────────────────
  activeFilters = signal<ActiveFilterChip[]>([])
  protected activeRawFilters: Record<string, RawColumnFilter> = {}

  // ── Columns ───────────────────────────────────────────────────────────────
  readonly columnDefs: ShColumnDef[] = (<ShColumnDef[]>[
    { field: 'name',       header: 'companies.name',    width: '18rem', sortable: true, filterable: true, filterType: 'text', mobileVisible: true, mobileLabel: true },
    { field: 'co_code',    header: 'companies.co_code', width: '9rem',  sortable: true, filterable: true, filterType: 'text', mobileVisible: true },
    { field: 'tax_id',     header: 'companies.tax_id',  width: '12rem', sortable: true, filterable: true, filterType: 'text' },
    { field: 'created_at', header: 'labels.created_at', width: '12rem', sortable: true, filterable: true, filterType: 'date' },
  ]).map(c => ({ ...c, template: c.field }))
  selectedCols: ShColumnDef[] = this.columnDefs.filter(c => c.visible !== false)
  translatedColumnDefs: TranslatedColumnDef[] = []

  // ── Row menu / dialog ─────────────────────────────────────────────────────
  menuItems: MenuItem[] = []
  readonly dialogVisible = signal(false)
  readonly editingId = signal<string | null>(null)
  readonly saving = signal(false)
  readonly errors = signal<string[]>([])
  form: CompanyForm = { ...EMPTY }

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

  // ── Filters ───────────────────────────────────────────────────────────────

  /** Only text and date filters on this page. */
  getActiveFilterValue(field: string): string | Date | null {
    return (this.activeRawFilters[field]?.value as string | Date | null | undefined) ?? null
  }

  getActiveFilterMatchMode(field: string): string | null {
    return this.activeRawFilters[field]?.matchMode ?? null
  }

  /** Text/date inputs emit { value, matchMode }. */
  onColumnFilterChange(field: string, event: unknown): void {
    if (!this.columnDefs.some(c => c.field === field)) return
    const filters = { ...this.activeRawFilters }
    const value = event && typeof event === 'object' && 'value' in event ? (event as { value: unknown }).value : event
    if (value === null || value === undefined || value === '') {
      delete filters[field]
    } else {
      const mode = event && typeof event === 'object' && 'matchMode' in event ? (event as { matchMode: string }).matchMode : null
      filters[field] = { value, matchMode: mode ?? 'contains' }
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
      filter: toApiFilter<CompanyFilter>(merged),
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

  private applyRawFilters(filters: Record<string, RawColumnFilter>): void {
    this.activeRawFilters = filters
    this.buildFilterChips()
    this.dto.update(d => ({ filter: toApiFilter<CompanyFilter>(filters), config: { ...d.config, page: 1 } }))
    this.saveState()
  }

  private buildFilterChips(): void {
    this.activeFilters.set(buildFilterChipsFromColumns(this.activeRawFilters, this.columnDefs, this.translate, {}))
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private restoreSavedState(): void {
    const saved = this.tableState.load(this.STATE_KEY)
    if (!saved) return
    const known = new Set(this.columnDefs.map(c => c.field))
    const raw = (saved.filters ?? {}) as Record<string, RawColumnFilter>
    this.activeRawFilters = Object.fromEntries(Object.entries(raw).filter(([f]) => known.has(f)))
    this.dto.update(d => ({
      filter: toApiFilter<CompanyFilter>(this.activeRawFilters),
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
        this.companies.set(res.data ?? [])
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
        this.companies.set([])
        this.loading.set(false)
      },
    })
  }

  // ── Row actions ───────────────────────────────────────────────────────────

  openRowMenu(event: Event, row: Company, menu: Menu): void {
    this.menuItems = [
      { label: this.translate.instant('buttons.edit'), icon: 'pi pi-pencil', command: () => this.edit(row) },
      { label: this.translate.instant('buttons.delete'), icon: 'pi pi-trash', command: () => this.remove(row) },
    ]
    menu.toggle(event)
  }

  private remove(row: Company): void {
    this.confirm.confirm({
      header: this.translate.instant('companies.delete_header'),
      message: this.translate.instant('companies.delete_message', { name: row.name }),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { label: this.translate.instant('buttons.delete'), severity: 'danger' },
      rejectButtonProps: { label: this.translate.instant('buttons.cancel'), severity: 'secondary', outlined: true },
      accept: () =>
        this.svc.delete(row.id).subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: this.translate.instant('companies.deleted') })
            this.load()
          },
          error: e => this.toast.add({ severity: 'warn', summary: this.errorMessage(e), life: 6000 }),
        }),
    })
  }

  // ── Create / edit ─────────────────────────────────────────────────────────

  edit(row: Company | null): void {
    this.errors.set([])
    this.editingId.set(row?.id ?? null)
    this.form = row ? { name: row.name, co_code: row.co_code ?? '', tax_id: row.tax_id ?? '' } : { ...EMPTY }
    this.dialogVisible.set(true)
  }

  save(): void {
    if (this.saving() || !this.form.name.trim()) return
    const opt = (v: string): string | null => v.trim() || null
    const input: CompanyInput = {
      name: this.form.name.trim(),
      co_code: opt(this.form.co_code)?.toUpperCase() ?? null,
      tax_id: opt(this.form.tax_id),
    }
    const id = this.editingId()
    this.saving.set(true)
    this.errors.set([])
    const req$ = id ? this.svc.update(id, input) : this.svc.create(input)
    req$.subscribe({
      next: () => {
        this.saving.set(false)
        this.dialogVisible.set(false)
        this.toast.add({ severity: 'success', summary: this.translate.instant('companies.saved') })
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
    switch (body?.code) {
      case 'COMPANY_DUPLICATE':
        return this.translate.instant(body.meta?.field === 'co_code' ? 'companies.duplicate_code' : 'companies.duplicate_name')
      case 'COMPANY_IN_USE':
        return this.translate.instant('companies.in_use')
      case 'COMPANY_LAST_ONE':
        return this.translate.instant('companies.last_one')
    }
    if (body?.errors?.length) {
      return body.errors
        .map(d => `${this.translate.instant('companies.' + d.field)}: ${this.translate.instant('forms_validation.' + d.rule)}`)
        .join(' · ')
    }
    return resolveErrorMessage(err, this.translate)
  }
}
