import {
  Component,
  effect,
  inject,
  OnInit,
  signal,
  computed,
  untracked,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ToastModule } from 'primeng/toast'
import { SelectModule } from 'primeng/select'
import { SelectButton } from 'primeng/selectbutton'
import { DatePickerModule } from 'primeng/datepicker'
import { ButtonModule } from 'primeng/button'
import { TooltipModule } from 'primeng/tooltip'
import { Skeleton } from 'primeng/skeleton'
import { TableModule } from 'primeng/table'
import { Tag } from 'primeng/tag'
import { ProgressBar } from 'primeng/progressbar'
import { ChartModule } from 'primeng/chart'
import { SalesService } from '@/app/features/sales/sales.service'
import { SalesDashboardSummary } from '@/app/features/sales/sales.types'
import { LayoutService } from '@/app/layout/service/layout.service'
import { MessageService } from 'primeng/api'

import { ParcelService } from '@/app/features/parcels/parcel.service'
import {
  ParcelDashboardSummary,
  ParcelShippedSummary,
  ParcelShipPreparedSummary,
  OrderDashboardSummary,
  OrdersShippedSummary,
  AlertsSummary,
  InventoryDashboardSummary,
  LocationDashboardSummary,
  BestSellingItem,
  CurrencyAmount,
} from '@/app/features/parcels/types/parcel.types'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { AuthService } from '@/app/core/services/auth.service'
import { CostingCurrency, formatCost } from '@/app/shared/utils/costing.util'
import { NO_FACILITY_ID, ScopeFacility } from '@/app/core/types/facility.types'
import { todayInZone, toApiDay } from '@/app/shared/utils/time-zone.util'
import { formatDisplayNumber } from '@/app/shared/utils/display-format'

// Sentinel: "no local narrowing" — falls back to whatever the topbar has in scope.
const ALL_FACILITIES: ScopeFacility = {
  id: '',
  name: 'all_facilities_sentinel',
  is_active: true,
}

// Shown, locked, while the topbar scope is only "No facility".
const NO_FACILITY: ScopeFacility = {
  id: NO_FACILITY_ID,
  name: 'no_facility_sentinel',
  is_active: true,
}

const EMPTY_SUMMARY: ParcelDashboardSummary = {
  shipped: { total: 0, deliveries: 0, customer_pickups: 0 },
  ship_prepared: { total: 0, ready: 0, missing_data: 0 },
}

const EMPTY_ORDER_SUMMARY: OrderDashboardSummary = {
  orders_shipped: { orders_shipped: 0, total_revenue: 0 },
  alerts: { back_orders: 0, low_inventory: 0 },
}

const EMPTY_INVENTORY_SUMMARY: InventoryDashboardSummary = {
  total_value: 0,
  skus: 0,
  units: 0,
  trace_cards: 0,
}

const EMPTY_LOCATIONS_SUMMARY: LocationDashboardSummary = {
  zones: 0,
  locations: 0,
  bins: 0,
}

// ── Date range types ──────────────────────────────────────────────

/** Date range preset option for the period selector */
export interface DateRangeOption {
  labelKey: string  // i18n translation key
  shortKey: string  // short i18n label for the period toggle
  icon: string      // PrimeIcons class
  days: number      // number of days to look back
}

/** Available period presets — only two options as per business requirement */
export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { labelKey: 'dashboard.date_7d',  shortKey: 'dashboard.date_7d_short',  icon: 'pi pi-calendar', days: 7  },
  { labelKey: 'dashboard.date_30d', shortKey: 'dashboard.date_30d_short', icon: 'pi pi-calendar', days: 30 },
  { labelKey: 'dashboard.date_custom', shortKey: 'dashboard.date_custom_short', icon: 'pi pi-calendar-plus', days: -1 },
]

/**
 * sessionStorage key for the header filters, scoped per uid. Session, not
 * local: a reload (F5) keeps the filters, but a custom range picked days ago
 * does not come back on its own.
 */
const FILTERS_STORAGE_KEY = 'dashboard-filters'

