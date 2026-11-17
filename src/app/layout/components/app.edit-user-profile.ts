import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core'

import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { FileUpload, FileUploadModule } from 'primeng/fileupload'
import { InputTextModule } from 'primeng/inputtext'
import { ProgressBarModule } from 'primeng/progressbar'
import { ToastModule } from 'primeng/toast'
import { SelectModule } from 'primeng/select'
import { KeyFilterModule } from 'primeng/keyfilter'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import {
  parsePhoneNumberWithError,
  isPossiblePhoneNumber,
  getCountryCallingCode,
  getCountries,
  CountryCode,
} from 'libphonenumber-js'
import { TranslateLanService } from '../../core/services/translate-lan.service'
import { UserAccountService } from '../../features/preferences/user-account/user-account.service'
import { AuthUser } from '../../features/preferences/user-account/user-account.types'
import { AuthService } from '../../core/services/auth.service'
import { AuthResponse } from '../../core/types/auth.types'


// ── Country list — one entry per calling code ─────────────────────────────────

/**
 * When multiple countries share the same calling code (e.g. +1 → US, CA, AG…),
 * this map defines which country is shown in the dropdown and used when restoring
 * a stored E.164 number whose country can't be determined from digits alone.
 *
 * Keys are the numeric calling code as a string; values are the preferred alpha-2
 * CountryCode to represent that code.
 */
const PREFERRED_FOR_CODE: Record<string, CountryCode> = {
  '1':   'US',   // +1: USA (also CA, AG, BB, BM, BS, DM, DO, GD, GU, JM, KN, KY, LC, MP, MS, PR, TC, TT, VC, VG, VI)
  '7':   'RU',   // +7: Russia (also KZ)
  '39':  'IT',   // +39: Italy (also VA – Vatican)
  '44':  'GB',   // +44: UK (also GG, IM, JE)
  '47':  'NO',   // +47: Norway (also BV, SJ)
  '61':  'AU',   // +61: Australia (also CC, CX)
  '64':  'NZ',   // +64: New Zealand (also PN)
  '212': 'MA',   // +212: Morocco (also EH)
  '262': 'RE',   // +262: Réunion (also YT)
  '290': 'SH',   // +290: Saint Helena (also TA)
  '358': 'FI',   // +358: Finland (also AX)
  '500': 'FK',   // +500: Falkland Islands (also GS)
  '590': 'GP',   // +590: Guadeloupe (also BL, MF)
  '599': 'CW',   // +599: Curaçao (also BQ)
  '672': 'NF',   // +672: Norfolk Island (also AQ, HM)
}

/** Set of calling codes that have a canonical representative in PREFERRED_FOR_CODE */
const _PREFERRED_CODES = new Set(Object.keys(PREFERRED_FOR_CODE))

/** Builds country options sorted alphabetically for the given locale.
 *  Only one entry per calling code is included — the canonical country from
 *  PREFERRED_FOR_CODE, or the only country that owns that code. */
function buildCountryOptions(locale: string) {
  const names = new Intl.DisplayNames([locale], { type: 'region' })

  // Track which calling codes have already been emitted
  const seen = new Set<string>()

  // First pass: gather all (code → callingCode) pairs
  const all = getCountries().map(code => ({
    cc: code,
    callingCode: getCountryCallingCode(code),
    label: `+${getCountryCallingCode(code)} ${names.of(code) ?? code}`,
    _name: names.of(code) ?? code,
  }))

  const result: { label: string; value: CountryCode; _name: string }[] = []

  for (const entry of all) {
    const dialCode = String(entry.callingCode)

    if (_PREFERRED_CODES.has(dialCode)) {
      // For shared codes: only emit the preferred country
      if (!seen.has(dialCode) && PREFERRED_FOR_CODE[dialCode] === entry.cc) {
        seen.add(dialCode)
        result.push({ label: entry.label, value: entry.cc, _name: entry._name })
      }
      // All other countries sharing this code are silently skipped
    } else if (!seen.has(dialCode)) {
      // Unique code — emit once (shouldn't collide, but guard anyway)
      seen.add(dialCode)
      result.push({ label: entry.label, value: entry.cc, _name: entry._name })
    }
  }

  return result.sort((a, b) => a._name.localeCompare(b._name, locale))
}

