import {
  costVariancePct,
  currencyOf,
  formatCost,
  isCostingEnabled,
  isOwnerRole,
} from './costing.util'

describe('costing.util', () => {
  it('only OWNER sees costs', () => {
    expect(isOwnerRole('OWNER')).toBeTrue()
    expect(isOwnerRole('owner')).toBeTrue()
    expect(isOwnerRole('RECEIVER')).toBeFalse()
    expect(isOwnerRole(undefined)).toBeFalse()
  })

  it('NONE or missing settings disable costing', () => {
    expect(isCostingEnabled(undefined)).toBeFalse()
    expect(isCostingEnabled({ method: 'NONE' })).toBeFalse()
    expect(isCostingEnabled({ method: 'FIFO' })).toBeTrue()
  })

  it('defaults the currency to BOB', () => {
    expect(currencyOf(undefined)).toBe('BOB')
    expect(currencyOf({ method: 'AVERAGE', currency: 'CLP' })).toBe('CLP')
  })

  it('formats with the currency prefix and decimals, in DISPLAY_LOCALE whatever the UI language', () => {
    expect(formatCost(10.5, 'BOB')).toBe('Bs 10,50')
    expect(formatCost(1250, 'CLP')).toBe('CLP$ 1.250')
    expect(formatCost(1234.5, 'USD')).toBe('US$ 1.234,50')
    expect(formatCost(null, 'BOB')).toBe('—')
  })

  it('computes the variance against the catalog cost', () => {
    expect(costVariancePct(12, 10)).toBeCloseTo(20)
    expect(costVariancePct(9, 10)).toBeCloseTo(-10)
    expect(costVariancePct(9, 0)).toBeNull()
    expect(costVariancePct(null, 10)).toBeNull()
  })
})
