import { FacilityDatePipe } from '@/app/shared/pipes/facility-date.pipe'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core'
import { DecimalPipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { DatePickerModule } from 'primeng/datepicker'
import { DrawerModule } from 'primeng/drawer'
import { IconFieldModule } from 'primeng/iconfield'
import { InputIconModule } from 'primeng/inputicon'
import { InputTextModule } from 'primeng/inputtext'
import { SelectModule } from 'primeng/select'
import { TableLazyLoadEvent, TableModule } from 'primeng/table'
import { TabsModule } from 'primeng/tabs'
import { TagModule } from 'primeng/tag'
import { TooltipModule } from 'primeng/tooltip'
import { MenuModule } from 'primeng/menu'
import { MenuItem } from 'primeng/api'
import { map, Subject, debounceTime } from 'rxjs'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TableExportService } from '@/app/shared/services/table-export.service'
import { ShColumnDef } from '@/app/shared/types/table.types'
import { TableExportFormat } from '@/app/shared/types/export.types'

import { AuthService } from '@/app/core/services/auth.service'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { scopeApiFilter, FACILITY_SCOPE_FIELD } from '@/app/shared/utils/facility-scope.util'
import { formatInZone, todayInZone, toApiDay } from '@/app/shared/utils/time-zone.util'
import { CostingCurrency, isOwnerRole } from '@/app/shared/utils/costing.util'
import { SalesService } from '../sales.service'
import {
  CashSession,
  ListConfig,
  PAYMENT_KINDS,
  PaymentKind,
  PriceList,
  Sale,
  SaleDetail,
  SaleFilter,
  SaleTotals,
  SessionFilter,
  SessionScope,
  SessionStatus,
  SessionSummary,
} from '../sales.types'
import { kindIcon, money, salesErrorMessages } from '../sales.util'
import { SessionSummaryViewComponent } from '../shared/session-summary-view.component'
import { CloseRegisterDialogComponent } from '../shared/close-register-dialog.component'
import { printLabels, printReceipt, printSessionReport, RECEIPT_KEYS, REPORT_KEYS } from '../shared/print.util'

const PAGE_SIZE = 25

function sortOf(e: TableLazyLoadEvent): ListConfig['sort_field'] {
  const field = typeof e.sortField === 'string' ? e.sortField : undefined
  return field ? [{ field, order: e.sortOrder ?? 1 }] : undefined
}


type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

/**
 * SalesHistoryComponent — every sale in detail, and the cash sessions.
 *
 * - Sales: KPIs per currency (never added across currencies), filters by date,
 *   payment kind, price list and text; the drawer shows lines, payments and,
 *   for OWNER, cost and margin per line (costs never reach other roles).
 * - Registers: shifts with expected vs counted cash; OWNER can close a drawer
 *   left open. Follows the global facility selector.
 */
@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [
    FacilityDatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    TranslateModule,
    ButtonModule,
    DatePickerModule,
    DrawerModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TabsModule,
    TagModule,
    TooltipModule,
    MenuModule,
    SessionSummaryViewComponent,
    CloseRegisterDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales-history.component.html',
})
export default class SalesHistoryComponent {
  private readonly svc = inject(SalesService)
  private readonly auth = inject(AuthService)
  private readonly translate = inject(TranslateService)
  readonly facilityScope = inject(FacilityScopeService)
  private readonly exportSvc = inject(TableExportService)
  /** True while an export is paging through the API */
  readonly exporting = this.exportSvc.exporting

  /** Typing in the search box reloads after a short pause (Enter still reloads at once) */
  private readonly searchInput$ = new Subject<string>()

  readonly exportItems: MenuItem[] = [
    { label: 'Excel (.xlsx)', icon: 'pi pi-file-excel', command: () => this.exportSales('xlsx') },
    { label: 'CSV (.csv)', icon: 'pi pi-file', command: () => this.exportSales('csv') },
  ]

  readonly isOwner = isOwnerRole(this.auth.getAuthUserInfo()?.role)
  readonly pageSize = PAGE_SIZE
  readonly activeTab = signal<'sales' | 'registers'>('sales')
  readonly showFacility = computed(() => !this.facilityScope.isSingle())