/** Default country when nothing is stored */
const DEFAULT_COUNTRY: CountryCode = 'US'

/**
 * Given a stored phone string (E.164 like "+5491123456" or raw national),
 * returns { country, national } using libphonenumber-js.
 *
 * For calling codes shared by multiple countries (e.g. +1), always resolves
 * to the canonical country in PREFERRED_FOR_CODE so the dropdown stays consistent.
 */
function parseStoredPhone(phone: string): { country: CountryCode; national: string } {
  if (!phone) return { country: DEFAULT_COUNTRY, national: '' }

  if (phone.startsWith('+')) {
    // 1) Try libphonenumber first — it works well for unambiguous codes
    try {
      const parsed = parsePhoneNumberWithError(phone)
      if (parsed?.country) {
        const callingCode = String(getCountryCallingCode(parsed.country))
        // If this code has a preferred representative, use that instead
        const canonical = PREFERRED_FOR_CODE[callingCode] ?? parsed.country
        return { country: canonical, national: parsed.nationalNumber as string }
      }
    } catch { /* fall through */ }

    // 2) Fallback: match calling code prefix, longest-first, map to canonical country
    const prefixes = getCountries()
      .map(c => ({ code: c, prefix: `+${getCountryCallingCode(c)}` }))
      .sort((a, b) => b.prefix.length - a.prefix.length)
    for (const { code, prefix } of prefixes) {
      if (phone.startsWith(prefix)) {
        const dialCode = String(getCountryCallingCode(code))
        const canonical = PREFERRED_FOR_CODE[dialCode] ?? code
        return { country: canonical, national: phone.slice(prefix.length).trim() }
      }
    }
  }

  // 3) Last resort: return as-is with default country
  return { country: DEFAULT_COUNTRY, national: phone.trim() }
}


/**
 * Encodes the canvas as JPEG at the given quality, lowering the quality by 0.1
 * until the result fits within `maxSize` (or quality reaches 0.3).
 * Resolves with the original file when the canvas cannot be encoded.
 */
function encodeCanvasAsJpeg(
  canvas: HTMLCanvasElement,
  file: File,
  maxSize: number,
  quality: number,
  resolve: (file: File) => void,
): void {
  canvas.toBlob(blob => {
    if (!blob) { resolve(file); return }
    if (blob.size <= maxSize || quality <= 0.3) {
      resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
    } else {
      encodeCanvasAsJpeg(canvas, file, maxSize, Math.round((quality - 0.1) * 10) / 10, resolve)
    }
  }, 'image/jpeg', quality)
}

/** Custom validator: checks that the national number length is plausible for the selected country */
function phoneValidator(countryCtrl: FormControl<CountryCode | null>) {
  return (ctrl: AbstractControl): ValidationErrors | null => {
    const national = ctrl.value as string
    if (!national) return null                    // phone is optional
    const country = countryCtrl.value ?? DEFAULT_COUNTRY
    try {
      if (isPossiblePhoneNumber(national, country)) return null
    } catch { /* fall through */ }
    return { invalidPhone: true }
  }
}

interface UserProfileDto {
  user_name?: string
  user_phone?: string
  user_img?: string
}

