import en from '../../../../../public/i18n/en.json'
import es from '../../../../../public/i18n/es.json'

/**
 * Lightweight spec that verifies i18n keys used by the Integrations tabs
 * exist in every translation file and have non-empty values.
 */
describe('Integrations tab translations', () => {
  const TAB_KEYS = [
    'labels.api_keys',
    'labels.providers_tab',
  ] as const

  /** Helper: resolve a dot-path like "labels.api_keys" from a nested object */
  function resolve(obj: Record<string, any>, path: string): unknown {
    return path.split('.').reduce((acc, key) => acc?.[key], obj)
  }

  for (const key of TAB_KEYS) {
    it(`en.json should contain "${key}"`, () => {
      const value = resolve(en, key)
      expect(value).toBeTruthy(`Missing or empty key "${key}" in en.json`)
    })

    it(`es.json should contain "${key}"`, () => {
      const value = resolve(es, key)
      expect(value).toBeTruthy(`Missing or empty key "${key}" in es.json`)
    })
  }

  it('es.json "labels.providers_tab" should be "Proveedores"', () => {
    expect(resolve(es, 'labels.providers_tab')).toBe('Proveedores')
  })

  it('en.json "labels.providers_tab" should be "Providers"', () => {
    expect(resolve(en, 'labels.providers_tab')).toBe('Providers')
  })
})
