import { Injectable, signal, computed } from '@angular/core';

// ─── Type Constants ───────────────────────────────────────────────────────────

/** Types that can only be placed inside an existing Area */
export const REQUIRE_AREA_TYPES = ['Bin', 'Hallway'] as const;

/** Types that can be placed freely anywhere on the grid */
export const FREE_TYPES = ['Wall', 'Conveyor', 'Pallet', 'Loc'] as const;

/** All placeable types shown in the draw popup */
export const ALL_TYPES = [...FREE_TYPES, ...REQUIRE_AREA_TYPES] as const;

/** Types that should NOT appear in the draw popup (created via toolbar/generate only) */
export const POPUP_EXCLUDED_TYPES = ['Zone', 'Area', 'Door', 'Hallway'] as const;

/** Location names that are system defaults and cannot be deleted */
export const DEFAULT_LOC_NAMES = ['REGULAR', 'HURT', 'STAGED'] as const;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DrawPopupState {
  /** Screen pixel position to anchor the popup */
  px: number;
  py: number;
  /** Grid coordinates of the drawn selection */
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  /** Which types are allowed at this position */
  types: string[];
}

export interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

export interface BeltPath {
  d: string;
  strokeWidth: number;
  stroke: string;
}

export interface GridItem {
  id: string;
  name: string;
  type: string;
  gw: number;
  gh: number;
  gx: number;
  gy: number;
  level: number;
  baseZ: number;
  selected?: boolean;
  /** Bay-only: storage category (REGULAR, HURT, PICKING, …) */
  category?: string;
  /** Bay-only: storage type tier (Floor-F, Low-L, …) */
  bayType?: string;
  /** Conveyor connections */
  connections?: { north: boolean; south: boolean; east: boolean; west: boolean };
  /** Area-only: custom starting number for rows (default: 1) */
  rowStart?: number;
  /** Area-only: custom starting number for columns/bays (default: 1) */
  colStart?: number;
  /** Area-only: column counting direction ('ltr' = left-to-right, 'rtl' = right-to-left) */
  colDir?: 'ltr' | 'rtl';
  /** Area-only: row counting direction ('ttb' = top-to-bottom, 'btt' = bottom-to-top) */
  rowDir?: 'ttb' | 'btt';
  /** Hallway-only: orientation */
  hallwayOrientation?: 'horizontal' | 'vertical';
  /**
   * When true, recomputeAllBayCodes will not overwrite this item's name/id.
   * Set automatically for Locs created via Generate or Arrow tool,
   * and when the user manually renames a Loc in the outliner.
   */
  locked?: boolean;
  /**
   * When true, the Loc is rendered at full cell size (no scale(0.82) padding).
   * Used for "area" body Locs.
   */
  fullScale?: boolean;
  /** Loc-only: numeric row number (used by batch editor; kept in sync with name) */
  locRow?: number;
  /** Loc-only: numeric column/bay number (used by batch editor; kept in sync with name) */
  locCol?: number;
  /** SVG rendering data */
  _svgRects?: WallRect[];
  _svgPaths?: BeltPath[];
  /** Loc-only: true when the Loc was brush-painted and has no name yet */
  unnamed?: boolean;
  /** Loc-only: zone UUID the location belongs to */
  zoneId?: string;
}

export interface GridFolder {
  id: string;
  name: string;
  collapsed: boolean;
  itemIds: string[];
}

