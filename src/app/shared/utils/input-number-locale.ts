/**
 * Makes every PrimeNG <p-inputnumber> write numbers like the rest of the app
 * (DISPLAY_LOCALE: 1.234,56) instead of the browser's locale.
 *
 * PrimeNG has no global setting for it, and setting [locale] on each input is
 * easy to forget in new screens, so the default is set once at startup
 * (main.ts). An input with its own [locale] keeps it.
 *
 * It also takes the "." key as the decimal sign when the locale writes ",":
 * people used to calculators type 10.50, and PrimeNG would drop the "." (it is
 * the thousands sign, which the input adds by itself) and keep 1050. PrimeNG
 * already does this for the numeric keypad's decimal key.
 *
 * And it reads pasted numbers in either style (normalizePastedNumber): PrimeNG
 * only understands the input's locale, so "1,234.5" copied from a US sheet
 * became 1,2345.
 *
 * Relies on InputNumber internals (constructParser, onInputKeyPress, onPaste,
 * _decimalChar); input-number-locale.spec.ts fails if an upgrade changes them.
 */
import { InputNumber } from 'primeng/inputnumber'
import { DISPLAY_LOCALE } from './display-format'

interface InputNumberInternals {
  locale?: string
  maxFractionDigits?: number
  _decimalChar?: string
  constructParser(): void
  onInputKeyPress(event: KeyboardEvent): void
  onPaste(event: ClipboardEvent): void
}

type Originals = Pick<InputNumberInternals, 'constructParser' | 'onInputKeyPress' | 'onPaste'>

/**
 * A pasted number written with "," or "." as the decimal sign, rewritten with
 * `decimalChar` and no thousands signs, as the input's locale reads it. null
 * when the text is not a number (PrimeNG then handles it as before).
 *
 * Which sign is the decimal one:
 * - both present: the last one ("1.234,5" and "1,234.5" are 1234.5);
 * - one sign several times: thousands ("1.234.567", "1,234,567");
 * - one sign once, not followed by exactly 3 digits: decimal ("10.5", "10,50");
 * - one sign once followed by 3 digits ("1.234", "1,234") is ambiguous: when
 *   the input takes fewer than 3 decimals it is thousands, otherwise it is read
 *   as the input's locale writes it.
 *
 * `maxFraction` is the decimals the input takes; with 0 (or no `decimalChar`,
 * an integer input) the decimals are dropped.
 */
export function normalizePastedNumber(text: string, decimalChar: string, maxFraction = 3): string | null {
  // Spaces (also the narrow and no-break ones some locales group with) and a
  // currency or unit around the number: "Bs 1.234,50", "US$ 3.00", "12 %".
  const body = text
    .replace(/[\s\u00a0\u202f']/g, '')
    .replace(/^[^\d.,-]+/, '')
    .replace(/[^\d.,]+$/, '')
  const match = /^(-?)([\d.,]+)$/.exec(body)
  if (!match || !/\d/.test(match[2])) return null
  const [, minus, digits] = match

  let decimalSign: string | null = null
  const lastDot = digits.lastIndexOf('.')
  const lastComma = digits.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    decimalSign = lastDot > lastComma ? '.' : ','
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sign = lastDot >= 0 ? '.' : ','
    const once = digits.indexOf(sign) === digits.lastIndexOf(sign)
    const decimals = digits.length - digits.lastIndexOf(sign) - 1
    if (once && decimals !== 3) decimalSign = sign
    else if (once && maxFraction >= 3 && sign === decimalChar) decimalSign = sign
  }

  const cut = decimalSign ? digits.lastIndexOf(decimalSign) : digits.length
  const whole = digits.slice(0, cut).replace(/[.,]/g, '') || '0'
  const fraction = decimalSign ? digits.slice(cut + 1).replace(/[.,]/g, '') : ''
  const keepFraction = fraction && decimalChar && maxFraction > 0
  return `${minus}${whole}${keepFraction ? decimalChar + fraction : ''}`
}

/** The same paste event, with `text` on the clipboard. */
function withClipboardText(event: ClipboardEvent, text: string): ClipboardEvent {
  const clipboardData = { getData: () => text }
  return new Proxy(event, {
    get(target, prop) {
      if (prop === 'clipboardData') return clipboardData
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

let originals: Originals | null = null

/** A keypress PrimeNG reads as the numeric keypad's decimal key. */
function asNumpadDecimal(event: KeyboardEvent): KeyboardEvent {
  return new Proxy(event, {
    get(target, prop) {
      if (prop === 'code') return 'NumpadDecimal'
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

export function applyInputNumberLocale(locale: string = DISPLAY_LOCALE): void {
  if (originals) return
  const proto = InputNumber.prototype as unknown as InputNumberInternals
  const { constructParser, onInputKeyPress, onPaste } = (originals = {
    constructParser: proto.constructParser,
    onInputKeyPress: proto.onInputKeyPress,
    onPaste: proto.onPaste,
  })

  proto.constructParser = function (this: InputNumberInternals): void {
    if (!this.locale) this.locale = locale
    constructParser.call(this)
  }

  proto.onInputKeyPress = function (this: InputNumberInternals, event: KeyboardEvent): void {
    const dotAsDecimal = event.key === '.' && !!this._decimalChar && this._decimalChar !== '.'
    onInputKeyPress.call(this, dotAsDecimal ? asNumpadDecimal(event) : event)
  }

  proto.onPaste = function (this: InputNumberInternals, event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('Text')
    const decimalChar = this._decimalChar ?? ''
    // Intl's default is 3 decimals; an input without a decimal sign takes none.
    const maxFraction = decimalChar ? (this.maxFractionDigits ?? 3) : 0
    const normalized = text ? normalizePastedNumber(text, decimalChar, maxFraction) : null
    onPaste.call(this, normalized !== null && normalized !== text ? withClipboardText(event, normalized) : event)
  }
}

/** Undoes applyInputNumberLocale (specs). */
export function restoreInputNumberLocale(): void {
  if (!originals) return
  Object.assign(InputNumber.prototype as unknown as InputNumberInternals, originals)
  originals = null
}