  readonly presetOptions: { value: Preset; label: string }[] = [
    { value: 'today', label: 'sales.history.today' },
    { value: 'yesterday', label: 'sales.history.yesterday' },
    { value: 'week', label: 'sales.history.last_7_days' },
    { value: 'month', label: 'sales.history.this_month' },
    { value: 'custom', label: 'sales.history.custom' },
  ]
  readonly kindOptions = PAYMENT_KINDS.map(k => ({ value: k, label: `sales.kinds.${k}` }))
  readonly priceListOptions = [
    { value: 'RETAIL', label: 'sales.pos.retail' },
    { value: 'WHOLESALE', label: 'sales.pos.wholesale' },
  ]
  readonly statusOptions = [
    { value: 'OPEN', label: 'sales.register.status_open' },
    { value: 'CLOSED', label: 'sales.register.status_closed' },
  ]

  readonly scopeOptions = [
    { value: 'FACILITY', label: 'sales.register.scope_facility' },
    { value: 'USER', label: 'sales.register.scope_user' },
  ]

  // ── Filters (shared date range) ──────────────────────────────────────────
  preset: Preset = 'today'
  range: Date[] | null = null
  search = ''
  kind: PaymentKind | null = null
  priceList: PriceList | null = null
  sessionStatus: SessionStatus | null = null
  sessionScope: SessionScope | null = null
  /** Set when drilling down from a register: only that session's sales. */
  readonly sessionFilter = signal<CashSession | null>(null)

  // ── Sales ────────────────────────────────────────────────────────────────
  readonly sales = signal<Sale[]>([])
  readonly totals = signal<SaleTotals[]>([])
  readonly count = signal(0)
  readonly loading = signal(false)
  private salesEvent: TableLazyLoadEvent = { first: 0, rows: PAGE_SIZE }

  readonly detail = signal<SaleDetail | null>(null)
  readonly detailLoading = signal(false)
  readonly detailError = signal<string[]>([])

  // ── Registers ────────────────────────────────────────────────────────────
  readonly sessions = signal<CashSession[]>([])
  readonly sessionCount = signal(0)
  readonly sessionLoading = signal(false)
  private sessionEvent: TableLazyLoadEvent = { first: 0, rows: PAGE_SIZE }

  readonly sessionDetail = signal<SessionSummary | null>(null)
  readonly sessionDetailLoading = signal(false)
  readonly closeVisible = signal(false)

  private scopeSeen = false

  constructor() {
    this.applyPreset()
    this.searchInput$.pipe(debounceTime(400), takeUntilDestroyed()).subscribe(() => this.reload())
    effect(() => {
      this.facilityScope.apiValue()
      untracked(() => {
        if (!this.scopeSeen) {
          this.scopeSeen = true
          return
        }
        this.reload()
      })
    })
  }

  // ── Filters ──────────────────────────────────────────────────────────────

  onPreset(p: Preset): void {
    this.preset = p
    if (p !== 'custom') {
      this.applyPreset()
      this.reload()
    }
  }

  private applyPreset(): void {
    // "Today" of the facilities in scope, not of the browser.
    const today = todayInZone(this.facilityScope.zone())
    const d = (offset: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
    switch (this.preset) {
      case 'today':
        this.range = [d(0), d(0)]
        break
      case 'yesterday':
        this.range = [d(-1), d(-1)]
        break
      case 'week':
        this.range = [d(-6), d(0)]
        break
      case 'month':
        this.range = [new Date(today.getFullYear(), today.getMonth(), 1), d(0)]
        break
    }
  }

  onRange(): void {
    this.preset = 'custom'
    // The picker emits after the first click too; wait for both ends.
    if (this.range && this.range[0] && this.range[1]) this.reload()
  }

  clearRange(): void {
    this.preset = 'custom'
    this.range = null
    this.reload()
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value)
  }

  reload(): void {
    if (this.activeTab() === 'sales') {
      this.salesEvent = { ...this.salesEvent, first: 0 }
      this.loadSales()
    } else {
      this.sessionEvent = { ...this.sessionEvent, first: 0 }
      this.loadSessions()
    }
  }

