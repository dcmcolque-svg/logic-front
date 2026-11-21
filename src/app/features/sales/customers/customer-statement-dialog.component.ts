import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { MessageModule } from 'primeng/message'
import { SelectModule } from 'primeng/select'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'

import { BaseDialog } from '@/app/shared/components'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { FacilityDatePipe } from '@/app/shared/pipes/facility-date.pipe'
import { CostingCurrency } from '@/app/shared/utils/costing.util'
import { SalesService } from '../sales.service'
import { CustomerStatement, PaymentMethod } from '../sales.types'
import { money, salesErrorMessages } from '../sales.util'
import { CustomerPaymentDialogComponent } from '../shared/customer-payment-dialog.component'

/**
 * Account statement of a customer: debt and purchases per currency, and the
 * newest movements (sales and payments) with the running balance. A payment
 * can be taken here in any reachable facility; cash needs its open drawer.
 */
@Component({
  selector: 'app-customer-statement-dialog',
  standalone: true,
  imports: [FacilityDatePipe, FormsModule, TranslateModule, ButtonModule, BaseDialog, MessageModule, SelectModule, TableModule, TagModule, CustomerPaymentDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Read-only: nothing typed to lose, so a click outside may close it -->
    <base-dialog
      [visible]="visible()"
      header="sales.customers.statement"
      size="lg"
      [dismissableMask]="true"
      saveLabel="buttons.edit"
      saveIcon="pi pi-pencil"
      cancelLabel="buttons.close"
      [saveDisabled]="!statement()"
      (save)="editRequested.emit()"
      (hide)="visible.set(false)"
    >
      @if (loading() && !statement()) {
        <div class="p-10 text-center text-surface-500"><i class="pi pi-spin pi-spinner text-3xl"></i></div>
      }
      @for (e of errors(); track e) { <p-message severity="error">{{ e }}</p-message> }
      @if (statement(); as st) {
        @let c = st.customer;
        <div class="flex flex-wrap items-start gap-4 mb-4">
          <div class="flex-1 min-w-64">
            <div class="text-xl font-semibold">{{ c.name }}
              @if (!c.is_active) { <p-tag class="ml-2" [value]="'sales.customers.inactive' | translate" severity="secondary" /> }
            </div>
            @if (c.business_name) { <div class="text-surface-600 dark:text-surface-300">{{ c.business_name }}</div> }
            <div class="text-sm text-surface-500">
              {{ c.doc || ('sales.customers.no_doc' | translate) }}@if (c.phone) { · {{ c.phone }} }@if (c.email) { · {{ c.email }} }
            </div>
            <div class="text-xs text-surface-500">{{ c.company_name }}</div>
          </div>
          <div class="flex flex-wrap gap-2">
            @for (b of st.balances; track b.currency) {
              <div class="rounded-lg bg-orange-50 dark:bg-orange-900/20 px-4 py-2 text-right">
                <div class="text-xs uppercase text-orange-700 dark:text-orange-300">{{ 'sales.customers.owes' | translate }}</div>
                <div class="text-xl font-bold text-orange-700 dark:text-orange-300">{{ mc(b.balance, b.currency) }}</div>
              </div>
            } @empty {
              <div class="rounded-lg bg-green-50 dark:bg-green-900/20 px-4 py-2 text-green-700 dark:text-green-300">
                <i class="pi pi-check-circle mr-1"></i>{{ 'sales.customers.no_debt' | translate }}
              </div>
            }
            @for (p of st.purchases; track p.currency) {
              <div class="rounded-lg bg-surface-50 dark:bg-surface-800 px-4 py-2 text-right">
                <div class="text-xs uppercase text-surface-500">{{ 'sales.customers.purchases' | translate: { count: p.sales } }}</div>
                <div class="text-xl font-semibold">{{ mc(p.total, p.currency) }}</div>
              </div>
            }
          </div>
        </div>

        @if (st.balances.length > 0 && facilities().length > 0) {
          <div class="flex flex-wrap items-center gap-2 mb-4 rounded-lg border border-surface-200 dark:border-surface-700 p-3">
            <span class="text-sm">{{ 'sales.customers.collect_in' | translate }}</span>
            <p-select [options]="facilities()" [ngModel]="payFacilityId()" (ngModelChange)="selectPayFacility($event)"
              optionLabel="name" optionValue="id" appendTo="body" styleClass="w-56" [filter]="facilities().length > 8" />
            @if (payCurrency(); as cur) {
              <span class="text-xs text-surface-500">
                {{ cur }} · {{ (payHasSession() ? 'sales.customers.register_open' : 'sales.customers.register_closed') | translate }}
              </span>
            }
            <p-button class="ml-auto" [label]="'sales.customers.register_payment' | translate" icon="pi pi-wallet" severity="warn"
              [disabled]="!payCurrency() || !owesIn(payCurrency())" (onClick)="paymentVisible.set(true)" />
          </div>
        }

        <p-table [value]="st.entries" styleClass="p-datatable-sm" [scrollable]="true" scrollHeight="50vh" [rowHover]="true">
          <ng-template #header>
            <tr>
              <th>{{ 'labels.date' | translate }}</th>
              <th>{{ 'sales.customers.movement' | translate }}</th>
              <th>{{ 'labels.facility' | translate }}</th>
              <th class="text-right">{{ 'sales.customers.charged' | translate }}</th>
              <th class="text-right">{{ 'sales.customers.paid' | translate }}</th>
              <th class="text-right">{{ 'sales.customers.balance' | translate }}</th>
            </tr>
          </ng-template>
          <ng-template #body let-e>
            <tr>
              <td class="text-sm whitespace-nowrap">{{ e.created_at | facilityDate: 'dateTime' : e.facility_id }}</td>
              <td>
                @if (e.type === 'SALE') {
                  <span class="font-medium">{{ e.number }}</span>
                  <small class="block text-surface-500">{{ 'sales.customers.sale_of' | translate: { total: mc(e.total, e.currency) } }}</small>
                } @else {
                  <p-tag [value]="'sales.customers.payment' | translate" severity="success" />
                  <small class="block text-surface-500">{{ e.method_name }}@if (e.reference) { #{{ e.reference }} }</small>
                }
              </td>
              <td class="text-sm">{{ e.facility_name }}<small class="block text-surface-500">{{ e.user_name }}</small></td>
              <td class="text-right font-mono">@if (e.debit > 0) { {{ mc(e.debit, e.currency) }} } @else { <span class="text-surface-400">—</span> }</td>
              <td class="text-right font-mono text-green-600">@if (e.credit > 0) { {{ mc(e.credit, e.currency) }} } @else { <span class="text-surface-400">—</span> }</td>
              <td class="text-right font-mono font-semibold">{{ mc(e.balance, e.currency) }}</td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr><td colspan="6" class="text-center text-surface-500 p-6">{{ 'sales.customers.no_movements' | translate }}</td></tr>
          </ng-template>
        </p-table>
        @if (st.truncated) {
          <small class="text-surface-500">{{ 'sales.customers.truncated' | translate }}</small>
        }
      }
    </base-dialog>

    <app-customer-payment-dialog
      [(visible)]="paymentVisible"
      [customer]="statement()?.customer ?? null"
      [facilityId]="payFacilityId()"
      [facilityName]="facilityScope.nameOf(payFacilityId())"
      [currency]="payCurrency() ?? 'BOB'"
      [hasSession]="payHasSession()"
      [methods]="methods()"
      (paid)="onPaid()"
    />
  `,
})
export class CustomerStatementDialogComponent {
  private readonly svc = inject(SalesService)
  private readonly translate = inject(TranslateService)
  readonly facilityScope = inject(FacilityScopeService)

  readonly visible = model(false)
  readonly customerId = input<string | null>(null)
  /** A payment was registered: the list's balances changed. */
  readonly changed = output<void>()
  readonly editRequested = output<void>()

  readonly statement = signal<CustomerStatement | null>(null)
  readonly loading = signal(false)
  readonly errors = signal<string[]>([])
  readonly methods = signal<PaymentMethod[]>([])
  readonly paymentVisible = signal(false)

  readonly facilities = computed(() => {
    const inScope = this.facilityScope.inScope()
    return inScope.length > 0 ? inScope : this.facilityScope.all()
  })
  readonly payFacilityId = signal<string | null>(null)
  readonly payCurrency = signal<CostingCurrency | null>(null)
  readonly payHasSession = signal(false)
  private request = 0

  constructor() {
    this.facilityScope.load()
    effect(() => {
      const id = this.customerId()
      const open = this.visible()
      untracked(() => {
        if (open && id) this.load(id)
        if (!open) this.statement.set(null)
      })
    })
    effect(() => {
      const list = this.facilities()
      untracked(() => {
        if (!this.payFacilityId() && list.length > 0) this.selectPayFacility(list[0].id)
      })
    })
  }

  reload(): void {
    const id = this.customerId()
    if (id) this.load(id)
  }

  private load(id: string): void {
    const request = ++this.request
    this.loading.set(true)
    this.errors.set([])
    if (this.methods().length === 0) {
      this.svc.listPaymentMethods(true).subscribe({ next: r => this.methods.set(r.data ?? []) })
    }
    this.svc.customerStatement(id).subscribe({
      next: st => {
        if (request !== this.request) return
        this.statement.set(st)
        this.loading.set(false)
      },
      error: e => {
        if (request !== this.request) return
        this.loading.set(false)
        this.errors.set(salesErrorMessages(e, this.translate))
      },
    })
  }

  /** The facility decides the currency of the payment and whether cash is possible. */
  selectPayFacility(id: string): void {
    this.payFacilityId.set(id)
    this.payCurrency.set(null)
    this.payHasSession.set(false)
    this.svc.currentSession(id).subscribe({
      next: res => {
        if (this.payFacilityId() !== id) return
        this.payCurrency.set(res.currency ?? 'BOB')
        this.payHasSession.set(res.session?.session.status === 'OPEN')
      },
      error: () => {
        if (this.payFacilityId() === id) this.payCurrency.set(null)
      },
    })
  }

  owesIn(currency: CostingCurrency | null): boolean {
    return !!currency && (this.statement()?.balances ?? []).some(b => b.currency === currency && b.balance > 0)
  }

  onPaid(): void {
    this.reload()
    this.changed.emit()
  }

  mc(v: number, currency: CostingCurrency): string {
    return money(v, currency)
  }
}
