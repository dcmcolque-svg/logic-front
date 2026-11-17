import {
  Component,
  inject,
  input,
  output,
  signal,
  OnChanges,
  SimpleChanges,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'

import { BaseDialog } from '@/app/shared/components/dialog/dialog/base-dialog.component'
import { BaseFormField } from '@/app/shared/components/form/form-field/base-form-field.component'
import { BaseFormGroup } from '@/app/shared/components/form/form-group/base-form-group.component'

import {
  LocationProfile,
  Zone,
  ZoneCreateInput,
  OperationalCategory,
  LocationGenerateInput,
  Facility,
} from '@/app/features/preferences/locations/types/location.types'

import { LocationService } from '../../location.service'

@Component({
  selector: 'app-location-generator-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    BaseDialog,
    BaseFormField,
    BaseFormGroup,
    ButtonModule,
    InputTextModule,
  ],
  templateUrl: './location-generator-dialog.component.html',
  styleUrl: './location-generator-dialog.component.scss',
})
export class LocationGeneratorDialogComponent implements OnChanges {
  private readonly locationService = inject(LocationService)
  private readonly messageService = inject(MessageService)
  private readonly translate = inject(TranslateService)

  // === Inputs ===
  visible = input(false)
  zones = input<Zone[]>([])
  operationalCategories = input<OperationalCategory[]>([])
  locationProfiles = input<LocationProfile[]>([])
  facilities = input<Facility[]>([])
  facilityId = input<string>('')

  // === Internal state ===
  saving = signal(false)
  savingZone = signal(false)

  // === Outputs ===
  generated = output<void>()
  zoneCreated = output<Zone>()
  hide = output<void>()

  // === Inline zone creation state ===
  showZoneForm = false
  zoneForm = new FormGroup({
    zone_name: new FormControl('', [Validators.required]),
    zone_type: new FormControl(''),
  })

