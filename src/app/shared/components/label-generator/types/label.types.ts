/**
 * Label Generator — Type definitions.
 *
 * Defines the shape of label configurations, field toggles,
 * available sizes, and the generic data item contract.
 */

// ============================================================
// Label Type — determines which fields are available
// ============================================================

export type LabelType = 'catalog' | 'tracecard' | 'location' | 'bin'

// ============================================================
// Field configuration (toggleable in the config panel)
// ============================================================

export interface LabelFieldConfig {
  /** Property key on the data item (e.g. 'sku', 'location_code') */
  key: string
  /** i18n translation key for the toggle label */
  label: string
  /** Whether this field is visible by default */
  enabled: boolean
  /** If true, this field only appears in the barcode field dropdown, not in the visible fields toggles */
  barcodeOnly?: boolean
  /** Optional icon override (e.g. 'pi-tag'). Defaults to the icon registry lookup by `key`. */
  icon?: string
}

// ============================================================
// Label size presets
// ============================================================

export interface LabelSize {
  /** Unique identifier, derived from the millimetre dimensions (e.g. '102x152') */
  key: string
  /** Display label showing both unit systems (e.g. '102 × 152 mm (4.00 × 6.00 in)') */
  label: string
  /** Width in millimetres, as the printer lists the media */
  widthMm: number
  /** Height in millimetres, as the printer lists the media */
  heightMm: number
  /** Width in inches */
  widthInches: number
  /** Height in inches */
  heightInches: number
}

/**
 * Build a label size entry.
 *
 * Both unit systems are stored verbatim rather than converted, because the
 * printer's own list is not internally consistent: it shows 102 mm as 4.00 in
 * on one row and 51 mm as 2.01 in on another. Reproducing its exact pairs is
 * what lets an operator match a row here to a row on the printer by eye.
 */
function labelSize(
  widthMm: number,
  heightMm: number,
  widthInches: number,
  heightInches: number
): LabelSize {
  const inches = (n: number) => n.toFixed(2)
  return {
    key: `${widthMm}x${heightMm}`,
    label: `${widthMm} × ${heightMm} mm (${inches(widthInches)} × ${inches(heightInches)} in)`,
    widthMm,
    heightMm,
    widthInches,
    heightInches,
  }
}

/**
 * Available label media, mirroring the thermal printer's paper-size list and
 * kept in its order — largest first — so the two read the same way.
 */
export const LABEL_SIZES: LabelSize[] = [
  labelSize(102, 152, 4.0, 6.0),
  labelSize(100, 150, 3.94, 5.91),
  labelSize(102, 127, 4.0, 5.0),
  labelSize(76, 152, 3.0, 6.0),
  labelSize(102, 102, 4.0, 4.0),
  labelSize(76, 130, 3.0, 5.12),
  labelSize(76, 102, 3.0, 4.0),
  labelSize(102, 76, 4.0, 3.0),
  labelSize(50, 127, 2.0, 5.0),
  labelSize(76, 76, 3.0, 3.0),
  labelSize(76, 69, 3.0, 2.72),
  labelSize(102, 51, 4.0, 2.01),
  labelSize(76, 66, 3.0, 2.6),
  labelSize(64, 64, 2.5, 2.5),
  labelSize(76, 51, 3.0, 2.01),
  labelSize(58, 58, 2.28, 2.28),
  labelSize(51, 51, 2.01, 2.01),
  labelSize(50, 50, 2.0, 2.0),
  labelSize(64, 38, 2.5, 1.5),
  labelSize(50, 47, 2.0, 1.85),
  labelSize(58, 38, 2.28, 1.5),
  labelSize(76, 25, 3.0, 1.0),
  labelSize(57, 32, 2.25, 1.25),
  labelSize(50, 30, 2.0, 1.18),
  labelSize(51, 25, 2.01, 1.0),
  labelSize(40, 30, 1.57, 1.18),
]

// ============================================================
// Barcode type
// ============================================================

export type BarcodeType = 'code128' | 'qrcode'

export const BARCODE_TYPES: { key: BarcodeType; label: string }[] = [
  { key: 'code128', label: 'Code 128' },
  // QR Code temporarily disabled — uncomment to re-enable the option in the config panel.
  // { key: 'qrcode', label: 'QR Code' },
]

