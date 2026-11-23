import { FacilityDatePipe } from '@/app/shared/pipes/facility-date.pipe'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { DecimalPipe, NgTemplateOutlet } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ConfirmationService, MessageService } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { DialogModule } from 'primeng/dialog'
import { BaseDialog } from '@/app/shared/components'
import { IconFieldModule } from 'primeng/iconfield'
import { InputIconModule } from 'primeng/inputicon'
import { InputNumberModule } from 'primeng/inputnumber'
import { InputTextModule } from 'primeng/inputtext'
import { MessageModule } from 'primeng/message'
import { SelectModule } from 'primeng/select'
import { SelectButtonModule } from 'primeng/selectbutton'
import { TagModule } from 'primeng/tag'
import { TextareaModule } from 'primeng/textarea'
import { ToggleSwitchModule } from 'primeng/toggleswitch'
import { TooltipModule } from 'primeng/tooltip'
import { catchError, debounceTime, EMPTY, map, of, Subject, switchMap, tap } from 'rxjs'

import { AuthService } from '@/app/core/services/auth.service'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { CostingCurrency, MONEY_MAX_DECIMALS, isOwnerRole } from '@/app/shared/utils/costing.util'
import { SalesService } from '../sales.service'
import {
  CatalogItem,
  CheckoutPayment,
  Customer,
  MovementKind,
  PaymentMethod,
  PriceList,
  SaleDetail,
  SessionScope,
  SessionSummary,
} from '../sales.types'
import {
  CartLine,
  cartTotals,
  lineTotal,
  money,
  newClientRef,
  percentOf,
  priceOf,
  round2,
  salesErrorMessages,
} from '../sales.util'
import { PaymentDialogComponent } from './payment-dialog.component'
import { CustomerPickerComponent } from './customer-picker.component'
import { CloseRegisterDialogComponent } from '../shared/close-register-dialog.component'
import { printLabels, printReceipt, RECEIPT_KEYS } from '../shared/print.util'

/** What survives a reload: the sale in progress, per user and facility. */
interface DraftSale {
  cart: CartLine[]
  discount: number
  priceList: PriceList
  /** Registered customer picked for the sale (null = walk-in). */
  customer: Customer | null
  note?: string
}

/** Drafts saved before customers were registered kept free text: drop it. */
function draftCustomer(c: unknown): Customer | null {
  return c && typeof c === 'object' && 'id' in c && 'balances' in c ? (c as Customer) : null
}
const SEARCH_DEBOUNCE_MS = 220

function storageGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function storageSet(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode / quota: the POS works without persistence */
  }
}

/**
 * PosComponent — point of sale.
 *
 * Flow: pick facility → open the cash register (once per shift) → scan or
 * search products → adjust qty / price / discounts → charge (one or several
 * payment methods, change for cash) → receipt. Each charge creates and ships
 * an outbound order in the same transaction as its payments, so stock and
 * money never diverge. Keyboard: F2 charge · F4 search · F7 customer · F9 clear.
 * The customer is picked from the registered ones (search by NIT/CI, name or
 * phone, quick create); none = walk-in. Credit needs a registered customer.
 */
@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [
    FacilityDatePipe,
    DecimalPipe,
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    TranslateModule,
    ButtonModule,
    ConfirmDialogModule,
    DialogModule,
    BaseDialog,
    IconFieldModule,
    InputIconModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    SelectButtonModule,
    TagModule,
    TextareaModule,
    ToggleSwitchModule,
    TooltipModule,
    PaymentDialogComponent,
    CloseRegisterDialogComponent,
    CustomerPickerComponent,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pos.component.html',
})
export default class PosComponent {
  private readonly svc = inject(SalesService)
  private readonly auth = inject(AuthService)
  private readonly translate = inject(TranslateService)
  private readonly toast = inject(MessageService)
  private readonly confirm = inject(ConfirmationService)
  private readonly destroyRef = inject(DestroyRef)
  readonly facilityScope = inject(FacilityScopeService)

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput')
  private readonly customerPicker = viewChild(CustomerPickerComponent)

