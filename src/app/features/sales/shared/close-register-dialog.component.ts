import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { InputNumberModule } from 'primeng/inputnumber'
import { MessageModule } from 'primeng/message'
import { TextareaModule } from 'primeng/textarea'
import { ToggleSwitchModule } from 'primeng/toggleswitch'

import { BaseDialog } from '@/app/shared/components'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { CostingCurrency, MONEY_MAX_DECIMALS } from '@/app/shared/utils/costing.util'
import { SalesService } from '../sales.service'
import { SessionSummary } from '../sales.types'
import { denominations, money, round2, salesErrorMessages } from '../sales.util'
import { SessionSummaryViewComponent } from './session-summary-view.component'
import { printLabels, printSessionReport, REPORT_KEYS } from './print.util'

/**
 * Cash count and close. The cashier counts the drawer (optionally bill by
 * bill); the server computes what should be there and stores the difference.
 * The summary is refreshed on open so late sales are included.
 */
@Component({
  selector: 'app-close-register-dialog',
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    ButtonModule,
    BaseDialog,
    InputNumberModule,
    MessageModule,
    TextareaModule,
    ToggleSwitchModule,
    SessionSummaryViewComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Closing is irreversible: no Enter-to-save (the cashier types counts) -->
    <base-dialog
      [visible]="visible()"
      [header]="done() ? 'sales.register.closed_title' : 'sales.register.close_title'"
      size="lg"
      [loading]="saving()"
      [submitOnEnter]="false"
      [saveLabel]="done() ? 'sales.register.print_report' : 'sales.register.confirm_close'"
      [saveIcon]="done() ? 'pi pi-print' : 'pi pi-lock'"
      [saveSeverity]="done() ? undefined : 'danger'"
      [cancelLabel]="done() ? 'buttons.close' : 'buttons.cancel'"
      [saveDisabled]="!done() && (counted() === null || needsNote())"
      (save)="done() ? print() : confirm()"
      (hide)="visible.set(false)"
      (shown)="refresh()"
    >
      @if (summary(); as s) {
        @if (done()) {
          <div class="text-center py-2 mb-4">
            <i class="pi pi-lock text-4xl text-surface-400"></i>
            <div class="text-lg font-semibold mt-2">{{ s.session.session_number }} · {{ 'sales.register.status_closed' | translate }}</div>
            <div class="text-3xl font-bold mt-2" [class]="diffClass(s.session.difference ?? 0)">
              {{ diffLabel(s.session.difference ?? 0) }}
            </div>
          </div>
          <app-session-summary-view [summary]="s" />
        } @else {
          <app-session-summary-view [summary]="s" />

          <div class="mt-5 p-4 rounded-lg border border-surface-200 dark:border-surface-700">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div class="font-semibold">{{ 'sales.register.count_cash' | translate }}</div>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <p-toggleswitch [(ngModel)]="byBills" />
                {{ 'sales.register.count_by_bills' | translate }}
              </label>
            </div>

            @if (byBills) {
              <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
                @for (d of bills(); track d; let i = $index) {
                  <div class="flex flex-col gap-1">
                    <small class="text-surface-500">{{ m(d) }}</small>
                    <p-inputnumber
                      [ngModel]="billQty()[i]"
                      (ngModelChange)="setBill(i, $event)"
                      [min]="0"
                      [showButtons]="false"
                      inputStyleClass="w-full text-right"
                      placeholder="0"
                    />
                  </div>
                }
              </div>
            }

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div class="flex flex-col gap-1">
                <label for="counted" class="text-sm">{{ 'sales.register.counted' | translate }}</label>
                <p-inputnumber
                  inputId="counted"
                  [ngModel]="counted()"
                  (ngModelChange)="counted.set($event)"
                  [disabled]="byBills"
                  mode="decimal"
                  [minFractionDigits]="0"
                  [maxFractionDigits]="decimals()"
                  [min]="0"
                  inputStyleClass="w-full text-right text-xl font-semibold"
                  [autofocus]="true"
                />
              </div>
              <div class="md:col-span-2">
                @if (counted() !== null) {
                  <div class="rounded-lg p-3 text-center" [class]="diffBg(difference())">
                    <div class="text-xs uppercase">{{ 'sales.register.difference' | translate }}</div>
                    <div class="text-2xl font-bold">{{ diffLabel(difference()) }}</div>
                  </div>
                }
              </div>
            </div>

            <div class="flex flex-col gap-1 mt-3">
              <label for="closingNote" class="text-sm">{{ 'sales.register.note' | translate }}
                @if (difference() !== 0 && counted() !== null) { <span class="text-orange-500">*</span> }
              </label>
              <textarea pTextarea id="closingNote" rows="2" [ngModel]="note()" (ngModelChange)="note.set($event)" class="w-full"
                [placeholder]="'sales.register.note_difference_hint' | translate"></textarea>
            </div>
          </div>

          @for (e of errors(); track e) {
            <p-message severity="error" styleClass="mt-3">{{ e }}</p-message>
          }
        }
      } @else {
        <div class="p-8 text-center text-surface-500"><i class="pi pi-spin pi-spinner text-2xl"></i></div>
      }

    </base-dialog>
  `,
})
export class CloseRegisterDialogComponent {
  private readonly svc = inject(SalesService)
  private readonly translate = inject(TranslateService)
  private readonly facilityScope = inject(FacilityScopeService)

  readonly visible = model(false)
  readonly sessionId = input.required<string>()
  readonly closed = output<SessionSummary>()

  readonly summary = signal<SessionSummary | null>(null)
  readonly counted = signal<number | null>(null)
  readonly billQty = signal<number[]>([])
  readonly saving = signal(false)
  readonly done = signal(false)
  readonly errors = signal<string[]>([])
  readonly note = signal('')
  private _byBills = false

  get byBills(): boolean {
    return this._byBills
  }
  set byBills(v: boolean) {
    this._byBills = v
    if (v) this.recountBills()
  }

  readonly currency = computed(() => (this.summary()?.session.currency ?? 'BOB') as CostingCurrency)
  /** Amount inputs take cents in any currency (CLP too), as typed. */
  readonly decimals = computed(() => MONEY_MAX_DECIMALS)
  readonly bills = computed(() => [...denominations(this.currency())].reverse())
  readonly difference = computed(() => round2((this.counted() ?? 0) - (this.summary()?.expected ?? 0)))
  /** A difference must be explained before closing. */
  readonly needsNote = computed(() => this.counted() !== null && this.difference() !== 0 && !this.note().trim())

  constructor() {
    effect(() => {
      if (!this.visible()) {
        untracked(() => {
          this.done.set(false)
          this.counted.set(null)
          this.errors.set([])
          this.note.set('')
          this._byBills = false
        })
      }
    })
  }

  refresh(): void {
    this.summary.set(null)
    this.svc.sessionSummary(this.sessionId()).subscribe({
      next: s => {
        this.summary.set(s)
        this.billQty.set(this.bills().map(() => 0))
        if (s.session.status === 'CLOSED') this.done.set(true)
      },
      error: e => this.errors.set(salesErrorMessages(e, this.translate)),
    })
  }

  setBill(i: number, qty: number | null): void {
    const next = [...this.billQty()]
    next[i] = Math.max(0, qty ?? 0)
    this.billQty.set(next)
    this.recountBills()
  }

  private recountBills(): void {
    const total = this.bills().reduce((s, d, i) => s + d * (this.billQty()[i] ?? 0), 0)
    this.counted.set(round2(total))
  }

  confirm(): void {
    const counted = this.counted()
    if (counted === null) return
    this.saving.set(true)
    this.errors.set([])
    this.svc.closeSession(this.sessionId(), counted, this.note().trim()).subscribe({
      next: s => {
        this.summary.set(s)
        this.saving.set(false)
        this.done.set(true)
        this.closed.emit(s)
      },
      error: e => {
        this.saving.set(false)
        this.errors.set(salesErrorMessages(e, this.translate))
      },
    })
  }

  print(): void {
    const s = this.summary()
    if (!s) return
    printSessionReport(s, printLabels(REPORT_KEYS, k => this.translate.instant(k)), this.facilityScope.zoneOf(s.session.facility_id))
  }

  m(v: number | null | undefined): string {
    return money(v, this.currency())
  }

  diffLabel(d: number): string {
    if (d === 0) return this.translate.instant('sales.register.balanced')
    const key = d < 0 ? 'sales.register.short' : 'sales.register.over'
    return `${this.translate.instant(key)} ${this.m(Math.abs(d))}`
  }

  diffClass(d: number): string {
    return d < 0 ? 'text-red-600' : d > 0 ? 'text-orange-500' : 'text-green-600'
  }

  diffBg(d: number): string {
    return d < 0
      ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
      : d > 0
        ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
        : 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  }
}
