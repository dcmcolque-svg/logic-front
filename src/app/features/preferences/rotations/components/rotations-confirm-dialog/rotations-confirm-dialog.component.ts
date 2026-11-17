import { Component, input, output } from '@angular/core'
import { CommonModule } from '@angular/common'
import { BaseConfirmDialog } from '@/app/shared/components/dialog/confirm-dialog/base-confirm-dialog.component'
import { ButtonModule } from 'primeng/button'
import { TranslateModule } from '@ngx-translate/core'
import { InventoryRotation } from '../../services/rotations.types'

@Component({
  selector: 'app-rotations-confirm-dialog',
  standalone: true,
  imports: [CommonModule, BaseConfirmDialog, ButtonModule, TranslateModule],
  templateUrl: './rotations-confirm-dialog.component.html',
  styleUrl: './rotations-confirm-dialog.component.scss',
})
export class RotationsConfirmDialogComponent {
  /** Dialog visibility */
  visible = input(false)
  /** If multiple are selected, pass null, else pass the single rotation */
  rotation = input<InventoryRotation | null>(null)
  /** If multiple are selected, how many? */
  count = input(0)
  /** Is deleting? */
  saving = input(false)

  confirm = output<void>()
  hide = output<void>()
}