  private readonly userKey = this.auth.getAuthUserInfo()?.uid ?? String(this.auth.getAuthUserInfo()?.id ?? 'me')
  readonly isOwner = isOwnerRole(this.auth.getAuthUserInfo()?.role)

  // ── Facility & register ─────────────────────────────────────────────────
  readonly facilities = computed(() => {
    const inScope = this.facilityScope.inScope()
    return inScope.length > 0 ? inScope : this.facilityScope.all()
  })
  readonly facilityId = signal<string | null>(null)
  readonly facilityName = computed(() => this.facilityScope.nameOf(this.facilityId()))
  readonly currency = signal<CostingCurrency>('BOB')
  /** Amount inputs take cents in any currency (CLP too), as typed. */
  readonly decimals = computed(() => MONEY_MAX_DECIMALS)

  readonly register = signal<SessionSummary | null>(null)
  readonly registerLoading = signal(false)
  readonly registerError = signal<string[]>([])
  readonly isOpen = computed(() => this.register()?.session.status === 'OPEN')

  openingAmount: number | null = null
  openingNote = ''
  openScope: SessionScope = 'FACILITY'
  readonly scopeOptions = [
    { value: 'FACILITY', label: 'sales.register.scope_facility' },
    { value: 'USER', label: 'sales.register.scope_user' },
  ]
  readonly opening = signal(false)
  readonly openErrors = signal<string[]>([])

  // ── Catalog search ──────────────────────────────────────────────────────
  readonly query = signal('')
  readonly results = signal<CatalogItem[]>([])
  readonly searching = signal(false)
  readonly activeIndex = signal(0)
  readonly searched = signal(false)
  private readonly search$ = new Subject<{ q: string; immediate: boolean }>()
  /** Set by Enter: add the exact hit as soon as the results arrive. */
  private addOnResult = false

  // ── Cart ────────────────────────────────────────────────────────────────
  readonly cart = signal<CartLine[]>([])
  readonly priceList = signal<PriceList>('RETAIL')
  readonly saleDiscount = signal(0)
  readonly discountMode = signal<'amount' | 'percent'>('amount')
  readonly discountInput = signal<number | null>(null)
  readonly customer = signal<Customer | null>(null)
  readonly note = signal('')
  readonly showNote = signal(false)
  /** Server-reported stock problems per sku_id (after a rejected charge). */
  readonly lineIssues = signal<Record<string, string>>({})
  readonly lastAdded = signal<string | null>(null)

  readonly totals = computed(() => cartTotals(this.cart(), this.saleDiscount()))
  readonly cartCompany = computed(() => this.cart()[0]?.item.company_id ?? null)
  readonly hasCustomer = computed(() => !!this.customer())
  /** OWNER preview of the sale's margin, when every line carries a cost. */
  readonly estimatedCost = computed(() => {
    if (!this.isOwner) return null
    let cost = 0
    for (const l of this.cart()) {
      if (l.item.unit_cost === null || l.item.unit_cost === undefined) return null
      cost += l.item.unit_cost * l.qty
    }
    return round2(cost)
  })
  readonly canCharge = computed(() => this.isOpen() && this.cart().length > 0 && !this.charging())

  readonly priceListOptions = [
    { value: 'RETAIL', label: 'sales.pos.retail' },
    { value: 'WHOLESALE', label: 'sales.pos.wholesale' },
  ]
  readonly discountModeOptions = [
    { value: 'amount', label: '$' },
    { value: 'percent', label: '%' },
  ]

  // ── Charge ──────────────────────────────────────────────────────────────
  readonly methods = signal<PaymentMethod[]>([])
  readonly paymentVisible = signal(false)
  readonly charging = signal(false)
  readonly chargeErrors = signal<string[]>([])
  /** Idempotency key of the current charge attempt; kept across retries. */
  private clientRef: string | null = null
  /** The last attempt ended without an answer: the same key must be retried. */
  readonly uncertain = signal(false)

