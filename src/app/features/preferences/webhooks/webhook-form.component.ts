import { Component, computed, effect, inject, OnInit, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms'
import { RouterModule } from '@angular/router'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { PasswordModule } from 'primeng/password'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'
import { ToastModule } from 'primeng/toast'
import { SelectModule } from 'primeng/select'
import { MultiSelectModule } from 'primeng/multiselect'
import { ProgressBarModule } from 'primeng/progressbar'
import { TagModule } from 'primeng/tag'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslateLanService } from '../../../core/services/translate-lan.service'
import { WebhookService } from './webhooks.service'
import { CredentialsService } from '../credentials/credentials.service'
import { formatDisplayDate } from '@/app/shared/utils/display-format'
import { OAuth2CredentialResponse } from '../credentials/credentials.types'
import { FieldErrorComponent, isInvalidCtrl, resolveErrorMessage } from '../../../shared/components'
import {
  AUTH_TYPE_OPTIONS,
  Facility,
  Webhook,
  WebhookAuthType,
  WebhookCreateUpdateDto,
  WebhookScope,
  VERSION_BY_SCOPE,
} from './webhooks.types'
import { revealInvalid } from '@/app/shared/utils/form.util'

/**
 * Strict HTTPS URL validator for webhook endpoint URLs.
 *
 * Rejects:
 *  - http:// (only https:// allowed)
 *  - Missing or empty host
 *  - Spaces anywhere in the URL
 *  - Non-ASCII / full-width characters (e.g. ｅxample.com)
 *  - Invalid characters in the host: < > | ^ ` [ ] { }
 *  - Host starting with a dot (https://.com) or double-dot
 *  - Host starting or ending with a hyphen (https://-example.com, https://example-.com)
 *  - Consecutive dots in host (https://example..com)
 *  - TLD shorter than 2 characters (https://example.c)
 *  - Purely numeric TLD (https://example.123)
 *  - Missing scheme (www.example.com, example.com, //example.com)
 */
function strictHttpsUrlValidator(control: import('@angular/forms').AbstractControl): { [key: string]: any } | null {
  const value: string = control.value ?? ''
  if (!value) return null // required handles empty

  const INVALID = { pattern: true }

  // 1. Must start with https://
  if (!/^https:\/\//i.test(value)) return INVALID

  // 2. No spaces anywhere
  if (/\s/.test(value)) return INVALID

  // 3. ASCII-only — reject full-width or non-ASCII chars
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(value)) return INVALID

  // 4. Parse with the URL API to get a proper host
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return INVALID
  }

  const host = parsed.hostname // e.g. "example.com" (lowercase, punycode-decoded)

  // 5. Host must be non-empty
  if (!host) return INVALID

  return isValidWebhookHost(host) ? null : INVALID
}