  onTab(v: string | number | undefined): void {
    const tab = v === 'registers' ? 'registers' : 'sales'
    this.activeTab.set(tab)
    this.reload()
  }

  private rangeFilter(fromKey: string, toKey: string): Record<string, { match_mode: string; value: string }> {
    const out: Record<string, { match_mode: string; value: string }> = {}
    const [from, to] = this.range ?? []
    // Days as yyyy-mm-dd: the backend takes each sale's day in the zone of
    // its own facility, inclusive on both ends.
    if (from) out[fromKey] = { match_mode: 'gte', value: toApiDay(from) }
    if (to ?? from) out[toKey] = { match_mode: 'lte', value: toApiDay((to ?? from)!) }
    return out
  }

  // ── Sales ────────────────────────────────────────────────────────────────

  /** The sales filter in effect (register or date range, search, kind, price list, facility scope). */
  private salesFilter(): SaleFilter {
    const session = this.sessionFilter()
    const filter: SaleFilter = session
      ? { session_id: { match_mode: 'equals', value: session.id } }
      : { ...this.rangeFilter('created_from', 'created_to') }
    const q = this.search.trim()
    if (q) filter.search = { match_mode: 'contains', value: q }
    if (this.kind) filter.payment_kind = { match_mode: 'in', value: [this.kind] }
    if (this.priceList) filter.price_list = { match_mode: 'equals', value: this.priceList }
    return scopeApiFilter(filter, this.facilityScope.apiValue(), { scopeField: FACILITY_SCOPE_FIELD })
  }

  /**
   * Every sale matching the current filters, as a file. Same columns as the
   * table; cost and margin only for OWNER; times in each sale's facility zone.
   */
  exportSales(format: TableExportFormat): void {
    const zone = (r: Sale) => this.facilityScope.zoneOf(r.facility_id)
    const columns: ShColumnDef[] = [
      { field: 'created_at', header: 'labels.timestamp', exportValue: (r: Sale) => formatInZone(r.created_at, 'yyyy-MM-dd HH:mm', zone(r)) },
      { field: 'sale_number', header: 'sales.history.sale' },
      ...(this.showFacility() ? [{ field: 'facility_name', header: 'labels.facility' }] : []),
      { field: 'user_name', header: 'sales.history.cashier' },
      { field: 'customer_name', header: 'sales.pos.customer', exportValue: (r: Sale) => r.customer_name || this.translate.instant('sales.pos.walk_in') },
      { field: 'customer_doc', header: 'sales.customers.doc' },
      { field: 'units', header: 'sales.pos.units' },
      { field: 'payment_kinds', header: 'sales.history.payment' },
      { field: 'currency', header: 'labels.currency' },
      { field: 'discount_total', header: 'sales.history.discounts' },
      { field: 'total', header: 'sales.pos.total' },
      ...(this.isOwner
        ? [
            { field: 'cost_total', header: 'sales.history.cost' },
            { field: 'margin', header: 'sales.history.margin' },
          ]
        : []),
    ]
    const sort = sortOf(this.salesEvent)
    void this.exportSvc.export<Sale>({
      filename: 'sales',
      format,
      columns,
      sheetName: this.translate.instant('pages.sales history'),
      fetchPage: (page, rows) =>
        this.svc
          .listSales(this.salesFilter(), { page, rows, sort_field: sort })
          .pipe(map(res => ({ data: res.data ?? [], total: res.meta_data?.total_records ?? 0 }))),
    })
  }

  onSalesLazy(e: TableLazyLoadEvent): void {
    this.salesEvent = e
    this.loadSales()
  }

  loadSales(): void {
    const e = this.salesEvent
    const rows = e.rows ?? PAGE_SIZE
    this.loading.set(true)
    this.svc
      .listSales(this.salesFilter(), {
        page: Math.floor((e.first ?? 0) / rows) + 1,
        rows,
        sort_field: sortOf(e),
      })
      .subscribe({
        next: res => {
          this.sales.set(res.data ?? [])
          this.totals.set(res.totals ?? [])
          this.count.set(res.meta_data?.total_records ?? 0)
          this.loading.set(false)
        },
        error: () => this.loading.set(false),
      })
  }