  readonly lastSale = signal<SaleDetail | null>(null)
  readonly receiptVisible = signal(false)
  readonly autoPrint = signal(storageGet<boolean>('pos-auto-print') ?? false)

  // ── Movements & closing ─────────────────────────────────────────────────
  readonly movementVisible = signal(false)
  readonly movementKind = signal<MovementKind>('OUT')
  movementAmount: number | null = null
  movementReason = ''
  readonly movementSaving = signal(false)
  readonly movementErrors = signal<string[]>([])
  readonly closeVisible = signal(false)
  private registerJustClosed = false
  readonly movementKindOptions = [
    { value: 'IN', label: 'sales.register.kind_in' },
    { value: 'OUT', label: 'sales.register.kind_out' },
  ]

  constructor() {
    this.facilityScope.load()

    // Pick a facility: last used if still reachable, else the only / first in scope.
    effect(() => {
      const list = this.facilities()
      untracked(() => {
        const current = this.facilityId()
        if (current && list.some(f => f.id === current)) return
        if (list.length === 0) return
        const saved = storageGet<string>(`${this.userKey}:pos-facility`)
        const pick = list.find(f => f.id === saved) ?? list[0]
        this.selectFacility(pick.id)
      })
    })

    // Persist the sale in progress.
    effect(() => {
      const fid = this.facilityId()
      const draft: DraftSale = {
        cart: this.cart(),
        discount: this.saleDiscount(),
        priceList: this.priceList(),
        customer: this.customer(),
        note: this.note(),
      }
      if (!fid) return
      const empty = draft.cart.length === 0 && !draft.customer && !draft.note
      storageSet(`${this.userKey}:pos-draft:${fid}`, empty ? null : draft)
    })

    effect(() => {
      if (this.closeVisible()) return
      untracked(() => {
        if (!this.registerJustClosed) return
        this.registerJustClosed = false
        this.register.set(null)
      })
    })

    this.svc.listPaymentMethods(true).pipe(takeUntilDestroyed()).subscribe({
      next: res => this.methods.set(res.data ?? []),
    })

    this.search$
      .pipe(
        map(s => ({ ...s, q: s.q.trim() })),
        switchMap(s => {
          const fid = this.facilityId()
          if (!s.q || !fid) {
            this.results.set([])
            this.searched.set(false)
            return EMPTY
          }
          const run = () => {
            this.searching.set(true)
            return this.svc.searchCatalog(fid, s.q).pipe(
              catchError(() => of({ data: [] as CatalogItem[] })),
              tap(() => this.searching.set(false))
            )
          }
          return s.immediate ? run() : of(null).pipe(debounceTime(SEARCH_DEBOUNCE_MS), switchMap(run))
        }),
        takeUntilDestroyed()
      )
      .subscribe(res => this.onResults(res.data ?? []))
  }

  // ════════════════════════════ Facility & register ════════════════════════════

  selectFacility(id: string): void {
    if (this.facilityId() === id) return
    this.facilityId.set(id)
    storageSet(`${this.userKey}:pos-facility`, id)
    this.restoreDraft(id)
    this.results.set([])
    this.query.set('')
    this.loadRegister()
  }

  private restoreDraft(facilityId: string): void {
    const d = storageGet<DraftSale>(`${this.userKey}:pos-draft:${facilityId}`)
    this.cart.set(d?.cart ?? [])
    this.saleDiscount.set(d?.discount ?? 0)
    this.discountInput.set(d?.discount ? d.discount : null)
    this.discountMode.set('amount')
    this.priceList.set(d?.priceList ?? 'RETAIL')
    this.customer.set(draftCustomer(d?.customer))
    this.note.set(d?.note ?? '')
    this.showNote.set(!!d?.note)
    this.lineIssues.set({})
    this.resetAttempt()
  }

