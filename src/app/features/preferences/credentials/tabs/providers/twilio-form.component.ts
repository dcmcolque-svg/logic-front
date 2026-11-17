import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { TooltipModule } from 'primeng/tooltip'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import { ProvidersService } from './providers.service'
import type { ProviderResponse } from './providers-tab.component'

interface TwilioConfig {
  account_sid: string
  auth_token: string
  from_number: string
  text_sid: string
  image_sid: string
}

/** Locked secret field + pencil button + eye toggle when unlocked */
type SecretField = 'auth_token' | 'text_sid' | 'image_sid'

@Component({
  selector: 'app-twilio-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule, ButtonModule, InputTextModule, TooltipModule],
  template: `
    <div class="flex flex-col gap-4 pt-2">
      <!-- Account SID -->
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Account SID <span class="text-red-500">*</span></label>
        <input
          pInputText
          [(ngModel)]="form.account_sid"
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          class="w-full font-mono text-sm"
        />
      </div>

      <!-- Auth Token -->
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Auth Token <span class="text-red-500">*</span></label>
        <div class="flex gap-2">
          @if (isEditing() && !editingField()['auth_token']) {
            <input pInputText type="password" [value]="masked" disabled class="flex-1 opacity-70 font-mono text-sm" />
            <p-button icon="pi pi-pencil" severity="secondary" [outlined]="true" size="small"
              [pTooltip]="'preferences.providers.change_secret' | translate"
              (click)="startEdit('auth_token')" />
          } @else {
            <div class="relative flex-1">
              <input pInputText [(ngModel)]="form.auth_token"
                [type]="showField()['auth_token'] ? 'text' : 'password'"
                placeholder="your_auth_token"
                class="w-full font-mono text-sm"
                style="padding-right: 2.5rem;" />
              <button type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                style="background:none;border:none;cursor:pointer;padding:0.25rem;"
                (click)="toggleShow('auth_token')">
                <i [class]="showField()['auth_token'] ? 'pi pi-eye-slash' : 'pi pi-eye'" style="font-size:1rem;"></i>
              </button>
            </div>
          }
        </div>
      </div>

      <!-- From Number -->
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">WhatsApp From Number <span class="text-red-500">*</span></label>
        <input
          pInputText
          [(ngModel)]="form.from_number"
          placeholder="whatsapp:+14155238886"
          class="w-full font-mono text-sm"
        />
        <small class="text-surface-400">Must include the <code>whatsapp:</code> prefix.</small>
      </div>

      <!-- Template SIDs -->
      <div class="grid grid-cols-2 gap-3">
        <!-- Text Template SID -->
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Text Template SID</label>
          <div class="flex gap-2">
            @if (isEditing() && !editingField()['text_sid']) {
              <input pInputText type="password" [value]="masked" disabled class="flex-1 opacity-70 font-mono text-sm" />
              <p-button icon="pi pi-pencil" severity="secondary" [outlined]="true" size="small"
                [pTooltip]="'preferences.providers.change_secret' | translate"
                (click)="startEdit('text_sid')" />
            } @else {
              <div class="relative flex-1">
                <input pInputText [(ngModel)]="form.text_sid"
                  [type]="showField()['text_sid'] ? 'text' : 'password'"
                  placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  class="w-full font-mono text-sm"
                  style="padding-right: 2.5rem;" />
                <button type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                  style="background:none;border:none;cursor:pointer;padding:0.25rem;"
                  (click)="toggleShow('text_sid')">
                  <i [class]="showField()['text_sid'] ? 'pi pi-eye-slash' : 'pi pi-eye'" style="font-size:1rem;"></i>
                </button>
              </div>
            }
          </div>
          <small class="text-surface-400">TWILIO_WHATSAPP_TEXT_SID</small>
        </div>

        <!-- Image Template SID -->
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Image Template SID</label>
          <div class="flex gap-2">
            @if (isEditing() && !editingField()['image_sid']) {
              <input pInputText type="password" [value]="masked" disabled class="flex-1 opacity-70 font-mono text-sm" />
              <p-button icon="pi pi-pencil" severity="secondary" [outlined]="true" size="small"
                [pTooltip]="'preferences.providers.change_secret' | translate"
                (click)="startEdit('image_sid')" />
            } @else {
              <div class="relative flex-1">
                <input pInputText [(ngModel)]="form.image_sid"
                  [type]="showField()['image_sid'] ? 'text' : 'password'"
                  placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  class="w-full font-mono text-sm"
                  style="padding-right: 2.5rem;" />
                <button type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                  style="background:none;border:none;cursor:pointer;padding:0.25rem;"
                  (click)="toggleShow('image_sid')">
                  <i [class]="showField()['image_sid'] ? 'pi pi-eye-slash' : 'pi pi-eye'" style="font-size:1rem;"></i>
                </button>
              </div>
            }
          </div>
          <small class="text-surface-400">TWILIO_WHATSAPP_IMAGE_SID</small>
        </div>
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
          [label]="'buttons.save' | translate"
          icon="pi pi-save"
          [loading]="saving()"
          [disabled]="!form.account_sid || !form.from_number || isAuthTokenMissing()"
          (click)="save()"
        />
      </div>
    </div>
  `,
})
export class TwilioFormComponent {
  private readonly svc    = inject(ProvidersService)
  private readonly ref    = inject(DynamicDialogRef)
  private readonly config = inject(DynamicDialogConfig)

