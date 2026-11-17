import { Injectable, signal, inject, computed } from '@angular/core';
import { Warehouse2dStateService, GridItem } from './warehouse-2d-state.service';

// ─── Interfaces ───────────────────────────────────────────────────────────────

/** Cardinal direction / face of a grid cell */
export type CardinalFace = 'N' | 'S' | 'E' | 'W';

export interface SkuInfo {
  code: string;
  quantity: number;
}

export interface PickStop {
  locId:        string;
  locName:      string;
  gx:           number;  // Loc grid cell (top-left)
  gy:           number;
  accessGx:     number;  // Hallway cell the picker stands in to pick this loc
  accessGy:     number;
  accessFace:   CardinalFace; // Which face of the Loc is hallway-accessible
  order:        number;
  packageCount: number;
  sku:          string;
  picked:       boolean;
  pathOffset:   number; // Index in path[] where the segment LEADING to this stop starts
  orderId:      string; // Which order this stop belongs to
  tote:         string; // Tote assigned to this order (e.g. 'TOTE-001')
}

/** Metadata for a single order when building a multi-order route */
export interface OrderRouteInput {
  orderId:     string;
  locationIds: string[];
  skuInfos:    SkuInfo[];
  tote:        string;
}

export interface RouteStep {
  fromGx:    number;
  fromGy:    number;
  toGx:      number;
  toGy:      number;
  direction: CardinalFace;
  isHallway: boolean;
}

export interface PickingRoute {
  startPoint:    { gx: number; gy: number; name: string };
  endPoint:      { gx: number; gy: number; name: string };
  stops:         PickStop[];
  path:          RouteStep[];
  totalCells:    number;
  estimatedTime: number;
  orderIds:      string[];
}

/** Order metadata attached to a target loc */
interface LocMeta {
  sku: SkuInfo;
  orderId: string;
  tote: string;
}

// ─── Fallback data ────────────────────────────────────────────────────────────

