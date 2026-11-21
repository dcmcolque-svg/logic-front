import { FacilityDatePipe } from '@/app/shared/pipes/facility-date.pipe'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core'
import { DatePipe, DecimalPipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { DrawerModule } from 'primeng/drawer'
import { InputTextModule } from 'primeng/inputtext'
import { SelectModule } from 'primeng/select'
import { TableLazyLoadEvent, TableModule } from 'primeng/table'
import { TabsModule } from 'primeng/tabs'
import { TagModule } from 'primeng/tag'
import { TooltipModule } from 'primeng/tooltip'
import { MenuModule } from 'primeng/menu'
import { MenuItem } from 'primeng/api'
import { debounceTime, map, Subject } from 'rxjs'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TableExportService } from '@/app/shared/services/table-export.service'
import { ShColumnDef } from '@/app/shared/types/table.types'
import { TableExportFormat } from '@/app/shared/types/export.types'
import { formatInZone } from '@/app/shared/utils/time-zone.util'

import { AuthService } from '@/app/core/services/auth.service'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { scopeApiFilter, FACILITY_SCOPE_FIELD } from '@/app/shared/utils/facility-scope.util'
import {
  COSTING_CURRENCIES,
  CostingCurrency,
  CostingMethod,
  formatCost,
  isOwnerRole,
} from '@/app/shared/utils/costing.util'
import { ValuationService } from './valuation.service'
import {
  BalanceFilter,
  BalanceItem,
  CurrencyTotal,
  LayerItem,
  ValuationConfig,
  VarianceFilter,
  VarianceItem,
  VarianceKind,
  VarianceTotal,
} from './valuation.types'

const PAGE_SIZE = 25

/** One API sort field from PrimeNG's lazy event; undefined keeps the backend default. */
function sortOf(e: TableLazyLoadEvent): ValuationConfig['sort_field'] {
  const field = typeof e.sortField === 'string' ? e.sortField : undefined
  return field ? [{ field, order: e.sortOrder ?? 1 }] : undefined
}

/**
 * ValuationComponent — inventory valued at cost (costing phase 5), OWNER only.
 *
 * - Stock tab: valued stock per facility + SKU with totals per currency (never
 *   added across currencies). FIFO rows open their cost layers.
 * - Variances tab: STANDARD purchase variances and revaluations.
 * Follows the global facility selector like every other list.
 */