  loadRegister(): void {
    const fid = this.facilityId()
    if (!fid) return
    this.registerLoading.set(true)
    this.registerError.set([])
    this.svc.currentSession(fid).subscribe({
      next: res => {
        this.currency.set(res.currency ?? 'BOB')
        this.register.set(res.session)
        this.registerLoading.set(false)
        if (res.session) this.focusSearch()
      },
      error: e => {
        this.registerLoading.set(false)
        this.register.set(null)
        this.registerError.set(salesErrorMessages(e, this.translate))
      },
    })
  }

  openRegister(): void {
    const fid = this.facilityId()
    if (!fid || this.opening()) return
    this.opening.set(true)
    this.openErrors.set([])
    this.svc.openSession(fid, this.openScope, this.openingAmount ?? 0, this.openingNote.trim()).subscribe({
      next: s => {
        this.register.set(s)
        this.currency.set(s.session.currency)
        this.opening.set(false)
        this.openingAmount = null
        this.openingNote = ''
        this.toast.add({
          severity: 'success',
          summary: this.translate.instant('sales.register.opened'),
          detail: s.session.session_number,
        })
        this.focusSearch()
      },
      error: e => {
        this.opening.set(false)
        // Opened from another tab meanwhile: just pick it up.
        const code = e?.code ?? e?.error?.code
        if (code === 'SALES_SESSION_ALREADY_OPEN' || code === 'SALES_SESSION_FACILITY_OPEN') {
          this.loadRegister()
          return
        }
        this.openErrors.set(salesErrorMessages(e, this.translate))
      },
    })
  }

  refreshRegister(): void {
    const id = this.register()?.session.id
    if (!id) return
    this.svc.sessionSummary(id).subscribe({ next: s => this.register.set(s) })
  }

  // ════════════════════════════ Search ════════════════════════════

  onQuery(q: string): void {
    this.query.set(q)
    this.addOnResult = false
    this.search$.next({ q, immediate: false })
  }

  /** Enter in the search box: scanners end with Enter, so add the exact hit directly. */
  onSearchEnter(): void {
    const q = this.query().trim()
    if (!q) {
      if (this.cart().length > 0) this.startCharge()
      return
    }
    const list = this.results()
    const exact = list.find(r => r.exact_match)
    if (!this.searching() && list.length > 0 && this.searched() && (exact || list.length === 1)) {
      this.addItem(exact ?? list[Math.min(this.activeIndex(), list.length - 1)])
      return
    }
    if (!this.searching() && list.length > 1 && this.searched()) {
      this.addItem(list[this.activeIndex()])
      return
    }
    this.addOnResult = true
    this.search$.next({ q, immediate: true })
  }

  private onResults(list: CatalogItem[]): void {
    this.results.set(list)
    this.searched.set(true)
    this.activeIndex.set(0)
    if (!this.addOnResult) return
    this.addOnResult = false
    const exact = list.find(r => r.exact_match)
    if (exact || list.length === 1) {
      this.addItem(exact ?? list[0])
    } else if (list.length === 0) {
      this.toast.add({ severity: 'warn', summary: this.translate.instant('sales.pos.not_found'), detail: this.query() })
      this.selectSearchText()
    }
  }

  moveActive(delta: number, e: Event): void {
    const n = this.results().length
    if (n === 0) return
    e.preventDefault()
    this.activeIndex.set((this.activeIndex() + delta + n) % n)
  }

  clearSearch(): void {
    this.query.set('')
    this.results.set([])
    this.searched.set(false)
  }

  // ════════════════════════════ Cart ════════════════════════════