@Component({
  selector: 'app-edit-user-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    FileUploadModule,
    InputTextModule,
    ProgressBarModule,
    ToastModule,
    SelectModule,
    KeyFilterModule,
  ],
  providers: [MessageService],
  styles: [`
    .avatar-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      padding: 1.5rem 0 1rem;
    }
    .avatar-wrapper {
      position: relative;
      width: 120px;
      height: 120px;
      cursor: pointer;
    }
    .avatar-wrapper:hover .avatar-img {
      filter: brightness(0.75);
    }
    .avatar-wrapper:hover .avatar-overlay {
      opacity: 1;
    }
    .avatar-img {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid var(--p-content-border-color);
      transition: filter 0.2s ease;
    }
    .avatar-overlay {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 1.4rem;
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
    }
    .avatar-email {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.85rem;
      color: var(--p-text-muted-color, #6b7280);
    }
    .avatar-email i {
      font-size: 0.8rem;
    }
    .avatar-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .profile-form {
      display: flex;
      flex-direction: column;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      margin-bottom: 0.75rem;
    }
    .field-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--p-text-color);
    }
    .field-label .required {
      color: var(--p-red-500, #ef4444);
      margin-left: 0.2rem;
    }
    .field-error {
      color: var(--p-red-500, #ef4444);
      font-size: 0.8rem;
    }
    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--p-content-border-color);
    }
    .phone-group {
      display: flex;
      gap: 0.5rem;
      align-items: stretch;
    }
    .phone-group p-select {
      flex: 0 0 auto;
    }
    .phone-group input {
      flex: 1 1 0;
    }
  `],
  template: `
    <!-- Avatar -->
    <div class="avatar-section">
      <div class="avatar-wrapper" (click)="onAvatarClick()" style="cursor:pointer" [title]="'preferences.user_account.choose_image' | translate">
        <img [src]="avatarSrc" alt="profile avatar" class="avatar-img" />
        <div class="avatar-overlay">
          <i class="pi pi-camera"></i>
        </div>
      </div>

      <div class="avatar-actions">
        <p-fileUpload
          #fileUpload
          mode="basic"
          accept="image/*"
          customUpload="true"
          [auto]="true"
          chooseIcon="pi pi-upload"
          [chooseLabel]="'preferences.user_account.choose_image' | translate"
          styleClass="p-button-outlined p-button-sm"
          (onSelect)="onFileSelected($event)"
        />
        @if (previewUrl()) {
          <p-button
            icon="pi pi-times"
            severity="secondary"
            [outlined]="true"
            size="small"
            (click)="cancelImage(fileUpload)"
          />
        }
      </div>

      @if (userEmail()) {
        <span class="avatar-email">
          <i class="pi pi-envelope"></i>
          {{ userEmail() }}
        </span>
      }
    </div>

    <!-- Form -->
    <form [formGroup]="form" (ngSubmit)="save()" class="profile-form">

      <!-- User name -->
      <div class="field">
        <label for="ep_user_name" class="field-label">
          {{ 'preferences.user_profile.user_name' | translate }}
          <span class="required">*</span>
        </label>
        <input
          pInputText
          id="ep_user_name"
          formControlName="user_name"
          class="w-full"
          [placeholder]="'preferences.user_profile.user_name_placeholder' | translate"
          [class.ng-invalid]="isInvalid('user_name')"
          maxlength="100"
          (input)="onNameInput($event)"
          (blur)="onNameBlur()"
        />
        @if (isInvalid('user_name')) {
          <small class="field-error">{{ getError('user_name') }}</small>
        }
      </div>

      <!-- Phone -->
      <div class="field">
        <label for="ep_user_phone" class="field-label">
          {{ 'preferences.user_profile.user_phone' | translate }}
        </label>
        <div class="phone-group">
          <p-select
            id="ep_phone_country"
            formControlName="phone_country"
            [options]="countryOptions()"
            optionLabel="label"
            optionValue="value"
            [filter]="true"
            filterBy="label"
            appendTo="body"
            [style]="{ 'min-width': '12rem', 'max-width': '12rem' }"
          />
          <input
            pInputText
            pKeyFilter="int"
            id="ep_user_phone"
            type="tel"
            inputmode="numeric"
            formControlName="user_phone"
            class="w-full"
            [placeholder]="'preferences.user_profile.user_phone_placeholder' | translate"
            [class.ng-invalid]="isInvalid('user_phone')"
            maxlength="20"
          />
        </div>
        @if (isInvalid('user_phone')) {
          <small class="field-error">{{ getError('user_phone') }}</small>
        }
      </div>

      <!-- Loading bar -->
      @if (isLoading()) {
        <p-progressBar mode="indeterminate" [style]="{ height: '3px' }" styleClass="mt-2" />
      }

      <!-- Footer -->
      <div class="dialog-footer">
        <p-button
          [label]="'buttons.cancel' | translate"
          severity="secondary"
          [text]="true"
          [disabled]="isLoading()"
          (click)="close()"
        />
        <p-button
          [label]="'buttons.save' | translate"
          type="submit"
          [disabled]="form.invalid || isLoading()"
          [loading]="isLoading()"
        />
      </div>

    </form>

    <p-toast />
  `,
})
export class AppEditUserProfile implements OnInit {
  private readonly translate      = inject(TranslateService)
  private readonly translateLan   = inject(TranslateLanService)
  private readonly ref            = inject(DynamicDialogRef)
  private readonly config         = inject(DynamicDialogConfig)
  private readonly svc            = inject(UserAccountService)
  private readonly authService    = inject(AuthService)
  private readonly messageService = inject(MessageService)

