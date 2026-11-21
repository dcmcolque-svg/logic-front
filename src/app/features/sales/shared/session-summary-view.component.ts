import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { FacilityDatePipe } from '@/app/shared/pipes/facility-date.pipe'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TagModule } from 'primeng/tag'

import { CostingCurrency } from '@/app/shared/utils/costing.util'
import { SessionSummary } from '../sales.types'
import { kindIcon, money } from '../sales.util'

/** Read-only drawer breakdown of a cash session: methods, cash flow, movements. */
@Component({
  selector: 'app-session-summary-view',
  standalone: true,
  imports: [FacilityDatePipe, TranslateModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = summary();
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <div class="rounded-lg bg-surface-50 dark:bg-surface-800 p-3">
        <div class="text-xs text-surface-500 uppercase">{{ 'sales.register.sales_count' | translate }}</div>
        <div class="text-xl font-semibold">{{ s.sales_count }}</div>
      </div>
      <div class="rounded-lg bg-surface-50 dark:bg-surface-800 p-3">
        <div class="text-xs text-surface-500 uppercase">{{ 'sales.register.sales_total' | translate }}</div>
        <div class="text-xl font-semibold">{{ m(s.sales_total) }}</div>
      </div>
      <div class="rounded-lg bg-surface-50 dark:bg-surface-800 p-3">
        <div class="text-xs text-surface-500 uppercase">{{ 'sales.register.discounts' | translate }}</div>
        <div class="text-xl font-semibold">{{ m(s.discounts) }}</div>
      </div>
      <div class="rounded-lg bg-primary-50 dark:bg-primary-900/30 p-3">
        <div class="text-xs text-primary-700 dark:text-primary-300 uppercase">{{ 'sales.register.expected_cash' | translate }}</div>
        <div class="text-xl font-semibold text-primary-700 dark:text-primary-300">{{ m(s.expected) }}</div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <div class="text-sm font-semibold mb-2">{{ 'sales.register.by_method' | translate }}</div>
        @for (x of s.methods; track x.payment_method_id) {
          <div class="flex items-center justify-between py-1.5 border-b border-surface-100 dark:border-surface-800">
            <span><i [class]="icon(x.kind)" class="mr-2 text-surface-500"></i>{{ x.method_name }}
              <small class="text-surface-500">({{ x.payments }})</small></span>
            <span class="font-mono">{{ m(x.amount) }}</span>
          </div>
        } @empty {
          <div class="text-sm text-surface-500 py-2">{{ 'sales.register.no_sales_yet' | translate }}</div>
        }
        @if (s.collections?.length) {
          <div class="text-sm font-semibold mt-4 mb-2">{{ 'sales.register.collections' | translate }}</div>
          @for (x of s.collections; track x.payment_method_id) {
            <div class="flex items-center justify-between py-1.5 border-b border-surface-100 dark:border-surface-800">
              <span><i [class]="icon(x.kind)" class="mr-2 text-surface-500"></i>{{ x.method_name }}
                <small class="text-surface-500">({{ x.payments }})</small></span>
              <span class="font-mono">{{ m(x.amount) }}</span>
            </div>
          }
        }
      </div>

      <div>
        <div class="text-sm font-semibold mb-2">{{ 'sales.register.drawer' | translate }}</div>
        <div class="flex justify-between py-1"><span>{{ 'sales.register.opening' | translate }}</span><span class="font-mono">{{ m(s.session.opening_amount) }}</span></div>
        <div class="flex justify-between py-1"><span>+ {{ 'sales.register.cash_sales' | translate }}</span><span class="font-mono">{{ m(s.cash_sales) }}</span></div>
        @if (s.cash_collections) {
          <div class="flex justify-between py-1"><span>+ {{ 'sales.register.cash_collections' | translate }}</span><span class="font-mono">{{ m(s.cash_collections) }}</span></div>
        }
        <div class="flex justify-between py-1"><span>+ {{ 'sales.register.cash_in' | translate }}</span><span class="font-mono">{{ m(s.cash_in) }}</span></div>
        <div class="flex justify-between py-1"><span>− {{ 'sales.register.cash_out' | translate }}</span><span class="font-mono">{{ m(s.cash_out) }}</span></div>
        <div class="flex justify-between py-1.5 mt-1 border-t border-surface-200 dark:border-surface-700 font-semibold">
          <span>{{ 'sales.register.expected_cash' | translate }}</span><span class="font-mono">{{ m(s.expected) }}</span>
        </div>
        @if (s.session.status === 'CLOSED') {
          <div class="flex justify-between py-1"><span>{{ 'sales.register.counted' | translate }}</span><span class="font-mono">{{ m(s.session.counted_amount) }}</span></div>
          <div class="flex justify-between py-1 font-semibold" [class]="diffClass()">
            <span>{{ 'sales.register.difference' | translate }}</span><span class="font-mono">{{ m(s.session.difference) }}</span>
          </div>
        }
      </div>
    </div>

    @if (s.session.scope === 'FACILITY' && (s.users?.length ?? 0) > 0) {
      <div class="text-sm font-semibold mt-4 mb-2">{{ 'sales.register.by_user' | translate }}</div>
      @for (u of s.users; track u.user_id) {
        <div class="flex items-center justify-between py-1.5 border-b border-surface-100 dark:border-surface-800">
          <span><i class="pi pi-user mr-2 text-surface-500"></i>{{ u.user_name || '—' }}
            <small class="text-surface-500">({{ u.sales_count }})</small></span>
          <span class="font-mono">{{ m(u.sales_total) }}</span>
        </div>
      }
    }

    @if (s.movements.length > 0) {
      <div class="text-sm font-semibold mt-4 mb-2">{{ 'sales.register.movements' | translate }}</div>
      @for (mv of s.movements; track mv.id) {
        <div class="flex items-center justify-between py-1.5 border-b border-surface-100 dark:border-surface-800 text-sm">
          <span>
            <p-tag [value]="('sales.register.kind_' + mv.kind.toLowerCase()) | translate" [severity]="mv.kind === 'IN' ? 'success' : 'warn'" />
            <span class="ml-2">{{ mv.reason }}</span>
            <small class="block text-surface-500">{{ mv.user_name }} · {{ mv.created_at | facilityDate: 'dateTime' : s.session.facility_id }}</small>
          </span>
          <span class="font-mono">{{ mv.kind === 'IN' ? '+' : '−' }}{{ m(mv.amount) }}</span>
        </div>
      }
    }
  `,
})
export class SessionSummaryViewComponent {
  private readonly translate = inject(TranslateService)
  readonly summary = input.required<SessionSummary>()

  readonly diffClass = computed(() => {
    const d = this.summary().session.difference ?? 0
    return d < 0 ? 'text-red-600' : d > 0 ? 'text-orange-500' : 'text-green-600'
  })

  m(v: number | null | undefined): string {
    return money(v, this.summary().session.currency as CostingCurrency)
  }

  icon(kind: string): string {
    return kindIcon(kind)
  }
}