  addItem(item: CatalogItem): void {
    const company = this.cartCompany()
    if (company && company !== item.company_id) {
      this.toast.add({
        severity: 'warn',
        summary: this.translate.instant('sales.pos.mixed_company_title'),
        detail: this.translate.instant('sales.pos.mixed_company', { company: item.company_name ?? '' }),
        life: 6000,
      })
      return
    }
    const cart = this.cart()
    const idx = cart.findIndex(l => l.item.sku_id === item.sku_id)
    if (idx >= 0) {
      const line = cart[idx]
      const qty = line.qty + 1
      if (qty > item.available) this.warnStock(item, item.available)
      this.updateLine(idx, { qty, item: { ...line.item, available: item.available } })
    } else {
      if (item.available < 1) this.warnStock(item, item.available)
      const price = priceOf(item, this.priceList())
      this.mutateCart([...cart, { item, qty: 1, unit_price: price, list_price: price, discount: 0 }])
    }
    this.lastAdded.set(item.sku_id)
    setTimeout(() => this.lastAdded() === item.sku_id && this.lastAdded.set(null), 900)
    this.clearSearch()
    this.focusSearch()
  }

  private warnStock(item: CatalogItem, available: number): void {
    this.toast.add({
      severity: 'warn',
      summary: this.translate.instant('sales.pos.low_stock_title'),
      detail: this.translate.instant('sales.pos.low_stock', { sku: item.sku_code, available }),
    })
  }

  setQty(i: number, qty: number | null): void {
    if (qty === null || qty <= 0) return
    this.updateLine(i, { qty })
  }

  stepQty(i: number, delta: number): void {
    const l = this.cart()[i]
    if (!l) return
    const qty = l.qty + delta
    if (qty <= 0) {
      this.removeLine(i)
      return
    }
    this.updateLine(i, { qty })
  }

  setPrice(i: number, price: number | null): void {
    if (price === null || price < 0) return
    this.updateLine(i, { unit_price: round2(price) })
  }

  resetPrice(i: number): void {
    const l = this.cart()[i]
    if (l) this.updateLine(i, { unit_price: l.list_price })
  }

  setLineDiscount(i: number, discount: number | null): void {
    const l = this.cart()[i]
    if (!l) return
    const max = round2(l.qty * l.unit_price)
    this.updateLine(i, { discount: Math.min(Math.max(round2(discount ?? 0), 0), max) })
  }

  removeLine(i: number): void {
    this.mutateCart(this.cart().filter((_, j) => j !== i))
    this.focusSearch()
  }

  private updateLine(i: number, patch: Partial<CartLine>): void {
    this.mutateCart(
      this.cart().map((l, j) => {
        if (j !== i) return l
        const next = { ...l, ...patch }
        // A line discount can never exceed the line amount.
        next.discount = Math.min(next.discount, round2(next.qty * next.unit_price))
        return next
      })
    )
  }

  /** Every cart change starts a new charge attempt and clears stale stock issues. */
  private mutateCart(next: CartLine[]): void {
    this.cart.set(next)
    if (!this.uncertain()) this.clientRef = null
    if (Object.keys(this.lineIssues()).length > 0) {
      const skus = new Set(next.map(l => l.item.sku_id))
      this.lineIssues.set(Object.fromEntries(Object.entries(this.lineIssues()).filter(([k]) => skus.has(k))))
    }
    this.applyDiscountInput()
  }

  setPriceList(list: PriceList): void {
    if (!list || list === this.priceList()) return
    this.priceList.set(list)
    // Lines at their list price follow the new list; edited prices stay.
    this.mutateCart(
      this.cart().map(l => {
        const price = priceOf(l.item, list)
        return l.unit_price === l.list_price ? { ...l, unit_price: price, list_price: price } : { ...l, list_price: price }
      })
    )
  }

  setDiscountInput(v: number | null): void {
    this.discountInput.set(v)
    this.applyDiscountInput()
  }

  setDiscountMode(mode: 'amount' | 'percent'): void {
    if (!mode) return
    this.discountMode.set(mode)
    this.discountInput.set(null)
    this.saleDiscount.set(0)
  }

  private applyDiscountInput(): void {
    const v = this.discountInput() ?? 0
    const subtotal = cartTotals(this.cart(), 0).subtotal
    const amount = this.discountMode() === 'percent' ? percentOf(subtotal, v) : Math.min(round2(v), subtotal)
    this.saleDiscount.set(Math.max(amount, 0))
  }

