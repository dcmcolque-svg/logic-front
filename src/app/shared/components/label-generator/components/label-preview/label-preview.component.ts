import {
  Component,
  inject,
  input,
  computed,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  LabelFieldConfig,
  LabelSize,
  LabelDataItem,
  BarcodeType,
  LabelOrientation,
  FieldLabelMode,
  LABEL_SIZES,
} from '../../types/label.types'
import { IconPipe } from '../../../../pipes/icon.pipe'
import {
  LABEL_LAYOUT,
  labelDesignHeight,
  labelContainScale,
  formatLabelDate,
} from '../../types/label-layout'

@Component({
  selector: 'label-preview',
  standalone: true,
  imports: [CommonModule, TranslateModule, IconPipe],
  template: `
    <div class="label-preview-scroll">
      @for (item of items(); track $index) {
        <div
          class="label-card"
          [style.width.px]="cardWidthPx()"
          [style.height.px]="cardHeightPx()"
        >
          <div class="label-content" [style.transform]="contentTransform()">
            <!-- Generation date -->
            <span class="label-date">{{ generatedAt }}</span>

            <!-- Barcode placeholder -->
            <div class="barcode-area">
              @if (barcodeType() === 'qrcode') {
                <div class="qr-placeholder">
                  <i class="pi pi-qrcode"></i>
                </div>
              } @else {
                <div class="barcode-placeholder">
                  <div class="barcode-lines">
                    @for (line of barcodeLines; track $index) {
                      <div class="bar" [style.width.px]="line"></div>
                    }
                  </div>
                </div>
              }
              <span class="barcode-value">{{ getBarcodeValue(item) }}</span>
            </div>

            <!-- Field values -->
            @if (enabledFields().length > 0) {
              <div class="fields-area">
                @for (field of enabledFields(); track field.key) {
                  <div class="field-row">
                    @switch (fieldLabelMode()) {
                      @case ('text') {
                        <span class="field-label">{{ field.label | translate }}:</span>
                      }
                      @case ('icon') {
                        <i [class]="'field-icon ' + ((field.icon || field.key) | icon)"></i>
                      }
                    }
                    <span class="field-value">{{ getFieldDisplay(item, field) }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }

      @if (items().length === 0) {
        <div class="empty-preview">
          <i class="pi pi-tag text-4xl text-surface-400"></i>
          <span class="text-surface-500">{{ 'labels.no_items_selected' | translate }}</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .label-preview-scroll {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 16px;
      max-height: 72vh;
      overflow-y: auto;
    }

    .label-card {
      background: white;
      border: 1.5px dashed var(--surface-300, #cbd5e1);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      transition: border-color 0.2s;
      flex-shrink: 0;
      overflow: hidden;
    }

    .label-card:hover {
      border-color: var(--primary-color, #6366f1);
    }

    .label-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      transform-origin: center center;
    }

    .barcode-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      width: 100%;
    }

    .barcode-placeholder {
      width: 90%;
      display: flex;
      justify-content: center;
    }

    .barcode-lines {
      display: flex;
      align-items: flex-end;
      gap: 1px;
      height: 32px;
    }

    .label-date {
      font-size: 6px;
      color: #94a3b8;
      letter-spacing: 0.3px;
      line-height: 10px;
    }

    .bar {
      background: #1e293b;
      height: 100%;
      min-width: 1px;
    }

    .qr-placeholder {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      background: #f8fafc;
    }

    .qr-placeholder i {
      font-size: 24px;
      color: #1e293b;
    }

    .barcode-value {
      font-family: 'Courier New', monospace;
      font-size: 8px;
      color: #475569;
      letter-spacing: 0.5px;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .fields-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      width: 100%;
    }

    .field-row {
      text-align: center;
      font-size: 10px;
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .field-value {
      color: #1e293b;
      font-weight: 500;
    }

    .field-label {
      color: #64748b;
      font-weight: 600;
      margin-right: 3px;
    }

    .field-icon {
      color: #64748b;
      font-size: 9px;
      margin-right: 3px;
      vertical-align: baseline;
    }

    .empty-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 40px;
    }
  `],
})
export class LabelPreviewComponent {
  items = input<LabelDataItem[]>([])
  fields = input<LabelFieldConfig[]>([])
  size = input<LabelSize>(LABEL_SIZES[0])
  barcodeType = input<BarcodeType>('code128')
  barcodeField = input<string>('barcode')
  orientation = input<LabelOrientation>('portrait')
  fieldLabelMode = input<FieldLabelMode>('none')

  private translate = inject(TranslateService)

  /** Scale factor: 1 inch = 60px in the preview */
  private readonly PX_PER_INCH = 60

  enabledFields = computed(() => this.fields().filter((f) => f.enabled && !f.barcodeOnly))

  /** Portrait uses the media as listed; landscape swaps it — same rule as the PDF. */
  cardWidthPx = computed(() => {
    const s = this.size()
    const inches = this.orientation() === 'landscape' ? s.heightInches : s.widthInches
    return inches * this.PX_PER_INCH
  })

  cardHeightPx = computed(() => {
    const s = this.size()
    const inches = this.orientation() === 'landscape' ? s.widthInches : s.heightInches
    return inches * this.PX_PER_INCH
  })

  /**
   * Contain-fit: compute a CSS transform scale so the content block
   * fits inside the card without distortion.
   *
   * The content is rendered at a fixed "design" size and then scaled
   * uniformly to fit the available card space — like object-fit: contain.
   */
  contentTransform = computed(() => {
    const cardW = this.cardWidthPx()
    const cardH = this.cardHeightPx()
    const padding = Math.min(cardW, cardH) * LABEL_LAYOUT.PADDING_RATIO * 2

    const designH = labelDesignHeight(
      this.enabledFields().length,
      this.barcodeType() === 'qrcode'
    )
    const scale = labelContainScale(cardW - padding, cardH - padding, designH)

    return `scale(${scale.toFixed(3)})`
  })

  /** Stamped on every label of this batch; the PDF prints the same value. */
  generatedAt = formatLabelDate()

  /**
   * Random-looking barcode line widths for the visual placeholder.
   * Purely cosmetic; uses the Web Crypto RNG so Sonar does not flag it as a
   * weak-PRNG hotspot (S2245).
   */
  barcodeLines = Array.from(
    crypto.getRandomValues(new Uint8Array(40)),
    (byte) => (byte > 127 ? 2 : 1)
  )

  getBarcodeValue(item: LabelDataItem): string {
    const val = item[this.barcodeField()]
    return val != null ? String(val) : '—'
  }

  getFieldDisplay(item: LabelDataItem, field: LabelFieldConfig): string {
    const val = item[field.key]
    return val != null ? String(val) : '—'
  }
}
