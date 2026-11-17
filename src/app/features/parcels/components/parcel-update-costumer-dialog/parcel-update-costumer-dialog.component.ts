import {
  AbstractControl,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnChanges,
  OnInit,
  output,
  signal,
  SimpleChanges,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TranslateLanService } from '../../../../core/services/translate-lan.service'

import { ButtonModule } from 'primeng/button'
import { DialogModule } from 'primeng/dialog'
import { InputTextModule } from 'primeng/inputtext'
import { DatePickerModule } from 'primeng/datepicker'
import { SelectModule } from 'primeng/select'
import { KeyFilterModule } from 'primeng/keyfilter'
import { MessageService } from 'primeng/api'

import {
  parsePhoneNumberWithError,
  isPossiblePhoneNumber,
  getCountryCallingCode,
  getCountries,
  CountryCode,
} from 'libphonenumber-js'

import { ParcelService } from '../../parcel.service'
import { Parcel, UpdateCustomerInfoDTO } from '../../types/parcel.types'

// ── Country list ──────────────────────────────────────────────────────────────

/** Builds country options sorted alphabetically for the given locale */
function buildCountryOptions(locale: string) {
  const names = new Intl.DisplayNames([locale], { type: 'region' })
  return getCountries()
    .map(code => ({
      label: `+${getCountryCallingCode(code)} ${names.of(code) ?? code}`,
      value: code,
      _name: names.of(code) ?? code,
    }))
    .sort((a, b) => a._name.localeCompare(b._name, locale))
}

const DEFAULT_COUNTRY: CountryCode = 'US'

function parseStoredPhone(phone: string): { country: CountryCode; national: string } {
  if (!phone) return { country: DEFAULT_COUNTRY, national: '' }

  if (phone.startsWith('+')) {
    try {
      const parsed = parsePhoneNumberWithError(phone)
      if (parsed?.country) {
        return { country: parsed.country, national: parsed.nationalNumber as string }
      }
    } catch { /* fall through */ }

    const prefixes = getCountries()
      .map(c => ({ code: c, prefix: `+${getCountryCallingCode(c)}` }))
      .sort((a, b) => b.prefix.length - a.prefix.length)
    for (const { code, prefix } of prefixes) {
      if (phone.startsWith(prefix)) {
        return { country: code, national: phone.slice(prefix.length).trim() }
      }
    }
  }

  return { country: DEFAULT_COUNTRY, national: phone.trim() }
}

function phoneValidator(countryCtrl: FormControl<CountryCode | null>) {
  return (ctrl: AbstractControl): ValidationErrors | null => {
    const national = ctrl.value as string
    if (!national) return null
    const country = countryCtrl.value ?? DEFAULT_COUNTRY
    try {
      if (isPossiblePhoneNumber(national, country)) return null
    } catch { /* fall through */ }
    return { invalidPhone: true }
  }
}

@Component({
  selector: 'app-parcel-update-costumer-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    TranslateModule,
    ReactiveFormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    DatePickerModule,
    SelectModule,
    KeyFilterModule,
  ],
  templateUrl: './parcel-update-costumer-dialog.component.html',
  styleUrl: './parcel-update-costumer-dialog.component.scss',
})
export class ParcelUpdateCostumerDialogComponent implements OnChanges, OnInit {
  private readonly fb = inject(FormBuilder)
  private readonly parcelService = inject(ParcelService)
  private readonly messageService = inject(MessageService)
  private readonly translate = inject(TranslateService)
  private readonly translateLan = inject(TranslateLanService)

  /** The parcel to edit — when set, populates the form */
  parcel = input<Parcel | null>(null)
  /** Controls dialog visibility */
  visible = input(false)

  /** Emitted when the dialog should close */
  hide = output<void>()
  /** Emitted after a successful save so the parent can reload the table */
  saved = output<void>()

  saving = signal(false)
  showConfirmation = signal(false)
  selectedDate = signal<Date | null>(null)

  /** Minimum selectable date — today at midnight (no past dates allowed) */
  readonly today = new Date(new Date().setHours(0, 0, 0, 0))