  /** A debt payment entered the drawer: refresh its totals. */
  onCustomerPaid(): void {
    this.refreshRegister()
  }

  clearSale(askFirst = true): void {
    const doClear = () => {
      this.cart.set([])
      this.saleDiscount.set(0)
      this.discountInput.set(null)
      this.customer.set(null)
      this.note.set('')
      this.showNote.set(false)
      this.lineIssues.set({})
      this.resetAttempt()
      this.clearSearch()
      this.focusSearch()
    }
    if (!askFirst || this.cart().length === 0) {
      doClear()
      return
    }
    this.confirm.confirm({
      header: this.translate.instant('sales.pos.clear_title'),
      message: this.translate.instant('sales.pos.clear_message'),
      icon: 'pi pi-trash',
      acceptLabel: this.translate.instant('sales.pos.clear_accept'),
      rejectLabel: this.translate.instant('buttons.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { text: true },
      accept: doClear,
    })
  }

  lineAmount(l: CartLine): number {
    return lineTotal(l)
  }

  // ════════════════════════════ Charge ════════════════════════════

  startCharge(): void {
    if (!this.canCharge()) return
    if (this.methods().length === 0) {
      this.toast.add({ severity: 'warn', summary: this.translate.instant('sales.pos.no_methods') })
      return
    }
    this.chargeErrors.set([])
    if (!this.clientRef) this.clientRef = newClientRef()
    this.paymentVisible.set(true)
  }

  charge(payments: CheckoutPayment[]): void {
    const fid = this.facilityId()
    const session = this.register()?.session
    if (!fid || !session || this.charging()) return
    if (!this.clientRef) this.clientRef = newClientRef()
    this.charging.set(true)
    this.chargeErrors.set([])
    const c = this.customer()
    this.svc
      .checkout({
        facility_id: fid,
        session_id: session.id,
        client_ref: this.clientRef,
        price_list: this.priceList(),
        // The server takes the customer's data from its record (snapshot).
        customer_id: c?.id ?? '',
        customer: { name: '', doc: '', email: '', phone: '' },
        lines: this.cart().map(l => ({
          sku_id: l.item.sku_id,
          qty: l.qty,
          unit_price: l.unit_price,
          discount: l.discount,
        })),
        discount: this.saleDiscount(),
        payments,
        note: this.note().trim(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: sale => this.onCharged(sale),
        error: e => this.onChargeError(e),
      })
  }

  private onCharged(sale: SaleDetail): void {
    this.charging.set(false)
    this.paymentVisible.set(false)
    this.uncertain.set(false)
    this.lastSale.set(sale)
    this.receiptVisible.set(true)
    this.clearSale(false)
    this.refreshRegister()
    if (this.autoPrint()) this.printLast()
  }

  private onChargeError(e: unknown): void {
    this.charging.set(false)
    const body = ((e as { error?: unknown })?.error ?? e) as { code?: string; errors?: { rule: string; context?: Record<string, unknown> }[] }
    const code = body?.code ?? ''
    const status = (e as { status?: number })?.status

    // No answer (network drop, timeout, 5xx): the charge may have gone through.
    // Keep the same idempotency key so a retry can never charge twice.
    if (!code || status === 0 || (status ?? 0) >= 500) {
      this.uncertain.set(true)
      this.chargeErrors.set([this.translate.instant('sales.errors.UNCERTAIN')])
      return
    }
    this.uncertain.set(false)
    this.clientRef = null
    const msgs = salesErrorMessages(e, this.translate)

    switch (code) {
      case 'SALES_INSUFFICIENT_STOCK':
      case 'ORDER_CHECKOUT_INSUFFICIENT_STOCK': {
        const issues: Record<string, string> = {}
        const cart = this.cart()
        for (const d of body.errors ?? []) {
          const skuId = d.context?.['sku_id'] as string | undefined
          const available = Number(d.context?.['qty_available'] ?? 0)
          if (!skuId) continue
          issues[skuId] = this.translate.instant('sales.pos.only_available', { available })
          const idx = cart.findIndex(l => l.item.sku_id === skuId)
          if (idx >= 0) cart[idx] = { ...cart[idx], item: { ...cart[idx].item, available } }
        }
        this.cart.set([...cart])
        this.lineIssues.set(issues)
        this.paymentVisible.set(false)
        this.toast.add({ severity: 'error', summary: this.translate.instant('sales.pos.stock_changed'), detail: msgs.join(' · '), life: 8000 })
        return
      }
      case 'SALES_SESSION_CLOSED':
      case 'SALES_SESSION_NOT_FOUND':
      case 'SALES_SESSION_NOT_YOURS':
      case 'SALES_SESSION_FACILITY_MISMATCH':
        this.paymentVisible.set(false)
        this.toast.add({ severity: 'error', summary: msgs[0], life: 8000 })
        this.loadRegister()
        return
      default:
        this.chargeErrors.set(msgs)
    }
  }

  private resetAttempt(): void {
    this.clientRef = null
    this.uncertain.set(false)
    this.chargeErrors.set([])
  }

  printLast(): void {
    const sale = this.lastSale()
    if (!sale) return
    printReceipt(sale, printLabels(RECEIPT_KEYS, k => this.translate.instant(k)), this.facilityScope.zoneOf(sale.facility_id))
  }

  setAutoPrint(v: boolean): void {
    this.autoPrint.set(v)
    storageSet('pos-auto-print', v)
  }

  newSale(): void {
    this.receiptVisible.set(false)
    this.focusSearch()
  }

  // ════════════════════════════ Movements & closing ════════════════════════════

  openMovement(kind: MovementKind): void {
    this.movementKind.set(kind)
    this.movementAmount = null
    this.movementReason = ''
    this.movementErrors.set([])
    this.movementVisible.set(true)
  }

  saveMovement(): void {
    const id = this.register()?.session.id
    if (!id || this.movementSaving()) return
    this.movementSaving.set(true)
    this.movementErrors.set([])
    this.svc.addMovement(id, this.movementKind(), this.movementAmount ?? 0, this.movementReason.trim()).subscribe({
      next: s => {
        this.register.set(s)
        this.movementSaving.set(false)
        this.movementVisible.set(false)
        this.toast.add({ severity: 'success', summary: this.translate.instant('sales.register.movement_saved') })
        this.focusSearch()
      },
      error: e => {
        this.movementSaving.set(false)
        this.movementErrors.set(salesErrorMessages(e, this.translate))
      },
    })
  }

  onRegisterClosed(s: SessionSummary): void {
    // The dialog stays up to print the report; the POS resets when it hides.
    this.registerJustClosed = true
    this.toast.add({
      severity: 'success',
      summary: this.translate.instant('sales.register.closed'),
      detail: s.session.session_number,
    })
  }

  // ════════════════════════════ Keyboard & helpers ════════════════════════════

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const dialogOpen =
      this.paymentVisible() || this.receiptVisible() || this.movementVisible() || this.closeVisible() ||
      !!this.customerPicker()?.dialogOpen()
    if (this.receiptVisible() && e.key === 'Enter') {
      e.preventDefault()
      this.newSale()
      return
    }
    if (dialogOpen) return
    switch (e.key) {
      case 'F2':
        e.preventDefault()
        this.startCharge()
        break
      case 'F4':
        e.preventDefault()
        this.focusSearch()
        break
      case 'F7':
        e.preventDefault()
        this.customerPicker()?.focus()
        break
      case 'F9':
        e.preventDefault()
        this.clearSale()
        break
    }
  }

  focusSearch(): void {
    setTimeout(() => this.searchInput()?.nativeElement.focus(), 0)
  }

  private selectSearchText(): void {
    setTimeout(() => this.searchInput()?.nativeElement.select(), 0)
  }

  m(v: number | null | undefined): string {
    return money(v, this.currency())
  }
}