// ============================================================
// Label orientation
// ============================================================

export type LabelOrientation = 'portrait' | 'landscape'

export const LABEL_ORIENTATIONS: { key: LabelOrientation; label: string; icon: string }[] = [
  { key: 'portrait', label: 'labels.portrait', icon: 'pi pi-mobile' },
  { key: 'landscape', label: 'labels.landscape', icon: 'pi pi-tablet' },
]

// ============================================================
// Field label mode — how each field is identified on the label
// ============================================================

/**
 * - `none` — only the value
 * - `text` — the translated field name, e.g. "SKU: PU-RSX-WHT-41"
 * - `icon` — an icon from the shared icon registry, e.g. "🏷 PU-RSX-WHT-41"
 */
export type FieldLabelMode = 'none' | 'text' | 'icon'

export const FIELD_LABEL_MODES: { key: FieldLabelMode; label: string }[] = [
  { key: 'none', label: 'labels.mode_none' },
  { key: 'text', label: 'labels.mode_text' },
  { key: 'icon', label: 'labels.mode_icon' },
]

// ============================================================
// Full label configuration (state of the modal)
// ============================================================

export interface LabelConfig {
  labelType: LabelType
  fields: LabelFieldConfig[]
  size: LabelSize
  barcodeType: BarcodeType
  /** Which data field to encode in the barcode */
  barcodeField: string
  /** Label orientation — portrait or landscape */
  orientation: LabelOrientation
  /** How each field is identified before its value — nothing, a text name, or an icon */
  fieldLabelMode: FieldLabelMode
}

// ============================================================
// Generic data item passed from the table
// ============================================================

export interface LabelDataItem {
  [key: string]: any
}

// ============================================================
// Default field configs per label type
// ============================================================

export function getDefaultFields(type: LabelType): LabelFieldConfig[] {
  switch (type) {
    case 'catalog':
      return [
        { key: 'sku', label: 'labels.sku', enabled: true },
        { key: 'barcode', label: 'labels.barcode', enabled: true },
        { key: 'description', label: 'labels.description', enabled: true },
        { key: 'name', label: 'labels.name', enabled: false },
        { key: 'brand', label: 'labels.brand', enabled: false },
        { key: 'company_name', label: 'labels.company', enabled: false },
        { key: 'sku_id', label: 'labels.sku_id', enabled: false, barcodeOnly: true },
      ]
    case 'tracecard':
      return [
        { key: 'sku', label: 'labels.sku', enabled: true },
        { key: 'barcode', label: 'labels.barcode', enabled: true },
        { key: 'description', label: 'labels.description', enabled: true },
        { key: 'location_code', label: 'labels.location', enabled: true },
        { key: 'qty_on_hand', label: 'labels.qty_on_hand', enabled: false },
        { key: 'lot', label: 'labels.lot', enabled: false },
        { key: 'expir', label: 'labels.expiration', enabled: false },
        { key: 'id', label: 'labels.tracecard_id', enabled: false, barcodeOnly: true },
      ]
    case 'location':
      return [
        { key: 'location_code', label: 'labels.location_code', enabled: true },
        { key: 'aisle', label: 'labels.aisle', enabled: true },
        { key: 'section', label: 'labels.section', enabled: true },
        { key: 'level', label: 'labels.level', enabled: true },
        { key: 'facility_name', label: 'labels.facility', enabled: false },
        { key: 'category', label: 'preferences.location.category', enabled: false },
        { key: 'type', label: 'preferences.location.type', enabled: false },
        { key: 'id', label: 'labels.location_id', enabled: false, barcodeOnly: true },
      ]
    case 'bin':
      return [
        { key: 'lpn_code', label: 'labels.lpn_code', enabled: true },
        { key: 'type', label: 'labels.type', enabled: true },
        { key: 'container_profile_code', label: 'labels.profile', enabled: false },
        { key: 'id', label: 'labels.lpn_id', enabled: false, barcodeOnly: true },
      ]
  }
}

/** Returns the default barcode source field for each label type */
export function getDefaultBarcodeField(type: LabelType): string {
  switch (type) {
    case 'catalog':
      return 'sku'
    case 'tracecard':
      return 'sku'
    case 'location':
      return 'location_code'
    case 'bin':
      return 'lpn_code'
  }
}
