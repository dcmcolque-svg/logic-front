import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { InputNumberModule } from 'primeng/inputnumber'
import { InputTextModule } from 'primeng/inputtext'
import { MessageModule } from 'primeng/message'

import { BaseDialog } from '@/app/shared/components'
import { CostingCurrency, MONEY_MAX_DECIMALS } from '@/app/shared/utils/costing.util'
import { CheckoutPayment, PaymentMethod } from '../sales.types'
import { kindIcon, money, quickTenders, round2, roundCurrency } from '../sales.util'

interface PaymentRow {
  method: PaymentMethod
  amount: number
  received: number
  reference: string
  /** The cashier typed what the customer handed over; otherwise it follows the amount. */
  receivedTouched: boolean
}

function newRow(method: PaymentMethod, amount: number): PaymentRow {
  return { method, amount, received: amount, reference: '', receivedTouched: false }
}

/**
 * New amount for a payment. "Received" follows the amount unless the cashier
 * typed it (then a cash payment keeps it, and shows change or a shortfall).
 */
function withAmount(r: PaymentRow, amount: number): PaymentRow {
  const received = r.method.kind === 'CASH' && r.receivedTouched ? r.received : amount
  return { ...r, amount, received }
}

/**
 * Charge dialog: one or several payments that must add up to the total.
 * Cash may receive more than it applies (change); other methods charge exactly.
 */
