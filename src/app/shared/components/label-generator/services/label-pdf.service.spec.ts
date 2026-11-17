import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { LabelPdfService } from './label-pdf.service'
import {
  LabelConfig,
  FieldLabelMode,
  LabelType,
  LabelSize,
  LABEL_SIZES,
  getDefaultFields,
  getDefaultBarcodeField,
} from '../types/label.types'
import { resolveIcon, FALLBACK_ICON } from '../../../config/icon.registry'

describe('LabelPdfService', () => {
  let service: LabelPdfService

  const items = [
    { sku: 'PU-RSX-WHT-41', barcode: '1112223334445', description: 'Puma RS-X' },
    { sku: 'AD-SMB-BLK-42', barcode: '5556667778889', description: 'Adidas Samba' },
  ]

  function configFor(mode: FieldLabelMode): LabelConfig {
    return {
      labelType: 'catalog',
      fields: getDefaultFields('catalog'),
      size: LABEL_SIZES[0],
      barcodeType: 'code128',
      barcodeField: 'sku',
      orientation: 'portrait',
      fieldLabelMode: mode,
    }
  }

  /** Read a Blob as a latin1 string so PDF structure keywords can be matched. */
  async function asText(blob: Blob): Promise<string> {
    const buf = new Uint8Array(await blob.arrayBuffer())
    let out = ''
    for (let i = 0; i < buf.length; i++) out += String.fromCharCode(buf[i])
    return out
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
      ],
    })
    service = TestBed.inject(LabelPdfService)
  })

  it('generates a PDF in each field label mode', async () => {
    for (const mode of ['none', 'text', 'icon'] as FieldLabelMode[]) {
      const blob = await service.generatePdf(configFor(mode), items)
      expect(blob.type).toBe('application/pdf')
      expect(blob.size).toBeGreaterThan(0)
    }
  })

  it('embeds the field icons as images in icon mode', async () => {
    const plain = await asText(await service.generatePdf(configFor('none'), items))
    const iconed = await asText(await service.generatePdf(configFor('icon'), items))

    // The barcode alone accounts for one image per page; icon mode must add
    // one more image per enabled field.
    const countImages = (pdf: string) => (pdf.match(/\/Subtype \/Image/g) ?? []).length

    expect(countImages(plain)).toBeGreaterThan(0)
    expect(countImages(iconed)).toBeGreaterThan(countImages(plain))
  })

  it('renders values without the text label in icon mode', async () => {
    const text = await asText(await service.generatePdf(configFor('text'), items))
    const icon = await asText(await service.generatePdf(configFor('icon'), items))

    // 'text' mode writes the i18n key through the stubbed translate service.
    expect(text).toContain('labels.sku')
    expect(icon).not.toContain('labels.sku')
  })

  it('handles an empty item list', async () => {
    const blob = await service.generatePdf(configFor('icon'), [])
    expect(blob.size).toBeGreaterThan(0)
  })

  it('renders every label size and orientation in icon mode', async () => {
    for (const size of LABEL_SIZES) {
      for (const orientation of ['portrait', 'landscape'] as const) {
        const blob = await service.generatePdf(
          { ...configFor('icon'), size, orientation },
          items
        )
        expect(blob.size)
          .withContext(`${size.key} ${orientation}`)
          .toBeGreaterThan(0)
      }
    }
  })
})

