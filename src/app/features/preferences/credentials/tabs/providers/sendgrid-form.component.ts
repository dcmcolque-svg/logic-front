import { ChangeDetectionStrategy, Component, inject, signal, ChangeDetectorRef } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { TooltipModule } from 'primeng/tooltip'
import { PasswordModule } from 'primeng/password'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { DynamicDialogConfig, DynamicDialogRef, DialogService } from 'primeng/dynamicdialog'
import { MessageService } from 'primeng/api'
import { ProvidersService } from './providers.service'
import type { ProviderResponse } from './providers-tab.component'
import { EmailTemplateEditorComponent, EmailTemplate } from './email-template-editor.component'

interface SendGridConfig {
  api_key: string
  from_email: string
  from_name: string
}

@Component({
  selector: 'app-sendgrid-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule, ButtonModule, InputTextModule, PasswordModule, TooltipModule, TableModule, TagModule],
  providers: [DialogService],
  template: `
    <div class="flex flex-col gap-6 pt-2 w-full">
        
        <!-- Credenciales -->
        <div class="flex flex-col gap-4">
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
              class="flex-1 opacity-70"
            />
            <p-button
              icon="pi pi-pencil"
              severity="secondary"
              [outlined]="true"
              size="small"
              [pTooltip]="'preferences.providers.sendgrid_change_key' | translate"
              (click)="startEditKey()"
            />
          } @else {
            
            <!-- Active state: enabled input + eye toggle -->
            <div class="relative flex-1">
              <input
                pInputText
                [(ngModel)]="form.api_key"
                [type]="showKey() ? 'text' : 'password'"
                placeholder="SG.xxxxxxxxxxxxxxxxxxxx"
                class="w-full"
                style="padding-right: 2.5rem;"
              />
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                style="background: none; border: none; cursor: pointer; padding: 0.25rem;"
                (click)="showKey.set(!showKey())"
                [attr.aria-label]="showKey() ? 'Hide API key' : 'Show API key'"
              >
                <i [class]="showKey() ? 'pi pi-eye-slash' : 'pi pi-eye'" style="font-size: 1rem;"></i>
              </button>
            </div>
          }
        </div>
        <small class="text-surface-400">{{ 'preferences.providers.sendgrid_api_key_hint' | translate }}</small>
      </div>

      <!-- From Email -->
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">From Email <span class="text-red-500">*</span></label>
        <input
          pInputText
          [(ngModel)]="form.from_email"
          name="from_email"
          type="text"
          #emailInput="ngModel"
          placeholder="ops@yourcompany.com"
          class="w-full"
          [ngClass]="{ 'ng-invalid ng-dirty': (!form.from_email || hasExtraSpaces(form.from_email) || !isValidEmail(form.from_email)) && (emailInput.dirty || emailInput.touched) }"
        />
        @if (emailInput.dirty || emailInput.touched) {
          @if (!form.from_email?.trim()) {
            <small class="text-red-500 text-xs">{{ 'forms_validation.required' | translate }}</small>
          } @else if (hasExtraSpaces(form.from_email)) {
            <small class="text-red-500 text-xs">{{ 'forms_validation.extra_spaces_not_allowed' | translate }}</small>
          } @else if (!isValidEmail(form.from_email)) {
            <small class="text-red-500 text-xs">{{ 'forms_validation.valid_email' | translate }}</small>
          }
        }
      </div>

      <!-- From Name -->
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">From Name</label>
        <input
          pInputText
          [(ngModel)]="form.from_name"
          type="text"
          placeholder="Operations"
          class="w-full"
        />
      </div>
      </div> <!-- End Credenciales Column -->

      <!-- Plantillas -->
      <div class="flex flex-col gap-2 pt-4 border-t border-surface-border">
        <div class="flex flex-col gap-1 mb-2">
          <h3 class="text-md font-bold m-0">{{ 'preferences.providers.email_template.title' | translate }}</h3>
          <small class="text-surface-500">{{ 'preferences.providers.email_template.language_helper_text' | translate }}</small>
        </div>
        
        <p-table [value]="templates()" [tableStyle]="{ 'min-width': '100%' }" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th>
                <div class="flex items-center gap-1">
                  {{ 'preferences.providers.email_template.language' | translate }}
                  <i class="pi pi-info-circle text-xs text-surface-400 cursor-help" [pTooltip]="'preferences.providers.email_template.language_helper' | translate" tooltipPosition="top"></i>
                </div>
              </th>
              <th>{{ 'preferences.providers.email_template.status' | translate }}</th>
              <th class="w-[80px]">{{ 'preferences.providers.email_template.actions' | translate }}</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-tpl let-i="rowIndex">
            <tr>
              <td><span class="font-bold">{{ tpl.language }}</span></td>
              <td>
                @if (tpl.is_default) {
                  <p-tag [value]="'preferences.providers.email_template.is_default' | translate" severity="success"></p-tag>
                } @else {
                  <p-button [label]="'preferences.providers.email_template.make_default' | translate" [text]="true" size="small" severity="secondary" (click)="setDefaultTemplate(i)"></p-button>
                }
              </td>
              <td>
                <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (click)="editTemplate(tpl, i)"></p-button>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="3" class="text-center text-surface-500 py-4">{{ 'preferences.providers.email_template.no_templates' | translate }}</td>
            </tr>
          </ng-template>
        </p-table>
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
          [label]="'buttons.save_changes' | translate"
          icon="pi pi-save"
          [loading]="saving()"
          [disabled]="!form.from_email || hasExtraSpaces(form.from_email) || !isValidEmail(form.from_email) || (!form.api_key && (!isEditing() || editingKey()))"
          (click)="save()"
        />
      </div>
    </div>
  `,
})
export class SendGridFormComponent {
  private readonly svc = inject(ProvidersService)
  private readonly ref = inject(DynamicDialogRef)
  private readonly config = inject(DynamicDialogConfig)
  private readonly messageService = inject(MessageService)
  private readonly translateService = inject(TranslateService)

