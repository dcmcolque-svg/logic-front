import { createSkuForm } from './sku-dialog-base'

describe('createSkuForm – unit_factor validation', () => {
  const form = createSkuForm()
  const ctrl = form.controls.unit_factor

  beforeEach(() => {
    form.reset()
    ctrl.markAsTouched()
  })

  it('should accept value 1', () => {
    ctrl.setValue(1)
    expect(ctrl.valid).toBeTrue()
    expect(ctrl.errors).toBeNull()
  })

  it('should accept values greater than 1', () => {
    ctrl.setValue(50)
    expect(ctrl.valid).toBeTrue()
  })

  it('should reject value 0', () => {
    ctrl.setValue(0)
    expect(ctrl.valid).toBeFalse()
    expect(ctrl.errors?.['min']).toBeTruthy()
  })

  it('should reject negative values', () => {
    ctrl.setValue(-3)
    expect(ctrl.valid).toBeFalse()
    expect(ctrl.errors?.['min']).toBeTruthy()
  })

  it('should accept null (field is optional)', () => {
    ctrl.setValue(null)
    expect(ctrl.valid).toBeTrue()
  })

  it('should default to 1 after reset with create-dialog defaults', () => {
    // Simulates what sku-create-dialog.resetForm() does
    form.reset({ serial_control_mode: 'NONE', unit_factor: 1 })
    expect(ctrl.value).toBe(1)
    expect(ctrl.valid).toBeTrue()
  })

  it('should default to 1 after reset with edit-dialog create defaults', () => {
    // Simulates what sku-form-dialog.openForCreate() does
    form.reset({ unit_factor: 1 })
    expect(ctrl.value).toBe(1)
    expect(ctrl.valid).toBeTrue()
  })

  it('should patch to 1 when row.unit_factor is 0 (edit-mode fallback)', () => {
    // Simulates the patchFormFromRow logic: row.unit_factor > 0 ? row.unit_factor : 1
    const rowUnitFactor = 0
    const patchedValue = rowUnitFactor > 0 ? rowUnitFactor : 1
    ctrl.setValue(patchedValue)
    expect(ctrl.value).toBe(1)
    expect(ctrl.valid).toBeTrue()
  })

  it('should keep existing value when row.unit_factor is positive (edit-mode)', () => {
    const rowUnitFactor = 7
    const patchedValue = rowUnitFactor > 0 ? rowUnitFactor : 1
    ctrl.setValue(patchedValue)
    expect(ctrl.value).toBe(7)
    expect(ctrl.valid).toBeTrue()
  })
})
