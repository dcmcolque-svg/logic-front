import { Component, input, output, OnChanges, SimpleChanges, inject, OnInit, DestroyRef, computed } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'

import { BaseDialog } from '@/app/shared/components/dialog/dialog/base-dialog.component'
import { BaseFormField } from '@/app/shared/components/form/form-field/base-form-field.component'
import { BaseFormGroup } from '@/app/shared/components/form/form-group/base-form-group.component'
import { Company, Facility, InventoryRotation } from '../../services/rotations.types'

@Component({
  selector: 'app-rotations-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    BaseDialog,
    BaseFormField,
    BaseFormGroup,
  ],
  templateUrl: './rotations-form-dialog.component.html',
  styleUrl: './rotations-form-dialog.component.scss',
})
export class RotationsFormDialogComponent implements OnChanges, OnInit {
  destroyRef = inject(DestroyRef)

  /** Dialog visibility */
  visible = input(false)
  /** Rotation to edit (null = create mode) */
  rotation = input<InventoryRotation | null>(null)
  /** Whether save is in progress */
  saving = input(false)

  /** Emitted when save is clicked (with form value) */
  save = output<Record<string, any>>()
  /** Emitted when dialog is hidden */
  hide = output<void>()

  /** Whether we are editing an existing rotation */
  editing = input(false)

  /** List of available zones for the multiselect */
  zonesList = input<any[]>([])

  /** List of available facilities for the dropdown */
  facilitiesList = input<Facility[]>([])

  /** List of available companies for the dropdown */
  companiesList = input<Company[]>([])

  // === Form ===
  rotationForm = new FormGroup({
    name: new FormControl('', [Validators.required]),
    facility_id: new FormControl<string | null>(null, [Validators.required]),
    company_id: new FormControl<string | null>(null, [Validators.required]),
    default: new FormControl(false),
    category: new FormControl(false),
    zones: new FormControl<string[]>([]),
    kardex_sort: new FormControl('greater_than_order', [Validators.required]),
    first_rotation: new FormControl('FIFO', [Validators.required]),
    second_rotation: new FormControl<string | null>(null),
  })

  // === Computed State ===
  selectedFacilityId = toSignal(this.rotationForm.controls.facility_id.valueChanges, {
    initialValue: this.rotationForm.controls.facility_id.value
  })

  filteredZonesList = computed(() => {
    const facilityId = this.selectedFacilityId()
    const allZones = this.zonesList()
    if (!facilityId) return []
    return allZones.filter((zone: any) => zone.facility_id === facilityId)
  })

  // === Options ===
  sortOptions = [
    { label: 'Greater than order', value: 'greater_than_order' },
    { label: 'Less than order', value: 'less_than_order' },
  ]

  firstRotationOptions = [
    { label: 'FIFO', value: 'FIFO' },
    { label: 'LIFO', value: 'LIFO' },
    { label: 'LOCATION-BIN ascending', value: 'LOCATION-BIN ascending' },
    { label: 'LOCATION-BIN descending', value: 'LOCATION-BIN descending' },
    { label: 'FEFO', value: 'FEFO' },
    { label: 'LEFO', value: 'LEFO' },
    { label: 'FLFO', value: 'FLFO' },
    { label: 'LLFO', value: 'LLFO' },
    { label: 'TraceCard qty ascending', value: 'tracecard qty ascending' },
    { label: 'TraceCard qty descending', value: 'tracecard qty descending' },
  ]

  secondRotationOptions = [
    { label: 'FIFO', value: 'FIFO' },
    { label: 'LIFO', value: 'LIFO' },
    { label: 'LOCATION-BIN ascending', value: 'LOCATION-BIN ascending' },
    { label: 'LOCATION-BIN descending', value: 'LOCATION-BIN descending' },
  ]

  get showSecondRotation(): boolean {
    const val = this.rotationForm.controls.first_rotation.value;
    return ['FEFO', 'LEFO', 'FLFO', 'LLFO'].includes(val as string);
  }

  ngOnInit() {
    this.rotationForm.controls.first_rotation.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateSecondRotationState();
      });

    // Clear zones when facility changes (old zone IDs are invalid for the new facility)
    this.rotationForm.controls.facility_id.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.rotationForm.controls.zones.setValue([]);
      });
  }

  private updateSecondRotationState() {
    if (this.showSecondRotation) {
      this.rotationForm.controls.second_rotation.enable();
    } else {
      this.rotationForm.controls.second_rotation.setValue(null);
      this.rotationForm.controls.second_rotation.disable();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rotation'] || changes['visible']) {
      const rotation = this.rotation()
      if (rotation) {
        this.rotationForm.patchValue({
          ...rotation,
          facility_id: rotation.facility_id || null,
          company_id: rotation.company_id || null,
          zones: rotation.zones || [],
        })
      } else if (this.visible()) {
        this.rotationForm.reset({
          facility_id: null,
          company_id: null,
          default: false,
          category: false,
          kardex_sort: 'greater_than_order',
          first_rotation: 'FIFO',
          second_rotation: null,
        })
      }
      
      this.updateSecondRotationState();
    }
  }

  onSave() {
    if (this.rotationForm.valid) {
      this.save.emit(this.rotationForm.value)
    }
  }
}
