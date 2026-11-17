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
import { TranslateModule } from '@ngx-translate/core'
import { ProgressSpinnerModule } from 'primeng/progressspinner'
import { ToastModule } from 'primeng/toast'
import { SelectModule } from 'primeng/select'
import { DatePickerModule } from 'primeng/datepicker'
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
} from '@/app/features/parcels/types/parcel.types'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { AuthService } from '@/app/core/services/auth.service'
import { NO_FACILITY_ID, ScopeFacility } from '@/app/core/types/facility.types'

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
  icon: string      // PrimeIcons class
  days: number      // number of days to look back
}

/** Available period presets — only two options as per business requirement */
export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { labelKey: 'dashboard.date_7d',  icon: 'pi pi-calendar', days: 7  },
  { labelKey: 'dashboard.date_30d', icon: 'pi pi-calendar', days: 30 },
  { labelKey: 'dashboard.date_custom', icon: 'pi pi-calendar-plus', days: -1 },
]

/**
 * sessionStorage key for the header filters, scoped per uid. Session, not
 * local: a reload (F5) keeps the filters, but a custom range picked days ago
 * does not come back on its own.
 */
const FILTERS_STORAGE_KEY = 'dashboard-filters'

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
    ProgressSpinnerModule,
    ToastModule,
    SelectModule,
    DatePickerModule,
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
  loading = signal(true)
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
   * Both bounds are the local midnight of an inclusive day, sent as a UTC
   * instant (backend adds a day to `to`). Plain yyyy-mm-dd was read by the
   * backend as a UTC day, which shifted every count by the browser's offset
   * and disagreed with the lists, whose date filters already send instants.
   * toISOString(), not formatDateForBackend(): HttpParams leaves '+' unencoded,
   * so a positive offset would reach the server as a space.
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
    // start N days back and cover N+1 days).
    const today = new Date()
    const from = new Date(today)
    from.setDate(from.getDate() - (days - 1))
    return { dateFrom: this.dayStart(from), dateTo: this.dayStart(today) }
  }

  /** Local midnight of the given day, as a UTC instant. */
  private dayStart(d: Date): string {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
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
      this.loading.set(false)
      return
    }
    this.loading.set(true)
    const facilityIds = this.requestedFacilityIds()
    // A narrowed scope restored before the facility list arrives has no ids
    // yet. Sending none would answer for every facility, so wait: the scope
    // effect reloads once the list is in.
    if (facilityIds?.length === 0) return
    const params: { facilityIds?: string[]; dateFrom?: string; dateTo?: string } = { ...dateParams, facilityIds }

    // Load parcel summary (shipped parcels + ship prepared)
    this.parcelService.getDashboardSummary(params).subscribe({
      next: (data) => {
        if (seq !== this.requestSeq) return
        this.summary.set(data ?? EMPTY_SUMMARY)
        this.loading.set(false)
      },
      error: () => {
        if (seq !== this.requestSeq) return
        this.summary.set(EMPTY_SUMMARY)
        this.loading.set(false)
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Could not load dashboard summary',
        })
      },
    })

    // Load order dashboard (orders shipped + alerts)
    this.loadOrderSummary(params, seq)

    // Load inventory dashboard (total value, SKUs, units, tracecards)
    this.loadInventorySummary(params, seq)

    // Load locations dashboard (zones, locations, bins)
    this.loadLocationsSummary(params, seq)

    // Load best selling items (top 10 SKUs by qty shipped)
    this.loadBestSellingItems(params, seq)
  }

  /** Fetch order-level summary (orders shipped + alerts) */
  private loadOrderSummary(params: { facilityIds?: string[]; dateFrom?: string; dateTo?: string }, seq: number): void {
    this.parcelService.getOrderDashboardSummary(params).subscribe({
      next: (data) => {
        if (seq !== this.requestSeq) return
        this.orderSummary.set(data ?? EMPTY_ORDER_SUMMARY)
      },
      error: () => {
        if (seq !== this.requestSeq) return
        this.orderSummary.set(EMPTY_ORDER_SUMMARY)
      },
    })
  }

  /** Fetch inventory summary (current state, no date filter) */
  private loadInventorySummary(params: { facilityIds?: string[] }, seq: number): void {
    this.parcelService.getInventoryDashboardSummary({
      facilityIds: params.facilityIds,
    }).subscribe({
      next: (data) => {
        if (seq !== this.requestSeq) return
        this.inventorySummary.set(data ?? EMPTY_INVENTORY_SUMMARY)
      },
      error: () => {
        if (seq !== this.requestSeq) return
        this.inventorySummary.set(EMPTY_INVENTORY_SUMMARY)
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
      },
      error: () => {
        if (seq !== this.requestSeq) return
        this.locations.set(EMPTY_LOCATIONS_SUMMARY)
      },
    })
  }

  /** Fetch best selling items (top 10 SKUs by qty_shipped in the date range) */
  private loadBestSellingItems(params: { facilityIds?: string[]; dateFrom?: string; dateTo?: string }, seq: number): void {
    this.parcelService.getBestSellingItems(params).subscribe({
      next: (data) => {
        if (seq !== this.requestSeq) return
        this.bestSelling.set(data ?? [])
      },
      error: () => {
        if (seq !== this.requestSeq) return
        this.bestSelling.set([])
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
}
