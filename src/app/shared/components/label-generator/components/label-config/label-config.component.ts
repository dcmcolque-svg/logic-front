import {
  Component,
  inject,
  input,
  output,
  signal,
  computed,
  OnInit,
  effect,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { SelectModule } from 'primeng/select'
import { ToggleSwitchModule } from 'primeng/toggleswitch'
import { SelectButtonModule } from 'primeng/selectbutton'

import {
  LabelFieldConfig,
  LabelSize,
  BarcodeType,
  LabelOrientation,
  FieldLabelMode,
  LABEL_SIZES,
  BARCODE_TYPES,
  LABEL_ORIENTATIONS,
  FIELD_LABEL_MODES,
} from '../../types/label.types'

/**
 * LabelConfigComponent — Side panel with label configuration controls.
 *
 * Renders:
 * - Label size selector dropdown
 * - Orientation toggle (portrait/landscape)
 * - Barcode type selector dropdown
 * - Barcode field selector dropdown
 * - Field label mode selector (none / text / icon)
 * - Toggle switches for each data field
 *
 * Emits changes upward so the parent can update the preview in real time.
 */
@Component({
  selector: 'label-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    SelectModule,
    ToggleSwitchModule,
    SelectButtonModule,
  ],
  template: `
    <div class="flex flex-col gap-5">
      <!-- Label size -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-surface-600 dark:text-surface-300">
          {{ 'labels.label_size' | translate }}
        </label>
        <p-select
          [options]="sizes"
          optionLabel="label"
          [ngModel]="selectedSize()"
          (ngModelChange)="onSizeChange($event)"
          appendTo="body"
          styleClass="w-full"
          size="small"
          [filter]="true"
          filterBy="label"
          [filterPlaceholder]="'labels.label_size' | translate"
          [virtualScroll]="true"
          [virtualScrollItemSize]="38"
          scrollHeight="16rem"
        />
      </div>

      <!-- Orientation -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-surface-600 dark:text-surface-300">
          {{ 'labels.orientation' | translate }}
        </label>
        <p-selectButton
          [options]="orientations"
          optionLabel="label"
          optionValue="key"
          [ngModel]="selectedOrientation()"
          (ngModelChange)="onOrientationChange($event)"
          size="small"
          styleClass="w-full"
        >
          <ng-template let-item pTemplate="item">
            <div class="flex items-center gap-2">
              <i [class]="item.icon"></i>
              <span>{{ item.label | translate }}</span>
            </div>
          </ng-template>
        </p-selectButton>
      </div>

      <!-- Barcode type -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-surface-600 dark:text-surface-300">
          {{ 'labels.barcode_type' | translate }}
        </label>
        <p-select
          [options]="barcodeTypes"
          optionLabel="label"
          optionValue="key"
          [ngModel]="selectedBarcodeType()"
          (ngModelChange)="onBarcodeTypeChange($event)"
          appendTo="body"
          styleClass="w-full"
          size="small"
        />
      </div>

      <!-- Barcode field selector -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-surface-600 dark:text-surface-300">
          {{ 'labels.barcode_field' | translate }}
        </label>
        <p-select
          [options]="barcodeFieldOptions()"
          optionLabel="label"
          optionValue="key"
          [ngModel]="selectedBarcodeField()"
          (ngModelChange)="onBarcodeFieldChange($event)"
          appendTo="body"
          styleClass="w-full"
          size="small"
        />
      </div>

      <!-- Field label mode -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-surface-600 dark:text-surface-300">
          {{ 'labels.field_label_mode' | translate }}
        </label>
        <p-selectButton
          [options]="fieldLabelModes"
          optionLabel="label"
          optionValue="key"
          [allowEmpty]="false"
          [ngModel]="fieldLabelMode()"
          (ngModelChange)="onFieldLabelModeChange($event)"
          size="small"
          styleClass="w-full"
        >
          <ng-template let-item pTemplate="item">
            <span>{{ item.label | translate }}</span>
          </ng-template>
        </p-selectButton>
      </div>

      <!-- Field toggles -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-surface-600 dark:text-surface-300">
          {{ 'labels.visible_fields' | translate }}
        </label>
        <div class="flex flex-col gap-3">
          @for (field of visibleToggleFields(); track field.key) {
            <div class="flex items-center justify-between">
              <span class="text-sm text-surface-700 dark:text-surface-200">
                {{ field.label | translate }}
              </span>
              <p-toggleSwitch
                [ngModel]="field.enabled"
                (ngModelChange)="onFieldToggle(field.key, $event)"
              />
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class LabelConfigComponent implements OnInit {
  /** Initial field definitions from the parent */
  fields = input<LabelFieldConfig[]>([])
  /** Currently selected size */
  selectedSize = input<LabelSize>(LABEL_SIZES[0])
  /** Currently selected barcode type */
  selectedBarcodeType = input<BarcodeType>('code128')
  /** Currently selected orientation */
  selectedOrientation = input<LabelOrientation>('portrait')
  /** Currently selected barcode field */
  selectedBarcodeField = input<string>('barcode')
  /** How fields are identified on the label — nothing, a text name, or an icon */
  fieldLabelMode = input<FieldLabelMode>('none')

  /** Emitted when a field toggle changes */
  fieldsChange = output<LabelFieldConfig[]>()
  /** Emitted when label size changes */
  sizeChange = output<LabelSize>()
  /** Emitted when barcode type changes */
  barcodeTypeChange = output<BarcodeType>()
  /** Emitted when orientation changes */
  orientationChange = output<LabelOrientation>()
  /** Emitted when barcode field changes */
  barcodeFieldChange = output<string>()
  /** Emitted when the field label mode changes */
  fieldLabelModeChange = output<FieldLabelMode>()

  sizes = LABEL_SIZES
  barcodeTypes = BARCODE_TYPES
  orientations = LABEL_ORIENTATIONS
  fieldLabelModes = FIELD_LABEL_MODES

  /** Local mutable copy of fields for toggle binding */
  internalFields = signal<LabelFieldConfig[]>([])

  /** Fields shown in the visible fields toggle list (excludes barcodeOnly fields) */
  visibleToggleFields = computed(() =>
    this.internalFields().filter((f) => !f.barcodeOnly)
  )

  private translate = inject(TranslateService)

  /** Build barcode field options from the available fields */
  barcodeFieldOptions = computed(() => {
    return this.internalFields().map((f) => ({
      key: f.key,
      label: this.translate.instant(f.label),
    }))
  })

  constructor() {
    // Sync input fields to internal state when they change
    effect(() => {
      const f = this.fields()
      if (f.length > 0 && this.internalFields().length === 0) {
        this.internalFields.set(f.map((field) => ({ ...field })))
      }
    })
  }

  ngOnInit() {
    // Initialize internal fields on first load
    if (this.fields().length > 0) {
      this.internalFields.set(this.fields().map((f) => ({ ...f })))
    }
  }

  onSizeChange(size: LabelSize) {
    this.sizeChange.emit(size)
  }

  onBarcodeTypeChange(type: BarcodeType) {
    this.barcodeTypeChange.emit(type)
  }

  onOrientationChange(orientation: LabelOrientation) {
    this.orientationChange.emit(orientation)
  }

  onBarcodeFieldChange(field: string) {
    this.barcodeFieldChange.emit(field)
  }

  onFieldLabelModeChange(mode: FieldLabelMode) {
    this.fieldLabelModeChange.emit(mode)
  }

  onFieldToggle(key: string, enabled: boolean) {
    this.internalFields.update((fields) =>
      fields.map((f) => (f.key === key ? { ...f, enabled } : f))
    )
    this.fieldsChange.emit(this.internalFields())
  }
}
