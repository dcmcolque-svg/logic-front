import { Component, input, output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { BaseConfirmDialog } from '@/app/shared/components/dialog/confirm-dialog/base-confirm-dialog.component'

@Component({
  selector: 'app-demo-confirm-dialog',
  standalone: true,
  imports: [CommonModule, TranslateModule, BaseConfirmDialog],
  templateUrl: './demo-confirm-dialog.component.html',
  styleUrl: './demo-confirm-dialog.component.scss',
})
export class DemoConfirmDialogComponent {
  /** Dialog visibility */
  visible = input(false)
  /** Emitted when confirmed */
  confirm = output<void>()
  /** Emitted when dialog is hidden */
  hide = output<void>()
}