@Component({
  selector: 'app-valuation',
  standalone: true,
  imports: [
    FacilityDatePipe,
    DatePipe,
    DecimalPipe,
    FormsModule,
    TranslateModule,
    ButtonModule,
    DrawerModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TabsModule,
    TagModule,
    TooltipModule,
    MenuModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './valuation.component.html',
})
export default class ValuationComponent {
  private readonly svc = inject(ValuationService)
  private readonly auth = inject(AuthService)
  private readonly translate = inject(TranslateService)
  private readonly facilityScope = inject(FacilityScopeService)
  private readonly exportSvc = inject(TableExportService)
  /** True while an export is paging through the API */
  readonly exporting = this.exportSvc.exporting

  /** Typing in the SKU box reloads after a short pause (Enter still reloads at once) */
  private readonly balanceSku$ = new Subject<string>()

  readonly exportItems: MenuItem[] = [
    { label: 'Excel (.xlsx)', icon: 'pi pi-file-excel', command: () => this.exportBalances('xlsx') },
    { label: 'CSV (.csv)', icon: 'pi pi-file', command: () => this.exportBalances('csv') },
  ]

  readonly isOwner = isOwnerRole(this.auth.getAuthUserInfo()?.role)
  readonly pageSize = PAGE_SIZE
  activeTab = signal<'stock' | 'variances'>('stock')

  readonly methodOptions = (['AVERAGE', 'SPECIFIC', 'FIFO', 'STANDARD'] as CostingMethod[]).map(m => ({
    value: m,
    label: `preferences.facilities.costing_method_${m.toLowerCase()}`,
  }))
  readonly currencyOptions = COSTING_CURRENCIES.map(c => ({ value: c, label: c }))
  readonly kindOptions = (['PURCHASE', 'REVALUATION'] as VarianceKind[]).map(k => ({
    value: k,
    label: `valuation.kind_${k.toLowerCase()}`,
  }))

  // ── Stock (balances) ──────────────────────────────────────────────────────
  balances = signal<BalanceItem[]>([])
  balanceTotals = signal<CurrencyTotal[]>([])
  balanceCount = signal(0)
  balanceLoading = signal(false)
  balanceSku = ''
  balanceMethod: CostingMethod | null = null
  balanceCurrency: CostingCurrency | null = null
  private balanceEvent: TableLazyLoadEvent = { first: 0, rows: PAGE_SIZE }

  // ── Variances ─────────────────────────────────────────────────────────────
  variances = signal<VarianceItem[]>([])
  varianceTotals = signal<VarianceTotal[]>([])
  varianceCount = signal(0)
  varianceLoading = signal(false)
  varianceSku = ''
  varianceKind: VarianceKind | null = null
  private varianceEvent: TableLazyLoadEvent = { first: 0, rows: PAGE_SIZE }

  // ── FIFO layers drawer ────────────────────────────────────────────────────
  layersOf = signal<BalanceItem | null>(null)
  layers = signal<LayerItem[]>([])
  layersLoading = signal(false)
  layersTotal = computed(() => this.layers().reduce((s, l) => s + l.value, 0))

  /** The tables' first lazy load does the initial fetch; the effect only reloads on scope changes. */
  private scopeSeen = false

  constructor() {
    this.balanceSku$.pipe(debounceTime(400), takeUntilDestroyed()).subscribe(() => this.applyBalanceFilters())
    // The global facility selector narrows both tabs; reload on change.
    effect(() => {
      this.facilityScope.apiValue()
      untracked(() => {
        if (!this.scopeSeen) {
          this.scopeSeen = true
          return
        }
        if (!this.isOwner) return
        this.loadBalances()
        if (this.activeTab() === 'variances') this.loadVariances()
      })
    })
  }

  onTabChange(value: string | number | undefined): void {
    const tab = value === 'variances' ? 'variances' : 'stock'
    this.activeTab.set(tab)
    if (tab === 'variances' && this.variances().length === 0) this.loadVariances()
  }

  // ── Balances ──────────────────────────────────────────────────────────────

  onBalanceLazyLoad(e: TableLazyLoadEvent): void {
    this.balanceEvent = e
    this.loadBalances()
  }

  onBalanceSkuInput(value: string): void {
    this.balanceSku$.next(value)
  }

  /** The stock filter in effect (SKU, method, currency, facility scope). */
  private balanceFilter(): BalanceFilter {
    const filter: BalanceFilter = {}
    const sku = this.balanceSku.trim()
    if (sku) filter.sku = { match_mode: 'contains', value: sku }
    if (this.balanceMethod) filter.method = { match_mode: 'equals', value: this.balanceMethod }
    if (this.balanceCurrency) filter.currency = { match_mode: 'equals', value: this.balanceCurrency }
    return scopeApiFilter(filter, this.facilityScope.apiValue(), { scopeField: FACILITY_SCOPE_FIELD })
  }

  /** Every stock row matching the current filters, valued at cost, as a file (OWNER only page). */
  exportBalances(format: TableExportFormat): void {
    const columns: ShColumnDef[] = [
      { field: 'facility_name', header: 'labels.facility' },
      { field: 'sku', header: 'labels.sku' },
      { field: 'sku_name', header: 'labels.description' },
      { field: 'company_name', header: 'labels.company' },
      {
        field: 'method',
        header: 'preferences.facilities.costing_method',
        exportValue: (r: BalanceItem) => this.translate.instant('preferences.facilities.costing_method_' + String(r.method).toLowerCase()),
      },
      { field: 'currency', header: 'labels.currency' },
      { field: 'qty', header: 'labels.quantity' },
      { field: 'avg_cost', header: 'labels.unit_cost' },
      { field: 'total_value', header: 'labels.cost_value' },
      { field: 'last_cost', header: 'valuation.last_cost' },
      {
        field: 'updated_at',
        header: 'valuation.updated_at',
        exportValue: (r: BalanceItem) => formatInZone(r.updated_at, 'yyyy-MM-dd HH:mm', this.facilityScope.zoneOf(r.facility_id)),
      },
    ]
    const sort = sortOf(this.balanceEvent)
    void this.exportSvc.export<BalanceItem>({
      filename: 'inventory_valuation',
      format,
      columns,
      sheetName: this.translate.instant('pages.valuation'),
      fetchPage: (page, rows) =>
        this.svc
          .listBalances(this.balanceFilter(), { page, rows, sort_field: sort })
          .pipe(map(res => ({ data: res.data ?? [], total: res.meta_data?.total_records ?? 0 }))),
    })
  }

  applyBalanceFilters(): void {
    this.balanceEvent = { ...this.balanceEvent, first: 0 }
    this.loadBalances()
  }

  loadBalances(): void {
    if (!this.isOwner) return
    const e = this.balanceEvent
    const rows = e.rows ?? PAGE_SIZE
    this.balanceLoading.set(true)
    this.svc
      .listBalances(this.balanceFilter(), {
        page: Math.floor((e.first ?? 0) / rows) + 1,
        rows,
        sort_field: sortOf(e),
      })
      .subscribe({
        next: res => {
          this.balances.set(res.data ?? [])
          this.balanceTotals.set(res.totals ?? [])
          this.balanceCount.set(res.meta_data?.total_records ?? 0)
          this.balanceLoading.set(false)
        },
        error: () => this.balanceLoading.set(false),
      })
  }

  // ── Variances ─────────────────────────────────────────────────────────────

  onVarianceLazyLoad(e: TableLazyLoadEvent): void {
    this.varianceEvent = e
    this.loadVariances()
  }

  applyVarianceFilters(): void {
    this.varianceEvent = { ...this.varianceEvent, first: 0 }
    this.loadVariances()
  }

  loadVariances(): void {
    if (!this.isOwner) return
    const e = this.varianceEvent
    const rows = e.rows ?? PAGE_SIZE
    const filter: VarianceFilter = {}
    const sku = this.varianceSku.trim()
    if (sku) filter.sku = { match_mode: 'contains', value: sku }
    if (this.varianceKind) filter.kind = { match_mode: 'equals', value: this.varianceKind }

    this.varianceLoading.set(true)
    this.svc
      .listVariances(scopeApiFilter(filter, this.facilityScope.apiValue(), { scopeField: FACILITY_SCOPE_FIELD }), {
        page: Math.floor((e.first ?? 0) / rows) + 1,
        rows,
        sort_field: sortOf(e),
      })
      .subscribe({
        next: res => {
          this.variances.set(res.data ?? [])
          this.varianceTotals.set(res.totals ?? [])
          this.varianceCount.set(res.meta_data?.total_records ?? 0)
          this.varianceLoading.set(false)
        },
        error: () => this.varianceLoading.set(false),
      })
  }

  // ── FIFO layers ───────────────────────────────────────────────────────────

  openLayers(row: BalanceItem): void {
    this.layersOf.set(row)
    this.layers.set([])
    this.layersLoading.set(true)
    this.svc.listLayers(row.facility_id, row.sku_id).subscribe({
      next: res => {
        this.layers.set(res.data ?? [])
        this.layersLoading.set(false)
      },
      error: () => this.layersLoading.set(false),
    })
  }

  closeLayers(): void {
    this.layersOf.set(null)
  }

  // ── Formatting ────────────────────────────────────────────────────────────

  cost(value: number | null | undefined, currency: CostingCurrency): string {
    return formatCost(value, currency)
  }

  methodSeverity(method: CostingMethod): 'info' | 'success' | 'warn' | 'secondary' {
    switch (method) {
      case 'AVERAGE':
        return 'info'
      case 'FIFO':
        return 'success'
      case 'STANDARD':
        return 'warn'
      default:
        return 'secondary'
    }
  }
}