  // === Form ===
  generatorForm = new FormGroup({
    facility_id: new FormControl<string | null>(null, [Validators.required]),
    zone_id: new FormControl<string | null>(null),
    location_profile_code: new FormControl('', [Validators.required]),
    operational_category_code: new FormControl<string | null>(null, [
      Validators.required,
    ]),
    aisle: new FormControl('', [Validators.required]),
    section_start: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(1),
    ]),
    section_end: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(1),
    ]),
    bay_start: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(1),
    ]),
    bay_end: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(1),
    ]),
    level_start: new FormControl('', [Validators.required]),
    level_end: new FormControl('', [Validators.required]),
  })

  // === Options ===
  levelOptions = Array.from({ length: 26 }, (_, i) => ({
    label: String.fromCodePoint(65 + i),
    value: String.fromCodePoint(65 + i),
  }))

  get facilityOptions() {
    return this.facilities().map((f) => ({
      label: f.name,
      value: f.id,
    }))
  }

  get zoneOptions() {
    const facilityId = this.generatorForm.get('facility_id')?.value
    if (!facilityId) return []
    return this.zones()
      .filter((z) => z.facility_id === facilityId)
      .map((z) => ({
        label: z.name,
        value: z.id,
      }))
  }

  get isZoneDisabled(): boolean {
    return !this.generatorForm.get('facility_id')?.value
  }

  get profileOptions() {
    return this.locationProfiles().map((p) => ({
      label: `${p.code} — ${p.name}`,
      value: p.code,
    }))
  }

  get opCategoryOptions() {
    return this.operationalCategories().map((c) => ({
      label: `${c.code} — ${this.translate.instant('preferences.location.category_' + c.code)}`,
      value: c.code,
    }))
  }

  constructor() {
    // When facility changes, reset zone selection (zones are facility-scoped)
    this.generatorForm.get('facility_id')?.valueChanges.subscribe((facilityId) => {
      this.generatorForm.get('zone_id')?.setValue(null)
      this.showZoneForm = false
      if (facilityId) {
        this.generatorForm.get('zone_id')?.enable()
      } else {
        this.generatorForm.get('zone_id')?.disable()
      }
    })

    // Cross-validate ranges — mark end controls dirty so inline errors show
    this.generatorForm.get('section_start')?.valueChanges.subscribe(() => {
      const endCtrl = this.generatorForm.get('section_end')
      if (endCtrl?.value != null) endCtrl.markAsDirty()
      endCtrl?.updateValueAndValidity()
    })
    this.generatorForm.get('bay_start')?.valueChanges.subscribe(() => {
      const endCtrl = this.generatorForm.get('bay_end')
      if (endCtrl?.value != null) endCtrl.markAsDirty()
      endCtrl?.updateValueAndValidity()
    })
    this.generatorForm.get('level_start')?.valueChanges.subscribe(() => {
      const endCtrl = this.generatorForm.get('level_end')
      if (endCtrl?.value != null) endCtrl.markAsDirty()
      endCtrl?.updateValueAndValidity()
    })

    // Add range validators
    this.generatorForm.get('section_end')?.addValidators((control) => {
      const start = this.generatorForm?.get('section_start')?.value
      if (start && control.value && control.value < start) {
        return { rangeInvalid: true }
      }
      return null
    })

    this.generatorForm.get('bay_end')?.addValidators((control) => {
      const start = this.generatorForm?.get('bay_start')?.value
      if (start && control.value && control.value < start) {
        return { rangeInvalid: true }
      }
      return null
    })

    this.generatorForm.get('level_end')?.addValidators((control) => {
      const startVal = this.generatorForm?.get('level_start')?.value as
        | string
        | null
      const endVal = control.value as string | null
      if (startVal && endVal) {
        if (
          endVal.toUpperCase().codePointAt(0)! <
          startVal.toUpperCase().codePointAt(0)!
        ) {
          return { rangeInvalid: true }
        }
      }
      return null
    })
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible()) {
      this.generatorForm.reset({
        facility_id: null,
      })
      this.generatorForm.get('zone_id')?.disable()
      this.showZoneForm = false
    }

    // When zones list changes (new zone added), auto-select the latest zone
    if (changes['zones'] && !changes['zones'].firstChange) {
      const zoneList = this.zones()
      if (this.showZoneForm && zoneList.length > 0) {
        const lastZone = zoneList.at(-1)!
        this.generatorForm.get('zone_id')?.setValue(lastZone.id)
        this.showZoneForm = false
        this.zoneForm.reset()
      }
    }
  }

  onGenerate() {
    if (!this.generatorForm.valid) return

    const v = this.generatorForm.getRawValue()
    const input: LocationGenerateInput = {
      facility_id: v.facility_id!,
      zone_id: v.zone_id || undefined,
      location_profile_code: v.location_profile_code!,
      operational_category_code: v.operational_category_code!,
      aisle: v.aisle!,
      section_start: v.section_start!,
      section_end: v.section_end!,
      bay_start: v.bay_start!,
      bay_end: v.bay_end!,
      level_start: v.level_start!,
      level_end: v.level_end!,
    }

    this.saving.set(true)
    this.locationService.generateLocations(input).subscribe({
      next: (resp) => {
        this.saving.set(false)
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('messages.success'),
          detail: this.translate.instant(
            'preferences.location.locations_generated',
            { count: resp.created }
          ),
        })
        this.generated.emit()
      },
      error: (err) => {
        this.saving.set(false)
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('messages.error'),
          detail:
            err?.error?.message ||
            this.translate.instant('preferences.location.generate_error'),
        })
      },
    })
  }

  // === Preview helpers ===

  getTotalCount(): number {
    const sectionRange = this.getSectionRange()
    const bayRange = this.getBayRange()
    const levelRange = this.getLevelRange()
    return sectionRange * bayRange * levelRange
  }

  getSectionRange(): number {
    const v = this.generatorForm.getRawValue()
    if (!v.section_start || !v.section_end) return 0
    const range = v.section_end - v.section_start + 1
    return Math.max(range, 0)
  }

  getBayRange(): number {
    const v = this.generatorForm.getRawValue()
    if (!v.bay_start || !v.bay_end) return 0
    const range = v.bay_end - v.bay_start + 1
    return Math.max(range, 0)
  }

  getLevelRange(): number {
    const v = this.generatorForm.getRawValue()
    if (!v.level_start || !v.level_end) return 0
    const startCode = v.level_start.toUpperCase().codePointAt(0)! - 65
    const endCode = v.level_end.toUpperCase().codePointAt(0)! - 65
    const range = endCode - startCode + 1
    return Math.max(range, 0)
  }

  // === Inline zone creation ===

  toggleZoneForm() {
    this.showZoneForm = !this.showZoneForm
    if (this.showZoneForm) {
      this.zoneForm.reset()
    }
  }

  cancelZoneForm() {
    this.showZoneForm = false
    this.zoneForm.reset()
  }

  saveZone() {
    if (!this.zoneForm.valid) return

    const facilityId = this.generatorForm.get('facility_id')?.value
    if (!facilityId) return

    const zoneInput: ZoneCreateInput = {
      facility_id: facilityId,
      name: this.zoneForm.get('zone_name')?.value || '',
      type: this.zoneForm.get('zone_type')?.value || undefined,
    }

    this.savingZone.set(true)
    this.locationService.createZone(zoneInput).subscribe({
      next: (zone) => {
        this.savingZone.set(false)
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('messages.success'),
          detail: this.translate.instant('preferences.location.zone_created'),
        })
        this.zoneCreated.emit(zone)
      },
      error: (err) => {
        this.savingZone.set(false)
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('messages.error'),
          detail:
            err?.error?.message ||
            this.translate.instant('preferences.location.zone_create_error'),
        })
      },
    })
  }
}