  saving    = signal(false)
  isEditing = signal(false)

  /** Tracks which secret fields the user has unlocked for editing */
  editingField = signal<Partial<Record<SecretField, boolean>>>({})

  /** Tracks eye-toggle state per field */
  showField = signal<Partial<Record<SecretField, boolean>>>({})

  /** Visual placeholder for locked fields */
  readonly masked = '••••••••••'

  form: TwilioConfig = {
    account_sid: '',
    auth_token:  '',
    from_number: '',
    text_sid:    '',
    image_sid:   '',
  }

  constructor() {
    const existing = this.config.data?.existing as ProviderResponse | null
    if (existing?.config) {
      this.isEditing.set(true)
      this.form.account_sid = existing.config['account_sid'] ?? ''
      this.form.from_number = existing.config['from_number'] ?? ''
      // auth_token, text_sid, image_sid stay empty — shown as locked until user unlocks
    }
  }

  /** Unlock a secret field for editing */
  startEdit(field: SecretField): void {
    this.form[field] = ''
    this.editingField.update(s => ({ ...s, [field]: true }))
    this.showField.update(s => ({ ...s, [field]: false }))
  }

  /** Toggle eye visibility for a field */
  toggleShow(field: SecretField): void {
    this.showField.update(s => ({ ...s, [field]: !s[field] }))
  }

  /**
   * auth_token is required when creating, or when the user unlocked it and has typed something.
   * If editing and not unlocked, it's fine to omit.
   */
  isAuthTokenMissing(): boolean {
    if (!this.isEditing()) return !this.form.auth_token
    if (this.editingField()['auth_token']) return !this.form.auth_token
    return false
  }

  save(): void {
    this.saving.set(true)

    // Always include non-secret fields
    const payload: Record<string, string> = {
      account_sid: this.form.account_sid,
      from_number: this.form.from_number,
    }

    // Include secret fields only when creating OR when user explicitly unlocked and typed a value
    const secrets: SecretField[] = ['auth_token', 'text_sid', 'image_sid']
    for (const field of secrets) {
      if (!this.isEditing() || (this.editingField()[field] && this.form[field])) {
        payload[field] = this.form[field]
      }
    }

    this.svc.upsert('twilio_whatsapp', payload).subscribe({
      next:  () => { this.saving.set(false); this.ref.close(true) },
      error: () => { this.saving.set(false) },
    })
  }

  cancel(): void {
    this.ref.close(false)
  }
}
