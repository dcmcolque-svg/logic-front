import {
  Component,
  input,
  output,
  signal,
  computed,
  inject,
  OnChanges,
  SimpleChanges,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { DialogModule } from 'primeng/dialog'
import { ButtonModule } from 'primeng/button'

import { LabelConfigComponent } from './components/label-config/label-config.component'
import { LabelPreviewComponent } from './components/label-preview/label-preview.component'
import { LabelPdfService } from './services/label-pdf.service'
import {
  LabelType,
  LabelFieldConfig,
  LabelSize,
  LabelDataItem,
  LabelConfig,
  BarcodeType,
  LabelOrientation,
  FieldLabelMode,
  LABEL_SIZES,
  getDefaultFields,
  getDefaultBarcodeField,
} from './types/label.types'

/**
 * LabelGeneratorDialog — Main reusable modal for generating label PDFs.
 *
 * Usage from any table component:
 * ```html
 * <label-generator-dialog
 *   [visible]="showLabelDialog()"
 *   [items]="selectedItems()"
 *   labelType="catalog"
 *   (hide)="showLabelDialog.set(false)"
 * />
 * ```
 *
 * The dialog is self-contained: it manages its own config state,
 * renders the preview, and handles PDF generation/download.
 */
@Component({
  selector: 'label-generator-dialog',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    DialogModule,
    ButtonModule,
    LabelConfigComponent,
    LabelPreviewComponent,
  ],
  template: `
    <p-dialog
      [visible]="visible()"
      (visibleChange)="onVisibleChange($event)"
      [header]="dialogHeader()"
      [modal]="true"
      [closable]="true"
      [dismissableMask]="true"
      [style]="{ width: '76rem', maxWidth: '96vw' }"
      [contentStyle]="{ padding: '0' }"
      [breakpoints]="{ '768px': '95vw' }"
    >
      <div class="label-dialog-body">
        <!-- Config Panel (left) -->
        <div class="config-panel">
          <label-config
            [fields]="currentFields()"
            [selectedSize]="currentSize()"
            [selectedBarcodeType]="currentBarcodeType()"
            [selectedOrientation]="currentOrientation()"
            [selectedBarcodeField]="currentBarcodeField()"
            [fieldLabelMode]="currentFieldLabelMode()"
            (fieldsChange)="onFieldsChange($event)"
            (sizeChange)="onSizeChange($event)"
            (barcodeTypeChange)="onBarcodeTypeChange($event)"
            (orientationChange)="onOrientationChange($event)"
            (barcodeFieldChange)="onBarcodeFieldChange($event)"
            (fieldLabelModeChange)="onFieldLabelModeChange($event)"
          />
        </div>

        <!-- Preview (right) -->
        <div class="preview-panel">
          <div class="preview-header">
            <i class="pi pi-eye text-primary"></i>
            <span class="font-semibold text-sm">{{ 'labels.preview' | translate }}</span>
            <span class="text-xs text-surface-500 ml-auto">
              {{ items().length }} {{ 'labels.labels' | translate }}
            </span>
          </div>
          <label-preview
            [items]="items()"
            [fields]="currentFields()"
            [size]="currentSize()"
            [barcodeType]="currentBarcodeType()"
            [barcodeField]="currentBarcodeField()"
            [orientation]="currentOrientation()"
            [fieldLabelMode]="currentFieldLabelMode()"
          />
        </div>
      </div>

      <ng-template pTemplate="footer">
        <div class="flex justify-end gap-3 pt-2">
          <p-button
            [label]="'labels.cancel' | translate"
            icon="pi pi-times"
            severity="secondary"
            [outlined]="true"
            (onClick)="onCancel()"
          />
          <p-button
            [label]="'labels.preview_pdf' | translate"
            icon="pi pi-eye"
            severity="info"
            [outlined]="true"
            (onClick)="onPreview()"
            [loading]="previewing()"
            [disabled]="items().length === 0"
          />
          <p-button
            [label]="'labels.download_pdf' | translate"
            icon="pi pi-download"
            (onClick)="onDownload()"
            [loading]="generating()"
            [disabled]="items().length === 0"
          />
        </div>
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    .label-dialog-body {
      display: flex;
      min-height: 560px;
    }

    .config-panel {
      width: 340px;
      min-width: 340px;
      padding: 24px;
      border-right: 1px solid var(--surface-border, rgba(0, 0, 0, 0.08));
      background: var(--surface-ground, #f8fafc);
      overflow-y: auto;
    }

    .preview-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .preview-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--surface-border, rgba(0, 0, 0, 0.08));
    }

    @media (max-width: 768px) {
      .label-dialog-body {
        flex-direction: column;
      }

      .config-panel {
        width: 100%;
        min-width: 100%;
        border-right: none;
        border-bottom: 1px solid var(--surface-border, rgba(0, 0, 0, 0.08));
        max-height: 45vh;
        overflow-y: auto;
      }
    }
  `],
})
export class LabelGeneratorDialog implements OnChanges {
  private pdfService = inject(LabelPdfService)
  private translate = inject(TranslateService)

