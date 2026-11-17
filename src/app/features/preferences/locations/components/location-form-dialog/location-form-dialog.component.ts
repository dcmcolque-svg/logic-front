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
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { MessageService } from 'primeng/api'

import { BaseDialog } from '@/app/shared/components/dialog/dialog/base-dialog.component'
import { BaseFormField } from '@/app/shared/components/form/form-field/base-form-field.component'
import { BaseFormGroup } from '@/app/shared/components/form/form-group/base-form-group.component'

import {
  Location,
  LocationCreateInput,
  LocationUpdateInput,
  LocationProfile,
  Zone,
  ZoneCreateInput,
  OperationalCategory,
  Facility,
} from '@/app/features/preferences/locations/types/location.types'

import { LocationService } from '../../location.service'

import { ToggleSwitchModule } from 'primeng/toggleswitch'
import { InputNumberModule } from 'primeng/inputnumber'

@Component({
  selector: 'app-location-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    BaseDialog,
    BaseFormField,
    BaseFormGroup,
    ToggleSwitchModule,
    InputNumberModule,
    ButtonModule,
    InputTextModule,
  ],
  templateUrl: './location-form-dialog.component.html',
  styleUrl: './location-form-dialog.component.scss',
})
export class LocationFormDialogComponent implements OnChanges {
  private readonly locationService = inject(LocationService)
  private readonly messageService = inject(MessageService)
  private readonly translate = inject(TranslateService)

  // === Inputs ===
  visible = input(false)
  location = input<Location | null>(null)
  editing = input(false)
  zones = input<Zone[]>([])
  operationalCategories = input<OperationalCategory[]>([])
  locationProfiles = input<LocationProfile[]>([])
  facilities = input<Facility[]>([])
  facilityId = input<string>('')

  // === Internal state ===
  saving = signal(false)
  savingZone = signal(false)

  // === Outputs ===
  saved = output<void>()
  zoneCreated = output<Zone>()
  hide = output<void>()

  // === Inline zone creation state ===
  showZoneForm = false
  zoneForm = new FormGroup({
    zone_name: new FormControl('', [Validators.required]),
    zone_type: new FormControl(''),
  })