  readonly countryOptions = computed(() => buildCountryOptions(this.translateLan.changeLanguage()))

  // phone_country must be created before the form so the validator can reference it
  readonly phoneCountryCtrl = new FormControl<CountryCode | null>(DEFAULT_COUNTRY)

  form = this.fb.group({
    name:          ['', Validators.required],
    last_name:     ['', Validators.required],
    email:         ['', [Validators.required, Validators.email]],
    phone_country: this.phoneCountryCtrl,
    phone:         ['', phoneValidator(this.phoneCountryCtrl)],
    address:       ['', Validators.required],
    ship_by_date:  [null as Date | null, Validators.required],
  })

  ngOnInit(): void {
    // Re-validate phone whenever the selected country changes
    this.phoneCountryCtrl.valueChanges.subscribe(() => {
      this.form.get('phone')?.updateValueAndValidity()
    })
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['parcel'] || changes['visible']) {
      const p = this.parcel()
      if (p && this.visible()) {
        this.populateForm(p)
        this.showConfirmation.set(false)
        this.saving.set(false)
      }
    }
  }

  private populateForm(p: Parcel) {
    const shipByRaw  = (p as any)?.ship_by_date ?? null
    const shipByDate = shipByRaw ? new Date(shipByRaw) : null
    this.selectedDate.set(shipByDate)

    const { country, national } = parseStoredPhone(p.customer?.phone ?? '')

    this.form.reset({
      name:          p.customer?.first_name ?? '',
      last_name:     p.customer?.last_name  ?? '',
      email:         p.customer?.email      ?? '',
      phone_country: country,
      phone:         national,
      address:       p.customer?.address    ?? '',
      ship_by_date:  shipByDate,
    })
  }

  /** User clicks "Save" — show confirmation step */
  onSaveClick() {
    this.form.markAllAsTouched()
    if (!this.form.valid) return
    this.showConfirmation.set(true)
  }

  /** User confirms — call API and refresh */
  onConfirm() {
    const parcelId = this.parcel()?.id
    if (!parcelId) return

    const raw          = this.form.getRawValue()
    const shipByDate   = raw.ship_by_date
    const national     = (raw.phone ?? '').trim()
    const phoneCountry = raw.phone_country ?? DEFAULT_COUNTRY

    // Build E.164 phone string via libphonenumber-js
    let fullPhone = ''
    if (national) {
      try {
        fullPhone = parsePhoneNumberWithError(national, phoneCountry).format('E.164')
      } catch {
        fullPhone = national   // fallback: store as-is
      }
    }

    const dto: UpdateCustomerInfoDTO = {
      id:           parcelId,
      name:         raw.name!,
      last_name:    raw.last_name!,
      email:        raw.email!,
      phone:        fullPhone,
      address:      raw.address!,
      ship_by_date: shipByDate
        ? shipByDate.toISOString().split('T')[0]
        : '',
    }

    this.saving.set(true)
    this.parcelService.updateCustomerInfo(dto).subscribe({
      next: () => {
        this.saving.set(false)
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('parcels.update_customer.success_summary'),
          detail:  this.translate.instant('parcels.update_customer.success_detail'),
        })
        this.showConfirmation.set(false)
        this.hide.emit()
        this.saved.emit()
      },
      error: () => {
        this.saving.set(false)
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('parcels.update_customer.error_summary'),
          detail:  this.translate.instant('parcels.update_customer.error_detail'),
        })
      },
    })
  }

  /** User cancels confirmation — go back to form */
  onCancelConfirmation() {
    this.showConfirmation.set(false)
  }

  /** User closes the dialog entirely */
  onClose() {
    this.showConfirmation.set(false)
    this.hide.emit()
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field)
    return !!(ctrl?.invalid && ctrl?.touched)
  }

  getPhoneError(): string {
    const errors = this.form.get('phone')?.errors
    if (!errors) return ''
    if (errors['invalidPhone']) return this.translate.instant('forms_validation.invalid_phone')
    return ''
  }
}