  /** Dialog visibility */
  visible = input(false)
  /** Data items to render labels for */
  items = input<LabelDataItem[]>([])
  /** Type of label — determines available fields */
  labelType = input<LabelType>('catalog')

  /** Emitted when the dialog closes */
  hide = output<void>()

  // ── Internal state ──
  currentFields = signal<LabelFieldConfig[]>([])
  currentSize = signal<LabelSize>(LABEL_SIZES[0])
  currentBarcodeType = signal<BarcodeType>('code128')
  currentBarcodeField = signal<string>('barcode')
  currentOrientation = signal<LabelOrientation>('portrait')
  currentFieldLabelMode = signal<FieldLabelMode>('none')
  generating = signal(false)
  previewing = signal(false)

  dialogHeader = computed(() => {
    const title = this.translate.instant('labels.generate_labels')
    const count = this.items().length
    return `${title} (${count})`
  })

  ngOnChanges(changes: SimpleChanges) {
    // Reset config when dialog opens or label type changes
    if (changes['visible'] || changes['labelType']) {
      if (this.visible()) {
        this.initConfig()
      }
    }
  }

  private initConfig() {
    const type = this.labelType()
    this.currentFields.set(getDefaultFields(type))
    this.currentBarcodeField.set(getDefaultBarcodeField(type))
    this.currentSize.set(LABEL_SIZES[0])
    this.currentBarcodeType.set('code128')
    this.currentOrientation.set('portrait')
    this.currentFieldLabelMode.set('none')
  }

  onFieldsChange(fields: LabelFieldConfig[]) {
    this.currentFields.set(fields)
  }

  onSizeChange(size: LabelSize) {
    this.currentSize.set(size)
  }

  onBarcodeTypeChange(type: BarcodeType) {
    this.currentBarcodeType.set(type)
  }

  onOrientationChange(orientation: LabelOrientation) {
    this.currentOrientation.set(orientation)
  }

  onBarcodeFieldChange(field: string) {
    this.currentBarcodeField.set(field)
  }

  onFieldLabelModeChange(mode: FieldLabelMode) {
    this.currentFieldLabelMode.set(mode)
  }

  onVisibleChange(value: boolean) {
    if (!value) {
      this.hide.emit()
    }
  }

  onCancel() {
    this.hide.emit()
  }

  async onPreview() {
    this.previewing.set(true)
    try {
      await this.pdfService.previewPdf(this.buildConfig(), this.items())
    } catch (error) {
      console.error('[LabelGenerator] PDF preview failed:', error)
    } finally {
      this.previewing.set(false)
    }
  }

  async onDownload() {
    this.generating.set(true)
    try {
      const timestamp = new Date().toISOString().slice(0, 10)
      const filename = `labels_${this.labelType()}_${timestamp}.pdf`

      await this.pdfService.downloadPdf(this.buildConfig(), this.items(), filename)
    } catch (error) {
      console.error('[LabelGenerator] PDF generation failed:', error)
    } finally {
      this.generating.set(false)
    }
  }

  private buildConfig(): LabelConfig {
    return {
      labelType: this.labelType(),
      fields: this.currentFields(),
      size: this.currentSize(),
      barcodeType: this.currentBarcodeType(),
      barcodeField: this.currentBarcodeField(),
      orientation: this.currentOrientation(),
      fieldLabelMode: this.currentFieldLabelMode(),
    }
  }
}
