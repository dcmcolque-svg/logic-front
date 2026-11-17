import { Component, inject, input, output, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'
import { BaseConfirmDialog } from '@/app/shared/components/dialog/confirm-dialog/base-confirm-dialog.component'

import { Location } from '@/app/features/preferences/locations/types/location.types'
import { LocationService } from '../../location.service'

@Component({
  selector: 'app-location-confirm-dialog',
  standalone: true,
  imports: [CommonModule, TranslateModule, BaseConfirmDialog],
  templateUrl: './location-confirm-dialog.component.html',
  styleUrl: './location-confirm-dialog.component.scss',
})
export class LocationConfirmDialogComponent {
  private readonly locationService = inject(LocationService)
  private readonly messageService = inject(MessageService)
  private readonly translate = inject(TranslateService)

  /** Dialog visibility */
  visible = input(false)
  /** The location to delete */
  deleteTarget = input<Location | null>(null)

  // === Internal state ===
  deleting = signal(false)

  /** Emitted when deletion succeeded */
  deleted = output<void>()
  /** Emitted when dialog is hidden */
  hide = output<void>()

  onConfirmDelete() {
    const target = this.deleteTarget()
    if (!target) return

    this.deleting.set(true)
    this.locationService.deleteLocation(target.id).subscribe({
      next: () => {
        this.deleting.set(false)
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('messages.success'),
          detail: this.translate.instant(
            'preferences.location.location_deleted'
          ),
        })
        this.deleted.emit()
      },
      error: (err) => {
        this.deleting.set(false)
        this.hide.emit()

        const errorCode = err?.code || ''
        if (errorCode === 'LOCATION_HAS_LINKED_RECORDS') {
          this.messageService.add({
            severity: 'warn',
            summary: this.translate.instant('messages.warning'),
            detail: this.translate.instant(
              'preferences.location.delete_error_foreign_key'
            ),
            life: 5000,
          })
        } else {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('messages.error'),
            detail: this.translate.instant(
              'preferences.location.delete_error'
            ),
          })
        }
      },
    })
  }
}
