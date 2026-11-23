import { CatalogItem } from './sales.types'
import { cartTotals, CartLine, lineTotal, percentOf, priceOf, quickTenders, roundCurrency, salesErrorMessages } from './sales.util'

function item(over: Partial<CatalogItem> = {}): CatalogItem {
  return {
    sku_id: 's1',
    sku_code: 'A1',
    sku_name: 'Arroz',
    barcode: null,
    image_url: null,
    company_id: 'c1',
    company_name: null,
    retail_price: 10,
    wholesale_price: 8,
    available: 50,
    exact_match: false,
    ...over,
  }
}

function line(qty: number, price: number, discount = 0): CartLine {
  return { item: item(), qty, unit_price: price, list_price: price, discount }
}

describe('sales.util', () => {
  it('computes totals like the backend (line + sale discounts)', () => {
    const t = cartTotals([line(2, 10.5, 1), line(1, 5)], 2)
    expect(t.gross).toBe(26)
    expect(t.subtotal).toBe(25)
    expect(t.discountTotal).toBe(3)
    expect(t.total).toBe(23)
    expect(t.units).toBe(3)
  })

  it('rounds float noise to cents', () => {
    expect(lineTotal({ qty: 3, unit_price: 0.1, discount: 0 })).toBe(0.3)
  })

  it('never lets the sale discount exceed the subtotal', () => {
    expect(cartTotals([line(1, 5)], 9).total).toBe(0)
  })

  it('falls back to retail when the wholesale price is missing', () => {
    expect(priceOf(item(), 'WHOLESALE')).toBe(8)
    expect(priceOf(item({ wholesale_price: 0 }), 'WHOLESALE')).toBe(10)
  })

  it('suggests the exact amount and round bills for cash', () => {
    expect(quickTenders(37.5, 'BOB')).toEqual([37.5, 40, 50, 100])
    expect(quickTenders(4350, 'CLP')).toEqual([4350, 4500, 5000, 6000])
    expect(quickTenders(0, 'BOB')).toEqual([])
  })

  it('keeps the cents of a CLP amount in the exact tender', () => {
    expect(quickTenders(46.3, 'CLP')[0]).toBe(46.3)
  })

  it('rounds CLP to whole pesos', () => {
    expect(roundCurrency(1234.56, 'CLP')).toBe(1235)
    expect(roundCurrency(12.345, 'BOB')).toBe(12.35)
  })

  it('computes percent discounts', () => {
    expect(percentOf(80, 12.5)).toBe(10)
    expect(percentOf(80, 150)).toBe(80)
  })

  it('translates validation details by rule with their context', () => {
    const translate = {
      instant: (key: string, p?: Record<string, unknown>) =>
        key === 'sales.rules.insufficient_stock' ? `sin stock ${p?.['sku_code']}` : key,
    } as any
    const msgs = salesErrorMessages(
      { code: 'SALES_INSUFFICIENT_STOCK', errors: [{ field: 'lines[0].qty', rule: 'insufficient_stock', context: { sku_code: 'A1' } }] },
      translate
    )
    expect(msgs).toEqual(['sin stock A1'])
  })

  it('falls back to the server message when the code is unknown', () => {
    const translate = { instant: (key: string) => key } as any
    expect(salesErrorMessages({ code: 'X', message: 'boom' }, translate)).toEqual(['boom'])
  })
})
