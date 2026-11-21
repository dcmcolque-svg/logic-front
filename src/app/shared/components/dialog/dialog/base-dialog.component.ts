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
  /**
   * Allow closing by clicking the backdrop. Off by default: a stray click
   * outside a form dialog would throw away everything the user typed.
   */
  dismissableMask = input(false)

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
  /** Save button color — e.g. 'danger' for an irreversible action. Default: primary */
  saveSeverity = input<'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' | undefined>(undefined)
  /**
   * Enter in a one-line field presses Save. Turn it off for irreversible
   * actions where the user types several numbers (e.g. a cash count).
   */
  submitOnEnter = input(true)

  /** Emitted when save is clicked */
  save = output<void>()
  /** Emitted when dialog is hidden */
  hide = output<void>()
  /** Emitted once the dialog has opened (e.g. to reset the form and focus a field) */
  shown = output<void>()

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

  /**
   * Enter in a one-line field saves, like a native form. Skipped for textareas
   * and buttons, when a component already handled the key (an autocomplete
   * picking an option calls preventDefault), and while saving is not allowed.
   */
  onEnter(event: Event) {
    const e = event as KeyboardEvent
    const target = e.target as HTMLElement | null
    if (e.defaultPrevented || e.isComposing || e.shiftKey) return
    if (!target || target.tagName !== 'INPUT') return
    const type = (target as HTMLInputElement).type
    if (['checkbox', 'radio', 'button', 'submit', 'file'].includes(type)) return
    if (!this.submitOnEnter() || !this.showFooter() || !this.showSave() || this.saveDisabled() || this.loading()) return
    e.preventDefault()
    this.save.emit()
  }

  onCancel() {
    this.hide.emit()
  }
}