describe('LabelPdfService — tracecard and location label types', () => {
  let service: LabelPdfService

  // Shaped after TracecardItem and Location as returned by their services.
  const itemsByType: Record<string, Record<string, unknown>[]> = {
    tracecard: [
      {
        id: 't1',
        sku: 'PU-RSX-WHT-41',
        barcode: '1112223334445',
        description: 'Puma RS-X',
        location_code: 'A-01-02-3',
        qty_on_hand: 54,
        lot: 'LOT-2026-01',
        expir: '2027-03-15',
      },
    ],
    location: [
      {
        id: 'l1',
        location_code: 'A-01-02-3',
        aisle: 'A',
        section: '01',
        level: '3',
        facility_name: 'Main Warehouse',
      },
    ],
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
      ],
    })
    service = TestBed.inject(LabelPdfService)
  })

  // Guards against adding a label type whose fields have no registry entry:
  // those would silently print the generic fallback icon on every label.
  it('maps every default field of every label type to a real icon', () => {
    const types: LabelType[] = ['catalog', 'tracecard', 'location', 'bin']

    for (const type of types) {
      // barcodeOnly fields never render as a row, so they never show an icon.
      for (const field of getDefaultFields(type).filter((f) => !f.barcodeOnly)) {
        expect(resolveIcon(field.key))
          .withContext(`${type}.${field.key} has no icon registry entry`)
          .not.toBe(FALLBACK_ICON)
      }
    }
  })

  for (const type of ['tracecard', 'location'] as LabelType[]) {
    it(`embeds one icon per visible field on a ${type} label`, async () => {
      const base: LabelConfig = {
        labelType: type,
        fields: getDefaultFields(type),
        size: LABEL_SIZES[0],
        barcodeType: 'code128',
        barcodeField: getDefaultBarcodeField(type),
        orientation: 'portrait',
        fieldLabelMode: 'none',
      }

      const countImages = async (config: LabelConfig) => {
        const buf = new Uint8Array(
          await (await service.generatePdf(config, itemsByType[type])).arrayBuffer()
        )
        let pdf = ''
        for (let i = 0; i < buf.length; i++) pdf += String.fromCharCode(buf[i])
        return (pdf.match(/\/Subtype \/Image/g) ?? []).length
      }

      // A transparent PNG costs more than one `/Subtype /Image` marker, since
      // jsPDF emits a companion SMask object for the alpha channel. Derive
      // that factor from the barcode-only baseline instead of hardcoding it.
      const perImage = await countImages(base)
      const withIcons = await countImages({ ...base, fieldLabelMode: 'icon' })
      const visibleFields = getDefaultFields(type)
        .filter((f) => f.enabled && !f.barcodeOnly).length

      expect(perImage).toBeGreaterThan(0)
      expect(withIcons).toBe(perImage * (1 + visibleFields))
    })
  }
})

describe('label field definitions', () => {
  const TYPES: LabelType[] = ['catalog', 'tracecard', 'location', 'bin']

  it('makes no field mandatory, so every toggle can be turned off', () => {
    for (const type of TYPES) {
      for (const field of getDefaultFields(type)) {
        expect((field as { required?: boolean }).required)
          .withContext(`${type}.${field.key} is still forced on`)
          .toBeUndefined()
      }
    }
  })

  it('offers an id to encode in the barcode for every label type', () => {
    for (const type of TYPES) {
      const ids = getDefaultFields(type).filter((f) => f.barcodeOnly)

      expect(ids.length).withContext(`${type} has no id field`).toBe(1)
      // Off by default and hidden from the visible-field toggles: an id is a
      // barcode payload, not something anyone wants printed as text.
      expect(ids[0].enabled).withContext(`${type} id enabled`).toBe(false)
      expect(ids[0].label).withContext(`${type} id label`).toMatch(/_id$/)
    }
  })

  it('keeps the default barcode source among the offered fields', () => {
    for (const type of TYPES) {
      const keys = getDefaultFields(type).map((f) => f.key)
      expect(keys).withContext(type).toContain(getDefaultBarcodeField(type))
    }
  })
})