  // === Form ===
  locationForm = new FormGroup({
    facility_id: new FormControl<string | null>(null, [Validators.required]),
    location_code: new FormControl('', [Validators.required]),
    zone_id: new FormControl<string | null>(null),
    aisle: new FormControl('', [Validators.required]),
    row: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0),
    ]),
    bay: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0),
    ]),
    level: new FormControl('', [Validators.required]),
    is_active: new FormControl(true),
    location_profile_code: new FormControl('', [Validators.required]),
    operational_category_code: new FormControl<string | null>(null, [
      Validators.required,
    ]),
    custom_name: new FormControl(false),
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
    const facilityId = this.locationForm.get('facility_id')?.value
    if (!facilityId) return []
    return this.zones()
      .filter((z) => z.facility_id === facilityId)
      .map((z) => ({
        label: z.name,
        value: z.id,
      }))
  }

  get isZoneDisabled(): boolean {
    return !this.locationForm.get('facility_id')?.value
  }

  get profileOptions() {
    return this.locationProfiles().map((p) => ({
      label: p.name,
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
    this.locationForm.get('facility_id')?.valueChanges.subscribe((facilityId) => {
      this.locationForm.get('zone_id')?.setValue(null)
      this.showZoneForm = false
      if (facilityId) {
        this.locationForm.get('zone_id')?.enable()
      } else {
        this.locationForm.get('zone_id')?.disable()
      }
    })

    // Auto-generate location_code when area/row/bay/level change
    ;['aisle', 'row', 'bay', 'level'].forEach((field) => {
      this.locationForm.get(field)?.valueChanges.subscribe(() => {
        if (!this.locationForm.get('custom_name')?.value) {
          this.updateGeneratedName()
        }
      })
    })

    // Toggle custom name mode
    this.locationForm
      .get('custom_name')
      ?.valueChanges.subscribe((isCustom: boolean | null) => {
        const codeCtrl = this.locationForm.get('location_code')
        const aisleCtrl = this.locationForm.get('aisle')
        const rowCtrl = this.locationForm.get('row')
        const bayCtrl = this.locationForm.get('bay')
        const levelCtrl = this.locationForm.get('level')

        if (isCustom) {
          codeCtrl?.enable()
          aisleCtrl?.clearValidators()
          rowCtrl?.clearValidators()
          bayCtrl?.clearValidators()
          levelCtrl?.clearValidators()
        } else {
          codeCtrl?.disable()
          aisleCtrl?.setValidators([Validators.required])
          rowCtrl?.setValidators([Validators.required, Validators.min(0)])
          bayCtrl?.setValidators([Validators.required, Validators.min(0)])
          levelCtrl?.setValidators([Validators.required])
        }
        aisleCtrl?.updateValueAndValidity()
        rowCtrl?.updateValueAndValidity()
        bayCtrl?.updateValueAndValidity()
        levelCtrl?.updateValueAndValidity()
      })

    // Start with generated name mode (code disabled)
    this.locationForm.get('location_code')?.disable()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['location'] || changes['visible']) {
      const loc = this.location()
      if (loc) {
        // Parse row and bay from location_code (format: {Area}{Row}-{Bay}-{Level})
        const parts = this.parseLocationCode(loc.location_code)
        this.locationForm.patchValue({
          facility_id: loc.facility_id,
          location_code: loc.location_code,
          zone_id: loc.zone_id || null,
          aisle: loc.aisle || parts.area,
          row: parts.row,
          bay: parts.bay,
          level: loc.level || parts.level,
          is_active: loc.is_active,
          location_profile_code: loc.location_profile_code || '',
          operational_category_code: loc.operational_category_code || null,
          custom_name: true,
        })
        this.locationForm.get('location_code')?.enable()
        // Disable facility in edit mode (can't change facility of existing location).
        // Use emitEvent:false so the facility valueChanges subscription doesn't fire
        // and reset zone_id to null after patchValue already set it.
        this.locationForm.get('facility_id')?.disable({ emitEvent: false })
      } else if (this.visible()) {
        this.locationForm.reset({
          facility_id: null,
          is_active: true,
          custom_name: false,
        })
        this.locationForm.get('location_code')?.disable()
        this.locationForm.get('facility_id')?.enable()
        this.locationForm.get('zone_id')?.disable()
        this.showZoneForm = false
      }
    }

    // When zones list changes (new zone added), auto-select the latest zone
    if (changes['zones'] && !changes['zones'].firstChange) {
      const zoneList = this.zones()
      if (this.showZoneForm && zoneList.length > 0) {
        const lastZone = zoneList.at(-1)!
        this.locationForm.get('zone_id')?.setValue(lastZone.id)
        this.showZoneForm = false
        this.zoneForm.reset()
      }
    }
  }

  onSave() {
    if (!this.locationForm.valid) return

    const formValue = this.locationForm.getRawValue()
    const editingLoc = this.location()

    // Parse section from row for API (v2 uses "section" field, not "row")
    const section = formValue.row
      ? String(formValue.row).padStart(2, '0')
      : undefined

    this.saving.set(true)

    if (editingLoc) {
      // Update
      const updateInput: LocationUpdateInput = {
        zone_id: formValue.zone_id || undefined,
        aisle: formValue.aisle || undefined,
        section: section,
        level: formValue.level || undefined,
        is_active: formValue.is_active ?? undefined,
        location_profile_code: formValue.location_profile_code || undefined,
        operational_category_code:
          formValue.operational_category_code ?? undefined,
      }
      this.locationService
        .updateLocation(editingLoc.id, updateInput)
        .subscribe({
          next: () => {
            this.saving.set(false)
            this.messageService.add({
              severity: 'success',
              summary: this.translate.instant('messages.success'),
              detail: this.translate.instant(
                'preferences.location.location_updated'
              ),
            })
            this.saved.emit()
          },
          error: (err) => {
            this.saving.set(false)
            this.messageService.add({
              severity: 'error',
              summary: this.translate.instant('messages.error'),
              detail:
                err?.error?.message ||
                this.translate.instant('preferences.location.save_error'),
            })
          },
        })
    } else {
      // Create
      const createInput: LocationCreateInput = {
        facility_id: formValue.facility_id!,
        zone_id: formValue.zone_id || undefined,
        location_code: formValue.location_code!,
        aisle: formValue.aisle || undefined,
        section: section,
        level: formValue.level || undefined,
        location_profile_code: formValue.location_profile_code!,
        operational_category_code: formValue.operational_category_code!,
        travel_sequence: 0,
      }
      this.locationService.createLocation(createInput).subscribe({
        next: () => {
          this.saving.set(false)
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('messages.success'),
            detail: this.translate.instant(
              'preferences.location.location_created'
            ),
          })
          this.saved.emit()
        },
        error: (err) => {
          this.saving.set(false)
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('messages.error'),
            detail:
              err?.error?.message ||
              this.translate.instant('preferences.location.save_error'),
          })
        },
      })
    }
  }

  onAreaInput(event: Event): void {
    const input = event.target as HTMLInputElement
    let value = input.value
    value = value.toUpperCase().replaceAll(/\s/g, '')
    input.value = value
    this.locationForm.get('aisle')?.setValue(value, { emitEvent: false })
    this.updateGeneratedName()
  }

  private updateGeneratedName(): void {
    const area = this.locationForm.get('aisle')?.value || ''
    const row = this.locationForm.get('row')?.value
    const bay = this.locationForm.get('bay')?.value
    const level = this.locationForm.get('level')?.value || ''

    // If no fields are filled, clear the value so the placeholder shows
    if (!area && !row && !bay && !level) {
      this.locationForm.get('location_code')?.setValue('', { emitEvent: false })
      return
    }

    const areaPart = area || 'XX'
    const rowPad = row ? String(row).padStart(2, '0') : '00'
    const bayPad = bay ? String(bay).padStart(2, '0') : '00'
    const levelPart = level || 'X'

    const code = `${areaPart}-${rowPad}-${bayPad}-${levelPart}`
    this.locationForm.get('location_code')?.setValue(code, { emitEvent: false })
  }

  /**
   * Parse location code in format {Area}-{Row:02d}-{Bay:02d}-{Level}
   * e.g. "A21-03-04-B" → { area: "A21", row: 3, bay: 4, level: "B" }
   * Also supports legacy format {Area}{Row:02d}-{Bay:02d}-{Level}
   * e.g. "A2103-04-B" → { area: "A21", row: 3, bay: 4, level: "B" }
   */
  private parseLocationCode(code: string): {
    area: string
    row: number | null
    bay: number | null
    level: string
  } {
    // New format: Area-Row-Bay-Level (e.g. "A21-03-04-B")
    const newMatch = /^([A-Z0-9]+)-(\d+)-(\d+)-([A-Z]+)$/i.exec(code)
    if (newMatch) {
      return {
        area: newMatch[1],
        row: Number.parseInt(newMatch[2], 10),
        bay: Number.parseInt(newMatch[3], 10),
        level: newMatch[4],
      }
    }
    // Legacy format: AreaRow-Bay-Level (e.g. "A2103-04-B")
    const oldMatch = /^([A-Z]+)(\d+)-(\d+)-([A-Z]+)$/i.exec(code)
    if (oldMatch) {
      return {
        area: oldMatch[1],
        row: Number.parseInt(oldMatch[2], 10),
        bay: Number.parseInt(oldMatch[3], 10),
        level: oldMatch[4],
      }
    }
    return { area: '', row: null, bay: null, level: '' }
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

    const facilityId = this.locationForm.get('facility_id')?.value
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