/** Quick action shortcut; shown only when the user has the matching menu activity. */
interface QuickAction {
  /** Menu label (app.menu.config) — the same name activities are matched by. */
  activity: string
  labelKey: string
  icon: string
  route: string
}

/** Activities that can read the sales dashboard endpoint (seed 20261119000200). */
const SALES_ACTIVITIES = ['point of sale', 'sales history']

/** Change against the previous period. */
export interface Delta {
  /** Rounded percent; null when the previous period had nothing (no base to compare). */
  pct: number | null
  dir: 'up' | 'down' | 'flat'
}

/** Change of `cur` against `prev`; null when there is no previous period. */
export function deltaOf(cur: number, prev: number | null | undefined): Delta | null {
  if (prev === null || prev === undefined) return null
  if (cur === prev) return { pct: 0, dir: 'flat' }
  const dir = cur > prev ? 'up' : 'down'
  if (prev === 0) return { pct: null, dir }
  return { pct: Math.round(((cur - prev) / Math.abs(prev)) * 100), dir }
}

/** Every yyyy-mm-dd day from `from` to `to`, both inclusive (calendar days, no zone math). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** Chart metric: orders shipped, or POS sales of one currency. */
export type ChartMetric = 'orders' | `sales:${CostingCurrency}`

const QUICK_ACTIONS: QuickAction[] = [
  { activity: 'point of sale', labelKey: 'dashboard.qa_new_sale',   icon: 'pi pi-shopping-cart', route: '/app/sales/pos' },
  { activity: 'receivings',    labelKey: 'dashboard.qa_receivings', icon: 'pi pi-download',      route: '/app/inbound/receivings' },
  { activity: 'tracecards',    labelKey: 'dashboard.qa_inventory',  icon: 'pi pi-box',           route: '/app/inventory/tracecards' },
  { activity: 'all orders',    labelKey: 'dashboard.qa_orders',     icon: 'pi pi-list',          route: '/app/outbound/allorders' },
]