  readonly defaultAvatar = '/layout/images/user_default.svg'
  readonly countryOptions = computed(() => buildCountryOptions(this.translateLan.changeLanguage()))

  // ── State ─────────────────────────────────────────────────────────────────
  // Read phone DIRECTLY from localStorage (most up-to-date source)
  // Read name/img from config.data (passed by topbar) as usual
  // config.data.user is the result of getCompleteUserInfo() which spreads AuthResponse
  // (has user_name) + AuthUser fields (has user_phone, user_img). We type it accordingly.
  user = this.config.data?.user as (AuthUser & Pick<AuthResponse, 'user_name'>) | undefined
  private readonly storedPhone = this.authService.getUserPhone() || this.user?.user_phone || ''
  private readonly storedImg   = this.authService.getUserImg()   || this.authService.getAvatar() || this.user?.user_img || ''
  isLoading   = signal(false)
  previewUrl  = signal<string | null>(null)
  previewFile = signal<File | null>(null)
  userEmail   = signal<string>('')

  // ── Parse stored phone on open ────────────────────────────────────────────
  private readonly parsed = parseStoredPhone(this.storedPhone)

  // ── Form ──────────────────────────────────────────────────────────────────
  // phone_country must be created first so the validator can reference it
  readonly phoneCountryCtrl = new FormControl<CountryCode | null>(this.parsed.country)

  form = new FormGroup({
    user_name: new FormControl(
      this.user?.user_name || '',
      [Validators.required, Validators.minLength(3)],
    ),
    phone_country: this.phoneCountryCtrl,
    user_phone: new FormControl(
      this.parsed.national,
      [phoneValidator(this.phoneCountryCtrl)],
    ),
    user_img: new FormControl(this.storedImg),
  })

  constructor() {
    effect(() => this.translate.use(this.translateLan.changeLanguage()))
  }