/** Validates the hostname part of a webhook URL (steps 6–9 of `strictHttpsUrlValidator`). */
function isValidWebhookHost(host: string): boolean {
  // 6. No invalid characters in host (before URL parsing normalises the path)
  //    Reject: < > | ^ ` [ ] { }
  if (/[<>|^`{}[\]]/.test(host)) return false

  // 7. Split host into labels and validate each segment
  const labels = host.split('.')

  // 7a. No empty label at the start → leading dot (https://.com)
  if (labels[0] === '') return false

  // 7b–7d. Each segment must be valid
  if (!labels.every(isValidHostLabel)) return false

  // 8. TLD (last label) must be 2+ alpha characters, not purely numeric
  const tld = labels.at(-1) ?? ''
  if (!/^[a-z]{2,}$/.test(tld)) return false

  // 9. Must have at least one domain label before the TLD (not just a TLD alone)
  return labels.length >= 2
}

function isValidHostLabel(label: string): boolean {
  // 7b. Each segment must not be empty (consecutive dots → https://example..com)
  if (label === '') return false
  // 7c. Each segment must not start or end with a hyphen
  if (label.startsWith('-') || label.endsWith('-')) return false
  // 7d. Each segment must contain only alphanumeric and hyphens
  return /^[a-z0-9-]+$/.test(label)
}

@Component({
  selector: 'app-webhook-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    TranslateModule,
    ToastModule,
    SelectModule,
    MultiSelectModule,
    ProgressBarModule,
    TagModule,
    FieldErrorComponent,
  ],
  providers: [MessageService],
  styles: [
    `
      .scope-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.3rem 0.75rem;
        border-radius: 20px;
        letter-spacing: 0.02em;
      }
      .scope-operator {
        background: rgba(59, 130, 246, 0.1);
        color: #3b82f6;
        border: 1px solid rgba(59, 130, 246, 0.25);
      }
      .scope-facility {
        background: rgba(34, 197, 94, 0.1);
        color: #16a34a;
        border: 1px solid rgba(34, 197, 94, 0.25);
      }
      .oauth-chip {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-radius: 8px;
        font-size: 0.8rem;
        font-weight: 500;
      }
      .oauth-chip--ok      { background: rgba(34,197,94,0.1);  color: #16a34a; border: 1px solid rgba(34,197,94,0.25); }
      .oauth-chip--warn    { background: rgba(234,179,8,0.1);  color: #ca8a04; border: 1px solid rgba(234,179,8,0.25); }
      .oauth-chip--expired { background: rgba(239,68,68,0.1);  color: #dc2626; border: 1px solid rgba(239,68,68,0.25); }
    `,
  ],
  template: `
    <p-toast></p-toast>
    <form
      [formGroup]="webhookForm"
      (ngSubmit)="saveWebhook()"
      class="flex flex-col gap-4"
    >
      <!-- Scope badge (read-only indicator) -->
      <div class="flex items-center gap-2 pb-1 border-b border-surface-200">
        @if (scope === 'operator') {
          <span class="scope-badge scope-operator">
            <i class="pi pi-globe" style="font-size: 0.7rem"></i>
            {{ 'preferences.webhook.scope_operator_title' | translate }}
          </span>
        } @else {
          <span class="scope-badge scope-facility">
            <i class="pi pi-building" style="font-size: 0.7rem"></i>
            {{ 'preferences.webhook.scope_facility_title' | translate }}
          </span>
        }
        <span class="text-surface-400 text-xs ml-1">
          {{ scope === 'operator'
            ? ('preferences.webhook.scope_operator_desc' | translate)
            : ('preferences.webhook.scope_facility_desc' | translate) }}
        </span>
      </div>

      <!-- Facility dropdown (only for facility scope) -->
      @if (scope === 'facility') {
        <div class="flex flex-col gap-2">
          <label for="facility_id" class="text-sm font-medium">
            {{ 'labels.facility' | translate }} *
          </label>
          <p-select
            id="facility_id"
            [options]="facilities"
            formControlName="facility_id"
            optionLabel="name"
            optionValue="id"
            [showClear]="true"
            [filter]="true"
            [placeholder]="'labels.select' | translate"
            [style]="{ width: '100%' }"
            appendTo="body"
          ></p-select>
          <sh-field-error [ctrl]="webhookForm.get('facility_id')" />
        </div>
      }

      <!-- Endpoint URL -->
      <div class="flex flex-col gap-2">
        <label for="endpoint_url" class="text-sm font-medium">
          {{ 'preferences.webhook.endpoint_url' | translate }} *
        </label>
        <input
          pInputText
          id="endpoint_url"
          formControlName="endpoint_url"
          placeholder="https://example.com/webhook"
          [class.ng-invalid]="isInvalid('endpoint_url')"
          class="w-full"
        />
        <sh-field-error
          [ctrl]="webhookForm.get('endpoint_url')"
          [errors]="{ pattern: 'forms_validation.valid_url' }"
        />
      </div>

      <!-- API Version -->
      <div class="flex flex-col gap-2">
        <label for="api_version" class="text-sm font-medium">
          {{ 'preferences.webhook.api_version' | translate }} *
        </label>
        <p-select
          id="api_version"
          [options]="versionOptions"
          formControlName="api_version"
          [showClear]="true"
          [placeholder]="'labels.select' | translate"
          [style]="{ width: '100%' }"
          appendTo="body"
        ></p-select>
        <sh-field-error [ctrl]="webhookForm.get('api_version')" />
      </div>

      <!-- Events -->
      <div class="flex flex-col gap-2">
        <label for="events" class="text-sm font-medium">
          {{ 'preferences.webhook.events' | translate }} *
        </label>
        <p-multiSelect
          id="events"
          formControlName="events"
          [options]="eventOptions"
          optionLabel="label"
          optionValue="value"
          [placeholder]="'preferences.webhook.select_events' | translate"
          [style]="{ width: '100%' }"
          appendTo="body"
        ></p-multiSelect>
        <sh-field-error [ctrl]="webhookForm.get('events')" />
      </div>

      <!-- Authentication Type -->
      <div class="flex flex-col gap-2">
        <label for="auth_type" class="text-sm font-medium">
          {{ 'preferences.webhook.authentication' | translate }}
        </label>
        <p-select
          id="auth_type"
          [options]="authTypeOptions"
          formControlName="auth_type"
          optionLabel="label"
          optionValue="value"
          [style]="{ width: '100%' }"
          appendTo="body"
          (onChange)="onAuthTypeChange($event.value)"
        ></p-select>
      </div>

      <!-- OAuth2 credential selector -->
      @if (selectedAuthType === 'oauth2') {
        <div class="flex flex-col gap-2">
          <label for="oauth_credential_id" class="text-sm font-medium">
            {{ 'preferences.webhook.oauth_credential' | translate }}
          </label>

          @if (oauthLoading()) {
            <div class="oauth-chip oauth-chip--warn">
              <i class="pi pi-spin pi-spinner"></i>
              <span>{{ 'preferences.webhook.loading_credentials' | translate }}</span>
            </div>
          } @else if (oauthList().length === 0) {
            <div class="oauth-chip oauth-chip--warn">
              <i class="pi pi-exclamation-triangle"></i>
              <span>
                {{ 'preferences.webhook.no_oauth_configured' | translate }} —
                <a (click)="goToOAuth()" class="cursor-pointer" style="font-weight:700;text-decoration:underline">
                  {{ 'preferences.webhook.configure_arrow' | translate }}
                </a>
              </span>
            </div>
          } @else {
            <p-select
              id="oauth_credential_id"
              [options]="oauthList()"
              formControlName="oauth_credential_id"
              optionLabel="label"
              optionValue="value"
              [showClear]="false"
              [placeholder]="'preferences.webhook.select_credential' | translate"
              [style]="{ width: '100%' }"
              appendTo="body"
            ></p-select>

            <!-- Status badge for selected credential -->
            @if (oauthCredential()) {
              <div [class]="oauthBadgeClass">
                <i [class]="oauthBadgeIcon"></i>
                <span>
                  {{ oauthBadgeLabel }}
                  @if (isOAuthConfigured() && isTokenValid()) {
                    &middot; {{ 'preferences.webhook.expires' | translate }} {{ getTokenExpDate() }}
                  }
                  @if (isOAuthConfigured() && !isTokenValid()) {
                    &nbsp;&mdash;
                    <a (click)="goToOAuth()" class="cursor-pointer" style="font-weight:700;text-decoration:underline">
                      {{ 'preferences.webhook.retest_integrations_arrow' | translate }}
                    </a>
                  }
                </span>
              </div>
            }
          }
        </div>
      }

      <!-- Bearer Token (conditional) -->
      @if (selectedAuthType === 'bearer_token') {
        <div class="flex flex-col gap-2">
          <label for="bearer_token" class="text-sm font-medium">
            {{ 'preferences.webhook.bearer_token' | translate }} *
          </label>
          <p-password
            id="bearer_token"
            formControlName="bearer_token"
            [feedback]="false"
            [toggleMask]="true"
            [placeholder]="'preferences.webhook.bearer_token_placeholder' | translate"
            styleClass="w-full"
            inputStyleClass="w-full"
          ></p-password>
          <sh-field-error [ctrl]="webhookForm.get('bearer_token')" />
        </div>
      }

      <!-- Description -->
      <div class="flex flex-col gap-2">
        <label for="description" class="text-sm font-medium">
          {{ 'labels.description' | translate }}
        </label>
        <input
          pInputText
          id="description"
          formControlName="description"
          [placeholder]="'preferences.webhook.description_placeholder' | translate"
          class="w-full"
        />
      </div>

      <!-- Loading -->
      @if (isLoading) {
        <div class="mt-2">
          <p-progressBar
            mode="indeterminate"
            [style]="{ height: '4px' }"
          ></p-progressBar>
        </div>
      }

      <!-- Actions -->
      <div class="flex justify-end gap-2 mt-2">
        <p-button
          (click)="closeDialog()"
          [label]="'buttons.cancel' | translate"
          severity="secondary"
          [outlined]="true"
          [disabled]="isLoading"
        ></p-button>
        <p-button
          type="submit"
          [label]="'buttons.save' | translate"
          [disabled]="isLoading"
          [loading]="isLoading"
        ></p-button>
      </div>
    </form>
  `,
})
export class WebhookFormDialogComponent implements OnInit {
  private readonly ref = inject(DynamicDialogRef)
  private readonly config = inject(DynamicDialogConfig)
  private readonly webhookService = inject(WebhookService)
  private readonly credentialsSvc = inject(CredentialsService)
  private readonly translate = inject(TranslateService)
  private readonly messageService = inject(MessageService)
  private readonly translateLanService = inject(TranslateLanService)

  webhook: Webhook | undefined
  facilities: Facility[] = []
  scope: WebhookScope = 'operator'
  webhookForm!: FormGroup
  isLoading = false

  eventOptions: { label: string; value: string }[] = []
  versionOptions: string[] = []
  authTypeOptions = AUTH_TYPE_OPTIONS

  // ── OAuth2 reactive state ────────────────────────────────────────────────
  /** Full list of credentials from the API — used to build the dropdown options */
  oauthList    = signal<{ label: string; value: string }[]>([])
  oauthLoading = signal(false)

  /** Raw list returned by the API */
  private readonly _oauthRaw          = signal<OAuth2CredentialResponse[]>([])
  /** UUID currently selected in the form control (updated via valueChanges) */
  private readonly _selectedCredId    = signal<string | null>(null)

  /** The credential object matching the current selection */
  oauthCredential = computed<OAuth2CredentialResponse | null>(() => {
    const id  = this._selectedCredId()
    const raw = this._oauthRaw()
    return raw.find((c) => c.id === id) ?? null
  })

  isOAuthConfigured = computed(() => !!this.oauthCredential())
  isTokenValid = computed(() => {
    const token = this.oauthCredential()?.token
    if (!token?.exp) return false
    return Date.now() < token.exp * 1000 - 5 * 60 * 1000
  })

  get selectedAuthType(): WebhookAuthType {
    return this.webhookForm?.get('auth_type')?.value ?? 'none'
  }

  get oauthBadgeClass(): string {
    if (this.oauthLoading()) return 'oauth-chip oauth-chip--warn'
    if (!this.isOAuthConfigured()) return 'oauth-chip oauth-chip--warn'
    return this.isTokenValid() ? 'oauth-chip oauth-chip--ok' : 'oauth-chip oauth-chip--expired'
  }

  get oauthBadgeIcon(): string {
    if (!this.isOAuthConfigured()) return 'pi pi-exclamation-triangle'
    return this.isTokenValid() ? 'pi pi-check-circle' : 'pi pi-times-circle'
  }

  get oauthBadgeLabel(): string {
    if (this.oauthLoading()) {
      return this.translate.instant('preferences.webhook.checking_oauth')
    }
    if (!this.isOAuthConfigured()) {
      return this.translate.instant('preferences.webhook.oauth_not_configured')
    }
    const token = this.oauthCredential()?.token
    if (!token?.exp) {
      return this.translate.instant('preferences.webhook.oauth_token_expired')
    }
    return this.isTokenValid()
      ? this.translate.instant('preferences.webhook.oauth_active')
      : this.translate.instant('preferences.webhook.oauth_token_expired')
  }

  getTokenExpDate(): string {
    const token = this.oauthCredential()?.token
    if (!token?.exp) return '—'
    return formatDisplayDate(token.exp * 1000, 'dateTime')
  }

  constructor() {
    effect(() => {
      this.translate.use(this.translateLanService.changeLanguage())
    })

    this.webhook = this.config.data?.webhook
    this.facilities = this.config.data?.facilities ?? []

    // Determine scope
    if (this.webhook) {
      this.scope = this.webhook.facility_id ? 'facility' : 'operator'
    } else {
      this.scope = this.config.data?.scope ?? 'operator'
    }
    this.versionOptions = [VERSION_BY_SCOPE[this.scope]]

    const backendEvents: { operator: { label: string; value: string }[], facility: { label: string; value: string }[] } | undefined = this.config.data?.events
    if (backendEvents) {
      this.eventOptions =
        this.scope === 'operator' ? backendEvents.operator : backendEvents.facility
    }

    this.translateEvents()

    this.translate.onLangChange.pipe(takeUntilDestroyed()).subscribe(() => {
      this.translateEvents()
    })
  }

  ngOnInit(): void {
    this.initializeForm()

    // Keep _selectedCredId signal in sync with the form control so that
    // the oauthCredential computed reacts to dropdown selection changes.
    this.webhookForm.get('oauth_credential_id')?.valueChanges.subscribe((id) => {
      this._selectedCredId.set(id ?? null)
    })
    // Initialise from the saved value (edit mode)
    const savedId = this.webhookForm.get('oauth_credential_id')?.value
    if (savedId) this._selectedCredId.set(savedId)

    // If editing an oauth2 webhook, load credentials immediately
    if (this.webhook?.auth_type === 'oauth2') {
      this.loadOAuthStatus()
    }
  }

  initializeForm(): void {
    const facilityValidators =
      this.scope === 'facility' ? [Validators.required] : []

    this.webhookForm = new FormGroup({
      api_version: new FormControl(this.webhook?.api_version || VERSION_BY_SCOPE[this.scope], [
        Validators.required,
      ]),
      events: new FormControl(this.webhook?.subscribed_events || [], [
        Validators.required,
      ]),
      status: new FormControl(this.webhook?.status || 'active', [
        Validators.required,
      ]),
      endpoint_url: new FormControl(this.webhook?.endpoint_url || '', [
        Validators.required,
        strictHttpsUrlValidator,
      ]),
      description: new FormControl(this.webhook?.description || ''),
      facility_id: new FormControl(
        this.webhook?.facility_id || null,
        facilityValidators
      ),
      auth_type: new FormControl<WebhookAuthType>(
        this.webhook?.auth_type ?? 'none'
      ),
      bearer_token: new FormControl(this.webhook?.bearer_token || ''),
      oauth_credential_id: new FormControl(this.webhook?.oauth_credential_id || null),
    })
  }

  onAuthTypeChange(value: WebhookAuthType): void {
    // Apply/clear bearer_token required validator dynamically
    const bearerCtrl = this.webhookForm.get('bearer_token')!
    if (value === 'bearer_token') {
      bearerCtrl.setValidators([Validators.required])
    } else {
      bearerCtrl.clearValidators()
      bearerCtrl.setValue('')
    }
    bearerCtrl.updateValueAndValidity()

    // Load OAuth2 credentials on first selection
    if (value === 'oauth2' && this.oauthList().length === 0) {
      this.loadOAuthStatus()
    }
    // Clear oauth credential when switching away
    if (value !== 'oauth2') {
      this.webhookForm.get('oauth_credential_id')?.setValue(null)
    }
  }

  loadOAuthStatus(): void {
    this.oauthLoading.set(true)
    this.credentialsSvc.listOAuth2().subscribe({
      next: (list) => {
        this._oauthRaw.set(list)

        // Build dropdown options — all active credentials
        const options = list
          .filter((c) => c.is_active)
          .map((c) => ({
            label: `${c.provider_name} (${c.environment})`,
            value: c.id,
          }))
        this.oauthList.set(options)

        // Pre-select: use the saved credential_id (edit mode), or the first active with a valid token
        const savedId = this.webhookForm.get('oauth_credential_id')?.value
        if (!savedId) {
          const best = list.find((c) => c.is_active && c.token?.exp)
          if (best) {
            this.webhookForm.get('oauth_credential_id')?.setValue(best.id)
          }
        }

        this.oauthLoading.set(false)
      },
      error: () => {
        this._oauthRaw.set([])
        this.oauthList.set([])
        this.oauthLoading.set(false)
      },
    })
  }

  saveWebhook(): void {
    if (revealInvalid(this.webhookForm)) return

    this.isLoading = true
    const v = this.webhookForm.value

    const webhookDto: WebhookCreateUpdateDto = {
      id: this.webhook?.id,
      api_version: v.api_version,
      subscribed_events: v.events ?? [],
      endpoint_url: v.endpoint_url,
      description: v.description || undefined,
      facility_id: v.facility_id || undefined,
      auth_type: v.auth_type,
      bearer_token: v.auth_type === 'bearer_token' ? v.bearer_token : undefined,
      oauth_credential_id: v.auth_type === 'oauth2' ? (v.oauth_credential_id ?? undefined) : undefined,
    }

    const saveObs = this.webhook?.id
      ? this.webhookService.putUpdateWebhook(webhookDto)
      : this.webhookService.postCreateWebhook(webhookDto)

    saveObs.subscribe({
      next: () => {
        this.isLoading = false
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('common.success'),
          detail: this.translate.instant(
            this.webhook?.id
              ? 'preferences.webhook.webhook_updated'
              : 'preferences.webhook.webhook_created'
          ),
        })
        this.ref.close(webhookDto)
      },
      error: (err) => {
        this.isLoading = false
        const detail =
          resolveErrorMessage(err, this.translate) ||
          this.translate.instant('messages.error_generic')
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('common.error'),
          detail,
        })
      },
    })
  }

  closeDialog(): void {
    this.ref.close()
  }

  goToOAuth(): void {
    this.ref.close('go_to_oauth')
  }

  isInvalid(field: string): boolean {
    return isInvalidCtrl(this.webhookForm.get(field))
  }

  private translateEvents(): void {
    const backendEvents = this.config.data?.events
    if (!backendEvents) return
    const rawList = this.scope === 'operator' ? backendEvents.operator : backendEvents.facility
    this.eventOptions = rawList.map((evt: any) => ({
      ...evt,
      label: evt.value,
    }))
  }
}
