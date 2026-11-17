import { APP_MENU_TOPBAR } from './app.menu.config'

describe('APP_MENU_TOPBAR', () => {
  it('does not offer access to addons', () => {
    expect(APP_MENU_TOPBAR.map(item => item.label)).not.toContain('addons')
  })

  it('keeps the rest of the shortcuts', () => {
    expect(APP_MENU_TOPBAR.map(item => item.label)).toEqual(
      jasmine.arrayContaining(['marketplace', 'users', 'roles', 'packaging', 'rotations', 'integrations']),
    )
  })
})