  openSale(row: Sale): void {
    this.detail.set({ ...row, items: [], payments: [] })
    this.detailLoading.set(true)
    this.detailError.set([])
    this.svc.getSale(row.id).subscribe({
      next: d => {
        this.detail.set(d)
        this.detailLoading.set(false)
      },
      error: err => {
        this.detailLoading.set(false)
        this.detailError.set(salesErrorMessages(err, this.translate))
      },
    })
  }

  closeSale(): void {
    this.detail.set(null)
  }

  printSale(): void {
    const d = this.detail()
    if (d) printReceipt(d, printLabels(RECEIPT_KEYS, k => this.translate.instant(k)), this.facilityScope.zoneOf(d.facility_id))
  }

  avgTicket(t: SaleTotals): number {
    return t.sales > 0 ? t.total / t.sales : 0
  }

  marginPct(t: SaleTotals): number | null {
    if (t.margin === null || t.margin === undefined || !t.costed_total) return null
    return (t.margin / t.costed_total) * 100
  }

  clearSessionFilter(): void {
    this.sessionFilter.set(null)
    this.reload()
  }

  // ── Registers ────────────────────────────────────────────────────────────

  onSessionsLazy(e: TableLazyLoadEvent): void {
    this.sessionEvent = e
    this.loadSessions()
  }

  loadSessions(): void {
    const e = this.sessionEvent
    const rows = e.rows ?? PAGE_SIZE
    const filter: SessionFilter = { ...this.rangeFilter('opened_from', 'opened_to') }
    if (this.sessionStatus) filter.status = { match_mode: 'equals', value: this.sessionStatus }
    if (this.sessionScope) filter.scope = { match_mode: 'equals', value: this.sessionScope }
    const q = this.search.trim()
    if (q) filter.session_number = { match_mode: 'contains', value: q }

    this.sessionLoading.set(true)
    this.svc
      .listSessions(scopeApiFilter(filter, this.facilityScope.apiValue(), { scopeField: FACILITY_SCOPE_FIELD }), {
        page: Math.floor((e.first ?? 0) / rows) + 1,
        rows,
        sort_field: sortOf(e),
      })
      .subscribe({
        next: res => {
          this.sessions.set(res.data ?? [])
          this.sessionCount.set(res.meta_data?.total_records ?? 0)
          this.sessionLoading.set(false)
        },
        error: () => this.sessionLoading.set(false),
      })
  }

  openSession(row: CashSession): void {
    this.sessionDetail.set(null)
    this.sessionDetailLoading.set(true)
    this.svc.sessionSummary(row.id).subscribe({
      next: s => {
        this.sessionDetail.set(s)
        this.sessionDetailLoading.set(false)
      },
      error: () => this.sessionDetailLoading.set(false),
    })
  }

  closeSessionDrawer(): void {
    this.sessionDetail.set(null)
    this.sessionDetailLoading.set(false)
  }

  sessionSales(s: CashSession): void {
    this.closeSessionDrawer()
    this.sessionFilter.set(s)
    this.activeTab.set('sales')
    this.salesEvent = { ...this.salesEvent, first: 0 }
    this.loadSales()
  }

  printSession(): void {
    const s = this.sessionDetail()
    if (s) printSessionReport(s, printLabels(REPORT_KEYS, k => this.translate.instant(k)), this.facilityScope.zoneOf(s.session.facility_id))
  }

  onSessionClosed(s: SessionSummary): void {
    this.sessionDetail.set(s)
    this.loadSessions()
  }

  // ── Formatting ───────────────────────────────────────────────────────────

  m(v: number | null | undefined, currency: CostingCurrency | string): string {
    return money(v, currency as CostingCurrency)
  }

  icon(kind: string): string {
    return kindIcon(kind)
  }

  diffClass(d: number | null): string {
    if (d === null) return ''
    return d < 0 ? 'text-red-600' : d > 0 ? 'text-orange-500' : 'text-green-600'
  }

  marginClass(v: number | null | undefined): string {
    if (v === null || v === undefined) return ''
    return v < 0 ? 'text-red-600' : 'text-green-600'
  }
}
