import { computed, inject, Injectable, signal } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { environment } from '@/environments/environment'
import { AuthService } from './auth.service'
import {
  FacilityScopeListRequest,
  FacilityScopeListResponse,
  NO_FACILITY_ID,
  ScopeFacility,
} from '../types/facility.types'
import { DEFAULT_TIME_ZONE, zoneOrDefault } from '@/app/shared/utils/time-zone.util'

/** localStorage key (scoped per user uid, same convention as TableStateService). */
const STORAGE_KEY = 'facility-scope'

/**
 * Version of the stored selection, written as `{ v, ids }`. Before "No
 * facility" existed it was a bare array, where ticking every facility meant
 * "all"; see `prune()`.
 */
const STORAGE_VERSION = 2

/** Page size used to pull the user's facilities. Matches the previous per-module calls. */
const FACILITY_PAGE_SIZE = 200

/**
 * FacilityScopeService — single source of truth for the global facility selector.
 *
 * Replaces the `facilities` / `facilityFilter` signal pair and the duplicated
 * `listMyFacilities()` call that used to live in seven feature components
 * (parcels, receivings, allorders, backorders, tracecards, locations, rotations).
 *
 * Semantics of `selectedIds`:
 *   - `[]`        → "All facilities". No restriction is applied anywhere.
 *   - `[a]`       → single facility. Tables hide their facility column entirely.
 *   - `[a, b, …]` → multiple. Tables show the column, with options narrowed to the selection.
 *   - every id    → equivalent to `[]`; see `isAll`. The multiselect's own
 *                   "select all" toggle produces this, and it must not read as
 *                   a filter.
 *
 * `NO_FACILITY_ID` can be ticked like a facility: it stands for the records
 * whose facility_id is NULL. They are only in scope when it is ticked (or the
 * scope is "all"): narrowing to `[a]` shows facility `a` and nothing else.
 *
 * "Single" is about what the scope *covers*, not what is ticked: a user who can
 * reach only one facility is always scoped to it, even with `[]`. See `isSingle`.
 *
 * The selection is persisted per user in localStorage so it survives reloads.
 */
@Injectable({ providedIn: 'root' })
export class FacilityScopeService {
  private readonly http = inject(HttpClient)
  private readonly auth = inject(AuthService)
  private readonly url = environment.URL_API + 'v2/facility'

  // === State ===
  private readonly _all = signal<ScopeFacility[]>([])
  private readonly _selectedIds = signal<string[]>([])
  private readonly _loading = signal(false)
  private readonly _loaded = signal(false)
  /** Guards the one-time read from localStorage (see restoreSelection). */
  private restored = false
  /** The restored selection predates "No facility" (bare array); `prune()` migrates it. */
  private legacySelection = false
  /**
   * uid the state above belongs to. Logout navigates to /login without a page
   * reload, so this root service outlives the session: when another user signs
   * in, everything loaded for the previous one must be dropped (see `syncOwner`).
   */
  private ownerUid: string | null = null

  /** Every facility the authenticated user has access to. */
  readonly all = this._all.asReadonly()
  readonly loading = this._loading.asReadonly()
  readonly loaded = this._loaded.asReadonly()

  /** Currently checked facility ids, `NO_FACILITY_ID` included. Empty array means "all". */
  readonly selectedIds = this._selectedIds.asReadonly()

  // === Derived ===

  /**
   * True when the scope imposes no restriction at all.
   *
   * Two selections mean the same thing: an empty one (the default) and one
   * that ticks every facility the user can reach. PrimeNG's "select all"
   * toggle produces the latter, and it must read as "all facilities" rather
   * than as a filter — in the topbar label and in the outgoing API payload.
   *
   * Compares by id, not by length, so a stale selected id (a facility the user
   * lost access to, before `prune()` runs) cannot pass as full coverage.
   */
  readonly isAll = computed(() => this.coversAll(this._selectedIds()))

  /**
   * The rule behind `isAll`, for a selection that is not committed yet (the
   * topbar's buffered one). Every facility *and* "No facility" must be ticked:
   * every facility alone still leaves out the records without one.
   */
  coversAll(ids: readonly string[]): boolean {
    if (ids.length === 0) return true
    const all = this._all()
    // Nothing loaded yet: a restored selection stays a restriction until we
    // actually know what "all" is.
    if (all.length === 0) return false
    // A single reachable facility locks the topbar selector, so the user could
    // never undo a narrower selection (one persisted before, say).
    if (all.length === 1) return true
    const selected = new Set(ids)
    return selected.has(NO_FACILITY_ID) && all.every((f) => selected.has(f.id))
  }

