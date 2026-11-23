import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { InputNumberModule } from 'primeng/inputnumber'
import { InputTextModule } from 'primeng/inputtext'
import { MessageModule } from 'primeng/message'

import { BaseDialog } from '@/app/shared/components'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { CostingCurrency, MONEY_MAX_DECIMALS } from '@/app/shared/utils/costing.util'
import { SalesService } from '../sales.service'
import { Customer, CustomerPaymentResult, PaymentMethod } from '../sales.types'
import { kindIcon, money, newClientRef, quickTenders, round2, salesErrorMessages } from '../sales.util'
import { PAYMENT_RECEIPT_KEYS, printLabels, printPaymentReceipt } from './print.util'

/**
 * Payment towards a customer's debt ("abono") in one facility and its
 * currency. Cash needs the open drawer (it enters the count) and may give
 * change; the other methods charge the exact amount. A retry after a lost
 * answer reuses the same client_ref, so a payment is never registered twice.
 */
@Component({
  selector: 'app-customer-payment-dialog',
  standalone: true,
  imports: [FormsModule, TranslateModule, ButtonModule, BaseDialog, InputNumberModule, InputTextModule, MessageModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Takes money: no Enter-to-save, the button must be pressed -->
    <base-dialog
      [visible]="visible()"
      header="sales.customers.payment_title"
      size="sm"
      [loading]="saving()"
      [closable]="!saving()"
      [closeOnEscape]="!saving()"
      [submitOnEnter]="false"
      [saveLabel]="result() ? 'sales.pos.print' : 'sales.customers.register_payment'"
      [saveIcon]="result() ? 'pi pi-print' : 'pi pi-check'"
      [cancelLabel]="result() ? 'buttons.close' : 'buttons.cancel'"
      [saveDisabled]="!result() && (problems().length > 0 || balance() <= 0)"
      (save)="result() ? print() : submit()"
      (hide)="visible.set(false)"
      (shown)="reset()"
    >
      @if (customer(); as c) {
        @if (result(); as r) {
          <div class="text-center pt-2">
            <div class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/40 mb-3">
              <i class="pi pi-check text-2xl text-green-600"></i>
            </div>
            <div class="text-lg font-semibold">{{ 'sales.customers.payment_done' | translate }}</div>
            <div class="text-surface-500">{{ c.name }} · {{ r.payment.method_name }} {{ m(r.payment.amount) }}</div>
            @if (r.payment.change_amount > 0) {
              <div class="mt-4 rounded-xl bg-green-50 dark:bg-green-900/30 p-3">
                <div class="text-xs uppercase text-green-700 dark:text-green-300">{{ 'sales.pos.change_due' | translate }}</div>
                <div class="text-4xl font-bold text-green-700 dark:text-green-300">{{ m(r.payment.change_amount) }}</div>
              </div>
            }
            <div class="mt-4 flex justify-between rounded-lg bg-surface-50 dark:bg-surface-800 p-3">
              <span>{{ 'sales.customers.balance_after' | translate }}</span>
              <span class="font-semibold font-mono">{{ m(r.balance_after) }}</span>
            </div>
          </div>
        } @else {
          <div class="flex flex-col gap-4">
            <div class="flex items-center justify-between rounded-lg bg-orange-50 dark:bg-orange-900/20 p-3">
              <div>
                <div class="font-semibold">{{ c.name }}</div>
                <div class="text-xs text-surface-500">{{ c.doc || '—' }} · {{ facilityName() }}</div>
              </div>
              <div class="text-right">
                <div class="text-xs uppercase text-orange-700 dark:text-orange-300">{{ 'sales.customers.owes' | translate }}</div>
                <div class="text-2xl font-bold text-orange-700 dark:text-orange-300">{{ m(balance()) }}</div>
              </div>
            </div>

            @if (balance() <= 0) {
              <p-message severity="info">{{ 'sales.customers.no_debt_in' | translate: { currency: currency() } }}</p-message>
            } @else {
              <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
                @for (pm of usableMethods(); track pm.id) {
                  <button
                    type="button"
                    class="flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors border-surface-200 dark:border-surface-700
                           hover:border-primary hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    [class]="method()?.id === pm.id ? '!border-primary !bg-primary-50 dark:!bg-primary-900/30' : ''"
                    [disabled]="saving() || (pm.kind === 'CASH' && !hasSession())"
                    (click)="pick(pm)"
                  >
                    <i [class]="icon(pm.kind)" class="text-xl"></i>
                    <span class="text-sm font-medium text-center leading-tight">{{ pm.name }}</span>
                  </button>
                }
              </div>
              @if (!hasSession()) {
                <small class="text-surface-500 -mt-2"><i class="pi pi-info-circle mr-1"></i>{{ 'sales.customers.cash_needs_register' | translate }}</small>
              }

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-surface-500" for="payAmount">{{ 'sales.customers.payment_amount' | translate }}</label>
                  <p-inputnumber inputId="payAmount" [ngModel]="amount()" (ngModelChange)="setAmount($event)" mode="decimal"
                    [minFractionDigits]="0" [maxFractionDigits]="decimals()" [min]="0" [max]="balance()"
                    inputStyleClass="w-full text-right text-xl font-semibold" />
                  <button type="button" class="text-xs text-primary hover:underline text-left" (click)="setAmount(balance())">
                    {{ 'sales.customers.pay_all' | translate }} ({{ m(balance()) }})
                  </button>
                </div>
                @if (method()?.kind === 'CASH') {
                  <div class="flex flex-col gap-1">
                    <label class="text-xs text-surface-500" for="payReceived">{{ 'sales.pos.received' | translate }}</label>
                    <p-inputnumber inputId="payReceived" [ngModel]="received()" (ngModelChange)="setReceived($event)" mode="decimal"
                      [minFractionDigits]="0" [maxFractionDigits]="decimals()" [min]="0"
                      inputStyleClass="w-full text-right text-xl font-semibold" />
                  </div>
                  <div class="sm:col-span-2 flex flex-wrap gap-2">
                    @for (v of tenders(); track v) {
                      <p-button [label]="m(v)" size="small" [outlined]="received() !== v" (onClick)="setReceived(v)" />
                    }
                  </div>
                } @else if (method()) {
                  <div class="flex flex-col gap-1">
                    <label class="text-xs text-surface-500" for="payRef">
                      {{ 'sales.pos.reference' | translate }}
                      @if (method()?.requires_reference) { <span class="text-red-500">*</span> }
                    </label>
                    <input pInputText id="payRef" [ngModel]="reference()" (ngModelChange)="reference.set($event)"
                      [placeholder]="'sales.pos.reference_hint' | translate" />
                  </div>
                }
              </div>
              <input pInputText [ngModel]="note()" (ngModelChange)="note.set($event)" maxlength="200"
                [placeholder]="'sales.customers.payment_note' | translate" [attr.aria-label]="'sales.customers.payment_note' | translate" />

              @if (change() > 0) {
                <div class="flex justify-between rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 p-3">
                  <span>{{ 'sales.pos.change' | translate }}</span><span class="font-bold text-xl">{{ m(change()) }}</span>
                </div>
              }
              @for (p of problems(); track p) {
                <p-message severity="warn" size="small">{{ p | translate }}</p-message>
              }
            }
            @if (uncertain()) {
              <p-message severity="warn" size="small">{{ 'sales.errors.UNCERTAIN' | translate }}</p-message>
            }
            @for (e of errors(); track e) { <p-message severity="error">{{ e }}</p-message> }
          </div>
        }
      }
    </base-dialog>
  `,
})
export class CustomerPaymentDialogComponent {
  private readonly svc = inject(SalesService)
  private readonly translate = inject(TranslateService)
  private readonly facilityScope = inject(FacilityScopeService)

  readonly visible = model(false)
  readonly customer = input<Customer | null>(null)
  readonly facilityId = input<string | null>(null)
  readonly facilityName = input('')
  readonly currency = input<CostingCurrency>('BOB')
  /** An open drawer exists in the facility: cash payments are possible. */
  readonly hasSession = input(false)
  readonly methods = input<PaymentMethod[]>([])
  readonly paid = output<CustomerPaymentResult>()

  readonly method = signal<PaymentMethod | null>(null)
  readonly amount = signal(0)
  readonly received = signal(0)
  private receivedTouched = false
  readonly reference = signal('')
  readonly note = signal('')
  readonly saving = signal(false)
  readonly errors = signal<string[]>([])
  readonly uncertain = signal(false)
  readonly result = signal<CustomerPaymentResult | null>(null)
  private clientRef: string | null = null

  /** Amount inputs take cents in any currency (CLP too), as typed. */
  readonly decimals = computed(() => MONEY_MAX_DECIMALS)
  readonly usableMethods = computed(() => this.methods().filter(m => m.is_active && m.kind !== 'CREDIT'))
  readonly balance = computed(() => this.customer()?.balances.find(b => b.currency === this.currency())?.balance ?? 0)
  readonly change = computed(() => (this.method()?.kind === 'CASH' ? round2(Math.max(this.received() - this.amount(), 0)) : 0))
  readonly tenders = computed(() => quickTenders(this.amount(), this.currency()))

  /** Client-side checks; the server repeats all of them. */
  readonly problems = computed(() => {
    const out: string[] = []
    const m = this.method()
    if (!m) out.push('sales.pos.pick_method')
    if (this.amount() <= 0) out.push('sales.pos.amount_zero')
    if (this.amount() > this.balance() + 0.004) out.push('sales.customers.amount_over_debt')
    if (m?.kind === 'CASH' && this.received() < this.amount()) out.push('sales.pos.received_short')
    if (m?.requires_reference && !this.reference().trim()) out.push('sales.pos.reference_missing')
    return out
  })

  reset(): void {
    this.result.set(null)
    this.errors.set([])
    this.uncertain.set(false)
    this.clientRef = null
    this.reference.set('')
    this.note.set('')
    const methods = this.usableMethods()
    const cash = this.hasSession() ? methods.find(m => m.kind === 'CASH') : undefined
    this.method.set(cash ?? methods.find(m => m.kind !== 'CASH') ?? null)
    this.receivedTouched = false
    this.setAmount(this.balance())
  }

  pick(m: PaymentMethod): void {
    this.method.set(m)
    this.receivedTouched = false
    this.received.set(this.amount())
    this.newAttempt()
  }

  setAmount(v: number | null): void {
    const amount = round2(Math.min(Math.max(v ?? 0, 0), this.balance()))
    this.amount.set(amount)
    if (!this.receivedTouched) this.received.set(amount)
    this.newAttempt()
  }

  setReceived(v: number | null): void {
    this.receivedTouched = true
    this.received.set(round2(v ?? 0))
  }

  /** A changed payment is a new attempt, unless the last one may have gone through. */
  private newAttempt(): void {
    if (!this.uncertain()) this.clientRef = null
  }

  submit(): void {
    const c = this.customer()
    const fid = this.facilityId()
    const m = this.method()
    if (!c || !fid || !m || this.saving() || this.problems().length > 0) return
    if (!this.clientRef) this.clientRef = newClientRef()
    this.saving.set(true)
    this.errors.set([])
    this.svc
      .registerCustomerPayment(c.id, {
        facility_id: fid,
        client_ref: this.clientRef,
        payment_method_id: m.id,
        amount: this.amount(),
        received: m.kind === 'CASH' ? this.received() : this.amount(),
        reference: this.reference().trim(),
        note: this.note().trim(),
      })
      .subscribe({
        next: r => {
          this.saving.set(false)
          this.uncertain.set(false)
          this.clientRef = null
          this.result.set(r)
          this.paid.emit(r)
        },
        error: e => {
          this.saving.set(false)
          const status = (e as { status?: number })?.status ?? 0
          const code = e?.error?.code ?? e?.code
          // No answer: the payment may be registered; keep the key for the retry.
          if (!code || status === 0 || status >= 500) {
            this.uncertain.set(true)
            return
          }
          this.uncertain.set(false)
          this.clientRef = null
          this.errors.set(salesErrorMessages(e, this.translate))
        },
      })
  }

  print(): void {
    const r = this.result()
    if (!r) return
    printPaymentReceipt(
      r,
      printLabels(PAYMENT_RECEIPT_KEYS, k => this.translate.instant(k)),
      this.facilityScope.zoneOf(r.payment.facility_id)
    )
  }

  m(v: number | null | undefined): string {
    return money(v, this.currency())
  }

  icon(kind: string): string {
    return kindIcon(kind)
  }
}