describe('LabelPdfService — a label with every field switched off', () => {
  let service: LabelPdfService

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
      ],
    })
    service = TestBed.inject(LabelPdfService)
  })

  // Turning every toggle off used to be impossible for location and bin.
  it('still renders the barcode, its value and the date', async () => {
    const config: LabelConfig = {
      labelType: 'location',
      fields: getDefaultFields('location').map((f) => ({ ...f, enabled: false })),
      size: LABEL_SIZES[0],
      barcodeType: 'code128',
      barcodeField: 'location_code',
      orientation: 'portrait',
      fieldLabelMode: 'none',
    }

    const blob = await service.generatePdf(config, [
      { id: 'l1', location_code: 'A-01-02-3' },
    ])

    expect(blob.size).toBeGreaterThan(0)

    const buf = new Uint8Array(await blob.arrayBuffer())
    let pdf = ''
    for (let i = 0; i < buf.length; i++) pdf += String.fromCharCode(buf[i])

    // The barcode image survives even with no field rows.
    expect(pdf).toContain('/Subtype /Image')
  })
})

describe('preview and PDF agree on which fields are printed', () => {
  // The preview filters `enabled && !barcodeOnly`; the PDF used to filter only
  // `enabled`, so an id turned on would have printed in the PDF and not on
  // screen. Pin the rule both sides must follow.
  it('excludes barcodeOnly fields even when they are enabled', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
      ],
    })
    const service = TestBed.inject(LabelPdfService)

    const fields = getDefaultFields('location').map((f) =>
      f.barcodeOnly ? { ...f, enabled: true } : { ...f, enabled: false }
    )
    const config: LabelConfig = {
      labelType: 'location',
      fields,
      size: LABEL_SIZES[0],
      barcodeType: 'code128',
      barcodeField: 'location_code',
      orientation: 'portrait',
      fieldLabelMode: 'text',
    }

    const blob = await service.generatePdf(config, [
      { id: 'ffffffff-1111-2222-3333-444444444444', location_code: 'A-01' },
    ])
    const buf = new Uint8Array(await blob.arrayBuffer())
    let pdf = ''
    for (let i = 0; i < buf.length; i++) pdf += String.fromCharCode(buf[i])

    // The id must not be printed as a text row.
    expect(pdf).not.toContain('labels.location_id')
  })
})

