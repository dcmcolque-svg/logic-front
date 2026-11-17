import { TestBed } from '@angular/core/testing'
import { IconRasterService } from './icon-raster.service'
import { resolveIcon, iconClass, FALLBACK_ICON } from '../config/icon.registry'

describe('icon registry', () => {
  it('resolves field, status and event keys', () => {
    expect(resolveIcon('sku')).toBe('pi-tag')
    expect(resolveIcon('shipped')).toBe('pi-truck')
    expect(resolveIcon('move')).toBe('pi-arrows-alt')
  })

  it('normalizes case and the labels. i18n prefix', () => {
    expect(resolveIcon('labels.sku')).toBe('pi-tag')
    expect(resolveIcon('  SKU  ')).toBe('pi-tag')
    expect(resolveIcon('IN-TRANSIT')).toBe('pi-truck')
  })

  it('passes through an explicit pi-* override', () => {
    expect(resolveIcon('pi-star')).toBe('pi-star')
  })

  it('falls back for unknown and empty keys', () => {
    expect(resolveIcon('not_a_real_key')).toBe(FALLBACK_ICON)
    expect(resolveIcon('')).toBe(FALLBACK_ICON)
    expect(resolveIcon('nope', 'pi-flag')).toBe('pi-flag')
  })

  it('builds a full template class', () => {
    expect(iconClass('sku')).toBe('pi pi-tag')
  })
})

describe('IconRasterService', () => {
  let service: IconRasterService

  beforeEach(() => {
    TestBed.configureTestingModule({})
    service = TestBed.inject(IconRasterService)
  })

  it('rasterizes a known icon to a non-blank PNG', async () => {
    const url = await service.toPngDataUrl('sku', 16)

    expect(url).toBeTruthy()
    expect(url!.startsWith('data:image/png;base64,')).toBe(true)

    // A glyph that failed to load would leave every pixel transparent.
    expect(await countOpaquePixels(url!)).toBeGreaterThan(0)
  })

  it('produces different images for different icons', async () => {
    const tag = await service.toPngDataUrl('sku', 16)
    const truck = await service.toPngDataUrl('shipped', 16)

    expect(tag).toBeTruthy()
    expect(truck).toBeTruthy()
    expect(tag).not.toEqual(truck!)
  })

  it('honors the requested color', async () => {
    const dark = await service.toPngDataUrl('sku', 16, '#000000')
    const red = await service.toPngDataUrl('sku', 16, '#ff0000')

    expect(dark).not.toEqual(red!)
  })

  it('returns null for an icon that has no glyph', async () => {
    expect(await service.toPngDataUrl('pi-definitely-not-an-icon', 16)).toBeNull()
  })

  it('caches so repeated calls return the identical result', async () => {
    const first = await service.toPngDataUrl('sku', 16)
    const second = await service.toPngDataUrl('sku', 16)

    expect(second).toBe(first!)
  })
})

/** Count non-transparent pixels in a PNG data URL. */
async function countOpaquePixels(dataUrl: string): Promise<number> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('image failed to load'))
    img.src = dataUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let opaque = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) opaque++
  }
  return opaque
}
