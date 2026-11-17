import {
  Component,
  inject,
  input,
  output,
  signal,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { MessageService } from 'primeng/api'
import { forkJoin, of } from 'rxjs'
import { switchMap, catchError } from 'rxjs/operators'

import { BaseDialog } from '@/app/shared/components/dialog/dialog/base-dialog.component'
import { AuthService } from '@/app/core/services/auth.service'
import {
  OperatorBrandingService,
  OperatorBranding,
  BrandingCreateInput,
} from '@/app/features/preferences/operator-branding/operator-branding.service'

interface ImageSlot {
  savedUrl: string | null
  previewUrl: string | null
  pendingFile: File | null
}

function emptySlot(): ImageSlot {
  return { savedUrl: null, previewUrl: null, pendingFile: null }
}

@Component({
  selector: 'app-operator-branding-dialog',
  standalone: true,
  imports: [CommonModule, TranslateModule, ButtonModule, BaseDialog],
  providers: [MessageService],
  templateUrl: './operator-branding-dialog.component.html',
  styleUrl: './operator-branding-dialog.component.scss',
})
export class OperatorBrandingDialogComponent implements OnChanges {
  private readonly brandingService = inject(OperatorBrandingService)
  private readonly authService = inject(AuthService)
  private readonly messageService = inject(MessageService)
  private readonly translate = inject(TranslateService)

  @ViewChild('fileLight') fileLightRef!: ElementRef<HTMLInputElement>

  // ── Inputs / Outputs ──────────────────────────────────────────────────────
  visible = input(false)
  hide = output<void>()
  saved = output<void>()

  // ── State ─────────────────────────────────────────────────────────────────
  branding = signal<OperatorBranding | null>(null)
  loadingBranding = signal(false)
  saving = signal(false)

  light = signal<ImageSlot>(emptySlot())

  readonly defaultLogoLight = '/layout/images/logo-dark.png'

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.branding.set(null)
      this.light.set(emptySlot())
      this.loadBranding()
    }
  }

  private loadBranding(): void {
    this.loadingBranding.set(true)
    this.brandingService.getMyBranding().subscribe({
      next: (record) => {
        this.branding.set(record)
        this.light.set({
          savedUrl: record.logo_light_url,
          previewUrl: null,
          pendingFile: null,
        })
        this.loadingBranding.set(false)
      },
      error: () => {
        // 404 → no branding yet → empty create form (silenced by interceptor)
        this.loadingBranding.set(false)
      },
    })
  }

  // ── File handling ─────────────────────────────────────────────────────────

  onFileSelected(slot: 'light', event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    this.light.update((s) => ({ ...s, previewUrl, pendingFile: file }))
    ;(event.target as HTMLInputElement).value = ''
  }

  clearSlot(slot: 'light'): void {
    const prev = this.light()
    if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl)
    this.light.set({ ...prev, previewUrl: null, pendingFile: null })
  }

  removeBackendImage(slot: 'light'): void {
    this.light.update((s) => ({ ...s, savedUrl: null }))
  }

  previewFor(slot: ImageSlot, fallback: string): string {
    return slot.previewUrl || slot.savedUrl || fallback
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  onSave(): void {
    this.saving.set(true)
    const operatorId = this.authService.getOperatorId()
    const lightSlot = this.light()

    const safeUpload = (sl: ImageSlot, name: 'light') => {
      if (!sl.pendingFile) return of<null>(null)
      return this.brandingService
        .uploadLogo(sl.pendingFile, operatorId, name)
        .pipe(catchError(() => of<null>(null)))
    }

    forkJoin({
      light: safeUpload(lightSlot, 'light'),
    })
      .pipe(
        switchMap(({ light }) => {
          const dto = {
            logo_light_url:
              (light as any)?.ref ??
              (light as any)?.url ??
              lightSlot.savedUrl ??
              '',
            logo_dark_url: '',
          }
          const existing = this.branding()
          if (existing) return this.brandingService.update(existing.id, dto)
          const createDto: BrandingCreateInput = {
            operator_id: operatorId,
            ...dto,
          }
          return this.brandingService.create(createDto)
        })
      )
      .subscribe({
        next: (record) => {
          this.branding.set(record)
          this.saving.set(false)
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('messages.success'),
            detail: this.translate.instant('branding.saved'),
          })
          this.saved.emit()
          this.hide.emit()
        },
        error: () => {
          this.saving.set(false)
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('messages.error'),
            detail: this.translate.instant('branding.save_error'),
          })
        },
      })
  }

  get canSave(): boolean {
    return !this.saving() && !this.loadingBranding()
  }
}