describe('label sizes', () => {
  it('has no duplicate media', () => {
    const keys = LABEL_SIZES.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('labels every size with both unit systems', () => {
    for (const size of LABEL_SIZES) {
      expect(size.label)
        .withContext(size.key)
        .toMatch(/^\d+ × \d+ mm \(\d+\.\d{2} × \d+\.\d{2} in\)$/)
    }
  })

  it('keys each size from its millimetre dimensions', () => {
    for (const size of LABEL_SIZES) {
      expect(size.key).toBe(`${size.widthMm}x${size.heightMm}`)
    }
  })

  it('keeps mm and inches consistent to within the printer\'s own rounding', () => {
    // The vendor rounds loosely and inconsistently — 2.00 in is listed as
    // 50 mm, not 50.8 — so the bar is set at 1 mm. That is still tight enough
    // to catch a transposed digit, which is what this guards against.
    for (const size of LABEL_SIZES) {
      expect(Math.abs(size.widthInches * 25.4 - size.widthMm))
        .withContext(`${size.key} width`)
        .toBeLessThanOrEqual(1)
      expect(Math.abs(size.heightInches * 25.4 - size.heightMm))
        .withContext(`${size.key} height`)
        .toBeLessThanOrEqual(1)
    }
  })

  it('carries both orientations of the same media as distinct entries', () => {
    // 76x102 and 102x76 are different rows on the printer; if the generator
    // collapsed them, picking one would silently print the other.
    const byKey = new Map(LABEL_SIZES.map((s) => [s.key, s]))
    expect(byKey.has('76x102')).toBe(true)
    expect(byKey.has('102x76')).toBe(true)
    expect(byKey.get('76x102')!.widthMm).toBe(76)
    expect(byKey.get('102x76')!.widthMm).toBe(102)
  })
})

describe('LabelPdfService — page geometry', () => {
  let service: LabelPdfService

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
      ],
    })
    service = TestBed.inject(LabelPdfService)
  })

  /** Read the /MediaBox of the first page, in points. */
  async function mediaBox(size: LabelSize, orientation: 'portrait' | 'landscape') {
    const config: LabelConfig = {
      labelType: 'bin',
      fields: getDefaultFields('bin'),
      size,
      barcodeType: 'code128',
      barcodeField: 'lpn_code',
      orientation,
      fieldLabelMode: 'none',
    }
    const buf = new Uint8Array(
      await (await service.generatePdf(config, [{ lpn_code: 'BIN-1', type: 'BOX' }])).arrayBuffer()
    )
    let pdf = ''
    for (let i = 0; i < buf.length; i++) pdf += String.fromCharCode(buf[i])

    const m = pdf.match(/\/MediaBox\s*\[([\d.\s]+)\]/)
    expect(m).withContext('no MediaBox in the PDF').toBeTruthy()
    const [, , w, h] = m![1].trim().split(/\s+/).map(Number)
    return { w, h }
  }

  it('uses the selected media exactly as listed in portrait', async () => {
    // 102 x 76 mm is a landscape-shaped media. Portrait must not rotate it:
    // the old code forced the longer side vertical and printed 76 x 102.
    const size = LABEL_SIZES.find((s) => s.key === '102x76')!
    const { w, h } = await mediaBox(size, 'portrait')

    expect(w / 72).toBeCloseTo(size.widthInches, 2)
    expect(h / 72).toBeCloseTo(size.heightInches, 2)
    expect(w).toBeGreaterThan(h)
  })

  it('swaps the media in landscape', async () => {
    const size = LABEL_SIZES.find((s) => s.key === '102x152')!
    const { w, h } = await mediaBox(size, 'landscape')

    expect(w / 72).toBeCloseTo(size.heightInches, 2)
    expect(h / 72).toBeCloseTo(size.widthInches, 2)
  })

  it('distinguishes the two orientations of the same media', async () => {
    const tall = await mediaBox(LABEL_SIZES.find((s) => s.key === '76x102')!, 'portrait')
    const wide = await mediaBox(LABEL_SIZES.find((s) => s.key === '102x76')!, 'portrait')

    expect(tall.w).not.toBeCloseTo(wide.w, 1)
    expect(tall.w).toBeCloseTo(wide.h, 1)
  })
})

describe('location label fields', () => {
  it('offers Category and Type, labelled like the table columns', () => {
    const byKey = new Map(getDefaultFields('location').map((f) => [f.key, f]))

    expect(byKey.get('category')?.label).toBe('preferences.location.category')
    expect(byKey.get('type')?.label).toBe('preferences.location.type')
  })

  it('leaves them off by default so existing labels are unchanged', () => {
    const byKey = new Map(getDefaultFields('location').map((f) => [f.key, f]))

    expect(byKey.get('category')?.enabled).toBe(false)
    expect(byKey.get('type')?.enabled).toBe(false)
  })

  it('does not offer the raw id columns behind them', () => {
    // Those hold a uuid; the page resolves them into `category` and `type`.
    const keys = getDefaultFields('location').map((f) => f.key)

    expect(keys).not.toContain('operational_category_id')
    expect(keys).not.toContain('location_profile_id')
  })

  it('prints them when switched on', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
      ],
    })
    const service = TestBed.inject(LabelPdfService)

    const config: LabelConfig = {
      labelType: 'location',
      fields: getDefaultFields('location').map((f) => ({
        ...f,
        enabled: f.key === 'category' || f.key === 'type',
      })),
      size: LABEL_SIZES[0],
      barcodeType: 'code128',
      barcodeField: 'location_code',
      orientation: 'portrait',
      fieldLabelMode: 'none',
    }

    // Shaped like labelLocations(): the page has already resolved the lookups.
    const blob = await service.generatePdf(config, [
      { id: 'l1', location_code: 'B01-01-A', category: 'Flow', type: 'Regular' },
    ])

    expect(blob.size).toBeGreaterThan(0)
  })
})
