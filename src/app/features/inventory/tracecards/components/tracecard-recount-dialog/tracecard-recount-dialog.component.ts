import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core'
import { DecimalPipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { InputNumberModule } from 'primeng/inputnumber'
import { MessageModule } from 'primeng/message'
import { SelectModule } from 'primeng/select'
import { finalize } from 'rxjs'

import { BaseDialog } from '@/app/shared/components/dialog/dialog/base-dialog.component'
import { TracecardsService } from '../../warehouse.service'
import { AppErrorBody, RecountInput, RecountResult, TracecardItem } from '../../types/warehouse.types'

/**
 * Reason codes, stored as-is in inv_adjustments.reason_code. The reason is only
 * a label: a recount never sets stock aside, it adds or removes units. So each
 * reason is offered only for the direction it describes — DAMAGED / LOST are
 * write-offs (units leave the inventory), FOUND-ITEM only adds.
 */
const REASONS: ReadonlyArray<{ code: string; when: 'any' | 'add' | 'remove' }> = [
  { code: 'CYCLE-COUNT', when: 'any' },
  { code: 'CORRECTION', when: 'any' },
  { code: 'FOUND-ITEM', when: 'add' },
  { code: 'DAMAGED', when: 'remove' },
  { code: 'LOST', when: 'remove' },
]
const DEFAULT_REASON = 'CYCLE-COUNT'

/**
 * Physical recount of one tracecard. The operator enters the quantity counted;
 * the dialog sends the difference with the system quantity, since
 * POST /v2/inventory/recount adds `qty` to qty_on_hand.
 */
@Component({
  selector: 'app-tracecard-recount-dialog',
  standalone: true,
  imports: [DecimalPipe, FormsModule, TranslateModule, InputNumberModule, MessageModule, SelectModule, BaseDialog],
  templateUrl: './tracecard-recount-dialog.component.html',
})
export class TracecardRecountDialogComponent {
  private readonly svc = inject(TracecardsService)
  private readonly translate = inject(TranslateService)

  visible = input(false)
  item = input<TracecardItem | null>(null)

  hide = output<void>()
  done = output<RecountResult>()

  counted = signal<number | null>(null)
  private readonly pickedReason = signal<string>(DEFAULT_REASON)
  saving = signal(false)
  formError = signal<string | null>(null)

  /** Units to add (+) or remove (−) from the system quantity. */
  delta = computed(() => {
    const it = this.item()
    const c = this.counted()
    if (!it || c === null || c === undefined) return 0
    return round4(c - it.qty_on_hand)
  })

  /** Reasons that fit the direction of the adjustment. */
  reasonOptions = computed(() => {
    const d = this.delta()
    return REASONS.filter(
      (r) => r.when === 'any' || (r.when === 'add' && d > 0) || (r.when === 'remove' && d < 0)
    ).map((r) => ({ code: r.code, label: `tracecard_ops.reasons.${r.code}` }))
  })

  /** The picked reason, falling back to the default once it no longer fits the direction. */
  reason = computed(() => {
    const picked = this.pickedReason()
    return this.reasonOptions().some((o) => o.code === picked) ? picked : DEFAULT_REASON
  })

  /** Units removed by the recount leave the inventory: a write-off, not a set-aside. */
  writesOff = computed(() => this.delta() < 0)

  /** A count below the reserved units releases allocations (orders fall back to backorder). */
  releasesReserved = computed(() => {
    const it = this.item()
    const c = this.counted()
    return !!it && c !== null && this.delta() < 0 && c < it.qty_reserved
  })

  canSave = computed(() => {
    const c = this.counted()
    return c !== null && c !== undefined && c >= 0 && this.delta() !== 0
  })

  pickReason(code: string): void {
    this.pickedReason.set(code)
  }

  constructor() {
    effect(() => {
      if (!this.visible()) return
      const it = this.item()
      untracked(() => {
        this.counted.set(it ? it.qty_on_hand : null)
        this.pickedReason.set(DEFAULT_REASON)
        this.formError.set(null)
        this.saving.set(false)
      })
    })
  }

  save(): void {
    const item = this.item()
    if (!item || this.saving() || !this.canSave()) return
    this.formError.set(null)

    const payload: RecountInput = {
      kardex_id: item.id,
      qty: this.delta(),
      reason_code: this.reason(),
    }

    this.saving.set(true)
    this.svc
      .recount(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (res) => this.done.emit(res),
        error: (err) => {
          const body = ((err as { error?: AppErrorBody })?.error ?? err) as AppErrorBody
          const code = body?.code ?? ''
          const key = `errors.${code}`
          const t = code ? this.translate.instant(key) : ''
          this.formError.set(t && t !== key ? t : body?.message || this.translate.instant('messages.save_error'))
        },
      })
  }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
