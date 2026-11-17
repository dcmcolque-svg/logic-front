import { inject, Injectable } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { jsPDF } from 'jspdf'
import bwipjs from 'bwip-js/browser'
import {
  LabelConfig,
  LabelDataItem,
  LabelFieldConfig,
  BarcodeType,
} from '../types/label.types'
import {
  LABEL_LAYOUT,
  barcodeBlockHeight,
  labelDesignHeight,
  labelContainScale,
  formatLabelDate,
} from '../types/label-layout'
import { IconRasterService } from '../../../services/icon-raster.service'
import { resolveIcon } from '../../../config/icon.registry'

/**
 * LabelPdfService — Generates a multi-page PDF with label stickers.
 *
 * Each page contains one label with:
 * - A barcode (Code128 or QR) centered, proportionally sized
 * - Enabled fields below the barcode, each optionally prefixed by its
 *   translated name or by an icon from the shared icon registry
 *
 * Uses jsPDF for PDF rendering and bwip-js for barcode generation.
 */
@Injectable({ providedIn: 'root' })
export class LabelPdfService {
  private readonly PPI = 72
  /** Nominal point size icons are rasterized at, then scaled down when drawn. */
  private readonly ICON_RASTER_PT = 16
  private translate = inject(TranslateService)
  private iconRaster = inject(IconRasterService)

  /**
   * Generate a PDF blob with one label per page.
   */
  async generatePdf(
    config: LabelConfig,
    items: LabelDataItem[]
  ): Promise<Blob> {
    const sizeW = config.size.widthInches
    const sizeH = config.size.heightInches
    const isLandscape = config.orientation === 'landscape'

    // Portrait uses the media exactly as listed; landscape swaps it. Forcing
    // the longer side vertical would contradict the selected size's own label,
    // now that the list carries both orientations of the same media
    // (76x102 mm and 102x76 mm are different rows).
    const pageW = (isLandscape ? sizeH : sizeW) * this.PPI
    const pageH = (isLandscape ? sizeW : sizeH) * this.PPI

    // jsPDF re-normalises `format` to match `orientation`, so the flag has to
    // describe the page we actually want rather than the user's toggle:
    // asking for 'portrait' with a wider-than-tall format silently swaps it.
    const pageOrientation = pageW > pageH ? 'landscape' : 'portrait'

    const doc = new jsPDF({
      orientation: pageOrientation,
      unit: 'pt',
      format: [pageW, pageH],
    })

    // Same filter the preview applies: a barcodeOnly field is a barcode
    // payload, never a printed row.
    const enabledFields = config.fields.filter((f) => f.enabled && !f.barcodeOnly)

    // Rasterize each field icon once for the whole batch — the enabled fields
    // are identical on every page, so doing this per label would repeat the
    // same canvas work N times.
    const icons = await this.buildIconMap(config, enabledFields)
    const generatedAt = formatLabelDate()

    for (let i = 0; i < items.length; i++) {
      if (i > 0) {
        doc.addPage([pageW, pageH], pageOrientation)
      }
      await this.renderLabel(
        doc, config, enabledFields, items[i], pageW, pageH, icons, generatedAt
      )
    }

    return doc.output('blob')
  }