const FALLBACK_SKUS  = ['SKU-A001', 'SKU-B042', 'SKU-C118', 'SKU-D007', 'SKU-E200', 'SKU-F033'];
const FALLBACK_ORDER = 'ORD-0000';

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PickingRouteService {

  private readonly state = inject(Warehouse2dStateService);

  readonly currentStopIndex = signal(0);
  readonly route            = signal<PickingRoute | null>(null);
  readonly stops            = computed(() => this.route()?.stops ?? []);
  readonly allPicked        = computed(() => {
    const s = this.stops();
    return s.length > 0 && s.every(stop => stop.picked);
  });

  /** When true, the viewport draws a thin gray polyline for the full route */
  readonly showFullPath = signal(true);

  // ── Scan flow settings ──────────────────────────────────────────────────
  readonly scanSkuEnabled      = signal(false);
  readonly scanLocationEnabled = signal(false);
  readonly scanToteEnabled     = signal(false);
  readonly manualInputMode     = signal(false);
  readonly anyScanEnabled      = computed(() =>
    this.scanSkuEnabled() || this.scanLocationEnabled() || this.scanToteEnabled()
  );

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Builds a picking route using BFS through walkable cells only.
   *
   * Rules:
   *  - Starts at the first pick location (no door-to-loc segment).
   *  - Path is divided into segments between consecutive stops.
   *  - Only Hallway and Door cells are walkable.
   */
  /**
   * Builds a picking route using BFS through walkable cells only.
   * Supports multi-order: pass an array of OrderRouteInput to merge all
   * stops into a single optimised route.
   */
  generateMockRoute(targetLocIds?: string[], orderId?: string, skuInfos?: SkuInfo[]): void {
    // Delegate to multi-order version with a single-order wrapper
    const orders: OrderRouteInput[] = [{
      orderId:     orderId || FALLBACK_ORDER,
      locationIds: targetLocIds || [],
      skuInfos:    skuInfos || [],
      tote:        'TOTE-001',
    }];
    this.generateMultiOrderRoute(orders);
  }

  /**
   * Builds a merged picking route from one or more orders.
   * All stops are re-sequenced by Area → Bay → Aisle → Level for optimal walking.
   */
  generateMultiOrderRoute(orders: OrderRouteInput[]): void {
    const items    = this.state.items();
    const doors    = items.filter(i => i.type === 'Door');
    const locs     = items.filter(i => i.type === 'Loc' && i.level === 1);
    const hallways = items.filter(i => i.type === 'Hallway');

    if (locs.length === 0) { this.route.set(null); return; }

    // ── 1. Build walkable cell set (Hallways + Doors) ─────────────────────
    const walkable = this._buildWalkableSet([...hallways, ...doors]);

    // ── 2. Merge all target locs from all orders ─────────────────────────
    const { locMeta, allTargetLocIds } = this._collectLocMeta(orders);
    const filteredLocs = this._selectTargetLocs(items, locs, allTargetLocIds);

    // Sort stops by real warehouse picking priority: Area → Bay → Aisle → Level
    filteredLocs.sort((a, b) => this._compareLocationCodes(a.name, b.name));

    const candidates: Array<{ loc: GridItem; accessKey: string; face: CardinalFace }> = [];
    for (const loc of filteredLocs) {
      const ap = this._findAccessPoint(loc, walkable);
      if (ap) candidates.push({ loc, accessKey: ap.key, face: ap.face });
    }

    if (candidates.length === 0) { this.route.set(null); return; }

    // ── 3. Build adjacency graph for BFS ──────────────────────────────────
    const graph = this._buildGraph(walkable);

    // ── 4. BFS route: stop1 → stop2 → ... → stopN ────────────────────────
    const path: RouteStep[] = [];
    const stops: PickStop[] = [];

    let currentKey = candidates[0].accessKey;
    const [sgx, sgy] = currentKey.split(',').map(Number);
    const startPoint = { gx: sgx, gy: sgy, name: candidates[0].loc.name || candidates[0].loc.id };

    // Add first stop
    stops.push(this._buildStop(candidates[0], 0, 0, locMeta));

    // Build segments Stop 1 -> Stop 2, Stop 2 -> Stop 3, etc.
    let currentPathOffset = 0;
    for (let i = 1; i < candidates.length; i++) {
      const { accessKey } = candidates[i];

      const segment = this._bfsPath(currentKey, accessKey, graph);
      const segmentStart = currentPathOffset;
      path.push(...segment);
      currentPathOffset += segment.length;

      stops.push(this._buildStop(candidates[i], i, segmentStart, locMeta));

      currentKey = accessKey;
    }

    const [egx, egy] = currentKey.split(',').map(Number);
    const orderIds = [...new Set(orders.map(o => o.orderId))];

    this.currentStopIndex.set(0);
    this.route.set({
      startPoint,
      endPoint:      { gx: egx, gy: egy, name: 'Finish' },
      stops,
      path,
      totalCells:    path.length,
      estimatedTime: Math.max(1, Math.round(path.length * 0.08)),
      orderIds,
    });
  }

  toggleStopPicked(stopOrder: number): void {
    const r = this.route();
    if (!r) return;

    const newStops = r.stops.map(s => 
      s.order === stopOrder ? { ...s, picked: !s.picked } : s
    );

    // Update currentStopIndex to the first unpicked stop
    const firstUnpicked = newStops.findIndex(s => !s.picked);
    if (firstUnpicked === -1) {
      this.currentStopIndex.set(newStops.length - 1); // Stay at last if all done
    } else {
      this.currentStopIndex.set(firstUnpicked);
    }

    this.route.set({ ...r, stops: newStops });
  }

  clearRoute(): void { this.route.set(null); }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** Collects every grid cell covered by the given items as `gx,gy` keys. */
  private _buildWalkableSet(cells: GridItem[]): Set<string> {
    const walkable = new Set<string>();
    for (const cell of cells)
      for (let dy = 0; dy < cell.gh; dy++)
        for (let dx = 0; dx < cell.gw; dx++)
          walkable.add(`${cell.gx + dx},${cell.gy + dy}`);
    return walkable;
  }

  /** Builds locId → { SkuInfo, orderId, tote } map and the flat list of target loc ids. */
  private _collectLocMeta(orders: OrderRouteInput[]): {
    locMeta: Map<string, LocMeta>;
    allTargetLocIds: string[];
  } {
    const locMeta = new Map<string, LocMeta>();
    const allTargetLocIds: string[] = [];

    for (const o of orders) {
      o.locationIds.forEach((locId, idx) => {
        allTargetLocIds.push(locId);
        if (o.skuInfos[idx]) {
          locMeta.set(locId, {
            sku: o.skuInfos[idx],
            orderId: o.orderId,
            tote: o.tote,
          });
        }
      });
    }
    return { locMeta, allTargetLocIds };
  }

  /** Resolves target locs (preferring level-1 siblings) or falls back to the first level-1 locs. */
  private _selectTargetLocs(items: GridItem[], level1Locs: GridItem[], targetIds: string[]): GridItem[] {
    if (targetIds.length === 0) return [...level1Locs].slice(0, 6);

    const allLocs = items.filter(i => i.type === 'Loc');
    // Prefer level-1 sibling for higher-level locs
    return allLocs
      .filter(l => targetIds.includes(l.id))
      .map(loc => {
        if (loc.level === 1) return loc;
        const lvl1 = level1Locs.find(l => l.gx === loc.gx && l.gy === loc.gy);
        return lvl1 ? { ...lvl1, id: loc.id, name: loc.name } : loc;
      });
  }

  /** Compares two location names by Area → Bay → Aisle → Level. */
  private _compareLocationCodes(nameA: string, nameB: string): number {
    const pa = this._parseLocationCode(nameA);
    const pb = this._parseLocationCode(nameB);
    if (pa.area !== pb.area) return pa.area.localeCompare(pb.area);
    if (pa.bay  !== pb.bay)  return pa.bay.localeCompare(pb.bay, undefined, { numeric: true });
    if (pa.aisle !== pb.aisle) return pa.aisle.localeCompare(pb.aisle, undefined, { numeric: true });
    return pa.level.localeCompare(pb.level);
  }

  /** Builds the PickStop for the candidate at position `index` in the route. */
  private _buildStop(
    candidate: { loc: GridItem; accessKey: string; face: CardinalFace },
    index: number,
    pathOffset: number,
    locMeta: Map<string, LocMeta>,
  ): PickStop {
    const { loc, accessKey, face } = candidate;
    const [agx, agy] = accessKey.split(',').map(Number);
    const meta = locMeta.get(loc.id);
    return {
      locId:        loc.id,
      locName:      loc.name || loc.id,
      gx:           loc.gx,
      gy:           loc.gy,
      accessGx:     agx,
      accessGy:     agy,
      accessFace:   face,
      order:        index + 1,
      packageCount: meta?.sku.quantity ?? (1 + (index % 3 + 1)),
      sku:          meta?.sku.code ?? FALLBACK_SKUS[index % FALLBACK_SKUS.length],
      picked:       false,
      pathOffset,
      orderId:      meta?.orderId ?? FALLBACK_ORDER,
      tote:         meta?.tote ?? 'TOTE-001',
    };
  }

  /**
   * Finds the first hallway-adjacent face of a Loc.
   * Only faces whose neighbour cell is in the walkable set count.
   * A face touching another Loc (not in walkable) is ignored.
   */
  private _findAccessPoint(
    loc: GridItem,
    walkable: Set<string>
  ): { key: string; face: CardinalFace } | null {
    const dirs: Array<{ dx: number; dy: number; face: CardinalFace }> = [
      { dx:  0, dy: -1, face: 'N' },
      { dx:  0, dy:  1, face: 'S' },
      { dx: -1, dy:  0, face: 'W' },
      { dx:  1, dy:  0, face: 'E' },
    ];
    for (let dy = 0; dy < loc.gh; dy++) {
      for (let dx = 0; dx < loc.gw; dx++) {
        for (const { dx: ndx, dy: ndy, face } of dirs) {
          const nx  = loc.gx + dx + ndx;
          const ny  = loc.gy + dy + ndy;
          const key = `${nx},${ny}`;
          if (walkable.has(key)) return { key, face };
        }
      }
    }
    return null;
  }

  /**
   * Builds a 4-directional adjacency graph from the walkable cell set.
   */
  private _buildGraph(walkable: Set<string>): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    for (const cell of walkable) {
      const [x, y] = cell.split(',').map(Number);
      const neighbors: string[] = [];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
        const nk = `${x + dx},${y + dy}`;
        if (walkable.has(nk)) neighbors.push(nk);
      }
      graph.set(cell, neighbors);
    }
    return graph;
  }

  /**
   * BFS shortest path through the walkable graph from `from` to `to`.
   * All steps have isHallway=true because only walkable (hallway/door) cells exist.
   */
  private _bfsPath(
    from:  string,
    to:    string,
    graph: Map<string, string[]>
  ): RouteStep[] {
    if (from === to) return [];
    const queue: string[][] = [[from]];
    const visited = new Set<string>([from]);

    while (queue.length > 0) {
      const pathSoFar = queue.shift()!;
      const cur       = pathSoFar.at(-1)!;
      for (const neighbor of (graph.get(cur) ?? [])) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        const newPath = [...pathSoFar, neighbor];
        if (neighbor === to) return this._cellsToSteps(newPath);
        queue.push(newPath);
      }
    }
    return []; // No connected hallway path found
  }

  /**
   * Converts an ordered list of cell-key strings into RouteStep[] with direction.
   */
  private _cellsToSteps(cells: string[]): RouteStep[] {
    const steps: RouteStep[] = [];
    for (let i = 0; i < cells.length - 1; i++) {
      const [fx, fy] = cells[i].split(',').map(Number);
      const [tx, ty] = cells[i + 1].split(',').map(Number);
      let direction: CardinalFace;
      if      (tx > fx) direction = 'E';
      else if (tx < fx) direction = 'W';
      else if (ty > fy) direction = 'S';
      else               direction = 'N';
      steps.push({ fromGx: fx, fromGy: fy, toGx: tx, toGy: ty, direction, isHallway: true });
    }
    return steps;
  }

  /**
   * Parses a location code in the format "{Area}-{Aisle}-{Bay}-{Level}"
   * e.g. "A-06-0001-A" → { area: 'A', aisle: '06', bay: '0001', level: 'A' }
   */
  private _parseLocationCode(code: string): { area: string; aisle: string; bay: string; level: string } {
    const parts = (code || '').split('-');
    return {
      area:  parts[0] || '',
      aisle: parts[1] || '',
      bay:   parts[2] || '',
      level: parts[3] || '',
    };
  }
}
