import { APP_MENU, APP_MENU_TOPBAR } from './app.menu.config'

describe('APP_MENU_TOPBAR', () => {
  it('does not offer access to addons', () => {
    expect(APP_MENU_TOPBAR.map(item => item.label)).not.toContain('addons')
  })

  it('does not offer marketplace or roles', () => {
    const labels = APP_MENU_TOPBAR.map(item => item.label)
    expect(labels).not.toContain('marketplace')
    expect(labels).not.toContain('roles')
  })

  it('lists users, companies and facilities first', () => {
    expect(APP_MENU_TOPBAR.slice(0, 3).map(item => item.label)).toEqual([
      'users', 'companies', 'fulfillment locations',
    ])
  })

  it('keeps the rest of the shortcuts', () => {
    expect(APP_MENU_TOPBAR.map(item => item.label)).toEqual(
      // Temporarily hidden: 'rotations', 'integrations'
      jasmine.arrayContaining(['users', 'packaging']),
    )
  })
})

describe('APP_MENU', () => {
  it('follows the business order, demo last', () => {
    expect(APP_MENU.map(item => item.label)).toEqual([
      'home', 'sales', 'inventory', 'inbound', 'outbound', 'demo_components',
    ])
  })
})
