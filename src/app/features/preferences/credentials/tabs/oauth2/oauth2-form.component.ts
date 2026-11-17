import { Component, effect, inject, OnInit, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { PasswordModule } from 'primeng/password'
import { SelectModule } from 'primeng/select'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'

import { TranslateLanService } from '../../../../../core/services/translate-lan.service'
import { CredentialsService } from '../../credentials.service'
import { ENV_OPTIONS, OAuth2CredentialRequest, OAuth2CredentialResponse } from '../../credentials.types'
import { FieldErrorComponent, isInvalidCtrl, handleFormError } from '../../../../../shared/components'

@Component({
  selector: 'app-oauth2-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    SelectModule,
    FieldErrorComponent,
  ],
  template: `
    <form
      [formGroup]="form"
      (ngSubmit)="save()"
      class="flex flex-col gap-4 p-1"
    >
      <!-- Provider -->
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">
          {{ 'labels.provider' | translate }}
          <span class="text-red-500">*</span>
        </label>
        <input
          pInputText
          formControlName="provider_name"
          [placeholder]="'labels.provider_placeholder' | translate"
          [readonly]="editMode"
          [class.opacity-60]="editMode"
          [class.ng-invalid]="isInvalid('provider_name')"
          class="w-full"
          (input)="sanitizeProviderName()"
        />
        @if (!editMode) {
          <small class="text-surface-400">{{
            'labels.provider_hint' | translate
          }}</small>
        }
        <sh-field-error
          [ctrl]="form.get('provider_name')"
          [errors]="{
            extraSpaces: 'forms_validation.extra_spaces_not_allowed',
            specialChars: 'forms_validation.special_chars_not_allowed'
          }"
        />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <!-- Client ID -->
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">
            {{ 'labels.client_id' | translate }}
            <span class="text-red-500">*</span>
          </label>
          <input
            pInputText
            formControlName="client_id"
            placeholder="e.g. 2510"
            [class.ng-invalid]="isInvalid('client_id')"
            class="w-full"
          />
          <sh-field-error [ctrl]="form.get('client_id')" />
        </div>

        <!-- Client Secret -->
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">
            {{ 'labels.client_secret' | translate }}
            @if (!editMode) {
              <span class="text-red-500">*</span>
            }
          </label>
          <p-password
            formControlName="client_secret"
            [placeholder]="
              editMode ? '••••••••' : ('labels.enter_secret' | translate)
            "
            [feedback]="false"
            [toggleMask]="true"
            styleClass="w-full"
            inputStyleClass="w-full"
          >
          </p-password>
          @if (editMode) {
            <small class="text-surface-400">{{
              'labels.leave_empty_to_keep' | translate
            }}</small>
          }
          <sh-field-error [ctrl]="form.get('client_secret')" />
        </div>

        <!-- Environment -->
        <div class="flex flex-col gap-1 col-span-2">
          <label class="text-sm font-medium">
            {{ 'labels.environment' | translate }}
            <span class="text-red-500">*</span>
          </label>
          <p-select
            [options]="envOptions"
            formControlName="environment"
            optionLabel="label"
            optionValue="value"
            [style]="{ width: '100%' }"
            appendTo="body"
          ></p-select>
          <sh-field-error [ctrl]="form.get('environment')" />
        </div>

        <!-- Token URL -->
        <div class="flex flex-col gap-1 col-span-2">
          <label class="text-sm font-medium">
            {{ 'labels.token_url' | translate }}
          </label>
          <input
            pInputText
            formControlName="token_url"
            placeholder="https://example.com/oauth/token"
            [class.ng-invalid]="isInvalid('token_url')"
            class="w-full"
          />
          <sh-field-error
            [ctrl]="form.get('token_url')"
            [errors]="{ invalidUrl: 'forms_validation.url_http_or_https' }"
          />
        </div>
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-2 mt-2">
        <p-button
          type="button"
          [label]="'buttons.cancel' | translate"
          severity="secondary"
          [text]="true"
          (click)="cancel()"
        ></p-button>
        <p-button
          type="submit"
          icon="pi pi-save"
          [label]="'buttons.save' | translate"
          [loading]="saving()"
          [disabled]="!isValid()"
        >
        </p-button>
      </div>
    </form>
  `,
})
export class OAuth2FormComponent implements OnInit {
  private readonly fb = inject(FormBuilder)
  private readonly ref = inject(DynamicDialogRef)
  private readonly config = inject(DynamicDialogConfig)
  private readonly svc = inject(CredentialsService)
  private readonly translate = inject(TranslateService)
  private readonly translateLan = inject(TranslateLanService)

