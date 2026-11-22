/**
 * Browser storage that belongs to one user.
 *
 * Every per-user key is written as `{uid}:{key}` (TableStateService,
 * FacilityScopeService, dashboard filters, filter presets, POS). Saving it is
 * fine — it is what lets a user come back to their tables, scope or sale in
 * progress — but the browser may be shared (a till, a warehouse PC): when a
 * different user signs in, whatever the previous one left behind is removed.
 */

/** User uids are UUIDs; a key starting with one followed by `:` is user-scoped. */
const UID_PREFIX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):/i

/** POS keys before they were uid-prefixed: `pos-facility:{uid}`, `pos-draft:{uid}:{facility}`. */
const LEGACY_POS = /^pos-(facility|draft):([^:]+)(?::(.+))?$/

/** Keys that used to be shared by every user of the browser; now uid-prefixed. */
const LEGACY_SHARED = new Set(['logic:preset:lastApplied'])

/** The key `key` as stored for user `uid`. */
export function userStorageKey(uid: string, key: string): string {
  return `${uid}:${key}`
}

/**
 * Removes every user-scoped key that does not belong to `uid`, from both
 * localStorage and sessionStorage. The current user's legacy POS keys are moved
 * to the uid-prefixed form instead, so a sale in progress survives the upgrade.
 */
export function purgeOtherUsersStorage(uid: string): void {
  for (const storage of stores()) {
    try {
      const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
        (k): k is string => k !== null
      )
      for (const key of keys) {
        const owner = UID_PREFIX.exec(key)?.[1]
        if (owner) {
          if (owner.toLowerCase() !== uid.toLowerCase()) storage.removeItem(key)
          continue
        }
        if (LEGACY_SHARED.has(key)) {
          storage.removeItem(key)
          continue
        }
        const legacy = LEGACY_POS.exec(key)
        if (!legacy) continue
        const [, kind, keyUid, facility] = legacy
        if (keyUid === uid) {
          const value = storage.getItem(key)
          const target = userStorageKey(uid, facility ? `pos-${kind}:${facility}` : `pos-${kind}`)
          if (value !== null && storage.getItem(target) === null) storage.setItem(target, value)
        }
        storage.removeItem(key)
      }
    } catch {
      /* storage unavailable (private mode): nothing persisted, nothing to purge */
    }
  }
}

function stores(): Storage[] {
  const out: Storage[] = []
  try {
    out.push(localStorage)
  } catch {
    /* blocked */
  }
  try {
    out.push(sessionStorage)
  } catch {
    /* blocked */
  }
  return out
}
