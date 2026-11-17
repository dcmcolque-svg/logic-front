import { Injectable } from '@angular/core'
import { resolveIcon } from '../config/icon.registry'

/**
 * IconRasterService — Renders a PrimeIcon glyph to a transparent PNG data URL.
 *
 * Needed because jsPDF cannot use a webfont that lives only in the browser:
 * to draw an icon in a PDF we rasterize it on a canvas and embed it as an
 * image — the same approach the label generator already uses for barcodes.
 *
 * The glyph codepoint is read at runtime from the `primeicons.css` rules that
 * are already loaded globally, so there is no hand-maintained codepoint table
 * to drift out of sync when primeicons is upgraded.
 *
 * Browser-only: every method touches `document`. All entry points are behind
 * user interaction, and failures return `null` so callers can degrade.
 */
@Injectable({ providedIn: 'root' })
export class IconRasterService {
  /** Supersampling factor — keeps icons crisp on 203/300 DPI label printers. */
  private readonly RASTER_SCALE = 8

  /** icon name → unicode glyph */
  private glyphCache = new Map<string, string | null>()
  /** `${icon}|${size}|${color}` → PNG data URL */
  private pngCache = new Map<string, string | null>()
  /** Guards against loading the same font spec repeatedly. */
  private fontLoads = new Map<string, Promise<void>>()

  /**
   * Rasterize an icon to a square transparent PNG data URL.
   *
   * @param key    Semantic key or a raw `pi-*` name — both are accepted.
   * @param sizePx Target size in points/pixels; the canvas is rendered larger.
   * @param color  Fill color for the glyph.
   * @returns The data URL, or `null` if the icon could not be rendered.
   */
  async toPngDataUrl(
    key: string,
    sizePx: number,
    color = '#1e293b'
  ): Promise<string | null> {
    const iconName = key.startsWith('pi-') ? key : resolveIcon(key)
    const cacheKey = `${iconName}|${sizePx}|${color}`

    if (this.pngCache.has(cacheKey)) {
      return this.pngCache.get(cacheKey)!
    }

    let result: string | null = null
    try {
      const glyph = this.glyphOf(iconName)
      if (glyph) {
        const canvasSize = Math.max(8, Math.round(sizePx * this.RASTER_SCALE))
        await this.ensureFontLoaded(canvasSize)
        result = this.drawGlyph(glyph, canvasSize, color)
      }
    } catch {
      result = null
    }

    this.pngCache.set(cacheKey, result)
    return result
  }

  /**
   * Warm the cache for a set of icons so a batch render does the rasterization
   * work once instead of once per generated page.
   */
  async preload(keys: string[], sizePx: number, color?: string): Promise<void> {
    await Promise.all(keys.map((k) => this.toPngDataUrl(k, sizePx, color)))
  }

  // ── Private ──────────────────────────────────────────────

  /**
   * Read the icon's unicode glyph from the `.pi-<name>:before { content }`
   * rule provided by primeicons.css.
   */
  private glyphOf(iconName: string): string | null {
    if (this.glyphCache.has(iconName)) {
      return this.glyphCache.get(iconName)!
    }

    let glyph: string | null = null
    const probe = document.createElement('i')
    probe.className = `pi ${iconName}`
    probe.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:-9999px'
    document.body.appendChild(probe)

    try {
      const raw = getComputedStyle(probe, '::before').getPropertyValue('content')
      // Comes back quoted, e.g. `"\ea00"`. `none`/empty means no such icon.
      const unquoted = raw?.trim().replace(/(?:^["'])|(?:["']$)/g, '')
      if (unquoted && unquoted !== 'none' && unquoted !== 'normal') {
        glyph = unquoted
      }
    } finally {
      probe.remove()
    }

    this.glyphCache.set(iconName, glyph)
    return glyph
  }

  /**
   * The primeicons webfont loads lazily; without this the canvas would paint
   * the browser's missing-glyph box instead of the icon.
   */
  private ensureFontLoaded(sizePx: number): Promise<void> {
    const spec = `${sizePx}px primeicons`
    let pending = this.fontLoads.get(spec)

    if (!pending) {
      pending = (async () => {
        try {
          await document.fonts.load(spec)
          await document.fonts.ready
        } catch {
          // Fall through — drawGlyph still produces something legible or the
          // caller degrades to a text label.
        }
      })()
      this.fontLoads.set(spec, pending)
    }

    return pending
  }

  /** Paint the glyph centered on a transparent square canvas. */
  private drawGlyph(glyph: string, canvasSize: number, color: string): string | null {
    const canvas = document.createElement('canvas')
    canvas.width = canvasSize
    canvas.height = canvasSize

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.clearRect(0, 0, canvasSize, canvasSize)
    // 0.82 leaves a little optical padding so the glyph is not flush to the edge.
    ctx.font = `${Math.round(canvasSize * 0.82)}px primeicons`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(glyph, canvasSize / 2, canvasSize / 2)

    return canvas.toDataURL('image/png')
  }
}
