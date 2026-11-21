import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { IconFieldModule } from 'primeng/iconfield'
import { InputIconModule } from 'primeng/inputicon'
import { InputTextModule } from 'primeng/inputtext'
import { TooltipModule } from 'primeng/tooltip'
import { catchError, debounceTime, EMPTY, map, of, Subject, switchMap, tap } from 'rxjs'

import { CostingCurrency } from '@/app/shared/utils/costing.util'
import { SalesService } from '../sales.service'
import { CompanyOption, Customer, CustomerInput, CustomerPaymentResult, PaymentMethod } from '../sales.types'
import { money } from '../sales.util'
import { CustomerFormDialogComponent, ExistingCustomerRef } from '../shared/customer-form-dialog.component'
import { CustomerPaymentDialogComponent } from '../shared/customer-payment-dialog.component'

const SEARCH_DEBOUNCE_MS = 250

/**
 * POS customer: one search box (NIT/CI, name or phone) instead of typing the
 * customer on every sale. An exact NIT/CI picks the customer on Enter; an
 * unknown one opens a quick create with the number already typed. The picked
 * customer shows its debt in the drawer's currency and can pay it here.
 * No customer = walk-in ("Cliente final").
 */
@Component({
  selector: 'app-customer-picker',
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    TooltipModule,
    CustomerFormDialogComponent,
    CustomerPaymentDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (selected(); as c) {
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
          <i class="pi pi-user text-primary"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold truncate">{{ c.name }}</div>
          @if (c.business_name && c.business_name !== c.name) {
            <div class="text-xs text-surface-600 dark:text-surface-300 truncate">{{ c.business_name }}</div>
          }
          <div class="text-xs text-surface-500 truncate">
            {{ c.doc || ('sales.customers.no_doc' | translate) }}@if (c.phone) { · {{ c.phone }} }
          </div>
        </div>
        <p-button icon="pi pi-times" [text]="true" [rounded]="true" size="small" severity="secondary"
          [pTooltip]="'sales.customers.remove' | translate" [ariaLabel]="'sales.customers.remove' | translate"
          [disabled]="disabled()" (onClick)="clear()" />
      </div>
      @if (companyMismatch()) {
        <div class="mt-2 text-xs text-orange-600">
          <i class="pi pi-exclamation-triangle mr-1"></i>{{ 'sales.customers.other_company' | translate: { company: c.company_name ?? '' } }}
        </div>
      }
      @if (debt() > 0) {
        <div class="mt-3 flex items-center justify-between gap-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 px-3 py-2">
          <div>
            <div class="text-xs uppercase text-orange-700 dark:text-orange-300">{{ 'sales.customers.owes' | translate }}</div>
            <div class="font-bold text-orange-700 dark:text-orange-300">{{ m(debt()) }}</div>
          </div>
          <p-button [label]="'sales.customers.collect' | translate" icon="pi pi-wallet" size="small" [outlined]="true"
            severity="warn" [disabled]="disabled()" (onClick)="paymentVisible.set(true)" />
        </div>
      }
      @for (b of otherBalances(); track b.currency) {
        <div class="mt-1 text-xs text-surface-500">{{ 'sales.customers.owes' | translate }} {{ mc(b.balance, b.currency) }}</div>
      }
    } @else {
      <div class="relative">
        <p-iconfield>
          <p-inputicon [styleClass]="searching() ? 'pi pi-spin pi-spinner' : 'pi pi-user'" />
          <input
            #input
            pInputText
            type="search"
            autocomplete="off"
            class="w-full"
            [disabled]="disabled()"
            [ngModel]="query()"
            (ngModelChange)="onQuery($event)"
            (keydown.enter)="onEnter($event)"
            (keydown.arrowdown)="move(1, $event)"
            (keydown.arrowup)="move(-1, $event)"
            (keydown.escape)="reset()"
            (blur)="onBlur()"
            [placeholder]="'sales.customers.search_placeholder' | translate"
            [attr.aria-label]="'sales.customers.search_placeholder' | translate"
          />
        </p-iconfield>
        @if (query().trim() && searched()) {
          <div class="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border border-surface-200 dark:border-surface-700
                      bg-surface-0 dark:bg-surface-900 shadow-lg max-h-80 overflow-auto" role="listbox">
            @for (r of results(); track r.id; let i = $index) {
              <button
                type="button"
                role="option"
                class="w-full flex items-center gap-2 px-3 py-2 text-left border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800"
                [class]="i === active() ? 'bg-primary-50 dark:bg-primary-900/30' : ''"
                [attr.aria-selected]="i === active()"
                (mouseenter)="active.set(i)"
                (mousedown)="$event.preventDefault()"
                (click)="pick(r)"
              >
                <div class="flex-1 min-w-0">
                  <div class="font-medium truncate">{{ r.name }}</div>
                  <div class="text-xs text-surface-500 truncate">
                    {{ r.doc || '—' }}@if (r.phone) { · {{ r.phone }} }@if (showCompany()) { · {{ r.company_name }} }
                  </div>
                </div>
                @if (balanceIn(r) > 0) {
                  <span class="text-xs font-semibold text-orange-600 whitespace-nowrap">{{ m(balanceIn(r)) }}</span>
                }
              </button>
            }
            <button
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2 text-left text-primary hover:bg-surface-50 dark:hover:bg-surface-800"
              [class]="active() === results().length ? 'bg-primary-50 dark:bg-primary-900/30' : ''"
              (mouseenter)="active.set(results().length)"
              (mousedown)="$event.preventDefault()"
              (click)="openCreate()"
            >
              <i class="pi pi-plus"></i>
              <span>{{ 'sales.customers.create_named' | translate: { q: query().trim() } }}</span>
            </button>
          </div>
        }
      </div>
      <div class="mt-1 text-xs text-surface-500">
        <i class="pi pi-info-circle mr-1"></i>{{ 'sales.customers.walk_in_hint' | translate }}
      </div>
    }

    <app-customer-form-dialog
      [(visible)]="formVisible"
      [prefill]="prefill()"
      [companies]="companies()"
      [lockedCompanyId]="companyId()"
      [compact]="true"
      (saved)="pick($event)"
      (useExisting)="pickExisting($event)"
    />
    <app-customer-payment-dialog
      [(visible)]="paymentVisible"
      [customer]="selected()"
      [facilityId]="facilityId()"
      [facilityName]="facilityName()"
      [currency]="currency()"
      [hasSession]="true"
      [methods]="methods()"
      (paid)="onPaid($event)"
    />
  `,
})
export class CustomerPickerComponent {
  private readonly svc = inject(SalesService)
  private readonly translate = inject(TranslateService)
  private readonly destroyRef = inject(DestroyRef)

  private readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('input')

  readonly selected = model<Customer | null>(null)
  /** Company of the cart (null while empty): search and create stay in it. */
  readonly companyId = input<string | null>(null)
  readonly facilityId = input<string | null>(null)
  readonly facilityName = input('')
  readonly currency = input<CostingCurrency>('BOB')
  readonly methods = input<PaymentMethod[]>([])
  readonly disabled = input(false)
  /** A debt payment was registered (the drawer changed). */
  readonly paid = output<CustomerPaymentResult>()

  readonly query = signal('')
  readonly results = signal<Customer[]>([])
  readonly searching = signal(false)
  readonly searched = signal(false)
  /** Highlighted row; results().length = the "create" row. */
  readonly active = signal(0)
  readonly companies = signal<CompanyOption[]>([])
  readonly formVisible = signal(false)
  readonly paymentVisible = signal(false)
  readonly prefill = signal<Partial<CustomerInput>>({})
  private readonly search$ = new Subject<{ q: string; immediate: boolean }>()
  /** Enter was pressed before the results arrived: act on them when they do. */
  private enterPending = false

  /** One of the picker's dialogs is open: the POS shortcuts must stay quiet. */
  readonly dialogOpen = computed(() => this.formVisible() || this.paymentVisible())
  readonly showCompany = computed(() => !this.companyId() && this.companies().length > 1)
  readonly debt = computed(() => this.balanceIn(this.selected()))
  readonly otherBalances = computed(() => (this.selected()?.balances ?? []).filter(b => b.currency !== this.currency() && b.balance > 0))
  readonly companyMismatch = computed(() => {
    const c = this.selected()
    const company = this.companyId()
    return !!c && !!company && c.company_id !== company
  })

  constructor() {
    this.svc.listCompanies().pipe(takeUntilDestroyed()).subscribe({
      next: res => this.companies.set(res.data ?? []),
      error: () => this.companies.set([]),
    })
    this.search$
      .pipe(
        map(s => ({ ...s, q: s.q.trim() })),
        switchMap(s => {
          if (!s.q) {
            this.results.set([])
            this.searched.set(false)
            return EMPTY
          }
          const run = () => {
            this.searching.set(true)
            return this.svc.searchCustomers(s.q, this.companyId()).pipe(
              catchError(() => of({ data: [] as Customer[] })),
              tap(() => this.searching.set(false))
            )
          }
          return s.immediate ? run() : of(null).pipe(debounceTime(SEARCH_DEBOUNCE_MS), switchMap(run))
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(res => this.onResults(res.data ?? []))
  }

  focus(): void {
    setTimeout(() => this.inputEl()?.nativeElement.focus(), 0)
  }

  onQuery(q: string): void {
    this.query.set(q)
    this.enterPending = false
    this.search$.next({ q, immediate: false })
  }

  private onResults(list: Customer[]): void {
    this.results.set(list)
    this.searched.set(true)
    this.active.set(0)
    if (this.enterPending) {
      this.enterPending = false
      this.resolveEnter()
    }
  }

  /** Enter: exact NIT/phone or the only hit → pick; nothing found → create. */
  onEnter(e: Event): void {
    e.preventDefault()
    if (!this.query().trim()) return
    if (this.searching() || !this.searched()) {
      this.enterPending = true
      this.search$.next({ q: this.query(), immediate: true })
      return
    }
    this.resolveEnter(true)
  }

  private resolveEnter(useActive = false): void {
    const list = this.results()
    if (useActive && this.active() < list.length) {
      this.pick(list[this.active()])
      return
    }
    if (useActive && this.active() === list.length) {
      this.openCreate()
      return
    }
    const exact = list.find(r => r.exact_match)
    if (exact || list.length === 1) this.pick(exact ?? list[0])
    else if (list.length === 0) this.openCreate()
  }

  move(delta: number, e: Event): void {
    if (!this.searched()) return
    e.preventDefault()
    const n = this.results().length + 1
    this.active.set((this.active() + delta + n) % n)
  }

  onBlur(): void {
    // Let a click on a result land before the list closes.
    setTimeout(() => this.searched.set(false), 150)
  }

  pick(c: Customer): void {
    this.selected.set(c)
    this.reset()
  }

  /** The NIT typed in "create" belongs to an existing customer: pick that one. */
  pickExisting(ex: ExistingCustomerRef): void {
    this.svc.searchCustomers(ex.doc, this.companyId()).subscribe({
      next: res => {
        const hit = (res.data ?? []).find(c => c.id === ex.id) ?? (res.data ?? []).find(c => c.exact_match)
        if (hit) this.pick(hit)
      },
    })
  }

  openCreate(): void {
    const q = this.query().trim()
    // Digits (with an optional extension like "LP") are a NIT/CI; the rest a name.
    const looksLikeDoc = /^\d[\d\s-]*[a-zA-Z]{0,3}$/.test(q)
    this.prefill.set(looksLikeDoc ? { doc: q.toUpperCase() } : { name: q })
    this.searched.set(false)
    this.formVisible.set(true)
  }

  clear(): void {
    this.selected.set(null)
    this.focus()
  }

  reset(): void {
    this.query.set('')
    this.results.set([])
    this.searched.set(false)
    this.enterPending = false
  }

  onPaid(r: CustomerPaymentResult): void {
    const c = this.selected()
    if (c && c.id === r.payment.customer_id) this.selected.set({ ...c, balances: r.balances })
    this.paid.emit(r)
  }

  balanceIn(c: Customer | null): number {
    return c?.balances.find(b => b.currency === this.currency())?.balance ?? 0
  }

  m(v: number): string {
    return money(v, this.currency())
  }

  mc(v: number, currency: CostingCurrency): string {
    return money(v, currency)
  }
}
