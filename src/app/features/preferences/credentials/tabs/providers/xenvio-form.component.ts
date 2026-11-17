import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { MessageModule } from 'primeng/message'
import { TooltipModule } from 'primeng/tooltip'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import type { AppErrorResponse } from '@/app/core/interceptors/app-error.schema'
import { ProvidersService } from './providers.service'
import type { ProviderResponse } from './providers-tab.component'

interface XenvioConfig {
  url: string
  email: string
  api_key: string
}

/** Rejected connection (422 from PUT providers/xenvio) → translation key */
const CONNECTION_ERROR_KEYS: Record<string, string> = {
  XENVIO_INVALID_CREDENTIALS: 'preferences.providers.xenvio_invalid_credentials',
  XENVIO_CONNECTION_FAILED: 'preferences.providers.xenvio_connection_failed',
  XENVIO_VALIDATION_ERROR: 'preferences.providers.xenvio_missing_fields',
}

@Component({
  selector: 'app-xenvio-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule, ButtonModule, InputTextModule, MessageModule, TooltipModule],
  template: `
    <div class="flex flex-col gap-4 pt-2">
      <!-- URL -->
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">URL <span class="text-red-500">*</span></label>
        <input
          pInputText
          [(ngModel)]="form.url"
          placeholder="https://your-environment.shipedge.com"
          class="w-full font-mono text-sm"
        />
        <small class="text-surface-400">{{ 'preferences.providers.xenvio_url_hint' | translate }}</small>
      </div>

      <!-- Email -->
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Email <span class="text-red-500">*</span></label>
        <input
          pInputText
          [(ngModel)]="form.email"
          placeholder="user@example.com"
          class="w-full font-mono text-sm"
        />
      </div>

      <!-- API Key -->
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">API Key <span class="text-red-500">*</span></label>
        <div class="flex gap-2">
          @if (isEditing() && !editingKey()) {
            <!-- Locked state: dots + edit button -->
            <input
              pInputText
              type="password"
              [value]="maskedKey"
              disabled
              class="flex-1 opacity-70 font-mono text-sm"
            />
            <p-button
              icon="pi pi-pencil"
              severity="secondary"
              [outlined]="true"
              size="small"
              [pTooltip]="'preferences.providers.change_secret' | translate"
              (click)="editingKey.set(true)"
            />
          } @else {
            <div class="relative flex-1">
              <input
                pInputText
                [(ngModel)]="form.api_key"
                [type]="showKey() ? 'text' : 'password'"
                placeholder="your_api_key"
                class="w-full font-mono text-sm"
                style="padding-right: 2.5rem;"
              />
              <button type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                style="background:none;border:none;cursor:pointer;padding:0.25rem;"
                (click)="showKey.set(!showKey())">
                <i [class]="showKey() ? 'pi pi-eye-slash' : 'pi pi-eye'" style="font-size:1rem;"></i>
              </button>
            </div>
          }
        </div>
      </div>

      @if (connectionError(); as errorKey) {
        <p-message severity="error" [text]="errorKey | translate" />
      }

      <!-- Actions -->
      <div class="flex justify-end gap-2 pt-2 border-t border-surface-200 dark:border-surface-700">
        <p-button
          [label]="'buttons.cancel' | translate"
          severity="secondary"
          [text]="true"
          (click)="dialogRef.close(false)"
        />
        <p-button
          icon="pi pi-check"
          [label]="'buttons.save' | translate"
          [loading]="saving()"
          [disabled]="!isValid()"
          (click)="save()"
        />
      </div>
    </div>
  `,
})
export class XenvioFormComponent {
  private svc = inject(ProvidersService)
  private config = inject(DynamicDialogConfig)
  dialogRef = inject(DynamicDialogRef)
  private translate = inject(TranslateService)

  form: XenvioConfig = { url: '', email: '', api_key: '' }
  saving = signal(false)
  isEditing = signal(false)
  editingKey = signal(false)
  showKey = signal(false)
  /** Translation key of the last rejected connection, or null */
  connectionError = signal<string | null>(null)

  maskedKey = '••••••••••••••••'

  constructor() {
    const existing: ProviderResponse | null = this.config.data?.existing ?? null
    if (existing) {
      this.isEditing.set(true)
      const cfg = existing.config as unknown as XenvioConfig
      this.form.url = cfg?.url ?? ''
      this.form.email = cfg?.email ?? ''
      // api_key stays empty: the API only returns it masked
    }
  }

  isValid(): boolean {
    return this.form.url.trim().length > 0 &&
      this.form.email.trim().length > 0 &&
      (this.isEditing() && !this.editingKey() ? true : this.form.api_key.trim().length > 0)
  }

  save(): void {
    this.saving.set(true)
    this.connectionError.set(null)
    const config: Record<string, string> = {
      url: this.form.url.trim(),
      email: this.form.email.trim(),
    }
    // Only send api_key if user is creating new or actively editing the key
    if (!this.isEditing() || this.editingKey()) {
      config['api_key'] = this.form.api_key.trim()
    }

    this.svc.upsert('xenvio', config).subscribe({
      next: () => {
        this.saving.set(false)
        this.dialogRef.close(true)
      },
      error: (err: AppErrorResponse) => {
        this.saving.set(false)
        this.connectionError.set(CONNECTION_ERROR_KEYS[err?.code] ?? null)
      },
    })
  }
}