  saving = signal(false)
  isEditing = signal(false)
  editingKey = signal(false)
  showKey = signal(false)
  templates = signal<EmailTemplate[]>([])
  logoUrl: string = ''
  providerId: string = ''

  /** Shown in the disabled input so it looks like a real masked key */
  readonly maskedKey = '••••••••••'

  isValidEmail(v: string | null | undefined): boolean {
    if (!v) return false;
    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return EMAIL_REGEX.test(v);
  }

  hasExtraSpaces(v: string | null | undefined): boolean {
    if (!v) return false;
    return v !== v.trim() || /\s{2,}/.test(v);
  }

  form: SendGridConfig = {
    api_key: '',
    from_email: '',
    from_name: '',
  }

  private readonly dialogService = inject(DialogService)
  private readonly cdr = inject(ChangeDetectorRef)

  constructor() {
    const existing = this.config.data?.existing as ProviderResponse | null
    this.logoUrl = this.config.data?.logoUrl || ''

    if (existing?.config) {
      this.providerId = existing.id || ''
      this.isEditing.set(true)
      this.form.from_email = existing.config['from_email'] ?? ''
      this.form.from_name = existing.config['from_name'] ?? ''
      if (existing.templates && existing.templates.length > 0) {
        this.templates.set(existing.templates.map(t => ({ ...t })))
      } else {
        this.loadDefaultTemplates()
      }
    } else {
      this.loadDefaultTemplates()
    }
  }

  private loadDefaultTemplates() {
    const defaults: EmailTemplate[] = this.config.data?.defaultTemplates || []

    // Si backend nos devuelve copias vacías por error, evitamos crashear
    if (!defaults || defaults.length === 0) return

    const appLang = (localStorage.getItem('lan') || 'en').toUpperCase()
    const isEsDefault = appLang === 'ES'

    // Hacemos una copia profunda (JSON) o spread para no mutar los defaults globales
    const templates = defaults.map((t: any) => ({
      ...t,
      is_default: (t.language === 'ES') ? isEsDefault : !isEsDefault
    }))

    this.templates.set(templates)
  }



  /** Unlocks the API key field for editing */
  startEditKey(): void {
    this.form.api_key = ''
    this.editingKey.set(true)
    this.showKey.set(false)
  }

  save(): void {
    this.saving.set(true)
    // Only include api_key when creating OR when user explicitly unlocked and typed a new one
    const payload: Record<string, string> = {
      from_email: this.form.from_email,
      from_name: this.form.from_name,
    }
    if (!this.isEditing() || (this.editingKey() && this.form.api_key)) {
      payload['api_key'] = this.form.api_key
    }
    this.svc.upsert('sendgrid', payload, this.templates()).subscribe({
      next: () => { this.saving.set(false); this.ref.close(true) },
      error: () => { this.saving.set(false) },
    })
  }

  cancel(): void {
    this.ref.close(false)
  }

  editTemplate(tpl: EmailTemplate, index: number): void {
    const ref = this.dialogService.open(EmailTemplateEditorComponent, {
      header: this.translateService.instant('preferences.providers.email_template.edit_template') || 'Edit Template',
      width: '800px',
      style: { 'max-width': '1200px' },
      contentStyle: { padding: '1.5rem', overflow: 'hidden' },
      baseZIndex: 10001,
      data: { template: tpl, logoUrl: this.logoUrl, sendGridConfig: this.form, providerId: this.providerId }
    })

    if (ref) {
      ref.onClose.subscribe((updatedTpl?: EmailTemplate) => {
        if (updatedTpl) {
          const current = this.templates().map((t, i) => {
            if (i === index) {
              return updatedTpl
            }
            if (updatedTpl.is_default) {
              return { ...t, is_default: false }
            }
            return t
          })
          this.templates.set(current)
          this.cdr.detectChanges()
        }
      })
    }
  }

  setDefaultTemplate(index: number) {
    const current = this.templates().map((t, i) => ({
      ...t,
      is_default: (i === index)
    }))
    this.templates.set(current)
    this.cdr.detectChanges()
  }
}
