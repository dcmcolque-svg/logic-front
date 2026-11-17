import {
  Component,
  input,
  output,
  computed,
  inject,
  viewChild,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { Dialog, DialogModule } from 'primeng/dialog'
import { ButtonModule } from 'primeng/button'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { BaseLoadingOverlay } from '../../loading/loading-overlay/base-loading-overlay.component'

/**
 * ShDialog — Smart responsive dialog wrapper.
 * Equivalent to agetic's CustomDialog.
 *
 * Features:
 * - Auto-fullscreen on mobile (< 768px)
 * - Standardized footer with Save/Cancel buttons
 * - Loading state overlay
 * - Predefined sizes (sm/md/lg/xl)
 *
 * Usage:
 * ```html
 * <sh-dialog
 *   [visible]="showDialog"
 *   header="labels.create_order"
 *   size="md"
 *   [loading]="isSaving"
 *   (save)="onSave()"
 *   (hide)="showDialog = false"
 * >
 *   <sh-form-group>...</sh-form-group>
 * </sh-dialog>
 * ```
 */
@Component({
  selector: 'base-dialog',
  standalone: true,
  imports: [
    CommonModule,
    DialogModule,
    ButtonModule,
    TranslateModule,
    BaseLoadingOverlay,
  ],
  templateUrl: './base-dialog.component.html',
  styleUrl: './base-dialog.component.scss',
})
export class BaseDialog {
  private readonly translate = inject(TranslateService)

  /** Reference to PrimeNG Dialog to read its ariaLabelledBy id */
  readonly dialog = viewChild(Dialog)

  /** Dialog visibility (two-way) */
  visible = input(false)
  /** Header text — i18n translation key */
  header = input('')
  /** Optional sub-header shown below the main title (plain text, not translated) */
  subHeader = input('')
  /** Predefined size */
  size = input<'sm' | 'md' | 'lg' | 'xl'>('md')
  /** Show loading overlay */
  loading = input(false)
  /** Allow closing with X button */
  closable = input(true)
  /** Allow closing with Escape key */
  closeOnEscape = input(true)
  /** Allow closing by clicking the backdrop */
  dismissableMask = input(true)

  // Footer config
  /** Show footer section */
  showFooter = input(true)
  /** Show save button */
  showSave = input(true)
  /** Show cancel button */
  showCancel = input(true)
  /** Save button label — i18n key */
  saveLabel = input('labels.save')
  /** Cancel button label — i18n key */
  cancelLabel = input('labels.cancel')
  /** Save button icon */
  saveIcon = input('pi pi-check')
  /** Disable save button */
  saveDisabled = input(false)

  /** Emitted when save is clicked */
  save = output<void>()
  /** Emitted when dialog is hidden */
  hide = output<void>()

  translatedHeader = computed(() => {
    const key = this.header()
    return key ? this.translate.instant(key) : ''
  })

  private readonly SIZE_MAP: Record<string, string> = {
    sm: '30rem',
    md: '50rem',
    lg: '70rem',
    xl: '90rem',
  }

  dialogStyle = computed(() => ({
    width: this.SIZE_MAP[this.size()] || this.SIZE_MAP['md'],
  }))

  onVisibleChange(value: boolean) {
    if (!value) {
      this.hide.emit()
    }
  }

  onCancel() {
    this.hide.emit()
  }
}