  /**
   * Generate and trigger a browser download.
   */
  async downloadPdf(
    config: LabelConfig,
    items: LabelDataItem[],
    filename = 'labels.pdf'
  ): Promise<void> {
    const blob = await this.generatePdf(config, items)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Generate and open the PDF in a new browser tab for preview/print.
   */
  async previewPdf(
    config: LabelConfig,
    items: LabelDataItem[]
  ): Promise<void> {
    const blob = await this.generatePdf(config, items)
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  // ── Private ──────────────────────────────────────────────

  /**
   * Rasterize the icon of every enabled field to a PNG, keyed by field key.
   *
   * Icons are rendered once at a fixed nominal size and scaled down by
   * `doc.addImage` at draw time — the per-label font size varies with the
   * contain-fit scaling, and re-rasterizing for each of those sizes would buy
   * no visible quality over the supersampled source.
   *
   * Returns an empty map when the mode is not `icon`, or when the browser
   * could not produce the glyph (the caller then falls back to text labels).
   */
  private async buildIconMap(
    config: LabelConfig,
    enabledFields: LabelFieldConfig[]
  ): Promise<Map<string, string>> {
    const icons = new Map<string, string>()
    if (config.fieldLabelMode !== 'icon') return icons

    await Promise.all(
      enabledFields.map(async (field) => {
        const iconName = resolveIcon(field.icon || field.key)
        const dataUrl = await this.iconRaster.toPngDataUrl(
          iconName,
          this.ICON_RASTER_PT
        )
        if (dataUrl) icons.set(field.key, dataUrl)
      })
    )

    return icons
  }

  private async renderLabel(
    doc: jsPDF,
    config: LabelConfig,
    enabledFields: LabelFieldConfig[],
    item: LabelDataItem,
    pageW: number,
    pageH: number,
    icons: Map<string, string>,
    generatedAt: string
  ): Promise<void> {
    // The label is laid out in the shared design units and then scaled as a
    // whole to fit, exactly like the preview does — this is what makes the two
    // match. Scaling up as well as down is the point: without it a 4"x6"
    // sticker showed a small barcode floating in whitespace.
    const margin = Math.min(pageW, pageH) * LABEL_LAYOUT.PADDING_RATIO
    const usableW = pageW - margin * 2
    const usableH = pageH - margin * 2

    const fieldCount = enabledFields.length
    const barcodeValue = String(item[config.barcodeField] || '—')
    const hasBarcode = Boolean(barcodeValue && barcodeValue !== '—')
    const isQr = config.barcodeType === 'qrcode'

    const designH = labelDesignHeight(fieldCount, isQr, hasBarcode)
    const scale = labelContainScale(usableW, usableH, designH)

    /** Convert a design unit to points on the page. */
    const u = (units: number) => units * scale

    const contentH = u(designH)
    let cursorY = margin + (usableH - contentH) / 2
    const centerX = pageW / 2

    // ── Generation date ──
    const dateFont = u(LABEL_LAYOUT.DATE_FONT)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(dateFont)
    doc.setTextColor(148, 163, 184)
    doc.text(generatedAt, centerX, cursorY + u(LABEL_LAYOUT.DATE_LINE_HEIGHT) * 0.75, {
      align: 'center',
    })
    doc.setTextColor(0, 0, 0)
    cursorY += u(LABEL_LAYOUT.DATE_LINE_HEIGHT)

    // ── Barcode ──
    if (hasBarcode) {
      const barcodeH = u(barcodeBlockHeight(isQr))
      const barcodeW = isQr
        ? barcodeH
        : u(LABEL_LAYOUT.DESIGN_WIDTH * LABEL_LAYOUT.BARCODE_WIDTH_RATIO)

      let barcodeImg: string | null = null
      try {
        barcodeImg = await this.generateBarcodeImage(barcodeValue, config.barcodeType)
      } catch {
        barcodeImg = null
      }

      if (barcodeImg) {
        // Drawing to a fixed height stretches the bars vertically, which is
        // what the preview shows and is safe: a scanner reads bar widths.
        doc.addImage(barcodeImg, 'PNG', centerX - barcodeW / 2, cursorY, barcodeW, barcodeH)
      } else {
        doc.setFontSize(u(LABEL_LAYOUT.VALUE_FONT))
        doc.text(`[${barcodeValue}]`, centerX, cursorY + barcodeH / 2, { align: 'center' })
      }
      cursorY += barcodeH

      // Human-readable value
      const valueFont = u(LABEL_LAYOUT.VALUE_FONT)
      const valueLine = u(LABEL_LAYOUT.VALUE_LINE_HEIGHT)
      doc.setFontSize(valueFont)
      doc.setFont('courier', 'normal')
      doc.text(this.truncateToWidth(doc, barcodeValue, usableW), centerX, cursorY + valueLine * 0.75, {
        align: 'center',
      })
      cursorY += valueLine + u(LABEL_LAYOUT.GAP_AFTER_BARCODE)
    }

    // ── Field rows ──
    if (fieldCount === 0) return

    const fieldFont = u(LABEL_LAYOUT.FIELD_FONT)
    const fieldLine = u(LABEL_LAYOUT.FIELD_LINE_HEIGHT)
    const iconGap = fieldFont * 0.35
    doc.setFontSize(fieldFont)
    doc.setFont('helvetica', 'normal')

    for (const field of enabledFields) {
      const rawValue = item[field.key]
      const value = rawValue != null ? String(rawValue) : '—'
      const baselineY = cursorY + fieldLine * 0.75

      const iconImg =
        config.fieldLabelMode === 'icon' ? icons.get(field.key) : undefined

      if (iconImg) {
        // Icon + value centered as one block, so the row stays aligned with
        // the rest of the (centered) label content.
        const text = this.truncateToWidth(doc, value, usableW - fieldFont - iconGap)
        const blockW = fieldFont + iconGap + doc.getTextWidth(text)
        const blockX = centerX - blockW / 2

        // Nudged up so the glyph box sits optically on the text baseline.
        doc.addImage(
          iconImg, 'PNG', blockX, baselineY - fieldFont * 0.8, fieldFont, fieldFont
        )
        doc.text(text, blockX + fieldFont + iconGap, baselineY, { align: 'left' })
      } else {
        // No icon available — fall back to the configured text behavior so a
        // failed raster never leaves a row unidentified.
        let displayText = value
        if (config.fieldLabelMode !== 'none') {
          displayText = `${this.translate.instant(field.label)}: ${value}`
        }
        doc.text(this.truncateToWidth(doc, displayText, usableW), centerX, baselineY, {
          align: 'center',
        })
      }

      cursorY += fieldLine
    }
  }

  /** Trim a string with an ellipsis until it fits the given width. */
  private truncateToWidth(doc: jsPDF, text: string, maxWidth: number): string {
    if (doc.getTextWidth(text) <= maxWidth) return text

    let out = text
    while (out.length > 1 && doc.getTextWidth(out + '…') > maxWidth) {
      out = out.slice(0, -1)
    }
    return out + '…'
  }

  /**
   * Render a barcode to a base64 PNG data URL using bwip-js.
   * Does NOT include text — we render the text separately in the PDF
   * for consistent sizing.
   */
  private async generateBarcodeImage(
    text: string,
    type: BarcodeType
  ): Promise<string> {
    const canvas = document.createElement('canvas')

    const bcid = type === 'qrcode' ? 'qrcode' : 'code128'
    const scale = type === 'qrcode' ? 6 : 3

    const opts: any = {
      bcid,
      text,
      scale,
      includetext: false,   // We render text separately for consistent sizing
      textxalign: 'center',
    }

    // For linear barcodes, set a reasonable height
    if (type !== 'qrcode') {
      opts.height = 12
      opts.width = text.length * 1.5  // Scale width based on data
    }

    bwipjs.toCanvas(canvas, opts)

    return canvas.toDataURL('image/png')
  }
}
