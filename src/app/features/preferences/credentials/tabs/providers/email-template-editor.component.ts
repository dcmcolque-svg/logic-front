import { ChangeDetectionStrategy, Component, OnInit, inject, Input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { TextareaModule } from 'primeng/textarea'
import { SelectModule } from 'primeng/select'
import { CheckboxModule } from 'primeng/checkbox'
import { TooltipModule } from 'primeng/tooltip'
import { SelectButtonModule } from 'primeng/selectbutton'
import { DynamicDialogRef, DynamicDialogConfig, DialogService } from 'primeng/dynamicdialog'
import { SendgridTestFormComponent } from './sendgrid-test-form.component'

export interface EmailTemplate {
  language: string
  is_default: boolean
  subject: string
  pre_title: string
  main_title: string
  instructions: string
  status_label: string
  status_message: string
  order_label: string
  pin_label: string
  security_title: string
  security_bullets: string
  show_security: boolean
  footer_text: string
  show_footer: boolean
  pickup_point: string
  template_mode: 'native' | 'sendgrid'
  sendgrid_template_id: string
}

@Component({
  selector: 'app-email-template-preview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="email-preview-wrapper bg-surface-ground p-4 rounded-xl flex justify-center items-start h-full overflow-y-auto">
      @if (template?.template_mode === 'sendgrid') {
        <div class="flex flex-col items-center justify-center h-full text-center p-8 mt-10">
          <i class="pi pi-send text-4xl text-blue-400 mb-4 opacity-50"></i>
          <h3 class="text-lg font-bold text-slate-400 mb-2">{{ 'preferences.providers.email_template.sendgrid_preview_title' | translate }}</h3>
          <p class="text-sm text-slate-500" [innerHTML]="'preferences.providers.email_template.sendgrid_preview_desc' | translate"></p>
        </div>
      } @else {
        <!-- Correo Simulado -->
        <div class="bg-white rounded-lg shadow-md w-full max-w-md overflow-hidden font-sans border border-gray-200 break-words">
          
          <!-- Header -->
        @if (logoUrl) {
          <div class="p-4 flex items-center border-b border-gray-100">
            <img [src]="logoUrl" alt="Logo" class="max-h-8 max-w-[150px] object-contain mr-2" />
          </div>
        }

        <div class="p-5">
          <!-- Main Content with QR -->
          <div class="mb-6">
            <div class="mb-4">
              <p class="text-[10px] tracking-widest uppercase text-slate-400 font-bold mb-1">{{ template.pre_title || (template.language === 'ES' ? 'NOTIFICACIÓN DE RETIRO' : 'PICKUP NOTIFICATION') }}</p>
              <h1 class="text-2xl font-bold text-slate-800 mb-2 leading-tight">{{ template.main_title || (template.language === 'ES' ? '¡Tu pedido está listo! 🎉' : 'Your order is ready! 🎉') }}</h1>
              <p class="text-sm text-slate-700 leading-relaxed">{{ template.instructions || (template.language === 'ES' ? 'Presenta el código QR en el mostrador para retirar tu paquete.' : 'Present the QR code at the pickup counter to claim your package.') }}</p>
            </div>
            <div class="flex justify-center">
              <div class="bg-white p-4 border border-slate-200 rounded-xl shadow-sm inline-block">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=example" alt="QR Code" class="w-40 h-40 object-contain mx-auto" />
              </div>
            </div>
          </div>

          <!-- Estado -->
          <div class="bg-green-50 border-l-4 border-green-500 rounded-r p-3 mb-4">
            <p class="text-sm font-bold text-slate-800 mb-1">{{ template.status_label || (template.language === 'ES' ? 'Estado' : 'Status') }}</p>
            <p class="text-sm text-slate-700 m-0">{{ template.status_message || (template.language === 'ES' ? 'Tu paquete está esperando en el punto de retiro.' : 'Your package is waiting at the pickup point.') }}</p>
          </div>

          <!-- Orden y PIN -->
          <div class="border border-slate-200 rounded-md mb-4">
            <div class="p-3 border-b border-slate-100">
              <p class="uppercase text-[10px] tracking-[1.5px] text-slate-400 font-bold m-0">{{ template.order_label || 'Tracking Number' }}</p>
            </div>
            <div class="p-3 border-b border-slate-100">
              <p class="text-xl font-bold text-slate-800 m-0 font-mono tracking-widest">TK-002</p>
            </div>
            <div class="p-3 border-b border-slate-100">
              <p class="uppercase text-[10px] tracking-[1.5px] text-slate-400 font-bold m-0">{{ template.pin_label || (template.language === 'ES' ? 'PIN DE RETIRO' : 'PICKUP PIN') }}</p>
            </div>
            <div class="p-3">
              <p class="text-xl font-bold text-slate-800 m-0 font-mono tracking-widest">X4T9-P2M5</p>
            </div>
          </div>

          <!-- Seguridad -->
          @if (template.show_security) {
            <div class="bg-orange-50 border-l-4 border-orange-500 rounded-r p-3 mb-6">
              <p class="text-xs font-bold text-slate-800 mb-2">{{ template.language === 'ES' ? 'Seguridad' : 'Security' }}</p>
              <p class="text-sm text-slate-800 font-medium mb-1">⚠️ {{ template.security_title || (template.language === 'ES' ? 'Aviso de Seguridad' : 'Security Notice') }}</p>
              <ul class="text-sm text-slate-700 space-y-1 m-0 list-none pl-0">
                @for (bullet of (template.security_bullets || '').split('\n'); track $index) {
                  @if (bullet.trim()) {
                    <li>• {{ bullet.trim() }}</li>
                  }
                }
                @if (!(template.security_bullets || '').trim()) {
                  @if (template.language === 'ES') {
                    <li>• Este código es personal... No lo compartas...</li>
                    <li>• Presenta el QR al personal.</li>
                  } @else {
                    <li>• This code is personal... Do not share...</li>
                    <li>• Present QR to staff.</li>
                  }
                }
              </ul>
            </div>
          }

          <!-- Footer Text -->
          @if (template.show_footer) {
            <div class="border-t border-slate-200 pt-4 mb-6">
              <p class="text-sm text-slate-700 m-0">{{ template.footer_text || (template.language === 'ES' ? 'Gracias por tu compra. ¡Te esperamos! 🙏' : 'Thank you for your purchase. See you soon! 🙏') }}</p>
            </div>
          }

          <!-- Pickup Point -->
          <div class="border-t border-slate-200 pt-4">
            <p class="text-sm font-bold text-slate-800 mb-1">{{ template.pickup_point || (template.language === 'ES' ? 'Punto de Retiro' : 'Pickup Point') }}</p>
            <p class="text-sm text-slate-500 m-0 flex items-center">
              <span class="text-red-500 mr-1">📍</span> {{ template.language === 'ES' ? 'Dirección del Punto de Retiro' : 'Pickup Point Address' }}
            </p>
          </div>

        </div>
      </div>
      }
    </div>
  `,
  styles: [`
    .email-preview-wrapper { min-height: 500px; }
  `]
})
export class EmailTemplatePreviewComponent {
  @Input() template!: EmailTemplate
  @Input() logoUrl: string = ''
}

@Component({
  selector: 'app-email-template-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    SelectButtonModule,
    CheckboxModule,
    TooltipModule,
    EmailTemplatePreviewComponent
  ],
  template: `
    <div class="flex flex-col md:grid md:grid-cols-2 gap-6 h-[65vh] min-h-[400px]">
      <!-- FORM (Smart) -->
      <div class="form-container flex flex-col gap-4 overflow-y-auto pr-2 pb-4" [formGroup]="form">
        <div class="flex flex-col gap-1 w-full mt-1 mb-2">
          <p-selectButton [options]="designSources" formControlName="template_mode" optionValue="value" styleClass="w-full" [allowEmpty]="false">
            <ng-template let-item pTemplate="item">
              <span>{{ item.label | translate }}</span>
            </ng-template>
          </p-selectButton>
        </div>

        @if (form.value.template_mode === 'sendgrid') {
          <div class="flex flex-col gap-1">
            <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.sendgrid_template_id_label' | translate }} <span class="text-red-500">*</span></label>
            <input pInputText formControlName="sendgrid_template_id" class="w-full" maxlength="100" placeholder="d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            @if (form.get('sendgrid_template_id')?.invalid && form.get('sendgrid_template_id')?.touched) {
              <small class="text-red-500">{{ 'preferences.providers.email_template.sendgrid_template_id_error' | translate }}</small>
            }
          </div>

          <!-- Variables Panel -->
          <div class="mt-4 border border-blue-400 bg-surface-900 rounded-xl p-4 shadow-sm">
            <h3 class="text-sm font-bold text-blue-300 mb-2 m-0">{{ 'preferences.providers.email_template.dynamic_vars.title' | translate }}</h3>
            <p class="text-xs text-surface-300 mb-3 mt-0">{{ 'preferences.providers.email_template.dynamic_vars.hint' | translate }}</p>
            
            <div class="max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              <ul class="m-0 pl-0 list-none space-y-2 text-xs text-surface-200">
                @for (v of dynamicVars; track v.key) {
                  <li class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                    <code class="text-pink-400 font-mono whitespace-nowrap">{{'{{' + v.key + '}}'}}</code> 
                    <span class="opacity-75">- {{ 'preferences.providers.email_template.dynamic_vars.' + v.i18n | translate }}</span>
                  </li>
                }
              </ul>
            </div>
          </div>
        }

        @if (form.value.template_mode === 'native') {
          <div class="flex gap-4">
            <div class="flex flex-col gap-1 flex-1">
              <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.language' | translate }} <span class="text-red-500">*</span></label>
              <p-select [options]="languages" formControlName="language" optionLabel="label" optionValue="value" class="w-full" styleClass="w-full"></p-select>
            </div>
          </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.subject' | translate }} <span class="text-red-500">*</span></label>
          <input pInputText formControlName="subject" class="w-full" maxlength="100" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.pre_title' | translate }} <span class="text-red-500">*</span></label>
          <input pInputText formControlName="pre_title" class="w-full uppercase" maxlength="100" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.main_title' | translate }} <span class="text-red-500">*</span></label>
          <input pInputText formControlName="main_title" class="w-full" maxlength="100" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.instructions' | translate }} <span class="text-red-500">*</span></label>
          <textarea pTextarea formControlName="instructions" rows="3" class="w-full" maxlength="500"></textarea>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.status_label' | translate }} <span class="text-red-500">*</span></label>
          <input pInputText formControlName="status_label" class="w-full" maxlength="50" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.status_message' | translate }} <span class="text-red-500">*</span></label>
          <input pInputText formControlName="status_message" class="w-full" maxlength="200" />
        </div>

        <div class="flex gap-4">
          <div class="flex flex-col gap-1 flex-1">
            <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.order_label' | translate }} <span class="text-red-500">*</span></label>
            <input pInputText formControlName="order_label" class="w-full uppercase" maxlength="50" />
          </div>
          <div class="flex flex-col gap-1 flex-1">
            <label class="text-sm font-bold text-color">PIN Label <span class="text-red-500">*</span></label>
            <input pInputText formControlName="pin_label" class="w-full uppercase" maxlength="50" />
          </div>
        </div>

        <div class="flex items-center justify-between mt-4">
          <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.security_section' | translate }}</label>
          <div class="flex items-center">
            <p-checkbox formControlName="show_security" [binary]="true" inputId="show_security"></p-checkbox>
            <label for="show_security" class="ml-2 text-sm text-color">{{ 'preferences.providers.email_template.show' | translate }}</label>
          </div>
        </div>
        
        @if (form.value.show_security) {
          <div class="flex flex-col gap-1 pl-4 border-l-2 border-surface-border">
            <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.security_title' | translate }} <span class="text-red-500">*</span></label>
            <input pInputText formControlName="security_title" class="w-full" maxlength="100" />
          </div>

          <div class="flex flex-col gap-1 pl-4 border-l-2 border-surface-border">
            <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.security_bullets' | translate }} <span class="text-red-500">*</span></label>
            <textarea pTextarea formControlName="security_bullets" rows="3" class="w-full" maxlength="1000" [placeholder]="'preferences.providers.email_template.security_bullets_placeholder' | translate"></textarea>
            <small class="text-surface-400">{{ 'preferences.providers.email_template.security_bullets_hint' | translate }}</small>
          </div>
        }

        <div class="flex flex-col gap-1 mt-4">
          <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.pickup_point' | translate }} <span class="text-red-500">*</span></label>
          <input pInputText formControlName="pickup_point" class="w-full" maxlength="100" />
        </div>

        <div class="flex items-center justify-between mt-4">
          <label class="text-sm font-bold text-color">{{ 'preferences.providers.email_template.footer_section' | translate }}</label>
          <div class="flex items-center">
            <p-checkbox formControlName="show_footer" [binary]="true" inputId="show_footer"></p-checkbox>
            <label for="show_footer" class="ml-2 text-sm text-color">{{ 'preferences.providers.email_template.show' | translate }}</label>
          </div>
        </div>

        @if (templateData.show_footer) {
          <div class="flex flex-col gap-1 pl-4 border-l-2 border-surface-border">
            <input pInputText formControlName="footer_text" class="w-full" maxlength="200" [placeholder]="'preferences.providers.email_template.footer_placeholder' | translate" />
          </div>
        }
        }
      </div>

      <!-- LIVE PREVIEW (Dumb) -->
      <div class="overflow-y-auto pb-4">
        <app-email-template-preview [template]="templateData" [logoUrl]="logoUrl"></app-email-template-preview>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-between items-center pt-4 mt-4 border-t border-surface-border shrink-0">
      <div class="inline-block" [pTooltip]="'preferences.providers.email_template.test_tooltip' | translate" [tooltipDisabled]="!!providerId" tooltipPosition="top">
        <p-button [label]="'preferences.providers.email_template.test_template_button' | translate" icon="pi pi-send" severity="info" [outlined]="true" [text]="true" (click)="onTest()" [disabled]="!providerId" styleClass="pointer-events-none"></p-button>
      </div>
      <div class="flex gap-2">
        <p-button [label]="'preferences.providers.email_template.cancel' | translate" severity="secondary" [outlined]="true" [text]="true" (click)="onCancel()"></p-button>
        <p-button [label]="'buttons.confirm' | translate" icon="pi pi-check" [disabled]="form.invalid" (click)="onSave()"></p-button>
      </div>
    </div>
  `
})
export class EmailTemplateEditorComponent implements OnInit {
  private readonly ref = inject(DynamicDialogRef)
  private readonly config = inject(DynamicDialogConfig)

  languages = [
    { label: 'Inglés (EN)', value: 'EN' },
    { label: 'Español (ES)', value: 'ES' }
  ]

  designSources = [
    { label: 'preferences.providers.email_template.native_editor', value: 'native' },
    { label: 'preferences.providers.email_template.sendgrid_dynamic_template', value: 'sendgrid' }
  ]

  dynamicVars = [
    { key: 'customer_name', i18n: 'desc_customer_name' },
    { key: 'facility_name', i18n: 'desc_facility_name' },
    { key: 'reference', i18n: 'desc_reference' },
    { key: 'tracking_number', i18n: 'desc_tracking_number' },
    { key: 'pickup_pin', i18n: 'desc_pickup_pin' },
    { key: 'maps_url', i18n: 'desc_maps_url' },
    { key: 'logo_url', i18n: 'desc_logo_url' },
    { key: 'qr_code_url', i18n: 'desc_qr_code_url' }
  ]

  logoUrl: string = ''
  form!: FormGroup
  sendGridConfig: any = null
  providerId: string = ''

  get templateData(): EmailTemplate {
    return this.form.getRawValue() as EmailTemplate
  }

  constructor(private readonly fb: FormBuilder) {
    this.form = this.fb.group({
      language: ['EN', Validators.required],
      is_default: [false],
      template_mode: ['native', Validators.required],
      sendgrid_template_id: ['', [Validators.pattern(/^d-[a-zA-Z0-9]+$/)]],
      subject: ['', Validators.required],
      pre_title: ['', Validators.required],
      main_title: ['', Validators.required],
      instructions: ['', Validators.required],
      status_label: ['', Validators.required],
      status_message: ['', Validators.required],
      order_label: ['', Validators.required],
      pin_label: ['', Validators.required],
      security_title: ['', Validators.required],
      security_bullets: ['', Validators.required],
      show_security: [true],
      footer_text: ['', Validators.required],
      show_footer: [true],
      pickup_point: ['', Validators.required]
    })
  }

  ngOnInit() {
    this.logoUrl = this.config.data?.logoUrl || ''
    this.sendGridConfig = this.config.data?.sendGridConfig || null
    this.providerId = this.config.data?.providerId || ''
    const tpl = this.config.data?.template
    if (tpl) {
      const patched = {
        ...tpl,
        template_mode: tpl.template_mode || 'native',
        pre_title: tpl.pre_title?.toUpperCase(),
        order_label: tpl.order_label?.toUpperCase(),
        pin_label: tpl.pin_label?.toUpperCase(),
      }
      this.form.patchValue(patched)
      // Language cannot be changed once created
      this.form.get('language')?.disable()
      // Call update manually to sync disabled states initially
      this.updateConditionalFields()
    }

    // Auto-uppercase fields: pre_title, order_label, pin_label
    const uppercaseFields = ['pre_title', 'order_label', 'pin_label']
    uppercaseFields.forEach((field) => {
      this.form.get(field)?.valueChanges.subscribe((val) => {
        if (typeof val === 'string' && val !== val.toUpperCase()) {
          this.form.get(field)?.setValue(val.toUpperCase(), { emitEvent: false })
        }
      })
    })

    // Subscribe to changes to disable/enable inputs based on checkbox
    this.form.get('show_security')?.valueChanges.subscribe(() => this.updateConditionalFields())
    this.form.get('show_footer')?.valueChanges.subscribe(() => this.updateConditionalFields())
    this.form.get('template_mode')?.valueChanges.subscribe(() => this.updateConditionalFields())
  }

  private updateConditionalFields() {
    const showSecurity = this.form.get('show_security')?.value
    const showFooter = this.form.get('show_footer')?.value

    if (showSecurity) {
      this.form.get('security_title')?.enable()
      this.form.get('security_bullets')?.enable()
    } else {
      this.form.get('security_title')?.disable()
      this.form.get('security_bullets')?.disable()
    }

    if (showFooter) {
      this.form.get('footer_text')?.enable()
    } else {
      this.form.get('footer_text')?.disable()
    }

    const templateMode = this.form.get('template_mode')?.value
    if (templateMode === 'sendgrid') {
      this.form.get('sendgrid_template_id')?.enable()
      this.form.get('sendgrid_template_id')?.setValidators([Validators.required, Validators.pattern(/^d-[a-zA-Z0-9]+$/)])
      // disable native fields to avoid validation errors
      const nativeFields = ['subject', 'pre_title', 'main_title', 'instructions', 'status_label', 'status_message', 'order_label', 'pin_label', 'security_title', 'security_bullets', 'footer_text', 'pickup_point']
      nativeFields.forEach(f => this.form.get(f)?.disable())
    } else {
      this.form.get('sendgrid_template_id')?.disable()
      this.form.get('sendgrid_template_id')?.clearValidators()
      // enable native fields
      const nativeFields = ['subject', 'pre_title', 'main_title', 'instructions', 'status_label', 'status_message', 'order_label', 'pin_label', 'pickup_point']
      nativeFields.forEach(f => this.form.get(f)?.enable())
      // re-trigger security/footer logic to enable/disable correctly
      if (showSecurity) {
        this.form.get('security_title')?.enable()
        this.form.get('security_bullets')?.enable()
      }
      if (showFooter) {
        this.form.get('footer_text')?.enable()
      }
    }
    
    this.form.get('sendgrid_template_id')?.updateValueAndValidity()
  }

  private readonly dialogService = inject(DialogService)

  onTest() {
    if (!this.providerId) {
      return
    }

    if (this.form.value.template_mode === 'sendgrid' && this.form.get('sendgrid_template_id')?.invalid) {
      this.form.get('sendgrid_template_id')?.markAsTouched()
      return
    }

    this.dialogService.open(SendgridTestFormComponent, {
      header: 'Send Test Email',
      width: '400px',
      data: { template: this.templateData, sendGridConfig: this.sendGridConfig }
    })
  }

  onSave() {
    if (this.form.valid) {
      this.ref.close(this.form.getRawValue()) // getRawValue includes disabled fields if we need to save them, otherwise value
    }
  }

  onCancel() {
    this.ref.close()
  }
}