  ngOnInit(): void {
    // Re-validate phone when country changes
    this.phoneCountryCtrl.valueChanges.subscribe(() => {
      this.form.get('user_phone')?.updateValueAndValidity()
    })

    // Fetch the user's email from the backend (not available in the cookie payload)
    const uid = (this.user as any)?.uid
    if (uid) {
      this.svc.getById(uid).subscribe({
        next: (res: any) => {
          // The backend returns the user object directly (not wrapped in { data })
          const email = res?.data?.email || res?.email || ''
          this.userEmail.set(email)
        },
      })
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  get avatarSrc(): string {
    return this.previewUrl() || this.storedImg || this.defaultAvatar
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field)
    return !!(ctrl?.invalid && (ctrl.dirty || ctrl.touched))
  }

  getError(field: string): string {
    const errors = this.form.get(field)?.errors
    if (!errors) return ''
    if (errors['required'])     return this.translate.instant('forms_validation.required')
    if (errors['minlength'])    return this.translate.instant('forms_validation.number_characters_3')
    if (errors['invalidPhone']) return this.translate.instant('forms_validation.invalid_phone')
    return ''
  }

  // ── Whitespace normalization ──────────────────────────────────────────────
  /** Collapses multiple spaces and prevents leading space while typing */
  onNameInput(event: Event): void {
    const input = event.target as HTMLInputElement
    let value = input.value
    if (value.startsWith(' ')) value = value.trimStart()
    value = value.replaceAll(/ {2,}/g, ' ')   // collapse 2+ spaces → 1
    if (value !== input.value) {
      this.form.get('user_name')?.setValue(value, { emitEvent: false })
    }
  }

  /** Trims trailing space on focus loss */
  onNameBlur(): void {
    const ctrl = this.form.get('user_name')
    if (ctrl) ctrl.setValue((ctrl.value ?? '').trim(), { emitEvent: false })
  }

  // ── Image handling ────────────────────────────────────────────────────────
  @ViewChild('fileUpload') private readonly fileUploadRef!: FileUpload

  /** Clicking the avatar circle opens the file picker (same as the Choose Image button) */
  onAvatarClick(): void {
    const input = this.fileUploadRef?.el?.nativeElement?.querySelector('input[type="file"]') as HTMLInputElement | null
    input?.click()
  }

  onFileSelected(event: { files: File[] }): void {
    const file = event.files[0]
    if (!file) return

    const MAX_SIZE = 5 * 1024 * 1024  // 5 MB
    if (file.size > MAX_SIZE) {
      this.compressImage(file).then(compressed => this.applyPreview(compressed))
    } else {
      this.applyPreview(file)
    }
  }

  private applyPreview(file: File): void {
    this.previewFile.set(file)
    const reader = new FileReader()
    reader.onload = () => this.previewUrl.set(reader.result as string)
    reader.readAsDataURL(file)
  }

  /**
   * Resizes the image to fit within MAX_PX on its longest side and encodes
   * as JPEG at the given quality. Iterates with lower quality if still > 5 MB.
   */
  private compressImage(file: File): Promise<File> {
    const MAX_PX   = 1200
    const MAX_SIZE = 5 * 1024 * 1024
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        // Calculate scaled dimensions keeping aspect ratio
        let { width, height } = img
        if (width > MAX_PX || height > MAX_PX) {
          if (width > height) { height = Math.round(height * MAX_PX / width);  width  = MAX_PX }
          else                { width  = Math.round(width  * MAX_PX / height); height = MAX_PX }
        }
        const canvas = document.createElement('canvas')
        canvas.width  = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

        encodeCanvasAsJpeg(canvas, file, MAX_SIZE, 0.85, resolve)
      }
      img.src = url
    })
  }

  cancelImage(fileUpload: { clear: () => void }): void {
    this.previewUrl.set(null)
    this.previewFile.set(null)
    fileUpload.clear()
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }

    this.isLoading.set(true)
    const raw = this.form.value
    const user_name  = (raw.user_name  ?? '').trim().replaceAll(/ {2,}/g, ' ')
    const user_phone = raw.user_phone  ?? ''
    const phone_country = raw.phone_country
    const user_img   = raw.user_img   ?? ''

    // Build E.164 phone string via libphonenumber-js
    let fullPhone = ''
    if (user_phone?.trim()) {
      try {
        const parsed = parsePhoneNumberWithError(user_phone.trim(), phone_country ?? DEFAULT_COUNTRY)
        fullPhone = parsed.format('E.164')   // e.g. "+5491123456"
      } catch {
        fullPhone = user_phone.trim()        // fallback: store as-is
      }
    }

    if (this.previewFile()) {
      const fd = new FormData()
      fd.append('file', this.previewFile()!)
      this.svc.uploadImage(fd).subscribe({
        next: (urls) => this.submitProfile({
          user_name:  user_name ?? '',
          user_phone: fullPhone,
          user_img:   urls?.[0] ?? user_img ?? '',
        }),
        error: () => this.handleError(),
      })
    } else {
      this.submitProfile({
        user_name:  user_name ?? '',
        user_phone: fullPhone,
        user_img:   user_img  ?? '',
      })
    }
  }

  private submitProfile(dto: UserProfileDto): void {
    this.svc.putUpdateUserProfile(dto).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.ref.close(dto)   // closing the dialog is the success signal
      },
      error: () => this.handleError(),
    })
  }

  private handleError(): void {
    this.isLoading.set(false)
    this.messageService.add({
      severity: 'error',
      summary: this.translate.instant('messages.error'),
      detail:  this.translate.instant('preferences.user_profile.save_error'),
    })
  }

  close(): void {
    this.ref.close()
  }
}