  /** True when records without a facility are in scope. */
  readonly includesNoFacility = computed(
    () => this.isAll() || this._selectedIds().includes(NO_FACILITY_ID)
  )

  /**
   * How many facility values the scope actually covers: every reachable
   * facility when unrestricted, the ticked entries otherwise — "No facility"
   * counts as one, since its rows share the same empty value. 0 until the list
   * has loaded and nothing is ticked — nothing is known yet.
   */
  private readonly coveredCount = computed(() =>
    this.isAll() ? this._all().length : this._selectedIds().length
  )

  /**
   * True when exactly one facility is in scope — the case where tables drop
   * their facility column because every row would repeat the same value.
   *
   * Counts coverage, not ticks: a user assigned to a single facility has the
   * default `[]` selection and is still scoped to that one facility.
   *
   * Ticking "No facility" always keeps the column, even alone: the point of
   * that entry is to see which records show "—" there.
   */
  readonly isSingle = computed(
    () => this.coveredCount() === 1 && !this._selectedIds().includes(NO_FACILITY_ID)
  )

  /**
   * `isSingle` for a table whose rows can lack a facility (parcels, webhooks,
   * API keys). While those rows are in scope they show "—" next to the
   * facility's own rows, so the column stays: for a user who can reach one
   * facility, whose scope is always "all", it never hides.
   */
  readonly isSingleWithoutNulls = computed(
    () => this.isSingle() && !this.includesNoFacility()
  )

  /** True when several facilities are in scope: the column stays, but narrowed. */
  readonly isMultiple = computed(() => this.coveredCount() > 1)

  /**
   * True when the user can reach exactly one facility, so there is nothing to
   * choose: the topbar selector shows it, locked.
   */
  readonly hasSingleFacility = computed(() => this._all().length === 1)

  /**
   * The facilities a table is allowed to offer as column-filter options.
   * Falls back to every facility when the scope is "all". Real facilities
   * only: "No facility" is not one, so ticking only that leaves it empty.
   */
  readonly inScope = computed<ScopeFacility[]>(() => {
    const ids = this._selectedIds()
    if (ids.length === 0) return this._all()
    const set = new Set(ids)
    return this._all().filter((f) => set.has(f.id))
  })

  /**
   * Value to merge into an outgoing API filter, or `null` when unrestricted.
   * Always an array so the backend receives an `in` match; "No facility"
   * becomes a `null` element (`facility_id IS NULL`).
   */
  readonly apiValue = computed<(string | null)[] | null>(() => {
    if (this.isAll()) return null
    return this._selectedIds().map((id) => (id === NO_FACILITY_ID ? null : id))
  })

  /** Display label for the topbar trigger: the facility's name when only one is in scope. */
  readonly label = computed(() => {
    if (!this.isSingle()) return null
    return this.inScope()[0]?.name ?? null
  })

  /**
   * IANA zone of a facility, for showing its rows' times. Unknown ids (or
   * records without a facility) take the scope's zone.
   */
  zoneOf(id: string | null | undefined): string {
    const tz = id ? this._all().find((f) => f.id === id)?.time_zone : undefined
    return tz ? zoneOrDefault(tz) : this.zone()
  }

  /**
   * Zone of the facilities in scope: the one that says which day "today" is
   * for date presets, and the zone of times shown without a facility. When
   * the scope mixes zones it is the zone most of them share (ties: the
   * first). Day filters do not depend on it: they go out as yyyy-mm-dd and the
   * backend resolves each row in its own facility's zone.
   */
  readonly zone = computed<string>(() => {
    const facilities = this.inScope().length ? this.inScope() : this._all()
    const counts = new Map<string, number>()
    for (const f of facilities) {
      const tz = zoneOrDefault(f.time_zone)
      counts.set(tz, (counts.get(tz) ?? 0) + 1)
    }
    let best = DEFAULT_TIME_ZONE
    let max = 0
    for (const [tz, n] of counts) {
      if (n > max) [best, max] = [tz, n]
    }
    return best
  })

  /** True when the facilities in scope do not all share one zone. */
  readonly mixedZones = computed(() => {
    const facilities = this.inScope().length ? this.inScope() : this._all()
    return new Set(facilities.map((f) => zoneOrDefault(f.time_zone))).size > 1
  })

  /** Resolve an id to its facility name — used by table cell templates. */
  nameOf(id: string | null | undefined): string {
    if (!id) return '—'
    return this._all().find((f) => f.id === id)?.name ?? id
  }

  // === Loading ===