export interface GridSelection {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

export interface HistorySnapshot {
  items: GridItem[];
  folders: GridFolder[];
}

/** Optional settings for {@link Warehouse2dStateService.addItem}. */
export interface AddItemOptions {
  /** Explicit id/name (defaults to an auto-generated id) */
  customId?: string;
  /** When true, a Hallway does not push overlapping items aside */
  skipReorder?: boolean;
  /** Loc-only: storage category */
  category?: string;
  /** Loc-only: storage type tier */
  bayType?: string;
  /** Loc-only: zone UUID */
  zoneId?: string;
}

/** Shape of a Loc entry inside the serialized saved-state snapshot */
type SerializedLoc = Pick<
  GridItem,
  'id' | 'name' | 'gx' | 'gy' | 'gw' | 'gh' | 'level' | 'category' | 'bayType' | 'zoneId'
>;

// ─── Geometry Helpers ─────────────────────────────────────────────────────────

type GridRect = Pick<GridItem, 'gx' | 'gy' | 'gw' | 'gh'>;

/** True when `inner` lies fully within `outer` (edges may touch). */
function isRectInside(inner: GridRect, outer: GridRect): boolean {
  return inner.gx >= outer.gx && inner.gy >= outer.gy &&
    inner.gx + inner.gw <= outer.gx + outer.gw &&
    inner.gy + inner.gh <= outer.gy + outer.gh;
}

/** Returns the axis-aligned bounding box of the given rects (must be non-empty). */
function boundingBox(rects: GridRect[]): GridRect {
  const minGx = Math.min(...rects.map(r => r.gx));
  const minGy = Math.min(...rects.map(r => r.gy));
  const maxGx = Math.max(...rects.map(r => r.gx + r.gw));
  const maxGy = Math.max(...rects.map(r => r.gy + r.gh));
  return { gx: minGx, gy: minGy, gw: maxGx - minGx, gh: maxGy - minGy };
}

/**
 * Describes the axis a hallway cuts across: a horizontal hallway occupies
 * rows (gy/gh) and is crossed by vertical hallways; a vertical one occupies
 * columns (gx/gw) and is crossed by horizontal hallways.
 */
interface HallwayAxis {
  pos: 'gx' | 'gy';
  size: 'gw' | 'gh';
  cross: 'horizontal' | 'vertical';
}

const HORIZONTAL_HALLWAY_AXIS: HallwayAxis = { pos: 'gy', size: 'gh', cross: 'vertical' };
const VERTICAL_HALLWAY_AXIS: HallwayAxis   = { pos: 'gx', size: 'gw', cross: 'horizontal' };

function hallwayAxis(orientation: string | undefined): HallwayAxis {
  return orientation === 'horizontal' ? HORIZONTAL_HALLWAY_AXIS : VERTICAL_HALLWAY_AXIS;
}

/** True when `item` is a perpendicular hallway that straddles grid line `line` on `axis`. */
function spansHallwayLine(item: GridItem, axis: HallwayAxis, line: number): boolean {
  return item.type === 'Hallway' &&
    item.hallwayOrientation === axis.cross &&
    item[axis.pos] < line &&
    item[axis.pos] + item[axis.size] > line;
}

const STANDARD_LOC_CODE_RE = /^([A-Z]{1,2})-(\d+)-(\d+)-([A-Z])$/;
const COMPACT_LOC_CODE_RE  = /^([A-Z]{1,2})(\d{2})-(\d{4})([A-Z])$/;
const LOC_AREA_PREFIX_RE   = /^([A-Z]{1,2})/;

interface HallwayResizeContext {
  hallway: GridItem;
  area: GridItem | undefined;
  axis: HallwayAxis;
  shiftAfter: boolean;
  boundary: number;
  delta: number;
  newThickness: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class Warehouse2dStateService {

  // ── Grid config ────────────────────────────────────────────────────────────
  readonly gridSize = 40; // Pixels per square foot

  // ── Grid dimensions ────────────────────────────────────────────────────────
  readonly gridWidth = signal<number>(100); // in feet
  readonly gridDepth = signal<number>(100);
  readonly activeLevelView = signal<string>('All');

  // ── Items & folders ────────────────────────────────────────────────────────
  readonly items = signal<GridItem[]>([]);
  readonly folders = signal<GridFolder[]>([]);

  maxZ = 10;
  minZ = 10;

  private itemCounter = 0;
  private folderCounter = 0;

  // ── Panel visibility (shared between toolbar and sidebar) ──────────────────
  readonly openPanels = signal<Set<string>>(new Set(['build']));

  // ── Async loading state (read by parent & canvas overlay) ──────────────────
  /** True while fetching the warehouse layout from the backend */
  readonly isLoadingLayout = signal(false);
  /** True while the save forkJoin (batch create / batch positions / sync) is in flight */
  readonly isSavingLayout  = signal(false);

  /**
   * IDs of Loc items that were loaded from the backend.
   * Used by the save logic to detect deletions (backend IDs no longer present).
   */
  readonly loadedLocIds = new Set<string>();

  // ── Saved-state tracking (dirty detection) ────────────────────────────────
  /**
   * Serialized snapshot of items at the last load/save point.
   * Used to detect if there are unsaved changes and which locs were modified.
   */
  private readonly _savedSnapshot = signal<string>('[]');

  /** True when the current canvas state differs from the last saved state */
  readonly hasUnsavedChanges = computed(() => {
    return this._serializeItems(this.items()) !== this._savedSnapshot();
  });

  /** Serialise only the fields relevant for change detection */
  private _serializeItems(items: GridItem[]): string {
    const locs = items
      .filter(i => i.type === 'Loc')
      .map(i => ({
        id: i.id, name: i.name, gx: i.gx, gy: i.gy, gw: i.gw, gh: i.gh,
        level: i.level, category: i.category, bayType: i.bayType, zoneId: i.zoneId,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const visual = items
      .filter(i => i.type !== 'Loc' && i.type !== 'Area' && i.type !== 'Zone')
      .map(i => ({
        id: i.id, type: i.type, gx: i.gx, gy: i.gy, gw: i.gw, gh: i.gh,
        name: i.name, connections: i.connections, hallwayOrientation: i.hallwayOrientation,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify({ locs, visual });
  }

  /** Call after a successful load or save to capture the "clean" state */
  markSaved(): void {
    this._savedSnapshot.set(this._serializeItems(this.items()));
  }

  /**
   * Sets the saved snapshot from external backend-state items so dirty detection
   * can compare the current (auto-positioned) state against what the backend actually has.
   */
  setBackendSnapshot(backendItems: GridItem[]): void {
    this._savedSnapshot.set(this._serializeItems(backendItems));
  }

  /**
   * Returns the IDs of existing locs whose relevant fields
   * (position, category, bayType) changed since the last save.
   */
  getDirtyExistingLocIds(): Set<string> {
    const saved = JSON.parse(this._savedSnapshot()) as { locs?: SerializedLoc[] };
    const savedMap = new Map<string, SerializedLoc>();
    for (const s of saved.locs ?? []) {
      savedMap.set(s.id, s);
    }
    const dirty = new Set<string>();
    for (const item of this.items()) {
      if (item.type !== 'Loc') continue;
      if (item.id === item.name) continue; // new loc — not "existing"
      const prev = savedMap.get(item.id);
      if (!prev) continue; // shouldn't happen but guard
      if (
        prev.gx !== item.gx || prev.gy !== item.gy ||
        prev.gw !== item.gw || prev.gh !== item.gh ||
        prev.level !== item.level ||
        prev.category !== item.category ||
        prev.bayType !== item.bayType ||
        prev.zoneId !== item.zoneId
      ) {
        dirty.add(item.id);
      }
    }
    return dirty;
  }

  // ── Taxonomy (loaded from API by the parent, shared across sub-components) ──
  readonly locationProfiles      = signal<{ code: string; name: string }[]>([]);
  readonly operationalCategories = signal<{ code: string }[]>([]);

  /** Storage types derived from API-loaded location profiles */
  readonly bayTypes = computed(() => {
    const profiles = this.locationProfiles();
    if (profiles.length > 0) {
      const seen = new Set<string>();
      return profiles
        .filter(p => {
          if (seen.has(p.code)) return false;
          seen.add(p.code);
          return true;
        })
        .map(p => ({ label: p.name, value: p.code }));
    }
    // Fallback while API hasn't loaded yet
    return [
      { label: 'Floor',  value: 'F' },
      { label: 'Low',    value: 'L' },
      { label: 'Mid',    value: 'M' },
      { label: 'Top',    value: 'T' },
    ];
  });

  /** Operational categories derived from API-loaded data */
  readonly bayCategories = computed(() => {
    const cats = this.operationalCategories();
    if (cats.length > 0) {
      return cats.map(c => c.code);
    }
    // Fallback while API hasn't loaded yet
    return ['REGULAR', 'HURT', 'PICKING'];
  });


  togglePanel(id: string): void {
    this.openPanels.update(set => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  openPanel(id: string): void {
    this.openPanels.update(set => { const next = new Set(set); next.add(id); return next; });
  }

  isPanelOpen(id: string): boolean {
    return this.openPanels().has(id);
  }

  // ── History ────────────────────────────────────────────────────────────────
  private history: HistorySnapshot[] = [];
  private readonly historyIndex = signal<number>(-1);

  readonly canUndo = computed(() => this.historyIndex() > 0);
  readonly canRedo = computed(() => this.historyIndex() < this.history.length - 1);

  // ── Tool state ─────────────────────────────────────────────────────────────
  readonly activeTool = signal<'arrow' | 'hand' | 'brush' | 'hallway'>('hand');
  readonly brushType = signal<string>('Wall');
  readonly brushSize = signal<'1x1' | 'shape' | 'custom'>('1x1');
  readonly brushCustomW = signal<number>(1);
  readonly brushCustomH = signal<number>(1);
  readonly brushShapeW = signal<number>(1);
  readonly brushShapeH = signal<number>(1);
  readonly creationMode = signal<'singular' | 'whole'>('whole');

  // ── Stats ──────────────────────────────────────────────────────────────────
  readonly totalLocCount = computed(() => 
    this.items().filter(i => i.type === 'Loc').length
  );

  /** Controls how Locs are created with the Arrow tool: one per cell or one unified body */
  readonly locArrowMode = signal<'singular' | 'body'>('singular');

  /** Width of automatically-inserted hallways (in grid cells). Min 1. */
  readonly hallwayWidth = signal<number>(1);

  /** Insert a hallway every N **columns** of Locs (generate). 0 = disabled. */
  readonly hallwayEveryCol = signal<number>(0);

  /** Insert a hallway every N **rows** of Locs (generate). 0 = disabled. */
  readonly hallwayEveryRow = signal<number>(2);

  /** Orientation used by the hallway tool. Toggled from the toolbar. */
  readonly hallwayOrientation = signal<'horizontal' | 'vertical'>('horizontal');

  /** @deprecated Use hallwayEveryCol / hallwayEveryRow instead */
  get hallwayEvery(): typeof this.hallwayEveryCol { return this.hallwayEveryCol; }

  /** Layer visibility: 'floor' | 'zones' | 'all' */
  readonly activeLayer = signal<'floor' | 'zones' | 'all'>('floor');

  /** When true, the warehouse is in read-only Picking Mode — editing is disabled */
  readonly pickingMode = signal<boolean>(false);

  /** When true, left-click pans the camera instead of interacting with items (picker pan lock) */
  readonly panLockMode = signal<boolean>(false);

  /** Temporary warning message shown as a toast/floating notification (auto-cleared) */
  readonly warningMessage = signal<string | null>(null);

  /**
   * Generate-preview ghost: when set, a draggable SVG ghost is shown on the viewport
   * so the user can position the generation before committing.
   */
  readonly generatePreview = signal<{
    gx: number;
    gy: number;
    gw: number;
    gh: number;
    label: string;
    /** Relative cell positions of each Loc (rel to gx/gy, 1-cell each) */
    locCells: Array<{ rx: number; ry: number }>;
    /** Relative positions and sizes of Hallway strips */
    hallways: Array<{ rx: number; ry: number; rw: number; rh: number }>;
    /** Full commit callback payload – opaque blob consumed by warehouse-planner */
    payload: unknown;
  } | null>(null);

  // ── Selection ──────────────────────────────────────────────────────────────
  readonly selectedItems = computed(() => this.items().filter(i => i.selected));

  /** Current empty selection drawn by the user (the blue box) */
  readonly emptySelection = signal<{ x: number; y: number; w: number; h: number } | null>(null);

  /** Draw-to-create popup state (set by viewport on mouseup, cleared on type pick or dismiss) */
  readonly drawPopup = signal<DrawPopupState | null>(null);

  // ── Viewport commands (sidebar → viewport communication) ───────────────────
  readonly centerViewport = signal<number>(0);
  readonly zoomTick = signal<{ dir: 'in' | 'out'; ts: number } | null>(null);
  /** When set, the viewport will scroll to center on this grid cell. */
  readonly scrollToCell = signal<{ gx: number; gy: number } | null>(null);

  zoomIn(): void  { this.zoomTick.set({ dir: 'in',  ts: Date.now() }); }
  zoomOut(): void { this.zoomTick.set({ dir: 'out', ts: Date.now() }); }

  /** Scroll the viewport to center on the given grid cell. */
  scrollTo(gx: number, gy: number): void {
    this.scrollToCell.set({ gx, gy });
  }

  // ── Overlap conflict detection ─────────────────────────────────────────────
  /** Set of item IDs that are currently in an overlap conflict */
  readonly overlapConflicts = signal<Set<string>>(new Set());

  // ── Unnamed Loc detection ─────────────────────────────────────────────────
  /** Computed: true when there are brush-painted Locs that haven't been named */
  readonly hasUnnamedLocs = computed(() =>
    this.items().some(i => i.type === 'Loc' && i.unnamed && !i.name?.trim())
  );

  /** Scans all items for same-level overlaps (ignoring Areas). Updates the signal. */
  detectOverlaps(): void {
    const items = this.items().filter(i => i.type !== 'Area');
    const conflictIds = new Set<string>();

    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const ia = items[a], ib = items[b];
        if (this.canConflict(ia, ib) && this.doOverlap(ia, ib)) {
          conflictIds.add(ia.id);
          conflictIds.add(ib.id);
        }
      }
    }

    const hadConflicts = this.overlapConflicts().size > 0;
    this.overlapConflicts.set(conflictIds);

    // Only scroll to first conflict when NEW conflicts appear
    if (!hadConflicts && conflictIds.size > 0) {
      const firstId = [...conflictIds][0];
      const firstItem = this.items().find(i => i.id === firstId);
      if (firstItem) {
        this.scrollTo(firstItem.gx, firstItem.gy);
      }
    }
  }

  /** Whether two items are eligible to be reported as an overlap conflict. */
  private canConflict(ia: GridItem, ib: GridItem): boolean {
    // Any overlap involving a Hallway is normal (Hallway+Loc, Hallway+Hallway) — skip
    if (ia.type === 'Hallway' || ib.type === 'Hallway') return false;
    // For Loc-vs-Loc: same area can stack on different levels, different areas always conflict
    if (ia.type === 'Loc' && ib.type === 'Loc') {
      const aArea = LOC_AREA_PREFIX_RE.exec(ia.name)?.[1] ?? '';
      const bArea = LOC_AREA_PREFIX_RE.exec(ib.name)?.[1] ?? '';
      // Same area: only conflict at same level
      if (aArea && bArea && aArea === bArea) return ia.level === ib.level;
      // Different areas: always check overlap (any level)
      return true;
    }
    // Non-Loc items: only check same level
    return ia.level === ib.level;
  }

  // ── Area ↔ Loc integrity ──────────────────────────────────────────────────
  /**
   * 1. Removes Areas that contain no Locs.
   * 2. Creates a 1×1 Area for any Loc that is not inside any Area.
   */
  enforceAreaLocIntegrity(): void {
    let items = this.items();
    const areas = items.filter(i => i.type === 'Area');
    const locs  = items.filter(i => i.type === 'Loc');

    // ── Step 1: remove empty Areas ──────────────────────────────────────
    const emptyAreaIds = new Set<string>();
    for (const area of areas) {
      const hasLoc = locs.some(loc => isRectInside(loc, area));
      if (!hasLoc) {
        emptyAreaIds.add(area.id);
      }
    }

    if (emptyAreaIds.size > 0) {
      items = items.filter(i => !emptyAreaIds.has(i.id));
    }

    // ── Step 2: create Areas for orphan Locs (duplicate original Area) ───
    const remainingAreas = items.filter(i => i.type === 'Area');
    const newItems: GridItem[] = [];

    for (const loc of locs) {
      const hasArea = remainingAreas.some(area => isRectInside(loc, area));
      if (!hasArea) {
        // Find the original Area by matching the Loc's name prefix
        const parsed = this.parseLocationCode(loc.name);
        const sourceArea = parsed
          ? areas.find(a => a.name === parsed.area)
          : undefined;

        this.maxZ++;
        const areaId = this.generateId('Area');
        newItems.push({
          id: areaId,
          name:     sourceArea?.name     ?? this.nextAreaName(),
          type: 'Area',
          gx: loc.gx, gy: loc.gy, gw: 1, gh: 1,
          level: loc.level,
          baseZ: this.maxZ,
          selected: false,
          rowStart: sourceArea?.rowStart,
          colStart: sourceArea?.colStart,
          colDir:   sourceArea?.colDir,
          rowDir:   sourceArea?.rowDir,
        });
      }
    }

    if (emptyAreaIds.size > 0 || newItems.length > 0) {
      this.items.set([...items, ...newItems]);
    }
  }

  /**
   * Incremented by the viewport when the user clicks "Place" on the preview ghost.
   * warehouse-planner.ts watches this with an effect and calls onConfirmPreview().
   */
  readonly commitGeneratePreview = signal<number>(0);

  confirmGeneratePreview(): void {
    this.commitGeneratePreview.update(n => n + 1);
  }

  // ── Location list import state ─────────────────────────────────────────────
  readonly locationListText = signal<string>('');
  readonly locationListOrientation = signal<'horizontal' | 'vertical'>('horizontal');

  // ── Nomenclature format ────────────────────────────────────────────────────
  /** How location codes are displayed: 'standard' | 'compact' | 'custom' */
  readonly nomenclatureFormat = signal<'standard' | 'compact' | 'custom'>('standard');

  /** Custom template string. Placeholders: {A}=area, {C}=col(2d), {R}=row(4d), {L}=level */
  readonly nomenclatureCustom = signal<string>('{A}-{C}-{R}-{L}');

  // ── Lookup data (passed from LocationsComponent for the Save-to-Backend flow) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly warehouseAccounts   = signal<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly warehouseZones      = signal<any[]>([]);
  /** Active facility ID — set by parent to scope zones */
  readonly facilityId = signal<string>('');
  /** Zones dropdown: [{label, value}] — filtered by the active facility */
  readonly zoneOptions = computed(() => {
    const fId = this.facilityId();
    const filtered = fId
      ? this.warehouseZones().filter(z => z.facility_id === fId)
      : this.warehouseZones();
    return [
      { label: '— None —', value: '' },
      ...filtered.map(z => ({ label: z.name, value: z.id })),
    ];
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly warehouseCategories = signal<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly warehouseTypeBins   = signal<any[]>([]);

  // ──────────────────────────────────────────────────────────────────────────
  constructor() {
    // Capture initial snapshot so undo is always available
    this.saveHistory();
  }

  /**
   * Returns the next available area name by scanning existing Area items.
   * Increments alphabetically: A → B → C → … → Z → AA → AB → …
   */
  nextAreaName(): string {
    const areaNames = this.items()
      .filter(i => i.type === 'Area' && i.name)
      .map(i => i.name.toUpperCase());

    if (areaNames.length === 0) return 'A';

    // Sort alphabetically (length first, then lexicographic)
    areaNames.sort((a, b) => a.length - b.length || a.localeCompare(b));
    const last = areaNames.at(-1)!;

    return this._incrementAlpha(last);
  }

  /** Increments an alphabetical string: A→B, Z→AA, AZ→BA, ZZ→AAA */
  private _incrementAlpha(s: string): string {
    const chars = s.split('');
    let carry = true;
    for (let i = chars.length - 1; i >= 0 && carry; i--) {
      if (chars[i] === 'Z') {
        chars[i] = 'A';
      } else {
        chars[i] = String.fromCodePoint(chars[i].codePointAt(0)! + 1);
        carry = false;
      }
    }
    if (carry) chars.unshift('A'); // ZZ → AAA
    return chars.join('');
  }

  // ─── Nomenclature ─────────────────────────────────────────────────────────

  /**
   * Formats a location code from its raw components applying the current
   * nomenclature format and zero-padding rules:
   *   Area  – 1–2 uppercase chars (stored as-is)
   *   Col   – zero-padded to 2 digits (00–99)
   *   Row   – zero-padded to 4 digits (0000–9999)
   *   Level – 1 uppercase letter (A–Z)
   */

  /**
   * Scans existing Loc items for a given area prefix and returns
   * the max col and max row found. Returns null if no Locs exist
   * for that area.
   */
  getAreaMaxColRow(areaCode: string): { maxCol: number; maxRow: number } | null {
    const prefix = areaCode.toUpperCase().trim();
    if (!prefix) return null;

    let maxCol = 0;
    let maxRow = 0;
    let found  = false;

    for (const item of this.items()) {
      if (item.type !== 'Loc') continue;
      const parsed = this.parseLocationCode(item.name);
      if (parsed?.area !== prefix) continue;
      found = true;
      if (parsed.col > maxCol) maxCol = parsed.col;
      if (parsed.row > maxRow) maxRow = parsed.row;
    }

    return found ? { maxCol, maxRow } : null;
  }

  formatLocationCode(area: string, col: number, row: number, levelLetter: string): string {
    const areaP = area.toUpperCase().slice(0, 2);
    const colP  = col.toString().padStart(2, '0');
    const rowP  = row.toString().padStart(4, '0');
    const lvl   = levelLetter.toUpperCase().slice(0, 1);

    switch (this.nomenclatureFormat()) {
      case 'compact':
        return `${areaP}${colP}-${rowP}${lvl}`;
      case 'custom': {
        const t = this.nomenclatureCustom();
        return t
          .replaceAll('{A}', areaP)
          .replaceAll('{C}', colP)
          .replaceAll('{R}', rowP)
          .replaceAll('{L}', lvl);
      }
      default: // 'standard'
        return `${areaP}-${colP}-${rowP}-${lvl}`;
    }
  }

  /**
   * Parses a formatted location code back into its components.
   * Handles 'standard' and 'compact' formats. Returns null for unparseable codes.
   */
  parseLocationCode(name: string): { area: string; col: number; row: number; level: string } | null {
    // Custom: attempt standard pattern as best-effort fallback
    const pattern = this.nomenclatureFormat() === 'compact' ? COMPACT_LOC_CODE_RE : STANDARD_LOC_CODE_RE;
    const m = pattern.exec(name);
    if (!m) return null;
    return { area: m[1], col: Number.parseInt(m[2], 10), row: Number.parseInt(m[3], 10), level: m[4] };
  }

  /**
   * Rebuilds the name/id of a Loc from its `locRow` and `locCol` fields.
   * Falls back to parsing the existing name if the fields are absent.
   * Used by the batch row/col editor in the planner panel.
   */
  rebuildLocName(item: GridItem): string {
    const parsed = this.parseLocationCode(item.name);
    if (!parsed) return item.name; // unparseable — leave untouched

    const col         = item.locCol ?? parsed.col;
    const row         = item.locRow ?? parsed.row;
    const levelLetter = parsed.level;
    const area        = parsed.area;

    return this.formatLocationCode(area, col, row, levelLetter);
  }

  /**
   * Renames a single Area item AND updates the area prefix of the Locs
   * contained within it. E.g. renaming area from "SU" to "QQ" changes
   * loc "SU-05-0003-A" to "QQ-05-0003-A".
   */
  renameAreaWithLocs(areaId: string, newName: string): void {
    const items = this.items();
    const area  = items.find(i => i.id === areaId && i.type === 'Area');
    if (!area) return;

    const oldName = area.name;
    if (oldName === newName) return;

    // Find Locs contained within this specific area's bounds
    const containedLocIds = new Set<string>();
    for (const loc of items) {
      if (loc.type !== 'Loc') continue;
      if (isRectInside(loc, area)) {
        containedLocIds.add(loc.id);
      }
    }

    this.items.update(all => all.map(i => {
      // Update only this area
      if (i.id === areaId) {
        return { ...i, name: newName };
      }
      // Update contained Locs: replace area prefix in their name
      if (containedLocIds.has(i.id)) {
        const parsed = this.parseLocationCode(i.name);
        if (parsed?.area === oldName) {
          const newCode = this.formatLocationCode(newName, parsed.col, parsed.row, parsed.level);
          return { ...i, name: newCode };
        }
      }
      return i;
    }));
  }

  // ─── History ──────────────────────────────────────────────────────────────

  saveHistory(): void {
    // Always sync Bay codes before taking a snapshot so the history always stores correct codes
    this.recomputeAllBayCodes();
    // Re-check for overlap conflicts on every state change
    this.detectOverlaps();
    // Ensure every Area has Locs and every Loc has an Area
    this.enforceAreaLocIntegrity();

    const snapshot: HistorySnapshot = {
      items:   structuredClone(this.items()),
      folders: structuredClone(this.folders())
    };

    if (this.historyIndex() < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex() + 1);
    }

    this.history.push(snapshot);
    if (this.history.length > 50) this.history.shift();
    this.historyIndex.set(this.history.length - 1);
  }

  undo(): void {
    if (this.historyIndex() > 0) {
      this.historyIndex.update(i => i - 1);
      const prev = this.history[this.historyIndex()];
      this.items.set(structuredClone(prev.items));
      this.folders.set(structuredClone(prev.folders));
    }
  }

  redo(): void {
    if (this.historyIndex() < this.history.length - 1) {
      this.historyIndex.update(i => i + 1);
      const next = this.history[this.historyIndex()];
      this.items.set(structuredClone(next.items));
      this.folders.set(structuredClone(next.folders));
    }
  }

  // ─── Bay Code Computation ─────────────────────────────────────────────────

  /**
   * Re-derives the location code for every Loc item based on its current
   * position within its containing Area. Called before each history snapshot
   * so any move/resize/rename automatically keeps codes in sync.
   *
   * Works entirely from a local snapshot (no reactive reads inside the loop)
   * to avoid circular signal updates.
   */
  recomputeAllBayCodes(): void {
    const snapshot = this.items();
    const areas    = snapshot.filter(i => i.type === 'Area');

    let changed = false;
    const updated = snapshot.map(item => {
      if (item.type !== 'Loc') return item;
      if (item.locked) return item; // user-assigned code — do not overwrite
      if (item.unnamed) return item; // brush-painted — user must name it

      // Find the Area that fully contains this Loc
      const area = areas.find(a => isRectInside(item, a));
      if (!area) return item; // Loc not inside any area — keep existing name

      const newCode = this.computeBayCode(area, item.gx, item.gy, item.level);

      if (newCode === item.id && newCode === item.name) return item;

      changed = true;
      return { ...item, name: newCode, id: newCode };
    });

    if (changed) {
      this.items.set(updated);
    }
  }

  // ─── Item Management ──────────────────────────────────────────────────────

  generateId(type: string): string {
    this.itemCounter++;
    return `${type}_${this.itemCounter}`;
  }

  addItem(
    type: string,
    gx: number,
    gy: number,
    gw: number,
    gh: number,
    level: number = 1,
    options: AddItemOptions = {},
  ): GridItem {
    const { customId, skipReorder = false, category, bayType, zoneId } = options;
    this.maxZ++;
    const autoId  = this.generateId(type);
    const finalId = customId ?? autoId;

    const newItem: GridItem = {
      id: finalId,
      name: finalId,
      type,
      gx, gy, gw, gh,
      level,
      baseZ: this.maxZ,
      selected: false,
      category:    type === 'Loc'      ? (category || 'REGULAR')                               : undefined,
      bayType:     type === 'Loc'      ? (bayType  || 'F')                                     : undefined,
      zoneId:      type === 'Loc'      ? (zoneId   || undefined)                               : undefined,
      connections: type === 'Conveyor' ? { north: true, south: true, east: true, west: true } : undefined
    };

    // Only Hallways push other items aside when placed (unless skipReorder is set)
    if (type === 'Hallway' && !skipReorder) {
      this.reorderItems(newItem, gx, gy, gw, gh, level);
    }
    this.items.update(items => [...items, newItem]);

    // Check for overlaps created by the push (e.g. loc pushed into a wall)
    if (type === 'Hallway' && !skipReorder) {
      this.detectOverlaps();
    }
    return newItem;
  }

  /**
   * Shrinks every Area to the tight bounding box of the Locs it contains.
   * Areas with no Locs inside remain unchanged.
   * Call after loading data, creating locs, or deleting locs.
   */
  fitAreasToLocs(): void {
    const items = this.items();
    const areas = items.filter(i => i.type === 'Area');
    const locs  = items.filter(i => i.type === 'Loc');

    if (areas.length === 0 || locs.length === 0) return;

    const updates = new Map<string, { gx: number; gy: number; gw: number; gh: number }>();
    /** Area IDs to remove (replaced by split sub-areas) */
    const removals = new Set<string>();
    /** New sub-area items to add */
    const additions: GridItem[] = [];

    for (const area of areas) {
      // Find all Locs whose position falls within this area
      const contained = locs.filter(loc => isRectInside(loc, area));
      if (contained.length === 0) continue;

      const bands = this.groupLocsIntoRowBands(contained);

      if (bands.length === 1) {
        // Single band — just update the existing area bounds
        const box = boundingBox(bands[0]);
        if (box.gx !== area.gx || box.gy !== area.gy || box.gw !== area.gw || box.gh !== area.gh) {
          updates.set(area.id, box);
        }
      } else {
        // Multiple bands — replace the original area with sub-areas
        removals.add(area.id);
        bands.forEach((bandLocs, idx) => {
          const box = boundingBox(bandLocs);
          additions.push({
            id:    `${area.id}-${idx}`,
            name:  area.name,
            type:  'Area',
            gx:    box.gx,
            gy:    box.gy,
            gw:    box.gw,
            gh:    box.gh,
            level: 1,
            baseZ: 1,
          });
        });
      }
    }

    if (updates.size === 0 && removals.size === 0) return;

    this.items.update(all => {
      let result = all
        .filter(i => !removals.has(i.id))
        .map(i => {
          const upd = updates.get(i.id);
          return upd ? { ...i, ...upd } : i;
        });
      if (additions.length > 0) {
        result = [...result, ...additions];
      }
      return result;
    });
  }

  /**
   * Groups Locs by their gy row and splits the sorted rows into contiguous
   * row-bands. Returns the Locs of each band, top to bottom.
   */
  private groupLocsIntoRowBands(locs: GridItem[]): GridItem[][] {
    const rowMap = new Map<number, GridItem[]>();
    for (const loc of locs) {
      const arr = rowMap.get(loc.gy) ?? [];
      arr.push(loc);
      rowMap.set(loc.gy, arr);
    }
    const sortedRows = [...rowMap.keys()].sort((a, b) => a - b);

    const bands: number[][] = [];
    let currentBand: number[] = [];
    for (const row of sortedRows) {
      if (currentBand.length === 0 || row === currentBand.at(-1)! + 1) {
        currentBand.push(row);
      } else {
        bands.push(currentBand);
        currentBand = [row];
      }
    }
    if (currentBand.length > 0) bands.push(currentBand);

    return bands.map(band => band.flatMap(row => rowMap.get(row) ?? []));
  }

  /**
   * Pushes items away if they overlap with a newly placed or moved item.
   * Similar to how hallways shift items, but for any item type.
   */
  private reorderItems(
    newItem: GridItem,
    gx: number,
    gy: number,
    gw: number,
    gh: number,
    level: number
  ): void {
    const currentItems = this.items();
    // Only affect items on the same level (unless level is 1 which acts as base)
    const affected = currentItems.filter(i =>
      i.id !== newItem.id &&
      i.type !== 'Area' &&
      i.type !== 'Wall' &&
      i.type !== 'Hallway' &&  // Hallways can overlap — never push them
      // Multi-level Locs share the same gx/gy — don't push sibling levels
      !(i.type === 'Loc' && newItem.type === 'Loc' && i.level !== level &&
        i.gx === gx && i.gy === gy) &&
      (i.level === level || i.level === 1) &&
      this.doOverlap(i, { gx, gy, gw, gh })
    );

    if (affected.length === 0) return;

    // Horizontal hallway → push overlapping items DOWN
    // Vertical hallway (or anything else) → push overlapping items RIGHT
    const pushDown = newItem.hallwayOrientation === 'horizontal' || gw > gh;

    this.items.update(items => items.map(i => {
      if (i.id === newItem.id || i.type === 'Area' || i.type === 'Wall' || i.type === 'Hallway' || (i.level !== level && i.level !== 1)) return i;

      if (this.doOverlap(i, { gx, gy, gw, gh })) {
        if (pushDown) {
          return { ...i, gy: i.gy + gh };
        } else {
          return { ...i, gx: i.gx + gw };
        }
      }
      return i;
    }));
  }

  private doOverlap(a: { gx: number, gy: number, gw: number, gh: number }, b: { gx: number, gy: number, gw: number, gh: number }): boolean {
    return a.gx < b.gx + b.gw && a.gx + a.gw > b.gx &&
           a.gy < b.gy + b.gh && a.gy + a.gh > b.gy;
  }

  /**
   * Pushes other items away when a selection is moved.
   * Finds the bounding box of the moved selection and pushes anything it overlaps.
   */
  reorderSelected(): void {
    const selected = this.selectedItems();
    if (selected.length === 0) return;

    // Calculate bounding box of selection
    const box = boundingBox(selected);

    // Find items to push (not in selection, same level, overlap box)
    const level = selected[0].level;
    this.items.update(items => items.map(i => {
      if (i.selected || i.type === 'Area' || (i.level !== level && i.level !== 1)) return i;

      if (this.doOverlap(i, box)) {
        // Push right by the width of the box
        return { ...i, gx: i.gx + box.gw };
      }
      return i;
    }));
  }

  deleteSelected(): void {
    if (this.selectedItems().length === 0) return;

    // Never delete default locs (REGULAR, HURT, STAGED)
    const protectedIds = new Set(
      this.items()
        .filter(i => i.selected && this.isDefaultLoc(i))
        .map(i => i.id)
    );
    if (protectedIds.size > 0) {
      // Deselect protected items so they are not affected
      this.items.update(items => items.map(i =>
        protectedIds.has(i.id) ? { ...i, selected: false } : i
      ));
    }

    // Re-check: if nothing remains selected after excluding defaults, bail out
    if (this.selectedItems().length === 0) return;

    // Handle hallway deletion specially — collapse items around it
    const selectedHallways = this.selectedItems().filter(i => i.type === 'Hallway');
    selectedHallways.forEach(hallway => this.removeHallway(hallway.id));

    // Delete non-hallway items
    this.items.update(items => items.filter(i => !i.selected || i.type === 'Hallway'));
    const remainingIds = new Set(this.items().map(i => i.id));
    this.folders.update(folders => folders.map(f => ({
      ...f,
      itemIds: f.itemIds.filter(id => remainingIds.has(id))
    })));

    // Shrink areas to fit remaining locs
    this.fitAreasToLocs();

    // Only save history if we didn't delete any hallways (removeHallway already saves)
    if (selectedHallways.length === 0) {
      this.saveHistory();
    }
  }

  clearSelection(): void {
    this.items.update(items => items.map(i => ({ ...i, selected: false })));
  }

  setItems(newItems: GridItem[], markAsClean = true): void {
    this.items.set(newItems);
    this.fitAreasToLocs();
    this.saveHistory();

    // Snapshot backend-origin Loc IDs (id !== name means UUID from server)
    this.loadedLocIds.clear();
    for (const item of newItems) {
      if (item.type === 'Loc' && item.id !== item.name) {
        this.loadedLocIds.add(item.id);
      }
    }

    // Capture the saved state so we can detect unsaved changes later
    if (markAsClean) {
      this.markSaved();
    }
  }

  duplicateSelected(levelTarget?: number): void {
    const selected = this.items().filter(i => i.selected);
    if (selected.length === 0) return;

    // Coerce to number (ngModel may pass a string)
    const targetLevel = levelTarget === undefined ? undefined : +levelTarget;

    const clones: GridItem[] = selected.map(item => {
      this.maxZ++;
      const isDupToLevel = targetLevel !== undefined;
      const offsetX      = isDupToLevel ? 0 : item.gw + 3;
      const cloneLvl     = isDupToLevel ? targetLevel : item.level;

      const newId = `${item.type}_${++this.itemCounter}`;
      return {
        ...item,
        id: newId,
        name: newId,
        gx: item.gx + offsetX,
        gy: item.gy,
        level: cloneLvl,
        baseZ: this.maxZ,
        selected: true,
        connections: item.connections ? { ...item.connections } : undefined
      };
    });

    this.items.update(items => [
      ...items.map(i => ({ ...i, selected: false })),
      ...clones
    ]);
    this.saveHistory();
  }

  divideSelected(): void {
    const selected = this.items().filter(i => i.selected && (i.gw > 1 || i.gh > 1));
    if (selected.length === 0) return;

    const newItems: GridItem[] = [];
    selected.forEach(item => {
      for (let y = item.gy; y < item.gy + item.gh; y++) {
        for (let x = item.gx; x < item.gx + item.gw; x++) {
          this.maxZ++;
          const autoId       = this.generateId(item.type);
          const locationCode = item.type === 'Loc'
            ? (this.generateBayCode(x, y, 1, 1, item.level) ?? autoId)
            : autoId;

          newItems.push({
            id: locationCode,
            name: locationCode,
            type: item.type,
            gx: x, gy: y, gw: 1, gh: 1,
            level: item.level,
            baseZ: this.maxZ,
            selected: false
          });
        }
      }
    });

    this.items.update(items => [...items.filter(i => !i.selected), ...newItems]);
    this.saveHistory();
  }

  bringToFront(): void {
    this.maxZ++;
    this.items.update(items => items.map(i => i.selected ? { ...i, baseZ: this.maxZ } : i));
    this.saveHistory();
  }

  sendToBack(): void {
    this.minZ--;
    this.items.update(items => items.map(i => i.selected ? { ...i, baseZ: this.minZ } : i));
    this.saveHistory();
  }

  toggleConveyorConnection(itemId: string, direction: 'north' | 'south' | 'east' | 'west'): void {
    this.items.update(items => items.map(i => {
      if (i.id !== itemId || !i.connections) return i;
      return { ...i, connections: { ...i.connections, [direction]: !i.connections[direction] } };
    }));
    this.saveHistory();
  }

  // ─── Surrounding Objects ──────────────────────────────────────────────────

  /**
   * Calculates the bounding box of selected items and creates a 1-cell thick
   * border of Walls around it.
   */
  createWallsAround(): void {
    this._createSurrounding('Wall');
  }

  /**
   * Calculates the bounding box of selected items and creates a 1-cell thick
   * border of Hallways around it.
   */
  createHallwaysAround(): void {
    this._createSurrounding('Hallway');
  }

  private _createSurrounding(type: string): void {
    const selected = this.selectedItems();
    if (selected.length === 0) return;

    // 1. Calculate bounding box
    const bounds = boundingBox(selected);

    // 2. Define the outer frame (1 cell larger in all directions)
    const frame = {
      x: bounds.gx - 1,
      y: bounds.gy - 1,
      w: bounds.gw + 2,
      h: bounds.gh + 2
    };

    // Prevent negative coordinates
    if (frame.x < 0) { frame.w += frame.x; frame.x = 0; }
    if (frame.y < 0) { frame.h += frame.y; frame.y = 0; }

    const lvFilter = this.activeLevelView();
    const lvl = lvFilter === 'All' ? 1 : (Number.parseInt(lvFilter) || 1);

    // 3. Create 4 strips to form the border
    // Top
    this.addItem(type, frame.x, frame.y, frame.w, 1, lvl);
    // Bottom
    this.addItem(type, frame.x, frame.y + frame.h - 1, frame.w, 1, lvl);
    // Left (excluding corners already covered by top/bottom)
    if (frame.h > 2) {
      this.addItem(type, frame.x, frame.y + 1, 1, frame.h - 2, lvl);
      // Right
      this.addItem(type, frame.x + frame.w - 1, frame.y + 1, 1, frame.h - 2, lvl);
    }

    this.saveHistory();
  }

  // ─── Hallway Management ───────────────────────────────────────────────────

  /**
   * Inserts a hallway at a specific grid line within an Area.
   * - Shifts all items on one side of the line
   * - Expands the Area to accommodate the hallway
   * - Creates a hallway object spanning the full Area dimension
   */
  insertHallway(
    areaId: string,
    gridLine: number,
    orientation: 'horizontal' | 'vertical',
    hallwayWidth: number = 1
  ): void {
    const area = this.items().find(i => i.id === areaId && i.type === 'Area');
    if (!area) return;

    const axis        = hallwayAxis(orientation);
    const itemsInArea = this.itemsInsideArea(area);

    this.maxZ++;

    const shiftedItems = itemsInArea.map(item => {
      if (item[axis.pos] >= gridLine) return { ...item, [axis.pos]: item[axis.pos] + hallwayWidth };
      if (spansHallwayLine(item, axis, gridLine)) return { ...item, [axis.size]: item[axis.size] + hallwayWidth };
      return item;
    });

    // The hallway spans the full Area on one axis and `hallwayWidth` cells on the other
    const hallway: GridItem = {
      id: `Hallway_${++this.itemCounter}`,
      name: `Hallway_${this.itemCounter}`,
      type: 'Hallway',
      gx: area.gx, gy: area.gy,
      gw: area.gw, gh: area.gh,
      level: area.level,
      baseZ: this.maxZ,
      hallwayOrientation: orientation
    };
    hallway[axis.pos]  = gridLine;
    hallway[axis.size] = hallwayWidth;

    const expandedArea = { ...area, [axis.size]: area[axis.size] + hallwayWidth };

    this.items.update(items =>
      items.map(i => {
        if (i.id === areaId) return expandedArea;
        return shiftedItems.find(s => s.id === i.id) ?? i;
      }).concat(hallway)
    );

    this.saveHistory();
  }

  /**
   * Removes a hallway and collapses the Area and items to fill the gap.
   * - Shifts all items on one side back toward the hallway position
   * - Shrinks the Area to remove the hallway space
   */
  removeHallway(hallwayId: string): void {
    const hallway = this.items().find(i => i.id === hallwayId && i.type === 'Hallway');
    if (!hallway) return;

    const axis         = hallwayAxis(hallway.hallwayOrientation);
    const hallwayWidth = hallway[axis.size];

    const area = this.findAreaContaining(hallway);
    if (!area) {
      // Free-standing hallway (not inside any area) — just remove it directly
      this.items.update(items => items.filter(i => i.id !== hallwayId));
      this.saveHistory();
      return;
    }

    this.collapseHallway(hallway, area, axis, hallwayWidth);
    this.saveHistory();
  }

  /**
   * Adjusts a hallway's thickness (the axis perpendicular to its orientation)
   * and shifts neighboring items + the containing Area to match.
   *
   * @param hallwayId       ID of the hallway being resized
   * @param newThickness    New thickness in grid cells (min 1)
   * @param resizeDir       The resize direction used ('n' | 's' | 'e' | 'w')
   */
  resizeHallway(hallwayId: string, newThickness: number, resizeDir: string): void {
    const hallway = this.items().find(i => i.id === hallwayId && i.type === 'Hallway');
    if (!hallway) return;

    const isHorizontal = hallway.hallwayOrientation === 'horizontal';
    const axis         = hallwayAxis(hallway.hallwayOrientation);
    const oldThickness = hallway[axis.size];
    const delta = newThickness - oldThickness;
    if (delta === 0) return;

    // Horizontal: 's' grows/shrinks downward (shift items below the bottom edge),
    //             'n' grows/shrinks upward   (shift items above the top edge).
    // Vertical:   same logic on the X axis with 'e' / 'w'.
    const shiftAfter = resizeDir === (isHorizontal ? 's' : 'e');
    const ctx: HallwayResizeContext = {
      hallway,
      area: this.findAreaContaining(hallway),
      axis,
      shiftAfter,
      boundary: shiftAfter ? hallway[axis.pos] + oldThickness : hallway[axis.pos],
      delta,
      newThickness,
    };

    this.items.update(items => items.map(i => this.applyHallwayResize(i, ctx)));

    this.saveHistory();
  }

  /** Returns `i` adjusted for a hallway resize described by `ctx` (or `i` itself if unaffected). */
  private applyHallwayResize(i: GridItem, ctx: HallwayResizeContext): GridItem {
    const { hallway, area, axis, shiftAfter, boundary, delta, newThickness } = ctx;
    const { pos, size } = axis;

    // Update the hallway itself
    if (i.id === hallway.id) {
      return shiftAfter
        ? { ...i, [size]: newThickness }
        : { ...i, [pos]: hallway[pos] - delta, [size]: newThickness };
    }
    if (!area) return i;

    // Expand/shrink the area
    if (i.id === area.id) {
      return shiftAfter
        ? { ...i, [size]: i[size] + delta }
        : { ...i, [pos]: i[pos] - delta, [size]: i[size] + delta };
    }

    // Only items inside the area on the affected side are shifted
    if (!isRectInside(i, area)) return i;
    if (shiftAfter && i[pos] >= boundary) return { ...i, [pos]: i[pos] + delta };
    if (!shiftAfter && i[pos] < boundary) return { ...i, [pos]: i[pos] - delta };
    // Stretch perpendicular hallways that span the boundary
    if (spansHallwayLine(i, axis, boundary)) return { ...i, [size]: i[size] + delta };
    return i;
  }

  /**
   * Moves a Hallway to a new grid line within its containing Area.
   * Atomic remove-then-insert:
   *   1. Remove the hallway (collapse neighbours to fill the gap)
   *   2. Re-insert at `newGridLine` (shift neighbours to make room)
   * The hallway orientation and width are preserved.
   */
  moveHallway(hallwayId: string, newGridLine: number): void {
    const hallway = this.items().find(i => i.id === hallwayId && i.type === 'Hallway');
    if (!hallway) return;

    const orientation  = hallway.hallwayOrientation ?? 'horizontal';
    const axis         = hallwayAxis(orientation);
    const hwWidth      = hallway[axis.size];

    // Find the containing Area
    const area = this.findAreaContaining(hallway);
    if (!area) return;

    // ── Step 1: collapse (same logic as removeHallway, no extra saveHistory) ──
    const shrunkArea = this.collapseHallway(hallway, area, axis, hwWidth);

    // ── Step 2: re-insert at the new position ──
    // Clamp so the hallway stays inside the (now-shrunk) area
    const clampedLine = Math.max(
      shrunkArea[axis.pos],
      Math.min(newGridLine, shrunkArea[axis.pos] + shrunkArea[axis.size])
    );

    // insertHallway already calls saveHistory()
    this.insertHallway(shrunkArea.id, clampedLine, orientation, hwWidth);
  }

  /** Items fully inside `area`, excluding the area itself and `excludeId` (if given). */
  private itemsInsideArea(area: GridItem, excludeId?: string): GridItem[] {
    return this.items().filter(i =>
      i.id !== area.id && i.id !== excludeId && isRectInside(i, area)
    );
  }

  /**
   * Removes `hallway` from `area`: shifts the items past it back by `width`,
   * shrinks perpendicular hallways that crossed it, and shrinks the Area.
   * Does not save history. Returns the shrunk Area.
   */
  private collapseHallway(hallway: GridItem, area: GridItem, axis: HallwayAxis, width: number): GridItem {
    const line = hallway[axis.pos];
    const collapsedItems = this.itemsInsideArea(area, hallway.id).map(item => {
      if (item[axis.pos] > line) return { ...item, [axis.pos]: item[axis.pos] - width };
      if (spansHallwayLine(item, axis, line)) return { ...item, [axis.size]: item[axis.size] - width };
      return item;
    });

    const shrunkArea = { ...area, [axis.size]: area[axis.size] - width };

    // Remove hallway, shrink area, shift neighbours
    this.items.update(items =>
      items.filter(i => i.id !== hallway.id).map(i => {
        if (i.id === area.id) return shrunkArea;
        return collapsedItems.find(c => c.id === i.id) ?? i;
      })
    );
    return shrunkArea;
  }

  // ─── Folder Management ────────────────────────────────────────────────────


  addFolder(): GridFolder {
    this.folderCounter++;
    const folder: GridFolder = {
      id: `folder_${this.folderCounter}`,
      name: `Folder ${this.folderCounter}`,
      collapsed: false,
      itemIds: []
    };
    this.folders.update(f => [...f, folder]);
    this.saveHistory();
    return folder;
  }

  removeFolder(folderId: string): void {
    this.folders.update(f => f.filter(folder => folder.id !== folderId));
    this.saveHistory();
  }

  toggleFolderCollapse(folderId: string): void {
    this.folders.update(folders =>
      folders.map(f => f.id === folderId ? { ...f, collapsed: !f.collapsed } : f)
    );
  }

  renameFolderItem(folderId: string, name: string): void {
    this.folders.update(folders =>
      folders.map(f => f.id === folderId ? { ...f, name } : f)
    );
    this.saveHistory();
  }

  assignItemsToFolder(folderId: string, itemIds: string[]): void {
    this.folders.update(folders =>
      folders.map(f => {
        if (f.id === folderId) {
          const newIds = itemIds.filter(id => !f.itemIds.includes(id));
          return { ...f, itemIds: [...f.itemIds, ...newIds] };
        }
        return { ...f, itemIds: f.itemIds.filter(id => !itemIds.includes(id)) };
      })
    );
    this.saveHistory();
  }

  // ─── Location List Import ─────────────────────────────────────────────────

  generateFromLocationList(): void {
    const text = this.locationListText().trim();
    if (!text) return;

    const orientation = this.locationListOrientation();
    const lines       = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Group by area-row
    const grouped = new Map<string, { area: string; row: string; bays: string[]; level: string }>();
    for (const line of lines) {
      const parts = line.split('-');
      if (parts.length < 4) continue;
      const [area, row, bay, level] = parts;
      const key = `${area}-${row}`;
      if (!grouped.has(key)) grouped.set(key, { area, row, bays: [], level });
      grouped.get(key)!.bays.push(bay);
    }

    const levelMap: Record<string, number> = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const rowGroups = Array.from(grouped.values());

    for (let ri = 0; ri < rowGroups.length; ri++) {
      const { area, row, bays, level } = rowGroups[ri];
      const lvl = levelMap[level.toLowerCase()] || 1;
      for (let bi = 0; bi < bays.length; bi++) {
        const bayNum = bays[bi];
        const name   = `${area}-${row}-${bayNum}-${level}`;
        const gx     = orientation === 'horizontal' ? bi * 5 : ri * 5;
        const gy     = orientation === 'horizontal' ? ri * 5 : bi * 5;
        const item   = this.addItem('Bin', gx, gy, 4, 4, lvl);
        this.items.update(items =>
          items.map(i => i.id === item.id ? { ...i, name, id: name } : i)
        );
      }
    }

    this.saveHistory();
  }

  // ─── Alignment ────────────────────────────────────────────────────────────

  getSelectionBounds(): GridSelection | null {
    const selected = this.selectedItems();
    if (selected.length < 2) return null;

    let minX =  Infinity, minY =  Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    selected.forEach(item => {
      if (item.gx              < minX) minX = item.gx;
      if (item.gy              < minY) minY = item.gy;
      if (item.gx + item.gw   > maxX) maxX = item.gx + item.gw;
      if (item.gy + item.gh   > maxY) maxY = item.gy + item.gh;
    });

    return {
      minX, minY, maxX, maxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
  }

  alignSelected(property: 'gx' | 'gy', alignTo: 'min' | 'max' | 'center'): void {
    const bounds = this.getSelectionBounds();
    if (!bounds) return;

    this.items.update(items =>
      items.map(item => {
        if (!item.selected) return item;
        const copy = { ...item };
        if (property === 'gx') {
          if (alignTo === 'min')    copy.gx = bounds.minX;
          if (alignTo === 'max')    copy.gx = bounds.maxX - copy.gw;
          if (alignTo === 'center') copy.gx = Math.floor(bounds.centerX - copy.gw / 2);
        } else {
          if (alignTo === 'min')    copy.gy = bounds.minY;
          if (alignTo === 'max')    copy.gy = bounds.maxY - copy.gh;
          if (alignTo === 'center') copy.gy = Math.floor(bounds.centerY - copy.gh / 2);
        }
        return copy;
      })
    );
    this.saveHistory();
  }

  // ─── Draw-to-Create Helpers ───────────────────────────────────────────────

  /**
   * Returns the first Area item that fully contains the given grid rect,
   * or null if no such Area exists.
   */
  getContainingArea(gx: number, gy: number, gw: number, gh: number): GridItem | null {
    return this.findAreaContaining({ gx, gy, gw, gh }) ?? null;
  }

  /** Returns the first Area item that fully contains `rect`. */
  private findAreaContaining(rect: GridRect): GridItem | undefined {
    return this.items().find(item => item.type === 'Area' && isRectInside(rect, item));
  }



  /**
   * Returns the list of types the user is allowed to create at the given
   * grid position. Types in REQUIRE_AREA_TYPES are only allowed when the
   * rect is fully contained within an existing Area.
   */
  getTypesAllowedAt(gx: number, gy: number, gw: number, gh: number): string[] {
    const insideArea = this.getContainingArea(gx, gy, gw, gh) !== null;
    const base       = insideArea ? [...ALL_TYPES] : [...FREE_TYPES];
    const filtered   = (base as string[]).filter(t =>
      !['Zone', 'Area', 'Door', 'Hallway'].includes(t)
    );
    filtered.push('LocBody');
    return filtered;
  }

  /**
   * Auto-generates a location code for a Loc from its position within its
   * containing Area, skipping hallway cells in the numbering.
   * Returns null if the position is not inside any Area.
   */
  generateBayCode(gx: number, gy: number, gw: number, gh: number, levelNum: number): string | null {
    const area = this.getContainingArea(gx, gy, gw, gh);
    if (!area) return null;
    return this.computeBayCode(area, gx, gy, levelNum);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Counts how many hallway cells exist before the given position within an Area.
   * Used to adjust row/column numbering to skip hallway cells.
   */
  /**
   * Derives the location code for a cell at (gx, gy) inside `area`,
   * skipping hallway cells in the row/column numbering.
   */
  private computeBayCode(area: GridItem, gx: number, gy: number, levelNum: number): string {
    const rowStart = area.rowStart ?? 1;
    const colStart = area.colStart ?? 1;
    const colDir   = area.colDir   ?? 'ltr';
    const rowDir   = area.rowDir   ?? 'ttb';

    const hallways = this.hallwaysInArea(area);

    const totalHallwayW = hallways
      .filter(h => h.hallwayOrientation === 'vertical')
      .reduce((s, h) => s + h.gw, 0);
    const totalHallwayH = hallways
      .filter(h => h.hallwayOrientation === 'horizontal')
      .reduce((s, h) => s + h.gh, 0);

    const totalLocCols = area.gw - totalHallwayW;
    const totalLocRows = area.gh - totalHallwayH;

    const hallwaysBeforeRow = this.countHallwaysBefore(area, gx, gy, 'row');
    const hallwaysBeforeCol = this.countHallwaysBefore(area, gx, gy, 'col');

    const physCol = gx - area.gx - hallwaysBeforeCol;
    const physRow = gy - area.gy - hallwaysBeforeRow;

    const logicCol = colDir === 'rtl' ? (totalLocCols - 1 - physCol) : physCol;
    const logicRow = rowDir === 'btt' ? (totalLocRows - 1 - physRow) : physRow;

    const bay         = logicCol + colStart;
    const row         = logicRow + rowStart;
    const levelLetter = String.fromCodePoint(64 + Math.max(1, Math.min(levelNum, 26)));

    return this.formatLocationCode(area.name, bay, row, levelLetter);
  }

  /** Returns every Hallway item fully contained within `area`. */
  private hallwaysInArea(area: GridItem): GridItem[] {
    return this.items().filter(item => item.type === 'Hallway' && isRectInside(item, area));
  }

  /**
   * Counts how many hallway cells exist before the given position within an Area.
   * Used to adjust row/column numbering to skip hallway cells.
   */
  private countHallwaysBefore(
    area: GridItem,
    gx: number,
    gy: number,
    direction: 'row' | 'col'
  ): number {
    const hallways = this.hallwaysInArea(area);

    if (direction === 'row') {
      return hallways
        .filter(h => h.hallwayOrientation === 'horizontal' && h.gy < gy)
        .reduce((sum, h) => sum + h.gh, 0);
    }

    return hallways
      .filter(h => h.hallwayOrientation === 'vertical' && h.gx < gx)
      .reduce((sum, h) => sum + h.gw, 0);
  }

  /** Wipes everything (Walls, Locs, Areas, etc.) but preserves default locs */
  clearAll(): void {
    const defaultLocs = this.items().filter(i => this.isDefaultLoc(i));
    this.items.set(defaultLocs);
    this.folders.set([]);
    this.clearSelection();
    this.saveHistory();
    // Keep loadedLocIds intact so the save logic knows which backend locs to delete
  }

  /** Returns true if the item is a system-default location that cannot be deleted */
  isDefaultLoc(item: GridItem): boolean {
    return item.type === 'Loc' && (DEFAULT_LOC_NAMES as readonly string[]).includes(item.name.toUpperCase());
  }
}
