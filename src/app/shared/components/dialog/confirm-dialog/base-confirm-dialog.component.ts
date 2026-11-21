import { Component, input, output, computed, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { DialogModule } from 'primeng/dialog'
import { ButtonModule } from 'primeng/button'
import { TranslateModule, TranslateService } from '@ngx-translate/core'

/**
 * ShConfirmDialog — Confirmation dialog with severity icon.
 * Equivalent to agetic's AlertDialog.
 *
 * Usage:
 * ```html
 * <sh-confirm-dialog
 *   [visible]="showConfirm"
 *   title="labels.confirm_delete"
 *   message="labels.confirm_delete_message"
 *   severity="danger"
 *   confirmLabel="labels.delete"
 *   (confirm)="onDelete()"
 *   (hide)="showConfirm = false"
 * />
 * ```
 */
@Component({
  selector: 'base-confirm-dialog',
  standalone: true,
  imports: [CommonModule, DialogModule, ButtonModule, TranslateModule],
  templateUrl: './base-confirm-dialog.component.html',
  styleUrl: './base-confirm-dialog.component.scss',
})
export class BaseConfirmDialog {
  private readonly translate = inject(TranslateService)

  /** Dialog visibility */
  visible = input(false)
  /** Title — i18n key */
  title = input('labels.confirm')
  /** Message — i18n key */
  message = input('labels.are_you_sure')
  /** Visual severity */
  severity = input<'success' | 'info' | 'warn' | 'danger'>('warn')
  /** Loading state */
  loading = input(false)
  /** Confirm button label — i18n key */
  confirmLabel = input('labels.confirm')
  /** Cancel button label — i18n key */
  cancelLabel = input('labels.cancel')
  /** Confirm button icon */
  confirmIcon = input('pi pi-check')
  /** Params for the message translation, e.g. { count: 3 } */
  messageParams = input<Record<string, unknown>>({})
  /** What the dialog is about (an item's name): plain text, shown bold above the message */
  subject = input('')
  /** False for a notice with a single acknowledge button (the confirm button) */
  showCancel = input(true)

  /** Emitted when confirm is clicked */
  confirm = output<void>()
  /** Emitted when dialog is hidden */
  hide = output<void>()

  translatedTitle = computed(() => this.translate.instant(this.title()))

  iconContainerClass = computed(() => {
    const map: Record<string, string> = {
      success: 'bg-green-100 dark:bg-green-900/30 text-green-600',
      info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
      warn: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600',
      danger: 'bg-red-100 dark:bg-red-900/30 text-red-600',
    }
    return map[this.severity()] || map['warn']
  })

  iconClass = computed(() => {
    const map: Record<string, string> = {
      success: 'pi pi-check-circle',
      info: 'pi pi-info-circle',
      warn: 'pi pi-exclamation-triangle',
      danger: 'pi pi-trash',
    }
    return map[this.severity()] || map['warn']
  })

  onVisibleChange(value: boolean) {
    if (!value) this.hide.emit()
  }
}
