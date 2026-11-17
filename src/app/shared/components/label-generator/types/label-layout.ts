/**
 * Label layout — the single design model shared by the on-screen preview and
 * the generated PDF.
 *
 * Both renderers lay the label out in these abstract design units and then
 * scale the whole block uniformly to fit the physical label, like
 * `object-fit: contain`. Keeping the constants here is what makes the PDF
 * actually look like the preview: when the two had their own numbers they
 * drifted, and the PDF refused to scale content up, so a 4"×6" sticker showed
 * a small barcode floating in whitespace.
 */

/** Design-space geometry. Units are arbitrary and only meaningful in ratio. */
export const LABEL_LAYOUT = {
  /** Reference width the content block is authored at. */
  DESIGN_WIDTH: 180,
  /** Padding on each side, as a fraction of the label's shorter dimension. */
  PADDING_RATIO: 0.03,
  /** Barcode width, as a fraction of DESIGN_WIDTH. */
  BARCODE_WIDTH_RATIO: 0.9,
  /** Height of a linear (Code 128) barcode. */
  BARCODE_HEIGHT: 32,
  /** Side of a QR code, which is square. */
  QR_SIZE: 48,
  /** Row holding the human-readable barcode value. */
  VALUE_LINE_HEIGHT: 12,
  /** Space between the barcode block and the field rows. */
  GAP_AFTER_BARCODE: 4,
  /** Height of one field row. */
  FIELD_LINE_HEIGHT: 16,
  /** Row holding the generation date at the top of the label. */
  DATE_LINE_HEIGHT: 10,

  // Font sizes, in the same design units.
  DATE_FONT: 6,
  VALUE_FONT: 8,
  FIELD_FONT: 10,
} as const

/** Height of the barcode block itself, without its value row. */
export function barcodeBlockHeight(isQrCode: boolean): number {
  return isQrCode ? LABEL_LAYOUT.QR_SIZE : LABEL_LAYOUT.BARCODE_HEIGHT
}

/**
 * Total height of the content block in design units.
 *
 * @param fieldCount Number of visible field rows.
 * @param isQrCode   Whether the barcode is a QR code (square) or linear.
 * @param hasBarcode Whether a barcode is drawn at all.
 */
export function labelDesignHeight(
  fieldCount: number,
  isQrCode: boolean,
  hasBarcode = true
): number {
  const barcode = hasBarcode
    ? barcodeBlockHeight(isQrCode) +
      LABEL_LAYOUT.VALUE_LINE_HEIGHT +
      LABEL_LAYOUT.GAP_AFTER_BARCODE
    : 0

  return (
    LABEL_LAYOUT.DATE_LINE_HEIGHT +
    barcode +
    fieldCount * LABEL_LAYOUT.FIELD_LINE_HEIGHT
  )
}

/**
 * Uniform scale that fits the design block inside the available space,
 * growing it as well as shrinking it so the label is actually filled.
 */
export function labelContainScale(
  availableWidth: number,
  availableHeight: number,
  designHeight: number
): number {
  return Math.min(
    availableWidth / LABEL_LAYOUT.DESIGN_WIDTH,
    availableHeight / designHeight
  )
}

/**
 * Generation date stamped on the label. ISO order is used deliberately: the
 * app is bilingual and a warehouse label should not read as 03/04 in one
 * locale and 04/03 in another.
 */
export function formatLabelDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