  envOptions = ENV_OPTIONS
  saving = signal(false)
  editMode = false
  credential: OAuth2CredentialResponse | null = null

  form!: FormGroup

  constructor() {
    effect(() => this.translate.use(this.translateLan.changeLanguage()))
  }

  ngOnInit(): void {
    this.credential =
      (this.config.data?.credential as OAuth2CredentialResponse) ?? null
    this.editMode = !!this.credential

    this.form = this.fb.group({
      provider_name: new FormControl(
        { value: this.credential?.provider_name ?? '', disabled: this.editMode },
        [Validators.required, this.noExtraSpacesValidator(), this.noSpecialCharsValidator()]
      ),
      client_id: new FormControl(
        this.credential?.client_id ?? '',
        Validators.required
      ),
      client_secret: new FormControl(''),
      environment: new FormControl<'qa' | 'sandbox' | 'production'>(
        (this.credential?.environment as 'qa' | 'sandbox' | 'production') ?? 'qa',
        Validators.required
      ),
      token_url: new FormControl(
        this.credential?.token_url ?? '',
        [this.httpOrHttpsValidator()]
      ),
    })
  }

  isInvalid(field: string): boolean {
    return isInvalidCtrl(this.form.get(field))
  }

  /** Validates that the URL starts with http:// or https:// (only if not empty) */
  private httpOrHttpsValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const val = control.value as string
      if (!val) return null
      return /^https?:\/\/.+/.test(val) ? null : { invalidUrl: true }
    }
  }

  /** Prevents leading spaces and consecutive spaces while typing */
  sanitizeProviderName(): void {
    const ctrl = this.form.get('provider_name')
    if (!ctrl) return
    let val: string = ctrl.value ?? ''
    // Remove leading spaces
    val = val.replace(/^\s+/, '')
    // Collapse consecutive spaces into one
    val = val.replaceAll(/ {2,}/g, ' ')
    if (val !== ctrl.value) {
      ctrl.setValue(val, { emitEvent: false })
    }
  }

  /** Validates no leading, trailing, or consecutive spaces */
  private noExtraSpacesValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const val = control.value as string
      if (!val) return null
      if (val !== val.trim() || / {2,}/.test(val)) {
        return { extraSpaces: true }
      }
      return null
    }
  }

  /** Validates that the value only contains letters, numbers, spaces, hyphens, and underscores */
  private noSpecialCharsValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      const val = control.value as string
      if (!val) return null
      if (!/^[a-zA-Z0-9 _-]+$/.test(val)) {
        return { specialChars: true }
      }
      return null
    }
  }

  isValid(): boolean {
    const secret = this.form.get('client_secret')?.value
    const secretOk = this.editMode || !!secret
    return this.form.valid && secretOk
  }

  save(): void {
    this.form.markAllAsTouched()
    if (!this.isValid()) return
    this.saving.set(true)

    const v = this.form.getRawValue()
    const provider = v.provider_name
    const body: OAuth2CredentialRequest = {
      client_id: v.client_id,
      client_secret: v.client_secret ?? '',
      environment: v.environment,
      token_url: v.token_url || undefined,
    }

    const call = this.editMode
      ? this.svc.updateOAuth2(body, provider)
      : this.svc.createOAuth2(body, provider)

    call.subscribe({
      next: () => {
        this.saving.set(false)
        this.ref.close(true)
      },
      error: (err: any) => {
        this.saving.set(false)
        handleFormError(err, this.form, this.translate)
      },
    })
  }

  cancel(): void {
    this.ref.close()
  }
}
