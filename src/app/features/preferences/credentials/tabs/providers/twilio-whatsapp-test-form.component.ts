import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { MessageService } from 'primeng/api'
import { ToastModule } from 'primeng/toast'
import { DynamicDialogRef } from 'primeng/dynamicdialog'
import { ProvidersService } from './providers.service'

@Component({
  selector: 'app-twilio-whatsapp-test-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule, ButtonModule, InputTextModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="flex flex-col gap-4 pt-2">

      <!-- Info banner -->
      <div class="whatsapp-info">
        <i class="pi pi-info-circle"></i>
        <span>{{ 'preferences.providers.test_whatsapp_info' | translate }}</span>
      </div>

      <!-- Phone -->
      <div class="flex flex-col gap-1">
        <label class="field-label">
          {{ 'preferences.providers.test_whatsapp_phone' | translate }}
          <span class="text-red-500">*</span>
        </label>
        <input
          pInputText
          type="tel"
          [(ngModel)]="form.phone"
          placeholder="+1234567890"
          class="w-full"
        />
        <span class="field-hint">{{ 'preferences.providers.test_whatsapp_phone_hint' | translate }}</span>
      </div>

      <!-- Code / message -->
      <div class="flex flex-col gap-1">
        <label class="field-label">{{ 'preferences.providers.test_whatsapp_code' | translate }}</label>
        <input
          pInputText
          type="text"
          [(ngModel)]="form.code"
          placeholder="TEST-1234"
          class="w-full"
        />
        <span class="field-hint">{{ 'preferences.providers.test_whatsapp_code_hint' | translate }}</span>
      </div>

      <!-- Image preview (hardcoded, always attached) -->
      <div class="image-preview">
        <img [src]="defaultQrImageUrl" alt="QR Preview" />
      </div>




      <!-- Actions -->
      <div class="flex justify-end gap-2 pt-2">
        <p-button
          [label]="'buttons.cancel' | translate"
          severity="secondary"
          [outlined]="true"
          [text]="true"
          (click)="cancel()"
        />
        <p-button
          icon="pi pi-send"
          [label]="'preferences.providers.test_send' | translate"
          [loading]="sending()"
          [disabled]="!form.phone || sending()"
          severity="success"
          (click)="send()"
        />
      </div>

    </div>
  `,
  styles: [`
    .whatsapp-info {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      font-size: 0.82rem;
      color: #166534;
      line-height: 1.5;
    }
    .whatsapp-info .pi {
      margin-top: 0.1rem;
      flex-shrink: 0;
      color: #16a34a;
    }
    .prod-warning {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 0.6rem 0.9rem;
      font-size: 0.8rem;
      color: #92400e;
      line-height: 1.5;
    }
    .prod-warning .pi {
      margin-top: 0.1rem;
      flex-shrink: 0;
      color: #d97706;
    }
    .field-label {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-color-secondary);
    }
    .field-hint {
      font-size: 0.72rem;
      color: var(--text-color-secondary);
    }
    .image-preview {
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      overflow: hidden;
      max-height: 160px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--surface-50);
    }
    .image-preview img {
      max-height: 160px;
      max-width: 100%;
      object-fit: contain;
    }
  `],
})
export class TwilioWhatsAppTestFormComponent {
  private readonly svc = inject(ProvidersService)
  private readonly ref = inject(DynamicDialogRef)
  private readonly messageService = inject(MessageService)
  private readonly translate = inject(TranslateService)

  /** Default QR image always attached to the test message. */
  readonly defaultQrImageUrl = 'https://imagedelivery.net/GxvlXjAl8WY58YDVcutV_g/5fc384cc-3210-44b8-3156-72b6f7792000/public'

  sending = signal(false)

  form = {
    phone: '',
    code: '',
  }

  onImgError(_event: Event): void { /* no-op */ }

  send(): void {
    if (!this.form.phone) return
    this.sending.set(true)
    this.svc.testWhatsApp(
      this.form.phone,
      this.form.code || undefined,
      this.defaultQrImageUrl,
    ).subscribe({
      next: () => {
        this.sending.set(false)
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('preferences.providers.test_whatsapp_success'),
          detail: this.translate.instant('preferences.providers.test_whatsapp_success_detail', { phone: this.form.phone }),
        })
        setTimeout(() => this.ref.close(true), 1500)
      },
      error: (err) => {
        this.sending.set(false)
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('messages.error'),
          detail: err?.error?.message ?? this.translate.instant('preferences.providers.test_whatsapp_error'),
        })
      },
    })
  }

  cancel(): void {
    this.ref.close(false)
  }
}
