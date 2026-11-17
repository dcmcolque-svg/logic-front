import {
  LABEL_LAYOUT,
  barcodeBlockHeight,
  labelDesignHeight,
  labelContainScale,
  formatLabelDate,
} from './label-layout'

describe('label layout — the model shared by the preview and the PDF', () => {
  const PPI = 72
  const PX_PER_INCH = 60 // label-preview.component.ts

  it('reserves a row for the generation date', () => {
    const withBarcode = labelDesignHeight(0, false, true)
    const withoutBarcode = labelDesignHeight(0, false, false)

    expect(withoutBarcode).toBe(LABEL_LAYOUT.DATE_LINE_HEIGHT)
    expect(withBarcode - withoutBarcode).toBe(
      LABEL_LAYOUT.BARCODE_HEIGHT +
        LABEL_LAYOUT.VALUE_LINE_HEIGHT +
        LABEL_LAYOUT.GAP_AFTER_BARCODE
    )
  })

  it('grows by exactly one row per field', () => {
    const base = labelDesignHeight(2, false)
    expect(labelDesignHeight(3, false) - base).toBe(LABEL_LAYOUT.FIELD_LINE_HEIGHT)
  })

  it('gives a QR code a square block', () => {
    expect(barcodeBlockHeight(true)).toBe(LABEL_LAYOUT.QR_SIZE)
    expect(barcodeBlockHeight(false)).toBe(LABEL_LAYOUT.BARCODE_HEIGHT)
  })

  it('scales content UP to fill a large label, not just down', () => {
    // The old PDF renderer clamped at 1.0, which is what left a 4"x6" sticker
    // with a small barcode floating in whitespace.
    const designH = labelDesignHeight(3, false)
    const scale = labelContainScale(4 * PPI * 0.94, 6 * PPI * 0.94, designH)

    expect(scale).toBeGreaterThan(1)
  })

  it('shrinks content to fit a label too small for it', () => {
    const designH = labelDesignHeight(6, false)
    const scale = labelContainScale(3 * PPI * 0.94, 1 * PPI * 0.94, designH)

    expect(scale).toBeLessThan(1)
    // Contain-fit: the scaled block must not exceed the height it was fitted to.
    expect(designH * scale).toBeLessThanOrEqual(1 * PPI * 0.94 + 1e-9)
  })

  it('never lets the content overflow either axis', () => {
    for (const [w, h] of [[4, 6], [6, 4], [4, 3], [4, 2], [3, 1]]) {
      for (const fields of [0, 1, 4, 8]) {
        const designH = labelDesignHeight(fields, false)
        const availW = w * PPI, availH = h * PPI
        const scale = labelContainScale(availW, availH, designH)

        expect(LABEL_LAYOUT.DESIGN_WIDTH * scale)
          .withContext(`${w}x${h}, ${fields} fields — width`)
          .toBeLessThanOrEqual(availW + 1e-9)
        expect(designH * scale)
          .withContext(`${w}x${h}, ${fields} fields — height`)
          .toBeLessThanOrEqual(availH + 1e-9)
      }
    }
  })

  it('produces the same proportions for the preview and the PDF', () => {
    // Same label, two renderers, two unit systems: the ratio of the content
    // block to its label must come out identical, or they look different.
    for (const [w, h] of [[4, 6], [6, 4], [3, 1]]) {
      for (const fields of [1, 3, 5]) {
        const designH = labelDesignHeight(fields, false)
        const pad = LABEL_LAYOUT.PADDING_RATIO

        const pdfScale = labelContainScale(
          w * PPI - Math.min(w, h) * PPI * pad * 2,
          h * PPI - Math.min(w, h) * PPI * pad * 2,
          designH
        )
        const previewScale = labelContainScale(
          w * PX_PER_INCH - Math.min(w, h) * PX_PER_INCH * pad * 2,
          h * PX_PER_INCH - Math.min(w, h) * PX_PER_INCH * pad * 2,
          designH
        )

        // Both scales differ only by the units-per-inch of each renderer.
        expect(pdfScale / previewScale)
          .withContext(`${w}x${h}, ${fields} fields`)
          .toBeCloseTo(PPI / PX_PER_INCH, 6)
      }
    }
  })

  it('stamps an unambiguous, locale-independent date', () => {
    expect(formatLabelDate(new Date(2026, 8, 2))).toBe('2026-09-02')
    // Zero-padded, so the column width never shifts between labels.
    expect(formatLabelDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
