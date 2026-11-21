import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core'
import { DecimalPipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MessageModule } from 'primeng/message'
import { SelectModule } from 'primeng/select'
import { TextareaModule } from 'primeng/textarea'
import { finalize } from 'rxjs'

import { BaseDialog } from '@/app/shared/components/dialog/dialog/base-dialog.component'
import { TracecardsService } from '../../warehouse.service'
import { AppErrorBody, BlockInput, BlockResult, ReservingOrder, TracecardItem } from '../../types/warehouse.types'

/** Hold reasons offered; stored in inv_holds.reason_code (backend accepts any upper-case code). */
const HOLD_REASONS = ['DAMAGED', 'QA_INSPECTION', 'EXPIRED', 'QUARANTINE', 'OTHER'] as const

/** Notes cap for the textarea (the backend does not limit inv_holds.notes). */
const MAX_NOTES_LENGTH = 500

/**
 * Blocks a whole tracecard: the units stay on hand but cannot be reserved for
 * orders / POS, moved or recounted until unblocked. POST /v2/inventory/block.
 *
 * Blocking applies to all of qty_on_hand; to set aside only part of it, move
 * those units to their own location/container first and block that tracecard.
 */
@Component({
  selector: 'app-tracecard-block-dialog',
  standalone: true,
  imports: [DecimalPipe, FormsModule, TranslateModule, MessageModule, SelectModule, TextareaModule, BaseDialog],
  templateUrl: './tracecard-block-dialog.component.html',
})
export class TracecardBlockDialogComponent {
  private readonly svc = inject(TracecardsService)
  private readonly translate = inject(TranslateService)

  visible = input(false)
  item = input<TracecardItem | null>(null)

  hide = output<void>()
  done = output<BlockResult>()

  reason = signal<string>('DAMAGED')
  notes = signal('')
  saving = signal(false)
  formError = signal<string | null>(null)
  /** Orders holding reservations on the tracecard (BLOCK_HAS_RESERVATIONS). */
  reservingOrders = signal<ReservingOrder[]>([])

  readonly maxNotes = MAX_NOTES_LENGTH
  readonly reasonOptions = HOLD_REASONS.map((code) => ({ code, label: `tracecard_ops.hold_reasons.${code}` }))

  /** OTHER says nothing on its own: it needs the notes. */
  canSave = computed(() => !!this.reason() && (this.reason() !== 'OTHER' || !!this.notes().trim()))

  constructor() {
    effect(() => {
      if (!this.visible()) return
      this.item()
      untracked(() => {
        this.reason.set('DAMAGED')
        this.notes.set('')
        this.formError.set(null)
        this.reservingOrders.set([])
        this.saving.set(false)
      })
    })
  }

  save(): void {
    const item = this.item()
    if (!item || this.saving() || !this.canSave()) return
    this.formError.set(null)
    this.reservingOrders.set([])

    const payload: BlockInput = { kardex_id: item.id, reason_code: this.reason() }
    const notes = this.notes().trim()
    if (notes) payload.notes = notes

    this.saving.set(true)
    this.svc
      .block(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (res) => this.done.emit(res),
        error: (err) => {
          const body = ((err as { error?: AppErrorBody })?.error ?? err) as AppErrorBody
          const code = body?.code ?? ''
          if (code === 'BLOCK_HAS_RESERVATIONS') {
            this.reservingOrders.set((body.meta?.['orders'] as ReservingOrder[] | undefined) ?? [])
          }
          const key = `errors.${code}`
          const t = code ? this.translate.instant(key) : ''
          this.formError.set(t && t !== key ? t : body?.message || this.translate.instant('messages.save_error'))
        },
      })
  }
}