interface PersistedFilters {
  days: number
  /** Custom range as local yyyy-mm-dd; `to` absent while half-picked. */
  from?: string
  to?: string
  facilityId?: string
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ToastModule,
    SelectModule,
    SelectButton,
    DatePickerModule,
    ButtonModule,
    TooltipModule,
    Skeleton,
    TableModule,
    Tag,
    ProgressBar,
    ChartModule,
  ],
  providers: [MessageService],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly parcelService   = inject(ParcelService)
  private readonly facilityScope = inject(FacilityScopeService)
  private readonly messageService  = inject(MessageService)
  private readonly router = inject(Router)
  private readonly auth = inject(AuthService)
  private readonly translate = inject(TranslateService)
  private readonly salesService = inject(SalesService)
  private readonly isDark = inject(LayoutService).isDarkTheme

  private readonly activities = new Set(
    (this.auth.getActivities() ?? []).map((a) => a.activity.toLowerCase())
  )

  /** The user can read sales: the dashboard requests and shows them only then. */
  readonly canSeeSales = SALES_ACTIVITIES.some((a) => this.activities.has(a))

  /** Name for the greeting; empty when unknown. */
  readonly userName = this.auth.getAuthUserInfo()?.user_name ?? ''

  /** Shortcuts the user can actually open (matched against their activities). */
  /** "View all" on the warehouse card opens Locations: only for users with that activity (or no activity list). */
  readonly canSeeLocations =
    this.activities.size === 0 || this.activities.has('locations & bins')

  readonly quickActions: QuickAction[] = QUICK_ACTIONS.filter((qa) => this.activities.has(qa.activity))

  // ── Facility selector ────────────────────────────────────────
  // Narrows to ONE of the facilities the topbar already has in scope; it never
  // reaches outside it. Options used to come from a private listMyFacilities()
  // call, which is why this select kept offering facilities the global selector
  // had excluded.
  loadingFacilities = this.facilityScope.loading
  selectedFacility  = signal<ScopeFacility>(ALL_FACILITIES)
  protected readonly noFacilityId = NO_FACILITY_ID

  /**
   * True when the topbar has only "No facility" ticked. These endpoints take
   * one facility id and have no metrics for records without one: sending none
   * would answer for every facility, the opposite of what the topbar says. So
   * nothing is requested, and the page says why.
   */
  readonly noFacilityOnly = computed(() => {
    const ids = this.facilityScope.selectedIds()
    return !this.facilityScope.isAll() && ids.length > 0 && ids.every((id) => id === NO_FACILITY_ID)
  })

  /** What the select shows: "No facility" while that is the whole scope. */
  readonly shownFacility = computed(() =>
    this.noFacilityOnly() ? NO_FACILITY : this.selectedFacility()
  )

  /**
   * Options: the "all" sentinel plus the facilities in scope.
   *
   * "All" here means all of the topbar's scope, not every facility the user
   * can reach: see `requestedFacilityIds`. It is dropped when the scope is a
   * single facility, since there is nothing to choose.
   *
   * Counts real facilities, not `isSingle()`: the topbar's "No facility" entry
   * has no metrics here (these endpoints take one facility id), so
   * "No facility" + one facility still pins to that facility.
   */
  readonly facilitiesWithAll = computed<ScopeFacility[]>(() => {
    if (this.noFacilityOnly()) return [NO_FACILITY]
    const inScope = this.facilityScope.inScope()
    if (inScope.length === 1) return inScope
    return [ALL_FACILITIES, ...inScope]
  })

  /**
   * Zone in which the period's days start: the picked facility's, or the zone
   * of the topbar scope when "all" is picked.
   */
  private facilityScopeZone(): string {
    const picked = this.selectedFacility()
    return picked.id && picked.id !== ALL_FACILITIES.id && picked.id !== NO_FACILITY_ID
      ? this.facilityScope.zoneOf(picked.id)
      : this.facilityScope.zone()
  }

  /** Nothing to choose when the topbar already pinned a single facility, or none. */
  readonly facilitySelectDisabled = computed(
    () => this.noFacilityOnly() || this.facilityScope.inScope().length === 1
  )

  // ── Period selector (7 days | 30 days | custom) ──────────────
  readonly dateRangeOptions = DATE_RANGE_OPTIONS
  selectedDateRange = signal<DateRangeOption>(DATE_RANGE_OPTIONS[0]) // default: last 7 days

  // ── Custom date range ────────────────────────────────────────
  /** Whether the custom range picker is shown */
  isCustomRange = computed(() => this.selectedDateRange().days === -1)
  /** The custom range value [from, to] */
  customRangeDates = signal<Date[] | null>(null)
  /** Min date: 1st day of the previous month */
  readonly minDate = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1, 1) // previous month, day 1
    d.setHours(0, 0, 0, 0)
    return d
  })()
  /** Max date: today */
  readonly maxDate = (() => {
    const d = new Date()
    d.setHours(23, 59, 59, 999)
    return d
  })()

  // ── Summary state ────────────────────────────────────────────
  /** Orders summary (revenue, orders shipped, alerts) in flight. */
  loading = signal(true)
  loadingInventory = signal(true)
  loadingLocations = signal(true)
  loadingBestSelling = signal(true)
  loadingSales = signal(this.canSeeSales)

  /** Per-card load failures: the card shows "Couldn't load · Retry" instead of zeros. */
  readonly loadErrors = signal<Record<'sales' | 'orders' | 'inventory' | 'locations' | 'bestSelling', boolean>>({
    sales: false, orders: false, inventory: false, locations: false, bestSelling: false,
  })

  private markError(key: 'sales' | 'orders' | 'inventory' | 'locations' | 'bestSelling', value = true): void {
    this.loadErrors.update((e) => ({ ...e, [key]: value }))
  }

  /** Any block still loading: drives the refresh button spinner. */
  readonly anyLoading = computed(
    () => this.loading() || this.loadingInventory() || this.loadingLocations() ||
      this.loadingBestSelling() || this.loadingSales()
  )

  // ── Sales (POS) ──────────────────────────────────────────────
  salesSummary = signal<SalesDashboardSummary | null>(null)

  /** Days of the period on screen, for the chart's x axis. */
  readonly periodDays = signal<string[]>([])

  // ── Chart ────────────────────────────────────────────────────
  /** Metric picked by the user; null until they pick one (then the first option shows). */
  readonly chartMetric = signal<ChartMetric | null>(null)

  /** Sales of each currency with sales, then orders shipped. */
  readonly chartMetricOptions = computed(() => {
    const currencies = new Set<CostingCurrency>()
    this.salesSummary()?.currencies.forEach((c) => c.sales > 0 && currencies.add(c.currency))
    this.salesSummary()?.daily.forEach((p) => currencies.add(p.currency))
    return [
      ...[...currencies].sort().map((c) => ({
        value: `sales:${c}` as ChartMetric,
        labelKey: 'dashboard.chart_sales',
        currency: c as CostingCurrency | null,
      })),
      { value: 'orders' as ChartMetric, labelKey: 'dashboard.chart_orders', currency: null as CostingCurrency | null },
    ]
  })

  /** The picked metric while it is still offered, else the first option (sales first). */
  readonly activeMetric = computed<ChartMetric>(() => {
    const opts = this.chartMetricOptions()
    const picked = this.chartMetric()
    return picked && opts.some((o) => o.value === picked) ? picked : opts[0].value
  })

  /** One value per day of the period: a day without data is 0, not a gap. */
  private readonly chartValues = computed(() => {
    const metric = this.activeMetric()
    const byDay = new Map<string, number>()
    if (metric === 'orders') {
      this.orderSummary().daily?.forEach((p) => byDay.set(p.day, p.orders))
    } else {
      const currency = metric.slice('sales:'.length)
      this.salesSummary()?.daily
        .filter((p) => p.currency === currency)
        .forEach((p) => byDay.set(p.day, p.total))
    }
    return this.periodDays().map((day) => byDay.get(day) ?? 0)
  })

  readonly chartHasData = computed(() => this.chartValues().some((v) => v > 0))

  readonly chartData = computed(() => {
    this.isDark() // re-read the theme colors when it flips
    const css = getComputedStyle(document.documentElement)
    const primary = css.getPropertyValue('--p-primary-color').trim() || '#3B82F6'
    return {
      labels: this.periodDays().map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`),
      datasets: [{
        data: this.chartValues(),
        backgroundColor: primary,
        hoverBackgroundColor: primary,
        borderRadius: 4,
        borderSkipped: 'bottom',
        maxBarThickness: 28,
      }],
    }
  })

  readonly chartOptions = computed(() => {
    this.isDark()
    const css = getComputedStyle(document.documentElement)
    const muted = css.getPropertyValue('--p-text-muted-color').trim() || '#64748b'
    const grid = css.getPropertyValue('--p-content-border-color').trim() || '#e2e8f0'
    const metric = this.activeMetric()
    const currency = metric === 'orders' ? null : (metric.slice('sales:'.length) as CostingCurrency)
    const fmt = (v: number) => (currency ? this.money(v, currency) : this.num(v))
    const days = this.periodDays()
    return {
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items: { dataIndex: number }[]) => days[items[0]?.dataIndex] ?? '',
            label: (item: { parsed: { y: number } }) => fmt(item.parsed.y),
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: muted, maxRotation: 0, autoSkipPadding: 12 } },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: grid },
          ticks: { color: muted, maxTicksLimit: 5, precision: 0, callback: (v: number) => this.num(v) },
        },
      },
    }
  })

  /** "Bs 1.234,50" in the UI language. */
  money(value: number | null | undefined, currency: CostingCurrency): string {
    return formatCost(value, currency)
  }

  private num(v: number): string {
    return formatDisplayNumber(v, 0, 0)
  }

  delta(cur: number, prev: number | null | undefined): Delta | null {
    return deltaOf(cur, prev)
  }

  /** Revenue per currency; older backends only send the plain total. */
  revenueRows(): CurrencyAmount[] {
    return this.ordersShipped.revenue_by_currency ?? []
  }
  summary = signal<ParcelDashboardSummary>(EMPTY_SUMMARY)

  get shipped(): ParcelShippedSummary {
    return this.summary().shipped
  }

  get shipPrepared(): ParcelShipPreparedSummary {
    return this.summary().ship_prepared
  }

  // ── Order dashboard state ─────────────────────────────────────
  orderSummary  = signal<OrderDashboardSummary>(EMPTY_ORDER_SUMMARY)

  get ordersShipped(): OrdersShippedSummary {
    return this.orderSummary().orders_shipped
  }

  get alerts(): AlertsSummary {
    return this.orderSummary().alerts
  }

  // ── Inventory dashboard state ───────────────────────────────
  inventorySummary = signal<InventoryDashboardSummary>(EMPTY_INVENTORY_SUMMARY)

  get inventory(): InventoryDashboardSummary {
    return this.inventorySummary()
  }

  // ── Best selling data (from API) ──────────────────────────────
  locations     = signal<LocationDashboardSummary>(EMPTY_LOCATIONS_SUMMARY)
  bestSelling   = signal<BestSellingItem[]>([])

  /** Highest qty in the top list: the 100% of each row's bar. */
  private readonly maxQtySold = computed(() =>
    this.bestSelling().reduce((max, i) => Math.max(max, i.qty_sold ?? 0), 0)
  )

  /** Stats of the "Warehouse" card. */
  readonly warehouseStats = computed(() => [
    { id: 'card-locations-zones',     labelKey: 'dashboard.zones',       icon: 'pi pi-th-large',   value: this.locations().zones,                loading: this.loadingLocations() },
    { id: 'card-locations-locations', labelKey: 'dashboard.locations',   icon: 'pi pi-map-marker', value: this.locations().locations,            loading: this.loadingLocations() },
    { id: 'card-locations-bins',      labelKey: 'dashboard.bins',        icon: 'pi pi-inbox',      value: this.locations().bins,                 loading: this.loadingLocations() },
    { id: 'card-inventory-trace',     labelKey: 'dashboard.trace_cards', icon: 'pi pi-id-card',    value: this.inventorySummary().trace_cards,   loading: this.loadingInventory() },
  ])

  /** Row's share of the top seller, 0–100, for its progress bar. */
  qtyShare(qty: number): number {
    const max = this.maxQtySold()
    return max > 0 ? Math.round(((qty ?? 0) / max) * 100) : 0
  }

  /** Last scope actually fetched for, so the effect cannot re-fetch for free. */
  private lastScopeKey: string | null = null

  /**
   * Bumped by every loadSummary(). A response for an older request is dropped,
   * so a slow reply cannot overwrite the numbers of the filters now on screen.
   */
  private requestSeq = 0

  constructor() {
    this.restoreFilters()

    effect(() => this.persistFilters({
      days: this.selectedDateRange().days,
      dates: this.customRangeDates(),
      facilityId: this.selectedFacility().id,
    }))

    // Follow the topbar. The facility list is loaded in ngOnInit — the global
    // selector also loads it, but the topbar may not render it.
    effect(() => {
      const inScope = this.facilityScope.inScope()
      const single = inScope.length === 1

      untracked(() => {
        // A restored selection is known before the facility list arrives, so
        // inScope() can still be empty here — resolve nothing until it loads.
        if (inScope.length > 0) {
          const current = this.selectedFacility()

          const match = inScope.find((f) => f.id === current.id)

          if (single) {
            // Pin to the only facility in scope, so "all" cannot widen past it.
            if (current.id !== inScope[0].id) this.selectedFacility.set(inScope[0])
          } else if (current.id && !match) {
            // The topbar just excluded whatever was picked here.
            this.selectedFacility.set(ALL_FACILITIES)
          } else if (match && match !== current) {
            // A facility restored from storage is only an id until the list
            // arrives; swap in the real option so the select can show it.
            this.selectedFacility.set(match)
          }
        }

        // Both the selection and the facility list can move this effect, but
        // only a change in what would actually be requested is worth a reload
        // — and ngOnInit has already done the first one.
        // The requested ids count too: a restored scope only resolves to them
        // once the facility list arrives, and loadSummary() waits for that.
        const key = `${this.facilityScope.selectedIds().join(',')}|${this.selectedFacility().id}|${this.requestedFacilityIds()?.join(',') ?? '*'}`
        const isFirstRun = this.lastScopeKey === null
        if (isFirstRun || key === this.lastScopeKey) {
          this.lastScopeKey = key
          return
        }
        this.lastScopeKey = key

        this.loadSummary()
      })
    })
  }

  // ── Lifecycle ────────────────────────────────────────────────
  ngOnInit(): void {
    this.facilityScope.load()
    this.loadSummary()
  }

  /** Called when user picks a different period */
  onDateRangeChange(): void {
    if (this.isCustomRange()) {
      // Don't reload yet — wait for the user to pick dates
      return
    }
    this.customRangeDates.set(null)
    this.loadSummary()
  }

  /** True when "Custom range" is picked but no day has been chosen yet. */
  readonly customRangeEmpty = computed(
    () => this.isCustomRange() && !this.customRangeDates()?.[0],
  )

  /** Called when the custom date range picker value changes */
  onCustomRangeChange(dates: Date[] | null): void {
    this.customRangeDates.set(dates)
    if (dates?.length === 2 && dates[0] && dates[1]) {
      this.loadSummary()
    }
  }

  /**
   * The picker closed on a half-picked range (one click). The input shows that
   * single day, so query exactly that day — the same thing refresh would do.
   */
  onCustomRangeClose(): void {
    const dates = this.customRangeDates()
    if (dates?.[0] && !dates[1]) this.loadSummary()
  }

  /**
   * Compute the [from, to] bounds from the selected period, or null when a
   * custom range has no day picked yet.
   *
   * Both bounds are inclusive days sent as yyyy-mm-dd. The backend counts
   * each record in the day of its own facility's zone (DayRange.CondIn), the
   * same rule the lists' date filters follow, so a dashboard and a list
   * filtered by the same days agree.
   */
  private getDateParams(): { dateFrom: string; dateTo: string } | null {
    const { days } = this.selectedDateRange()

    if (days === -1) {
      const [from, to] = this.customRangeDates() ?? []
      if (!from) return null
      // A half-picked range is the single day the input displays.
      return { dateFrom: this.dayStart(from), dateTo: this.dayStart(to ?? from) }
    }

    // "Last N days" includes today, so it starts N-1 days back (it used to
    // start N days back and cover N+1 days). Today of the facilities' zone.
    const today = todayInZone(this.facilityScopeZone())
    const from = new Date(today)
    from.setDate(from.getDate() - (days - 1))
    return { dateFrom: this.dayStart(from), dateTo: this.dayStart(today) }
  }

  /** The given day as yyyy-mm-dd: the backend counts it in each facility's zone. */
  private dayStart(d: Date): string {
    return toApiDay(d)
  }

  /** Format a Date to ISO-8601 date string (YYYY-MM-DD) */
  private toISODate(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  /**
   * The facilities to request: the one picked here, or under "All" those the
   * topbar has in scope. `undefined` when the topbar covers every facility,
   * so the backend answers for all the user can reach.
   */
  private requestedFacilityIds(): string[] | undefined {
    const fac = this.selectedFacility()
    if (fac?.id) return [fac.id]
    if (this.facilityScope.isAll()) return undefined
    return this.facilityScope.inScope().map((f) => f.id)
  }

  /** Fetch summary filtered by the selected facility, or by the topbar's scope under "All" */
  loadSummary(): void {
    const dateParams = this.getDateParams()
    // Custom range with no day yet: an undated query would count all time
    // under a "Custom range" label, so keep the last numbers instead.
    if (!dateParams) return

    const seq = ++this.requestSeq
    if (this.noFacilityOnly()) {
      // The bumped seq drops any reply still in flight.
      this.setAllLoading(false)
      return
    }
    this.setAllLoading(true)
    this.periodDays.set(daysBetween(dateParams.dateFrom, dateParams.dateTo))
    const facilityIds = this.requestedFacilityIds()
    // A narrowed scope restored before the facility list arrives has no ids
    // yet. Sending none would answer for every facility, so wait: the scope
    // effect reloads once the list is in.
    if (facilityIds?.length === 0) return
    const params: { facilityIds?: string[]; dateFrom?: string; dateTo?: string } = { ...dateParams, facilityIds }

    // Parcel summary ("Paquetes Entregados" / "Paquetes en Red") is disabled:
    // its panels are commented out in the template, so it is not requested.
    // The orders summary now ends the loading state instead.
    // this.parcelService.getDashboardSummary(params).subscribe({
    //   next: (data) => {
    //     if (seq !== this.requestSeq) return
    //     this.summary.set(data ?? EMPTY_SUMMARY)
    //     this.loading.set(false)
    //   },
    //   error: () => {
    //     if (seq !== this.requestSeq) return
    //     this.summary.set(EMPTY_SUMMARY)
    //     this.loading.set(false)
    //     this.messageService.add({
    //       severity: 'error',
    //       summary: 'Error',
    //       detail: 'Could not load dashboard summary',
    //     })
    //   },
    // })

    // Load order dashboard (orders shipped + alerts); ends the loading state
    // now that the parcel summary is disabled.
    this.loadOrderSummary(params, seq)

    // Load inventory dashboard (total value, SKUs, units, tracecards)
    this.loadInventorySummary(params, seq)

    // Load locations dashboard (zones, locations, bins)
    this.loadLocationsSummary(params, seq)

    // Load best selling items (top 10 SKUs by qty shipped)
    this.loadBestSellingItems(params, seq)

    // POS sales (only for users who can read sales)
    if (this.canSeeSales) this.loadSalesSummary(params, seq)
  }

  /** Fetch POS sales per currency, previous period, open registers and per day. */
  private loadSalesSummary(params: { facilityIds?: string[]; dateFrom?: string; dateTo?: string }, seq: number): void {
    this.salesService.getDashboardSummary(params).subscribe({
      next: (data) => {
        if (seq !== this.requestSeq) return
        this.salesSummary.set(data ?? null)
        this.loadingSales.set(false)
      },
      error: () => {
        if (seq !== this.requestSeq) return
        this.salesSummary.set(null)
        this.markError('sales')
        this.loadingSales.set(false)
      },
      complete: () => {
        if (seq === this.requestSeq) this.loadingSales.set(false)
      },
    })
  }

  /** Fetch order-level summary (orders shipped + alerts) */
  private loadOrderSummary(params: { facilityIds?: string[]; dateFrom?: string; dateTo?: string }, seq: number): void {
    this.parcelService.getOrderDashboardSummary(params).subscribe({
      next: (data) => {
        if (seq !== this.requestSeq) return
        this.orderSummary.set(data ?? EMPTY_ORDER_SUMMARY)
        this.loading.set(false)
      },
      error: () => {
        if (seq !== this.requestSeq) return
        this.orderSummary.set(EMPTY_ORDER_SUMMARY)
        this.markError('orders')
        this.loading.set(false)
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: this.translate.instant('dashboard.load_error'),
        })
      },
    })
  }

  private setAllLoading(value: boolean): void {
    this.loading.set(value)
    this.loadingInventory.set(value)
    this.loadingLocations.set(value)
    this.loadingBestSelling.set(value)
    this.loadingSales.set(value && this.canSeeSales)
    if (value) {
      this.loadErrors.set({ sales: false, orders: false, inventory: false, locations: false, bestSelling: false })
    }
  }

  /** Fetch inventory summary (current state, no date filter) */
  private loadInventorySummary(params: { facilityIds?: string[] }, seq: number): void {
    this.parcelService.getInventoryDashboardSummary({
      facilityIds: params.facilityIds,
    }).subscribe({
      next: (data) => {
        if (seq !== this.requestSeq) return
        this.inventorySummary.set(data ?? EMPTY_INVENTORY_SUMMARY)
        this.loadingInventory.set(false)
      },
      error: () => {
        if (seq !== this.requestSeq) return
        this.inventorySummary.set(EMPTY_INVENTORY_SUMMARY)
        this.markError('inventory')
        this.loadingInventory.set(false)
      },
      complete: () => {
        if (seq === this.requestSeq) this.loadingInventory.set(false)
      },
    })
  }

  /** Fetch location summary (zones, locations, bins — current state, no date filter) */
  private loadLocationsSummary(params: { facilityIds?: string[] }, seq: number): void {
    this.parcelService.getLocationDashboardSummary({
      facilityIds: params.facilityIds,
    }).subscribe({
      next: (data) => {
        if (seq !== this.requestSeq) return
        this.locations.set(data ?? EMPTY_LOCATIONS_SUMMARY)
        this.loadingLocations.set(false)
      },
      error: () => {
        if (seq !== this.requestSeq) return
        this.locations.set(EMPTY_LOCATIONS_SUMMARY)
        this.markError('locations')
        this.loadingLocations.set(false)
      },
      complete: () => {
        if (seq === this.requestSeq) this.loadingLocations.set(false)
      },
    })
  }

  /** Fetch best selling items (top 10 SKUs by qty_shipped in the date range) */
  private loadBestSellingItems(params: { facilityIds?: string[]; dateFrom?: string; dateTo?: string }, seq: number): void {
    this.parcelService.getBestSellingItems(params).subscribe({
      next: (data) => {
        if (seq !== this.requestSeq) return
        this.bestSelling.set(data ?? [])
        this.loadingBestSelling.set(false)
      },
      error: () => {
        if (seq !== this.requestSeq) return
        this.bestSelling.set([])
        this.markError('bestSelling')
        this.loadingBestSelling.set(false)
      },
      complete: () => {
        if (seq === this.requestSeq) this.loadingBestSelling.set(false)
      },
    })
  }

  /** Called when user picks a different facility */
  onFacilityChange(): void {
    this.loadSummary()
  }

  // ── Filter persistence (survives F5) ─────────────────────────

  private storageKey(): string {
    const uid = this.auth.authInfo()?.uid
    return uid ? `${uid}:${FILTERS_STORAGE_KEY}` : FILTERS_STORAGE_KEY
  }

  /**
   * Re-applies the filters saved by persistFilters(). Anything that no longer
   * fits (unknown period, a custom day now before minDate) falls back to the
   * defaults rather than querying a range the picker could not show.
   */
  private restoreFilters(): void {
    let saved: PersistedFilters | null = null
    try {
      const raw = sessionStorage.getItem(this.storageKey())
      saved = raw ? JSON.parse(raw) : null
    } catch {
      return
    }
    if (!saved) return

    const option = DATE_RANGE_OPTIONS.find((o) => o.days === saved.days)
    if (!option) return

    if (option.days === -1) {
      const from = this.fromISODate(saved.from)
      const to = this.fromISODate(saved.to)
      const inBounds = (d: Date | null) => !!d && d >= this.minDate && d <= this.maxDate
      if (!inBounds(from) || (to && !inBounds(to))) return
      this.customRangeDates.set(to ? [from!, to] : [from!])
    }
    this.selectedDateRange.set(option)

    if (saved.facilityId) {
      // Placeholder until the facility list loads; the scope effect swaps in
      // the real option, or falls back to "All" if it is no longer in scope.
      this.selectedFacility.set({ id: saved.facilityId, name: '', is_active: true })
    }
  }

  private persistFilters(f: { days: number; dates: Date[] | null; facilityId: string }): void {
    const saved: PersistedFilters = { days: f.days }
    if (f.days === -1 && f.dates?.[0]) {
      saved.from = this.toISODate(f.dates[0])
      if (f.dates[1]) saved.to = this.toISODate(f.dates[1])
    }
    if (f.facilityId) saved.facilityId = f.facilityId
    try {
      sessionStorage.setItem(this.storageKey(), JSON.stringify(saved))
    } catch {
      /* storage unavailable — filters just won't survive a reload */
    }
  }

  /** Parses a local yyyy-mm-dd (as written by toISODate), or null. */
  private fromISODate(value: string | undefined): Date | null {
    const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
  }

  /** Navigate to a specific route from dashboard panel buttons */
  navigateTo(path: string): void {
    this.router.navigate([path])
  }

  /** "Bs 1,234.00" — inventory value at cost on the inventory card. */
  costText(value: number, currency: CostingCurrency): string {
    return formatCost(value, currency)
  }
}