@Component({
  selector: 'app-payment-dialog',
  standalone: true,
  imports: [FormsModule, TranslateModule, ButtonModule, BaseDialog, InputNumberModule, InputTextModule, MessageModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Enter charges on purpose (fast POS flow) via this dialog's own onEnter,
         so base-dialog's Enter-to-save is off to avoid charging twice -->
    <base-dialog
      [visible]="visible()"
      header="sales.pos.charge"
      size="md"
      [loading]="loading()"
      [closable]="!loading()"
      [closeOnEscape]="!loading()"
      [submitOnEnter]="false"
      saveLabel="sales.pos.confirm_charge_enter"
      [saveDisabled]="problems().length > 0"
      (save)="submit()"
      (hide)="visible.set(false)"
      (shown)="reset()"
    >
      <div (keydown.enter)="onEnter($event)">
        <div class="text-center mb-4">
          <div class="text-sm text-surface-500 uppercase tracking-wide">{{ 'sales.pos.total_to_charge' | translate }}</div>
          <div class="text-5xl font-bold">{{ m(total()) }}</div>
        </div>

        <div class="text-xs mb-2" [class]="adding() ? 'text-primary font-semibold' : 'text-surface-500'">
          {{ (adding() ? 'sales.pos.adding_hint' : rows().length > 1 ? 'sales.pos.split_hint' : 'sales.pos.switch_hint') | translate }}
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4 rounded-lg"
             [class]="adding() ? 'ring-2 ring-primary ring-offset-2 dark:ring-offset-surface-900' : ''">
          @for (pm of methods(); track pm.id) {
            <button
              type="button"
              class="flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors
                     border-surface-200 dark:border-surface-700 hover:border-primary hover:bg-primary-50 dark:hover:bg-primary-900/20"
              [class]="isUsed(pm) ? '!border-primary !bg-primary-50 dark:!bg-primary-900/30' : ''"
              [disabled]="loading() || (rows().length > 1 || adding() ? isUsed(pm) : false)"
              (click)="pick(pm)"
            >
              <i [class]="icon(pm.kind)" class="text-xl"></i>
              <span class="text-sm font-medium text-center leading-tight">{{ pm.name }}</span>
            </button>
          }
        </div>

        @for (row of rows(); track $index; let i = $index) {
          <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 mb-2">
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold"><i [class]="icon(row.method.kind)" class="mr-2"></i>{{ row.method.name }}</span>
              @if (rows().length > 1) {
                <p-button icon="pi pi-times" [text]="true" [rounded]="true" size="small" severity="secondary"
                  [ariaLabel]="'buttons.delete' | translate" (onClick)="remove(i)" />
              }
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs text-surface-500">{{ 'sales.pos.amount' | translate }}</label>
                <p-inputnumber
                  [ngModel]="row.amount"
                  (ngModelChange)="setAmount(i, $event)"
                  mode="decimal"
                  [minFractionDigits]="0"
                  [maxFractionDigits]="decimals()"
                  [min]="0"
                  [max]="total()"
                  [disabled]="rows().length === 1"
                  inputStyleClass="w-full text-right font-semibold"
                />
              </div>
              @if (row.method.kind === 'CASH') {
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-surface-500">{{ 'sales.pos.received' | translate }}</label>
                  <p-inputnumber
                    [ngModel]="row.received"
                    (ngModelChange)="setReceived(i, $event)"
                    mode="decimal"
                    [minFractionDigits]="0"
                    [maxFractionDigits]="decimals()"
                    [min]="0"
                    inputStyleClass="w-full text-right font-semibold"
                    [autofocus]="i === 0"
                  />
                </div>
                <div class="sm:col-span-2 flex flex-wrap gap-2">
                  @for (v of tenders(row.amount); track v) {
                    <p-button [label]="m(v)" size="small" [outlined]="row.received !== v" (onClick)="setReceived(i, v)" />
                  }
                </div>
              } @else if (row.method.requires_reference || row.method.kind !== 'CREDIT') {
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-surface-500">
                    {{ 'sales.pos.reference' | translate }}
                    @if (row.method.requires_reference) { <span class="text-red-500">*</span> }
                  </label>
                  <input pInputText [ngModel]="row.reference" (ngModelChange)="setReference(i, $event)"
                    [placeholder]="'sales.pos.reference_hint' | translate" class="w-full" />
                </div>
              }
            </div>
          </div>
        }

        @if (total() > 0 && methods().length > rows().length) {
          @if (adding()) {
            <p-button [label]="'buttons.cancel' | translate" icon="pi pi-times" [text]="true" size="small"
              severity="secondary" (onClick)="adding.set(false)" />
          } @else {
            <p-button [label]="'sales.pos.add_method' | translate" icon="pi pi-plus" [text]="true" size="small"
              [disabled]="loading()" (onClick)="adding.set(true)" />
          }
        }

        <div class="grid grid-cols-2 gap-3 mt-4">
          <div class="rounded-lg p-3 text-center"
               [class]="due() > 0 ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' : 'bg-surface-50 dark:bg-surface-800'">
            <div class="text-xs uppercase">{{ 'sales.pos.remaining' | translate }}</div>
            <div class="text-2xl font-bold">{{ m(due()) }}</div>
          </div>
          <div class="rounded-lg p-3 text-center"
               [class]="change() > 0 ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-surface-50 dark:bg-surface-800'">
            <div class="text-xs uppercase">{{ 'sales.pos.change' | translate }}</div>
            <div class="text-2xl font-bold">{{ m(change()) }}</div>
          </div>
        </div>

        @for (p of problems(); track p) {
          <p-message severity="warn" styleClass="mt-3" size="small">{{ p | translate }}</p-message>
        }
        @for (e of errors(); track e) {
          <p-message severity="error" styleClass="mt-3">{{ e }}</p-message>
        }
      </div>

    </base-dialog>
  `,
})
export class PaymentDialogComponent {
  private readonly translate = inject(TranslateService)

  readonly visible = model(false)
  readonly total = input.required<number>()
  readonly currency = input.required<CostingCurrency>()
  readonly methods = input.required<PaymentMethod[]>()
  readonly hasCustomer = input(false)
  readonly loading = input(false)
  readonly errors = input<string[]>([])
  readonly confirmed = output<CheckoutPayment[]>()

  readonly rows = signal<PaymentRow[]>([])
  /** "Add another method" was pressed: the next method tapped is added, not switched to. */
  readonly adding = signal(false)
  /** Amount inputs take cents in any currency (CLP too), as typed. */
  readonly decimals = computed(() => MONEY_MAX_DECIMALS)

  readonly paid = computed(() => round2(this.rows().reduce((s, r) => s + (r.amount || 0), 0)))
  readonly remaining = computed(() => round2(this.total() - this.paid()))
  /**
   * What the cashier still has to collect: the part of the total no payment
   * covers yet, plus cash received short of its amount (100 due, 50 received → 50).
   */
  readonly due = computed(() =>
    round2(
      Math.max(this.remaining(), 0) +
        this.rows().reduce((s, r) => s + (r.method.kind === 'CASH' ? Math.max(r.amount - (r.received || 0), 0) : 0), 0)
    )
  )
  readonly change = computed(() =>
    round2(this.rows().reduce((s, r) => s + (r.method.kind === 'CASH' ? Math.max((r.received || 0) - r.amount, 0) : 0), 0))
  )

  /** Client-side checks; the server repeats all of them. */
  readonly problems = computed(() => {
    const out: string[] = []
    const rows = this.rows()
    if (this.total() > 0 && rows.length === 0) out.push('sales.pos.pick_method')
    if (Math.abs(this.remaining()) >= 0.005 && rows.length > 0) {
      out.push(this.remaining() > 0 ? 'sales.pos.payments_short' : 'sales.pos.payments_over')
    }
    if (rows.some(r => r.method.kind === 'CASH' && (r.received || 0) < r.amount)) out.push('sales.pos.received_short')
    if (rows.some(r => r.method.requires_reference && !r.reference.trim())) out.push('sales.pos.reference_missing')
    if (rows.some(r => r.method.kind === 'CREDIT') && !this.hasCustomer()) out.push('sales.pos.credit_needs_customer')
    if (rows.some(r => r.amount <= 0)) out.push('sales.pos.amount_zero')
    return out
  })

  reset(): void {
    const methods = this.methods()
    const cash = methods.find(m => m.kind === 'CASH') ?? methods[0]
    const total = this.total()
    this.adding.set(false)
    this.rows.set(cash && total > 0 ? [newRow(cash, total)] : [])
  }

  isUsed(pm: PaymentMethod): boolean {
    return this.rows().some(r => r.method.id === pm.id)
  }

  /**
   * Single payment (the common case): tapping a method switches the whole
   * payment to it. Mixed payment ("add another method" pressed, or already two
   * or more): the method is added for what is still due; when nothing is due,
   * the last payment is split in half (100 cash → 50 cash + 50 card), and
   * editing either amount rebalances the other.
   */
  pick(pm: PaymentMethod): void {
    const rows = this.rows()
    const mixed = this.adding() || rows.length > 1
    this.adding.set(false)
    if (!mixed) {
      this.rows.set([newRow(pm, this.total())])
      return
    }
    if (rows.some(r => r.method.id === pm.id)) return
    const due = Math.max(this.remaining(), 0)
    if (due > 0 || rows.length === 0) {
      this.rows.set([...rows, newRow(pm, due)])
      return
    }
    const last = rows[rows.length - 1]
    const half = roundCurrency(last.amount / 2, this.currency())
    this.rows.set([...rows.slice(0, -1), withAmount(last, round2(last.amount - half)), newRow(pm, half)])
  }

  remove(i: number): void {
    const removed = this.rows()[i]
    const rows = this.rows().filter((_, j) => j !== i)
    if (rows.length === 1) {
      rows[0] = withAmount(rows[0], this.total())
    } else if (rows.length > 1 && removed) {
      // The last payment takes over what the removed one covered.
      const last = rows.length - 1
      rows[last] = withAmount(rows[last], round2(rows[last].amount + removed.amount))
    }
    this.rows.set(rows)
  }

  /**
   * Changing one amount moves the difference to a partner payment (the last
   * one, or the one before it when editing the last), so the payments keep
   * adding up to the total: with 100 in two payments, typing 30 cash leaves 70 card.
   */
  setAmount(i: number, v: number | null): void {
    const rows = [...this.rows()]
    if (!rows[i]) return
    const amount = Math.min(Math.max(round2(v ?? 0), 0), this.total())
    const delta = round2(amount - rows[i].amount)
    if (delta === 0) return
    rows[i] = withAmount(rows[i], amount)
    if (rows.length > 1) {
      const j = i === rows.length - 1 ? rows.length - 2 : rows.length - 1
      rows[j] = withAmount(rows[j], Math.max(round2(rows[j].amount - delta), 0))
    }
    this.rows.set(rows)
  }

  setReceived(i: number, v: number | null): void {
    this.patch(i, r => ({ ...r, received: round2(v ?? 0), receivedTouched: true }))
  }

  setReference(i: number, v: string): void {
    this.patch(i, r => ({ ...r, reference: v ?? '' }))
  }

  private patch(i: number, fn: (r: PaymentRow) => PaymentRow): void {
    this.rows.set(this.rows().map((r, j) => (j === i ? fn(r) : r)))
  }

  tenders(amount: number): number[] {
    return quickTenders(amount, this.currency())
  }

  onEnter(e: Event): void {
    e.preventDefault()
    if ((e.target as HTMLElement)?.tagName === 'BUTTON') return
    this.submit()
  }

  submit(): void {
    if (this.loading() || this.problems().length > 0) return
    this.confirmed.emit(
      this.rows().map(r => ({
        payment_method_id: r.method.id,
        amount: r.amount,
        received: r.method.kind === 'CASH' ? r.received : r.amount,
        reference: r.reference.trim(),
      }))
    )
  }

  m(v: number): string {
    return money(v, this.currency())
  }

  icon(kind: string): string {
    return kindIcon(kind)
  }
}
