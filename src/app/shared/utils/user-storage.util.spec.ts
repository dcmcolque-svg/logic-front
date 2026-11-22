import { purgeOtherUsersStorage, userStorageKey } from './user-storage.util'

describe('purgeOtherUsersStorage', () => {
  const me = '11111111-1111-1111-1111-111111111111'
  const other = '22222222-2222-2222-2222-222222222222'

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  afterAll(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('removes keys of other users and keeps the current user and shared ones', () => {
    localStorage.setItem(userStorageKey(me, 'facility-scope'), 'mine')
    localStorage.setItem(userStorageKey(other, 'facility-scope'), 'theirs')
    localStorage.setItem(userStorageKey(other, 'pos-draft:fac-1'), 'theirs')
    sessionStorage.setItem(userStorageKey(other, 'dashboard-filters'), 'theirs')
    localStorage.setItem('lan', 'es')
    localStorage.setItem('pos-auto-print', 'true')

    purgeOtherUsersStorage(me)

    expect(localStorage.getItem(userStorageKey(me, 'facility-scope'))).toBe('mine')
    expect(localStorage.getItem(userStorageKey(other, 'facility-scope'))).toBeNull()
    expect(localStorage.getItem(userStorageKey(other, 'pos-draft:fac-1'))).toBeNull()
    expect(sessionStorage.getItem(userStorageKey(other, 'dashboard-filters'))).toBeNull()
    expect(localStorage.getItem('lan')).toBe('es')
    expect(localStorage.getItem('pos-auto-print')).toBe('true')
  })

  it('moves the current user legacy POS keys and drops the rest', () => {
    localStorage.setItem(`pos-facility:${me}`, '"fac-1"')
    localStorage.setItem(`pos-draft:${me}:fac-1`, '{"cart":[]}')
    localStorage.setItem(`pos-draft:${other}:fac-1`, '{"cart":[]}')
    localStorage.setItem('logic:preset:lastApplied', '{}')

    purgeOtherUsersStorage(me)

    expect(localStorage.getItem(userStorageKey(me, 'pos-facility'))).toBe('"fac-1"')
    expect(localStorage.getItem(userStorageKey(me, 'pos-draft:fac-1'))).toBe('{"cart":[]}')
    expect(localStorage.getItem(`pos-facility:${me}`)).toBeNull()
    expect(localStorage.getItem(`pos-draft:${me}:fac-1`)).toBeNull()
    expect(localStorage.getItem(`pos-draft:${other}:fac-1`)).toBeNull()
    expect(localStorage.getItem('logic:preset:lastApplied')).toBeNull()
  })
})