  /**
   * Loads the user's facilities once per session. Safe to call from many
   * components: subsequent calls are no-ops while loaded or in flight.
   *
   * Does not touch the selection: a page that only needs the facility list
   * (the dashboard) must not resurrect a persisted scope that no visible
   * control can clear. The topbar selector calls `restoreSelection()` itself.
   */
  load(force = false): void {
    this.syncOwner()
    if (!force && (this._loaded() || this._loading())) return

    this._loading.set(true)
    const req: FacilityScopeListRequest = {
      filter: {},
      config: { page: 1, rows: FACILITY_PAGE_SIZE },
    }

    const uid = this.ownerUid
    this.http
      .post<FacilityScopeListResponse>(`${this.url}/my`, req)
      .subscribe({
        next: (resp) => {
          // The user changed while this was in flight: it is someone else's list.
          if (uid !== this.ownerUid) return
          this._all.set(resp?.data ?? [])
          this._loaded.set(true)
          this._loading.set(false)
          // Drop ids the user no longer has access to (revoked assignment,
          // deleted facility) so the scope can never filter to nothing.
          this.prune()
        },
        error: () => {
          if (uid === this.ownerUid) this._loading.set(false)
        },
      })
  }

  // === Mutations ===

  /** Replaces the selection wholesale (used by the topbar multiselect). */
  setSelection(ids: string[]): void {
    const unique = Array.from(new Set(ids ?? []))
    this._selectedIds.set(unique)
    this.persist(unique)
  }

  /** Clears the scope back to "all facilities". */
  clear(): void {
    this.setSelection([])
  }

  /**
   * Removes selected ids that are not present in the loaded facility list,
   * and settles two selections that can only mean "all":
   * - any selection of a user who can reach one facility: the selector is
   *   locked, so nothing narrower could ever be undone;
   * - a selection stored before "No facility" existed that ticks every
   *   facility. Back then it meant "all"; read as-is it would now drop the
   *   records without a facility, with nothing on screen saying so.
   */
  private prune(): void {
    const all = this._all()
    const current = this._selectedIds()
    const known = new Set([NO_FACILITY_ID, ...all.map((f) => f.id)])
    let kept = current.filter((id) => known.has(id))
    if (all.length === 1) {
      kept = []
    } else if (this.legacySelection && all.length > 0 && all.every((f) => kept.includes(f.id))) {
      kept = []
    }
    const migrate = this.legacySelection
    this.legacySelection = false
    if (migrate || kept.length !== current.length) this.setSelection(kept)
  }

  /**
   * Drops the previous user's facilities and selection when the signed-in uid
   * differs from the one this state was built for. Called at the entry points
   * (`load`, `restoreSelection`), which every page using the scope goes through.
   */
  private syncOwner(): void {
    const uid = this.auth.authInfo()?.uid ?? null
    if (uid === this.ownerUid) return
    this.ownerUid = uid
    this._all.set([])
    this._selectedIds.set([])
    this._loaded.set(false)
    this._loading.set(false)
    this.restored = false
    this.legacySelection = false
  }

  // === Persistence (mirrors TableStateService key scoping) ===

  private scopedKey(): string {
    const uid = this.auth.authInfo()?.uid
    return uid ? `${uid}:${STORAGE_KEY}` : STORAGE_KEY
  }

  /**
   * Reads the persisted selection once, after auth has a uid to scope by —
   * not in a field initializer, where the uid may not be resolved yet and the
   * unscoped key would be read and then written back to the scoped one.
   * Order-independent from `load()`: if the list is already here, prune now.
   */
  restoreSelection(): void {
    this.syncOwner()
    if (this.restored) return
    this.restored = true
    this.readPersisted()
    if (this._loaded()) this.prune()
  }

  private readPersisted(): void {
    try {
      const raw = localStorage.getItem(this.scopedKey())
      const parsed = raw ? JSON.parse(raw) : null
      const legacy = Array.isArray(parsed)
      const ids: unknown = legacy ? parsed : parsed?.v === STORAGE_VERSION ? parsed.ids : null
      if (Array.isArray(ids)) {
        this.legacySelection = legacy
        this._selectedIds.set(ids.filter((v): v is string => typeof v === 'string'))
      }
    } catch {
      /* unreadable storage — start with an unrestricted scope */
    }
  }

  private persist(ids: string[]): void {
    try {
      localStorage.setItem(this.scopedKey(), JSON.stringify({ v: STORAGE_VERSION, ids }))
    } catch {
      /* storage unavailable (private mode, quota) — scope stays in-memory */
    }
  }
}
