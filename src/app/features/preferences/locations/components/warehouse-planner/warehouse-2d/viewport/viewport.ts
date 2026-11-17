import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  NgZone,
  effect,
  computed,
  signal,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContextMenuModule } from 'primeng/contextmenu';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { MenuItem } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TooltipModule } from 'primeng/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import {
  Warehouse2dStateService,
  GridItem,
  DrawPopupState,
  WallRect,
  BeltPath,
} from '../../services/warehouse-2d-state.service';
import { PickingRouteService, RouteStep } from '../../services/picking-route.service';
import { BinPlannerDialogComponent } from '../../../bin-planner-dialog/bin-planner-dialog.component';
import { PlannedBin, BinPlannerResult } from '../../../bin-planner-dialog/bin-planner.types';

// ─── Local types ──────────────────────────────────────────────────────────────

/** A single Loc that the draw popup would create */
interface LocPlan { code: string; gx: number; gy: number; lvl: number }

/** Geometry context needed to build Area + Hallways + Locs for a planned loc grid */
interface AreaLocBuildContext {
  popup: DrawPopupState; name: string; lvlStart: number;
  colDir: 'ltr' | 'rtl'; rowDir: 'btt' | 'ttb';
  colOffsets: number[]; rowOffsets: number[];
  totalW: number; totalH: number;
  numCols: number; numRows: number;
  hwEveryCol: number; hwEveryRow: number; hwWidth: number;
  category?: string; bayType?: string; zoneId?: string;
}

interface CellConnections { north: boolean; south: boolean; east: boolean; west: boolean }

interface AreaCellIndex { cellToArea: Map<string, string>; areaById: Map<string, GridItem> }

/** Pre-computed geometry of one conveyor cell */
interface ConveyorCellGeometry {
  cellX: number; cellY: number; gs: number;
  beltW: number; beltH: number;
  centerX: number; centerY: number;
  fill: string;
}

interface ConveyorCorners { ne: boolean; nw: boolean; se: boolean; sw: boolean }

const SVG_SHAPE_TYPES = new Set(['Wall', 'Door', 'Conveyor', 'Hallway']);

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** 'A' → 1, 'B' → 2, … */
function levelNumberFromLetter(letter: string): number {
  return (letter.codePointAt(0) ?? Number.NaN) - 64;
}

function levelLetter(levelNum: number): string {
  return String.fromCodePoint(64 + Math.max(1, Math.min(levelNum, 26)));
}

function isShiftKey(e: KeyboardEvent): boolean {
  return e.code === 'ShiftLeft' || e.code === 'ShiftRight';
}

function toolForShortcutKey(key: string): 'arrow' | 'hand' | 'brush' | null {
  if (key === 'v' || key === 'V') return 'arrow';
  if (key === 'h' || key === 'H') return 'hand';
  if (key === 'b' || key === 'B') return 'brush';
  return null;
}

/** Extract the area prefix (1-2 leading uppercase letters) from a Loc name */
function locAreaPrefix(name: string): string {
  const m = /^([A-Z]{1,2})/.exec(name);
  return m ? m[1] : '';
}

/** AABB overlap check between two grid items */
function gridItemsOverlap(a: GridItem, b: GridItem): boolean {
  return a.gx < b.gx + b.gw && a.gx + a.gw > b.gx &&
         a.gy < b.gy + b.gh && a.gy + a.gh > b.gy;
}

/** True when a dragged item `d` collides with a stationary item `s` */
function dragItemsCollide(d: GridItem, s: GridItem): boolean {
  if (!gridItemsOverlap(d, s)) return false;
  // Hallway rules: can overlap Locs but NOT Walls
  if (d.type === 'Hallway') return s.type === 'Wall';
  // Non-hallway over Hallway → no collision
  if (s.type === 'Hallway') return false;
  // Non-hallway over Wall → collision
  if (s.type === 'Wall' || d.type === 'Wall') return true;
  // Both are Locs — apply area + level stacking rules
  const dArea = locAreaPrefix(d.name);
  const sArea = locAreaPrefix(s.name);
  // Same area: only collide if same level (multi-level stacking)
  if (dArea && sArea && dArea === sArea) return s.level === d.level;
  // Different areas: always collide (cannot share grid cells)
  return true;
}

/** True when two overlapping Locs belong to different areas */
function isCrossAreaLocOverlap(d: GridItem, s: GridItem): boolean {
  if (s.type !== 'Loc') return false;
  if (!gridItemsOverlap(d, s)) return false;
  const dArea = locAreaPrefix(d.name);
  const sArea = locAreaPrefix(s.name);
  return !!dArea && !!sArea && dArea !== sArea;
}

/**
 * True when a dragged Loc ends up inside a DIFFERENT Area than its "home"
 * area (identified by the loc's name prefix). The home area is virtually
 * expanded to include ALL dragged locs from the same prefix (simulates
 * fitAreasToLocs), so block moves that extend beyond the static Area
 * rectangle don't trigger false cross-area warnings.
 */
function isCrossAreaMove(d: GridItem, dragged: GridItem[], areas: GridItem[]): boolean {
  if (d.type !== 'Loc') return false;
  const locPrefix = locAreaPrefix(d.name);
  if (!locPrefix) return false;
  const homeArea = areas.find(a => a.name.toUpperCase() === locPrefix);
  if (!homeArea) return false;

  // Loc is within the effective home area → OK
  const home = effectiveHomeBounds(homeArea, dragged, locPrefix);
  if (d.gx >= home.minX && d.gy >= home.minY &&
      d.gx + d.gw <= home.maxX && d.gy + d.gh <= home.maxY) return false;

  // Loc is inside a DIFFERENT area → cross-area move
  return areas.some(a =>
    a.id !== homeArea.id &&
    a.gx <= d.gx && a.gy <= d.gy &&
    a.gx + a.gw >= d.gx + d.gw && a.gy + a.gh >= d.gy + d.gh
  );
}

/** Union of the Area rect + all dragged locs with the same prefix (anticipates fitAreasToLocs) */
function effectiveHomeBounds(
  homeArea: GridItem, dragged: GridItem[], locPrefix: string,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = homeArea.gx, minY = homeArea.gy;
  let maxX = homeArea.gx + homeArea.gw;
  let maxY = homeArea.gy + homeArea.gh;
  for (const dl of dragged) {
    if (dl.type === 'Loc' && locAreaPrefix(dl.name) === locPrefix) {
      minX = Math.min(minX, dl.gx);
      minY = Math.min(minY, dl.gy);
      maxX = Math.max(maxX, dl.gx + dl.gw);
      maxY = Math.max(maxY, dl.gy + dl.gh);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** True when an item spanning [pos, pos+size) touches or straddles grid line `line` */
function touchesGridLine(pos: number, size: number, line: number): boolean {
  return pos + size === line || pos === line || (pos <= line && pos + size > line);
}

/** True when [pos, pos+size) contains `p` */
function spanCovers(pos: number, size: number, p: number): boolean {
  return pos <= p && pos + size > p;
}

/** Sorts ranges by start and merges overlapping/contiguous ones */
function mergeRanges(ranges: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of sorted) {
    const last = merged.at(-1);
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

/**
 * Builds an offset array for `count` slots with hallway gaps of `hwWidth`
 * every `hwEvery` slots. Returns: { offsets[], totalSpan }
 */
function buildHallwayOffsets(count: number, hwEvery: number, hwWidth: number): { offsets: number[]; totalSpan: number } {
  const offsets: number[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    offsets.push(cursor);
    cursor++;
    if (hwEvery > 0 && (i + 1) % hwEvery === 0 && i < count - 1) {
      cursor += hwWidth;
    }
  }
  return { offsets, totalSpan: cursor };
}

/** Perimeter cells of a multi-cell rect (top, bottom, then inner left/right edges) */
function wallPerimeterCells(rect: { gx: number; gy: number; gw: number; gh: number }): { x: number; y: number }[] {
  const { gx, gy, gw, gh } = rect;
  const cells: { x: number; y: number }[] = [];
  // Top edge
  for (let x = gx; x < gx + gw; x++) cells.push({ x, y: gy });
  // Bottom edge (if > 1 row)
  if (gh > 1) {
    for (let x = gx; x < gx + gw; x++) cells.push({ x, y: gy + gh - 1 });
  }
  // Left edge (inner rows)
  for (let y = gy + 1; y < gy + gh - 1; y++) cells.push({ x: gx, y });
  // Right edge (inner rows, if > 1 col)
  if (gw > 1) {
    for (let y = gy + 1; y < gy + gh - 1; y++) cells.push({ x: gx + gw - 1, y });
  }
  return cells;
}

/** All cells of a rect, row by row */
function rectCells(rect: { gx: number; gy: number; gw: number; gh: number }): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let y = rect.gy; y < rect.gy + rect.gh; y++) {
    for (let x = rect.gx; x < rect.gx + rect.gw; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/** Rotates an item 90° around (cx, cy), swapping its size and remapping orientation/direction fields */
function rotateItemAround(item: GridItem, dir: 'cw' | 'ccw', cx: number, cy: number): GridItem {
  // ── Rotate the item's centre-point around (cx, cy) ──────────────────
  const dx = item.gx + item.gw / 2 - cx;
  const dy = item.gy + item.gh / 2 - cy;
  const [newCx, newCy] = dir === 'cw'
    ? [cx + dy, cy - dx]
    : [cx - dy, cy + dx];

  // ── 90° always swaps width ↔ height ───────────────────────────────────
  const newGw = item.gh;
  const newGh = item.gw;
  const newGx = Math.round(newCx - newGw / 2);
  const newGy = Math.round(newCy - newGh / 2);

  const { colDir, rowDir } = rotatedAreaDirs(item, dir);
  return {
    ...item,
    gx: newGx, gy: newGy, gw: newGw, gh: newGh,
    hallwayOrientation: flippedHallwayOrientation(item.hallwayOrientation),
    colDir, rowDir,
  };
}

/** Flip hallwayOrientation (horizontal ↔ vertical) */
function flippedHallwayOrientation(o: GridItem['hallwayOrientation']): GridItem['hallwayOrientation'] {
  if (o === 'horizontal') return 'vertical';
  if (o === 'vertical') return 'horizontal';
  return o;
}

/**
 * Remap Area colDir / rowDir after 90° rotation.
 * CW:  what was X-axis becomes Y-axis.  ltr→ttb, rtl→btt; ttb→rtl, btt→ltr
 * CCW: inverse
 */
function rotatedAreaDirs(item: GridItem, dir: 'cw' | 'ccw'): Pick<GridItem, 'colDir' | 'rowDir'> {
  if (item.type !== 'Area' || !(item.colDir || item.rowDir)) {
    return { colDir: item.colDir, rowDir: item.rowDir };
  }
  if (dir === 'cw') {
    return {
      colDir: (item.rowDir ?? 'ttb') === 'btt' ? 'rtl' : 'ltr',
      rowDir: (item.colDir ?? 'ltr') === 'ltr' ? 'ttb' : 'btt',
    };
  }
  return {
    colDir: (item.rowDir ?? 'ttb') === 'ttb' ? 'rtl' : 'ltr',
    rowDir: (item.colDir ?? 'ltr') === 'rtl' ? 'ttb' : 'btt',
  };
}

// ─── Area adjacency helpers ───────────────────────────────────────────────────

/** Builds a cell → area-id lookup for all area cells */
function buildAreaCellIndex(areas: GridItem[]): AreaCellIndex {
  const cellToArea = new Map<string, string>();
  const areaById   = new Map<string, GridItem>();
  for (const a of areas) {
    areaById.set(a.id, a);
    for (let dy = 0; dy < a.gh; dy++) {
      for (let dx = 0; dx < a.gw; dx++) {
        cellToArea.set(`${a.gx + dx},${a.gy + dy}`, a.id);
      }
    }
  }
  return { cellToArea, areaById };
}

/** Area ids found in the 4-neighbourhood of every cell of `cur` (in scan order, may repeat) */
function neighborAreaIds(cur: GridItem, cellToArea: Map<string, string>): string[] {
  const ids: string[] = [];
  for (let dy = 0; dy < cur.gh; dy++) {
    for (let dx = 0; dx < cur.gw; dx++) {
      const cx = cur.gx + dx;
      const cy = cur.gy + dy;
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        const nId = cellToArea.get(`${nx},${ny}`);
        if (nId) ids.push(nId);
      }
    }
  }
  return ids;
}

/** BFS over same-name adjacent areas starting from `start` */
function collectConnectedAreas(start: GridItem, index: AreaCellIndex, visited: Set<string>): GridItem[] {
  const component: GridItem[] = [];
  const queue = [start.id];
  visited.add(start.id);
  while (queue.length > 0) {
    const curId = queue.shift()!;
    const cur   = index.areaById.get(curId)!;
    component.push(cur);
    // Check border cells for adjacency to other same-name areas
    for (const nId of neighborAreaIds(cur, index.cellToArea)) {
      if (!visited.has(nId) && index.areaById.get(nId)!.name === cur.name) {
        visited.add(nId);
        queue.push(nId);
      }
    }
  }
  return component;
}

/** For each name group, find connected components and pick one label owner (top-left) per component */
function findAreaLabelOwners(areas: GridItem[], index: AreaCellIndex): Set<string> {
  // Group areas by name to determine which one shows the label
  const nameGroups = new Map<string, GridItem[]>();
  for (const a of areas) {
    const key = a.name || '';
    const arr = nameGroups.get(key) ?? [];
    arr.push(a);
    nameGroups.set(key, arr);
  }

  const labelOwners = new Set<string>();
  for (const [, group] of nameGroups) {
    if (group.length < 2) {
      labelOwners.add(group[0].id);
      continue;
    }
    const visited = new Set<string>();
    for (const area of group) {
      if (visited.has(area.id)) continue;
      const component = collectConnectedAreas(area, index, visited);
      // Label owner = top-left area of the component
      const owner = component.reduce((best, a) =>
        a.gy < best.gy || (a.gy === best.gy && a.gx < best.gx) ? a : best,
        component[0]
      );
      labelOwners.add(owner.id);
    }
  }
  return labelOwners;
}

/** Which edges of area `a` touch another area with the same name */
function sameNameAreaEdges(a: GridItem, index: AreaCellIndex): CellConnections {
  const name = a.name || '';
  const sameNameAt = (gx: number, gy: number): boolean => {
    const nId = index.cellToArea.get(`${gx},${gy}`);
    return !!nId && nId !== a.id && index.areaById.get(nId)?.name === name;
  };
  const anyAlong = (len: number, test: (i: number) => boolean): boolean => {
    for (let i = 0; i < len; i++) {
      if (test(i)) return true;
    }
    return false;
  };
  return {
    north: anyAlong(a.gw, dx => sameNameAt(a.gx + dx, a.gy - 1)),
    south: anyAlong(a.gw, dx => sameNameAt(a.gx + dx, a.gy + a.gh)),
    east:  anyAlong(a.gh, dy => sameNameAt(a.gx + a.gw, a.gy + dy)),
    west:  anyAlong(a.gh, dy => sameNameAt(a.gx - 1, a.gy + dy)),
  };
}

// ─── SVG shape helpers (Wall / Door / Conveyor / Hallway) ─────────────────────

/** Maps 'gx,gy' → the item occupying that cell */
function buildCellIndex(items: GridItem[]): Map<string, GridItem> {
  const cellIndex = new Map<string, GridItem>();
  for (const it of items) {
    for (let dy = 0; dy < it.gh; dy++) {
      for (let dx = 0; dx < it.gw; dx++) {
        cellIndex.set(`${it.gx + dx},${it.gy + dy}`, it);
      }
    }
  }
  return cellIndex;
}

/**
 * Cache checksum: geometry + neighbors. Neighbors are included so that placing
 * an adjacent Wall/Conveyor immediately invalidates the cache of the existing item.
 */
function svgChecksum(item: GridItem, cellIndex: Map<string, GridItem>): string {
  const sig = (n: GridItem | undefined) => `${n?.type ?? ''}.${n?.level ?? ''}`;
  const nN  = cellIndex.get(`${item.gx},${item.gy - 1}`);
  const nS  = cellIndex.get(`${item.gx},${item.gy + item.gh}`);
  const nE  = cellIndex.get(`${item.gx + item.gw},${item.gy}`);
  const nW  = cellIndex.get(`${item.gx - 1},${item.gy}`);
  const neighborSig = `${sig(nN)}|${sig(nS)}|${sig(nE)}|${sig(nW)}`;
  return `${item.gx}|${item.gy}|${item.gw}|${item.gh}|${item.type}|${item.level}|${neighborSig}`;
}

/** Computes the SVG rects/paths for a Wall, Door, Conveyor or Hallway item */
function buildItemSvgShapes(item: GridItem, cellIndex: Map<string, GridItem>, gs: number): { rects: WallRect[]; paths: BeltPath[] } {
  const rects: WallRect[] = [];
  const paths: BeltPath[] = [];
  const isWall = item.type === 'Wall' || item.type === 'Door';
  const isConv = item.type === 'Conveyor';
  const isDoor = item.type === 'Door';
  const wallFill = isDoor ? '#EF4444' : '#64748B';

  const allowed = item.connections
    ? Object.keys(item.connections).filter(k => (item.connections as any)[k])
    : ['north', 'south', 'east', 'west'];

  for (let cy = 0; cy < item.gh; cy++) {
    for (let cx = 0; cx < item.gw; cx++) {
      const cellX = cx * gs;
      const cellY = cy * gs;
      const conn  = cellConnections(item, cellIndex, item.gx + cx, item.gy + cy, isConv, allowed);

      if (isWall) pushWallCellRects(rects, cellX, cellY, gs, conn, wallFill);
      if (isConv) pushConveyorCellShapes(rects, paths, cellX, cellY, gs, conn);
      if (item.type === 'Hallway') {
        rects.push({ x: cellX, y: cellY, w: gs, h: gs, fill: 'rgba(148, 163, 184, 0.35)' });
      }
    }
  }
  return { rects, paths };
}

/** O(1) adjacency check via cellIndex for the 4 sides of one cell */
function cellConnections(
  item: GridItem, cellIndex: Map<string, GridItem>,
  cellGx: number, cellGy: number,
  isConv: boolean, allowed: string[],
): CellConnections {
  const isConn = (ddx: number, ddy: number, dirStr: string): boolean => {
    if (isConv && !allowed.includes(dirStr)) return false;
    const checkGx = cellGx + ddx;
    const checkGy = cellGy + ddy;
    // Own body
    if (checkGx >= item.gx && checkGx < item.gx + item.gw &&
        checkGy >= item.gy && checkGy < item.gy + item.gh) return true;
    // Adjacent item — O(1) lookup
    const adj = cellIndex.get(`${checkGx},${checkGy}`);
    return !!adj && adj.type === item.type && adj.level === item.level;
  };
  return {
    north: isConn(0, -1, 'north'),
    south: isConn(0,  1, 'south'),
    east:  isConn(1,  0, 'east'),
    west:  isConn(-1, 0, 'west'),
  };
}

function pushWallCellRects(rects: WallRect[], cellX: number, cellY: number, gs: number, conn: CellConnections, fill: string): void {
  const wCenter = gs * 0.6;
  const centerX = cellX + (gs - wCenter) / 2;
  const centerY = cellY + (gs - wCenter) / 2;
  const connW   = gs * 0.6;
  const connH   = gs * 0.6;
  rects.push({ x: centerX, y: centerY, w: wCenter, h: wCenter, fill });
  if (conn.north) rects.push({ x: centerX + (wCenter - connW) / 2, y: cellY,                 w: connW, h: centerY - cellY + wCenter / 2,              fill });
  if (conn.south) rects.push({ x: centerX + (wCenter - connW) / 2, y: centerY + wCenter / 2, w: connW, h: (cellY + gs) - (centerY + wCenter / 2),      fill });
  if (conn.east)  rects.push({ x: centerX + wCenter / 2, y: centerY + (wCenter - connH) / 2, w: (cellX + gs) - (centerX + wCenter / 2), h: connH, fill });
  if (conn.west)  rects.push({ x: cellX, y: centerY + (wCenter - connH) / 2,                  w: centerX - cellX + wCenter / 2,          h: connH, fill });
}

function pushConveyorCellShapes(rects: WallRect[], paths: BeltPath[], cellX: number, cellY: number, gs: number, conn: CellConnections): void {
  const beltW = gs * 0.5;
  const beltH = gs * 0.5;
  const g: ConveyorCellGeometry = {
    cellX, cellY, gs, beltW, beltH,
    centerX: cellX + (gs - beltW) / 2,
    centerY: cellY + (gs - beltH) / 2,
    fill: '#F97316',
  };
  const corners: ConveyorCorners = {
    ne: conn.north && conn.east,
    nw: conn.north && conn.west,
    se: conn.south && conn.east,
    sw: conn.south && conn.west,
  };
  const hasCurve = corners.ne || corners.nw || corners.se || corners.sw;
  pushConveyorCurves(paths, g, corners);
  if (!hasCurve) rects.push({ x: g.centerX, y: g.centerY, w: beltW, h: beltH, fill: g.fill });
  pushConveyorVerticalRects(rects, g, conn, corners);
  pushConveyorHorizontalRects(rects, g, conn, corners);
}

function pushConveyorCurves(paths: BeltPath[], g: ConveyorCellGeometry, corners: ConveyorCorners): void {
  const { cellX, cellY, gs, beltW, fill } = g;
  const r    = gs / 2;
  const midN = { x: cellX + gs / 2, y: cellY };
  const midS = { x: cellX + gs / 2, y: cellY + gs };
  const midE = { x: cellX + gs,     y: cellY + gs / 2 };
  const midW = { x: cellX,          y: cellY + gs / 2 };
  if (corners.ne) paths.push({ d: `M ${midN.x} ${midN.y} A ${r} ${r} 0 0 0 ${midE.x} ${midE.y}`, strokeWidth: beltW, stroke: fill });
  if (corners.nw) paths.push({ d: `M ${midN.x} ${midN.y} A ${r} ${r} 0 0 1 ${midW.x} ${midW.y}`, strokeWidth: beltW, stroke: fill });
  if (corners.se) paths.push({ d: `M ${midS.x} ${midS.y} A ${r} ${r} 0 0 1 ${midE.x} ${midE.y}`, strokeWidth: beltW, stroke: fill });
  if (corners.sw) paths.push({ d: `M ${midS.x} ${midS.y} A ${r} ${r} 0 0 0 ${midW.x} ${midW.y}`, strokeWidth: beltW, stroke: fill });
}

function pushConveyorVerticalRects(rects: WallRect[], g: ConveyorCellGeometry, conn: CellConnections, corners: ConveyorCorners): void {
  const { cellY, gs, beltW, beltH, centerX, centerY, fill } = g;
  if (conn.north && conn.south) {
    rects.push({ x: centerX, y: cellY, w: beltW, h: gs, fill });
    return;
  }
  if (conn.north && !corners.ne && !corners.nw) rects.push({ x: centerX, y: cellY, w: beltW, h: centerY - cellY + beltH / 2, fill });
  if (conn.south && !corners.se && !corners.sw) rects.push({ x: centerX, y: centerY + beltH / 2, w: beltW, h: (cellY + gs) - (centerY + beltH / 2), fill });
}

function pushConveyorHorizontalRects(rects: WallRect[], g: ConveyorCellGeometry, conn: CellConnections, corners: ConveyorCorners): void {
  const { cellX, gs, beltW, beltH, centerX, centerY, fill } = g;
  if (conn.east && conn.west) {
    rects.push({ x: cellX, y: centerY, w: gs, h: beltH, fill });
    return;
  }
  if (conn.east && !corners.ne && !corners.se) rects.push({ x: centerX + beltW / 2, y: centerY, w: (cellX + gs) - (centerX + beltW / 2), h: beltH, fill });
  if (conn.west && !corners.nw && !corners.sw) rects.push({ x: cellX, y: centerY, w: centerX - cellX + beltW / 2, h: beltH, fill });
}

/** Multi-level stack: only the top-level loc shows the 'min - max' label; others show '' */
function setStackedLocLabels(map: Map<string, string>, posKey: string, group: GridItem[]): void {
  const levels = group.map(l => l.level);
  const maxLvl = Math.max(...levels);
  const minLvl = Math.min(...levels);
  const minL   = levelLetter(minLvl);
  const maxL   = levelLetter(maxLvl);
  const label  = minLvl === maxLvl ? minL : `${minL} - ${maxL}`;
  for (const loc of group) {
    map.set(`${posKey},${loc.level}`, loc.level === maxLvl ? label : '');
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-warehouse-2d-viewport',
  standalone: true,
  imports: [
    FormsModule, 
    ContextMenuModule, 
    DialogModule, 
    ButtonModule,
    SelectModule,
    InputTextModule,
    InputNumberModule,
    TooltipModule,
    TranslateModule,
    BinPlannerDialogComponent,
  ],
  templateUrl: './viewport.html',
  styleUrl: './viewport.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Warehouse2dViewportComponent implements OnInit, OnDestroy {

  // ── DI ────────────────────────────────────────────────────────────────────
  readonly state         = inject(Warehouse2dStateService);
  private readonly translate = inject(TranslateService);
  readonly pickingService = inject(PickingRouteService);
  private readonly ngZone = inject(NgZone);

  // ── Duplicate-codes dialog state ───────────────────────────────────────
  /** Codes that already exist and would be skipped */
  readonly dupDialogVisible  = signal(false);
  readonly dupDialogCodes    = signal<string[]>([]);
  /** Items that are unique and ready to be created once the user confirms */
  readonly dupPendingItems   = signal<LocPlan[]>([]);
  /** Geometry context needed to build Area + Hallways when the user confirms */
  private _dupPendingContext: AreaLocBuildContext | null = null;

  // ── View refs ─────────────────────────────────────────────────────────────
  @ViewChild('viewport',        { static: true }) viewportRef!: ElementRef<HTMLDivElement>;
  @ViewChild('container',       { static: true }) containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('itemContextMenu') itemContextMenu: any;

  // ── Context Menu ──────────────────────────────────────────────────────────
  contextMenuItems: MenuItem[] = [];

  // ── Bin Planner ───────────────────────────────────────────────────────────
  showBinPlanner = signal(false);
  binPlannerLocationCode = signal('');
  showBulkBinPlanner = signal(false);
  bulkBinPlannerCodes = signal<string[]>([]);

  // ── Interaction state ─────────────────────────────────────────────────────
  isSpaceHeld  = false;
  isPanning    = false;
  isSelecting  = false;
  /** True when the hand/select tool (not arrow) is doing a rubber-band selection. */
  isHandSelecting = false;
  scale        = 1;

  panStartX = 0; panStartY = 0;
  initialScrollLeft = 0; initialScrollTop = 0;

  startPxX = 0; startPxY = 0;

  isDraggingItems    = false;
  dragStartX         = 0; dragStartY = 0;
  dragStartContext   = new Map<string, { x: number; y: number }>();
  /** True when dragged items overlap with other items on the grid */
  readonly dragHasCollision = signal(false);
  /** True when a Loc is being dragged into a different Area */
  readonly dragAreaWarning = signal(false);
  private dragAreaWarningTimer: any = null;

  isResizingGizmo  = false;
  resizeDir        = '';
  resizeStartCtx: any = null;

  isBrushPainting     = false;
  brushPaintedCells   = new Set<string>();
  _brushPendingAreaName = 'Area';

  /** Hallway tool: true while the user is dragging to position the hallway line */
  isHallwayDragging = false;
  /** Hallway tool: floor-snapped grid cell (used for area containment detection) */
  hallwayDragCell: { gx: number; gy: number } | null = null;
  /** Hallway tool: boundary-snapped position (Math.round) — used for gridLine insertion */
  hallwaySnapGx = 0;
  hallwaySnapGy = 0;
  /** Hallway tool: orientation driven by the toolbar signal */
  hallwayDragOrientation: 'horizontal' | 'vertical' = 'horizontal';
  /** Hallway tool: computed span from the preview (full line of adjacent locs) */
  _hallwayPreviewSpan: { gx: number; gy: number; gw: number; gh: number } | null = null;

  /**
   * When dragging an existing Hallway item with the hand/arrow tool,
   * we capture its original position so that on drop we can call moveHallway()
   * which reflowing the neighbouring locs correctly.
   */
  hallwayMoveOrigin: { id: string; gx: number; gy: number; orientation: 'horizontal' | 'vertical' } | null = null;

  private _toolBeforeShift: 'arrow' | 'hand' | 'brush' | 'hallway' | null = null;
  private previewDrag: { startMouseX: number; startMouseY: number; startGx: number; startGy: number } | null = null;

  private readonly unlisteners: (() => void)[] = [];

  // ── SVG rect cache: keyed by itemId, value is { checksum, rects, paths } ──
  // Avoids recomputing SVG shapes for unchanged items (Opt 3)
  private readonly _svgCache = new Map<string, { checksum: string; rects: WallRect[]; paths: BeltPath[] }>();

  // ── Visible rect signal: updated on viewport scroll/resize (Opt 1) ────────
  // Stores the currently-visible grid cell range (with overscan)
  readonly visibleRect = signal<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // ── Resize handle directions ──────────────────────────────────────────────────
  readonly resizeDirs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

  // ── Picking route overlay (pixel-space path + stops) ────────────────────────
  /** Pre-computed pixel coordinates from the route signal for the SVG overlay */
  readonly pickingOverlay = computed(() => {
    const route = this.pickingService.route();
    if (!route) return null;
    const gs = this.state.gridSize;

    const cx = (gx: number) => gx * gs + gs / 2;
    const cy = (gy: number) => gy * gs + gs / 2;

    // Progressive reveal:
    //  currentIndex = first unpicked stop (where the picker is heading)
    //  - Step 0: currentIndex=0, nothing picked → only show marker 1
    //  - After picking stop 0: currentIndex=1 → show marker 1 (gray), 
    //    blue path from 0→1, marker 2 (active)
    //  - After picking stop 1: currentIndex=2 → past paths 0→1 (gray), 
    //    blue path from 1→2, marker 3 (active)
    const currentIndex = this.pickingService.currentStopIndex();
    const stops        = route.stops;

    let currentSteps: RouteStep[] = [];
    let pastSteps:    RouteStep[] = [];

    if (currentIndex > 0) {
      // There's a path segment LEADING TO the current stop (from previous stop)
      // This is the "current blue line"
      const currentStop = stops[currentIndex];
      const segStart = currentStop.pathOffset;
      const segEnd = (currentIndex + 1 < stops.length)
        ? stops[currentIndex + 1].pathOffset
        : route.path.length;

      currentSteps = route.path.slice(segStart, segEnd);

      // Past = all segments before the current one
      pastSteps = route.path.slice(0, segStart);
    }
    // else: currentIndex === 0 → no path shown yet, just the first marker

    const toPolylineData = (steps: RouteStep[]) => {
      if (steps.length === 0) return { points: '', length: 0 };
      const pts: string[] = [];
      let len = 0;
      pts.push(`${cx(steps[0].fromGx)},${cy(steps[0].fromGy)}`);
      for (const s of steps) {
        pts.push(`${cx(s.toGx)},${cy(s.toGy)}`);
        const dx = (s.toGx - s.fromGx) * gs;
        const dy = (s.toGy - s.fromGy) * gs;
        len += Math.hypot(dx, dy);
      }
      return { points: pts.join(' '), length: len };
    };

    const current = toPolylineData(currentSteps);
    const past    = toPolylineData(pastSteps);

    // Full path: all steps from start to finish (shown when "Show all path" is on)
    const showFull = this.pickingService.showFullPath();
    const full = showFull ? toPolylineData(route.path) : { points: '', length: 0 };

    return {
      currentPoints: current.points,
      currentLength: current.length,
      pastPoints:    past.points,
      pastLength:    past.length,
      fullPathPoints: full.points,
      fullPathStopMarkers: showFull ? route.stops.map(s => ({
        ax: cx(s.accessGx),
        ay: cy(s.accessGy),
        order: s.order,
      })) : [],
      start: { x: cx(route.startPoint.gx), y: cy(route.startPoint.gy) },
      end:   { x: cx(route.endPoint.gx),   y: cy(route.endPoint.gy)   },
      stopMarkers: route.stops.map((s, idx) => ({
        px: s.gx * gs,
        py: s.gy * gs,
        pw: gs,
        ph: gs,
        ax: cx(s.accessGx),
        ay: cy(s.accessGy),
        order: s.order,
        picked: s.picked,
        name: s.locName,
        // Current = where picker is heading, previous = just completed
        isCurrent: idx === currentIndex || (currentIndex > 0 && idx === currentIndex - 1),
        // Show markers up to currentIndex (the first unpicked stop)
        isVisible: idx <= currentIndex
      }))
    };
  });

  // ── Draw popup state ──────────────────────────────────────────────────────
  drawPopupPendingType: string | null = null;
  drawPopupStep: 'area-name' | 'loc-code' | null = null;
  drawPopupAreaName    = 'A';
  drawPopupPrefilledCode = '';

  // ── Popup generate fields ─────────────────────────────────────────────────
  popupGenZone       = '';
  popupGenLevelStart = 'A';
  popupGenLevelEnd   = 'A';
  popupGenCategory   = 'REGULAR';
  popupGenType       = 'F';
  popupGenRInit      = 1;
  popupGenREnd       = 5;
  popupGenBInit      = 1;
  popupGenBEnd       = 10;
  popupColDir: 'ltr' | 'rtl' = 'ltr';
  popupRowDir: 'ttb' | 'btt' = 'ttb';

  readonly popupBayCategories = this.state.bayCategories;
  readonly popupBayTypes      = this.state.bayTypes;
  readonly popupZoneOptions   = this.state.zoneOptions;
  readonly levelOptions       = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(l => ({ label: l, value: l }));

  /** Clamp Level Last so it's never below Level First */
  onPopupLevelStartChange(): void {
    if (this.popupGenLevelEnd < this.popupGenLevelStart) {
      this.popupGenLevelEnd = this.popupGenLevelStart;
    }
  }

  // ── Type metadata for draw popup ─────────────────────────────────────────
  readonly allTypesMeta = [
    { type: 'Zone',     color: '#8B5CF6', icon: 'pi pi-map' },
    { type: 'Area',     color: '#3B82F6', icon: 'pi pi-clone' },
    { type: 'Wall',     color: '#64748B', icon: 'pi pi-stop' },
    { type: 'Door',     color: '#EF4444', icon: 'pi pi-sign-in' },
    { type: 'Conveyor', color: '#F97316', icon: 'pi pi-sync' },
    { type: 'Loc',      color: '#10B981', icon: 'pi pi-check-square' },
    { type: 'LocBody',  color: '#34D399', icon: 'pi pi-table' },
    { type: 'Bin',      color: '#06B6D4', icon: 'pi pi-box' },
    { type: 'Hallway',  color: '#94A3B8', icon: 'pi pi-directions' },
  ];

  // ─── Computed: area adjacency map for visual merging ──────────────────────
  // For each Area item, determines which sides connect to a same-name neighbor.
  // Used by the template to add CSS classes that remove internal borders.
  readonly areaAdjacency = computed(() => {
    const areas = this.state.items().filter(i => i.type === 'Area');
    const index = buildAreaCellIndex(areas);

    // For each name group, find connected components and pick one label owner per component
    const labelOwners = findAreaLabelOwners(areas, index);

    // For each area, check if the cells just outside its edges belong
    // to another area with the same name.
    const adj = new Map<string, { north: boolean; south: boolean; east: boolean; west: boolean; showLabel: boolean }>();
    for (const a of areas) {
      adj.set(a.id, { ...sameNameAreaEdges(a, index), showLabel: labelOwners.has(a.id) });
    }

    return adj;
  });

  // ─── Computed: rendered items with SVG shapes resolved ───────────────────
  // Opt 2: builds a cell-index Map once (O(N)) for O(1) adjacency lookups
  // Opt 3: memoizes _svgRects/_svgPaths per item using a checksum; skips
  //        recomputation for items whose geometry/type/level hasn't changed.
  readonly renderedItems = computed(() => {
    const items = this.state.items();
    const gs    = this.state.gridSize;

    // ── Opt 2: O(1) cell lookup map ──────────────────────────────────────────
    const cellIndex = buildCellIndex(items);

    return items.map(item => {
      if (!SVG_SHAPE_TYPES.has(item.type)) return item;

      // ── Opt 3: skip recomputation if geometry AND neighbors haven't changed ──
      const checksum = svgChecksum(item, cellIndex);
      const cached   = this._svgCache.get(item.id);
      if (cached?.checksum === checksum) {
        return { ...item, _svgRects: cached.rects, _svgPaths: cached.paths };
      }

      const { rects, paths } = buildItemSvgShapes(item, cellIndex, gs);

      // Store in cache for next recompute
      this._svgCache.set(item.id, { checksum, rects, paths });
      return { ...item, _svgRects: rects, _svgPaths: paths };
    });
  });

  // ─── Computed: loc stack labels (Opt 4) ───────────────────────────────────
  // Builds a Map<'gx,gy', label> once per items change instead of calling
  // items().filter() inside the template for every rendered Loc.
  readonly locStackLabelMap = computed(() => {
    const map  = new Map<string, string>();
    const locs = this.state.items().filter(i => i.type === 'Loc');

    // Group by grid position
    const byPos = new Map<string, typeof locs>();
    for (const loc of locs) {
      const key = `${loc.gx},${loc.gy},${loc.gw},${loc.gh}`;
      const arr  = byPos.get(key) ?? [];
      arr.push(loc);
      byPos.set(key, arr);
    }

    for (const [posKey, group] of byPos) {
      if (group.length === 1) {
        const loc    = group[0];
        const lv     = this.state.activeLevelView();
        const lvNum  = lv === 'All' ? Math.max(...group.map(l => l.level)) : loc.level;
        map.set(`${posKey},${loc.level}`, levelLetter(lvNum));
      } else {
        setStackedLocLabels(map, posKey, group);
      }
    }
    return map;
  });

  // ─── Computed: culled items (Opt 1 — Viewport Culling) ───────────────────
  // Returns only the items that overlap the visible scroll region + overscan.
  // Falls back to all renderedItems() when visibleRect is null (e.g. during init).
  readonly culledItems = computed(() => {
    const vr      = this.visibleRect();
    const all     = this.renderedItems();
    const OVERSCAN = 3; // extra cells beyond viewport edges

    if (!vr) return all; // not yet measured

    const x1 = vr.x1 - OVERSCAN;
    const y1 = vr.y1 - OVERSCAN;
    const x2 = vr.x2 + OVERSCAN;
    const y2 = vr.y2 + OVERSCAN;

    return all.filter(item =>
      item.gx          < x2 &&
      item.gx + item.gw > x1 &&
      item.gy          < y2 &&
      item.gy + item.gh > y1
    );
  });

  // ─── Computed: row / column selector overlay (hand tool + 2+ Locs selected) ───
  // When the hand/select tool is active and multiple Locs are selected, this
  // computes the pixel positions of the row-select and col-select buttons.
  readonly rowColSelectors = computed(() => {
    const tool = this.state.activeTool();
    if (tool !== 'hand') return null;
    if (this.state.activeLayer() === 'floor') return null;

    const selected = this.state.selectedItems().filter(i => i.type === 'Loc');
    if (selected.length < 2) return null;

    const gs = this.state.gridSize;

    const uniqueRows = [...new Set(selected.map(l => l.gy))].sort((a, b) => a - b);
    const uniqueCols = [...new Set(selected.map(l => l.gx))].sort((a, b) => a - b);

    // Only show when there's something meaningful to select
    if (uniqueRows.length < 2 && uniqueCols.length < 2) return null;

    const minGx = Math.min(...selected.map(l => l.gx));
    const minGy = Math.min(...selected.map(l => l.gy));

    const BTN = 18; // button size in px
    const GAP = 4;  // gap from edge of selection

    const rows = uniqueRows.map(gy => ({
      gy,
      // Button sits to the left of the selection, vertically centered in the row
      left: Math.max(0, minGx * gs - BTN - GAP),
      top:  gy * gs + (gs - BTN) / 2,
    }));

    const cols = uniqueCols.map(gx => ({
      gx,
      // Button sits above the selection, horizontally centered in the column
      left: gx * gs + (gs - BTN) / 2,
      top:  Math.max(0, minGy * gs - BTN - GAP),
    }));

    return { rows, cols };
  });


  // ─── Effects ──────────────────────────────────────────────────────────────

  constructor() {
    // React to zoom-tick from sidebar
    effect(() => {
      const tick = this.state.zoomTick();
      if (!tick) return;
      const cnt = this.containerRef?.nativeElement;
      const vp  = this.viewportRef?.nativeElement;
      if (!cnt || !vp) return;
      const rect = vp.getBoundingClientRect();
      const nextScale = Math.max(0.6, Math.min(this.scale + (tick.dir === 'in' ? 0.15 : -0.15), 1.5));
      this._zoomAt(vp, cnt, rect.width / 2, rect.height / 2, nextScale);
    });

    // React to center command from sidebar
    effect(() => {
      this.state.centerViewport(); // track
      setTimeout(() => {
        const vp = this.viewportRef?.nativeElement;
        if (vp) this._scrollToGridCenter(vp);
      });
    });

    // Clear selection rect + draw popup whenever the active tool changes
    effect(() => {
      this.state.activeTool(); // track
      const vp = this.viewportRef?.nativeElement;
      if (vp) this._updateCursor(vp);
      // Dismiss any in-progress area selection and popup when switching tools
      this.state.emptySelection.set(null);
      this.state.drawPopup.set(null);
      this.state.emptySelection.set(null);
      this.drawPopupPendingType = null;
      this.drawPopupStep        = null;
    });

    // Scroll viewport to center on a specific grid cell after generation
    effect(() => {
      const cell = this.state.scrollToCell();
      if (!cell) return;
      setTimeout(() => {
        const vp = this.viewportRef?.nativeElement;
        if (!vp) return;
        const gs      = this.state.gridSize;
        // Convert grid coords to pixel coords (accounting for current scale)
        const cellPxX = cell.gx * gs * this.scale;
        const cellPxY = cell.gy * gs * this.scale;
        // Scroll so the cell is centered in the viewport
        vp.scrollLeft = cellPxX - vp.clientWidth  / 2;
        vp.scrollTop  = cellPxY - vp.clientHeight / 2;
        // Clear the signal so it doesn't re-trigger
        this.state.scrollToCell.set(null);
      }, 50);
    });
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this._centerViewport();
    this._setupListeners();
  }

  ngOnDestroy(): void {
    this.unlisteners.forEach(fn => fn());
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  getPx(gridPos: number): number { return gridPos * this.state.gridSize; }

  /** Z-index with type priority: Wall > Loc > Hallway when overlapping */
  getItemZIndex(item: any): number {
    const typePriority: Record<string, number> = {
      'Hallway': 100,
      'Loc':     200,
      'Wall':    300,
    };
    return (item.level * 1000) + item.baseZ + (typePriority[item.type] ?? 0);
  }

  /** Returns CSS classes for area visual merging (border removal on connected sides) */
  getAreaConnClasses(item: GridItem): string {
    const info = this.areaAdjacency().get(item.id);
    if (!info) return '';
    const cls: string[] = [];
    if (info.north) cls.push('area-conn-north');
    if (info.south) cls.push('area-conn-south');
    if (info.east)  cls.push('area-conn-east');
    if (info.west)  cls.push('area-conn-west');
    if (!info.showLabel) cls.push('area-hide-label');
    return cls.join(' ');
  }

  dismissOverlapWarning(): void {
    this.state.overlapConflicts.set(new Set());
  }

  getLevelFilter(): number { return Number.parseInt(this.state.activeLevelView()) || 1; }

  /**
   * Returns true when a specific level is selected AND this item is a Loc
   * that belongs to a different level — i.e. it is hidden or faded in the view
   * and must not be selectable or deletable.
   */
  isLocBlockedByLevel(item: GridItem): boolean {
    const lv = this.state.activeLevelView();
    if (lv === 'All') return false;          // no filter active
    if (item.type !== 'Loc') return false;   // only Loc items are level-filtered
    return item.level !== Number.parseInt(lv);
  }

  getLevelLetter(levelNum: number): string {
    return levelLetter(levelNum);
  }

  getMaxLevelAtPosition(item: GridItem): number {
    const stacked = this.state.items().filter(i =>
      i.type === 'Loc' &&
      i.gx === item.gx && i.gy === item.gy &&
      i.gw === item.gw && i.gh === item.gh
    );
    return stacked.length ? Math.max(...stacked.map(i => i.level)) : item.level;
  }

  getLocLevelColor(level: number): string {
    const l = Math.max(12, 40 - (level - 1) * 7);
    return `hsl(161, 79%, ${l}%)`;
  }

  isHiddenByLayer(item: GridItem): boolean {
    const layer = this.state.activeLayer();
    if (layer === 'all') return false;
    const floorTypes = new Set(['Wall', 'Door', 'Loc', 'Conveyor', 'Pallet', 'Bin', 'Hallway']);
    const zoneTypes  = new Set(['Zone', 'Area']);
    if (layer === 'floor') return !floorTypes.has(item.type);
    if (layer === 'zones') return !zoneTypes.has(item.type);
    return false;
  }

  // Opt 4: O(1) label lookup from the pre-computed locStackLabelMap signal
  getLocStackLabel(item: GridItem): string {
    const key = `${item.gx},${item.gy},${item.gw},${item.gh},${item.level}`;
    return this.locStackLabelMap().get(key) ?? '';
  }

  getTransform(_item: GridItem): string { return 'none'; }

  /**
   * Returns the resize handle directions available for a given item.
   * Hallways only expose thickness-axis handles (n/s for horizontal, e/w for vertical).
   */
  getResizeDirsForItem(item: GridItem): readonly string[] {
    if (item.type === 'Area') return [];
    if (item.type !== 'Hallway') return this.resizeDirs;
    return item.hallwayOrientation === 'horizontal'
      ? ['n', 's']   // horizontal hallway: change height (thickness)
      : ['e', 'w'];  // vertical hallway:   change width  (thickness)
  }

  sanitizeAreaInput(val: string): string {
    return val.toUpperCase().replaceAll(/[^A-Z]/g, '').slice(0, 2);
  }

  onPopupAreaChange(areaCode: string): void {
    const maxes = this.state.getAreaMaxColRow(areaCode);
    if (!maxes) return;

    const colCount = Math.max(1, (this.popupGenBEnd - this.popupGenBInit) + 1);
    const rowCount = Math.max(1, (this.popupGenREnd - this.popupGenRInit) + 1);

    this.popupGenBInit = maxes.maxCol + 1;
    this.popupGenBEnd  = this.popupGenBInit + colCount - 1;
    this.popupGenRInit = maxes.maxRow + 1;
    this.popupGenREnd  = this.popupGenRInit + rowCount - 1;
  }

  getDoorCenter(item: GridItem): { cx: number; cy: number; r: number } | null {
    const rects = (item as any)._svgRects;
    if (!rects?.length) return null;
    const r0 = rects[0];
    return { cx: r0.x + r0.w * 0.5, cy: r0.y + r0.h * 0.5, r: Math.min(r0.w, r0.h) * 0.55 };
  }

  getDoorArcPath(item: GridItem): string {
    const rects = (item as any)._svgRects;
    if (!rects?.length) return '';
    const r0     = rects[0];
    const cx     = r0.x + r0.w * 0.5;
    const cy     = r0.y + r0.h * 0.5;
    const radius = Math.min(r0.w, r0.h) * 0.55;
    return `M ${cx} ${cy} L ${cx} ${cy - radius} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy} Z`;
  }

  _updateCursor(vp: HTMLElement): void {
    if (this.state.panLockMode()) {
      vp.style.cursor = 'grab';
      return;
    }
    const tool = this.state.activeTool();
    if (tool === 'hand') {
      vp.style.cursor = 'default';
    } else if (tool === 'brush') {
      vp.style.cursor = 'cell';
    } else {
      vp.style.cursor = 'crosshair';
    }
  }

  private _centerViewport(): void {
    setTimeout(() => this._scrollToGridCenter(this.viewportRef.nativeElement), 100);
  }

  private _scrollToGridCenter(vp: HTMLElement): void {
    const sc = 2000 * this.scale;
    vp.scrollLeft = sc - vp.clientWidth  / 2;
    vp.scrollTop  = sc - vp.clientHeight / 2;
  }

  // ─── Context Menu ─────────────────────────────────────────────────────────

  onItemContextMenu(e: MouseEvent, item: GridItem): void {
    e.preventDefault();
    e.stopPropagation();
    if (!item.selected) {
      this.state.clearSelection();
      this._patchItem(item.id, { selected: true });
    }
    this.contextMenuItems = this._buildContextMenu(item);
    this.itemContextMenu?.show(e);
  }

  private _buildContextMenu(item: GridItem): MenuItem[] {
    const selected    = this.state.selectedItems();
    const allWalls    = selected.length > 0 && selected.every(i => i.type === 'Wall');
    const allDoors    = selected.length > 0 && selected.every(i => i.type === 'Door');
    const multiSel    = selected.length >= 2;
    const isLarger    = item.gw > 1 || item.gh > 1;
    const items: MenuItem[] = [];

    if (multiSel) {
      items.push(
        { label: 'Rotate Left ↺',  icon: 'pi pi-replay',  command: () => this.rotateGroup('ccw') },
        { label: 'Rotate Right ↻', icon: 'pi pi-refresh', command: () => this.rotateGroup('cw')  },
        { separator: true },
        { label: 'Create Walls Around',    icon: 'pi pi-stop',    command: () => this.state.createWallsAround() },
        { label: 'Create Hallways Around', icon: 'pi pi-stop-circle', command: () => this.state.createHallwaysAround() },
        { separator: true },
      );
    }

    items.push(
      { label: 'Bring to Front', icon: 'pi pi-arrow-up',   command: () => this.state.bringToFront() },
      { label: 'Send to Back',   icon: 'pi pi-arrow-down', command: () => this.state.sendToBack()   },
      { separator: true },
      { label: 'Duplicate',      icon: 'pi pi-copy',       command: () => this.state.duplicateSelected() },
    );

    if (allWalls || allDoors) {
      items.push({ separator: true });
      if (allWalls) {
        items.push({ label: 'Convert to Door', icon: 'pi pi-sign-in', command: () => this._convertSelectedType('Door') });
      } else {
        items.push({ label: 'Convert to Wall', icon: 'pi pi-minus',   command: () => this._convertSelectedType('Wall') });
      }
    }

    if (isLarger) {
      items.push({ separator: true }, { label: 'Divide into 1×1', icon: 'pi pi-th-large', command: () => this.state.divideSelected() });
    }

    // Bin Planner options for Loc items
    const selectedLocs = selected.filter(i => i.type === 'Loc' && i.name);
    if (!multiSel && item.type === 'Loc' && item.name) {
      items.push({ separator: true }, {
        label: 'Bin Planner',
        icon: 'pi pi-objects-column',
        command: () => this.onOpenBinPlanner(item),
      });
    } else if (multiSel && selectedLocs.length >= 2) {
      items.push({ separator: true }, {
        label: `Bin Planner in Bulk (${selectedLocs.length})`,
        icon: 'pi pi-objects-column',
        command: () => this.onOpenBulkBinPlanner(selectedLocs),
      });
    }

    items.push(
      { separator: true },
      { label: 'Delete', icon: 'pi pi-trash', styleClass: 'p-menuitem-danger', command: () => {
          this._deselectLocsOutsideActiveLevel();
          this.state.deleteSelected();
        }
      }
    );

    return items;
  }

  // ─── Item interactions ─────────────────────────────────────────────────────

  onItemMouseDown(e: MouseEvent, item: GridItem): void {
    if (e.button !== 0) return;
    e.stopPropagation();

    // In picking mode the viewport is read-only — no editing allowed
    if (this.state.pickingMode()) return;

    // Block interaction with Locs that are outside the active level filter
    if (this.isLocBlockedByLevel(item)) return;

    const tool = this.state.activeTool();
    if (tool === 'brush') return; // brush is handled at viewport level

    if (!item.selected) {
      if (!e.shiftKey) this.state.clearSelection();
      this._patchItem(item.id, { selected: true });
    }

    // Areas are not directly draggable — they follow their child Locs
    if (item.type === 'Area') return;

    // If dragging a Hallway with hand/arrow, capture its origin for reflow on drop
    const selectedNow = this.state.selectedItems();
    const singleHallway = selectedNow.length === 1 && selectedNow[0].type === 'Hallway'
      ? selectedNow[0] : null;
    if (singleHallway && (tool === 'hand' || tool === 'arrow')) {
      this.hallwayMoveOrigin = {
        id:          singleHallway.id,
        gx:          singleHallway.gx,
        gy:          singleHallway.gy,
        orientation: singleHallway.hallwayOrientation ?? 'horizontal',
      };
    } else {
      this.hallwayMoveOrigin = null;
    }

    this.isDraggingItems  = true;
    this.dragStartX       = e.clientX;
    this.dragStartY       = e.clientY;
    this.dragStartContext = new Map(
      this.state.selectedItems().filter(i => i.type !== 'Area').map(i => [i.id, { x: i.gx, y: i.gy }])
    );
  }

  onAreaLabelMouseDown(e: MouseEvent, item: GridItem): void {
    e.stopPropagation();
    if (this.isLocBlockedByLevel(item)) return;
    // Areas are not directly draggable — only select them
    this.state.clearSelection();
    this._patchItem(item.id, { selected: true });
  }

  onResizeStart(e: MouseEvent, item: GridItem, dir: string): void {
    e.stopPropagation();
    e.preventDefault();
    this.isResizingGizmo = true;
    this.resizeDir       = dir;
    this.resizeStartCtx  = {
      itemId: item.id,
      itemType: item.type,
      hallwayOrientation: item.hallwayOrientation,
      startMouseX: e.clientX, startMouseY: e.clientY,
      itemGx: item.gx, itemGy: item.gy,
      itemGw: item.gw, itemGh: item.gh,
    };
  }

  // ─── Generate preview ghost drag ─────────────────────────────────────────

  onPreviewGhostMouseDown(e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    const gp = this.state.generatePreview();
    if (!gp) return;
    this.previewDrag = { startMouseX: e.clientX, startMouseY: e.clientY, startGx: gp.gx, startGy: gp.gy };

    const onMove = (me: MouseEvent) => {
      if (!this.previewDrag) return;
      const gs = this.state.gridSize;
      const z  = this.scale;
      const dxG = Math.round((me.clientX - this.previewDrag.startMouseX) / (gs * z));
      const dyG = Math.round((me.clientY - this.previewDrag.startMouseY) / (gs * z));
      this.state.generatePreview.update(prev => prev
        ? { ...prev, gx: Math.max(0, this.previewDrag!.startGx + dxG), gy: Math.max(0, this.previewDrag!.startGy + dyG) }
        : prev
      );
    };
    const onUp = () => {
      this.previewDrag = null;
      globalThis.removeEventListener('mousemove', onMove);
      globalThis.removeEventListener('mouseup',   onUp);
    };
    globalThis.addEventListener('mousemove', onMove);
    globalThis.addEventListener('mouseup',   onUp);
  }

  /** Called by the "✓ Place" button on the ghost — triggers commit in warehouse-planner */
  onCommitPreview(): void {
    this.state.confirmGeneratePreview();
  }

  // ─── Draw popup ───────────────────────────────────────────────────────────

  onDrawPopupTypeClick(type: string, popup: DrawPopupState): void {
    if (type === 'Loc' || type === 'LocBody') {
      this._startLocDrawFlow(type, popup);
      return;
    }

    const lvl = Number.parseInt(this.state.activeLevelView()) || 1;

    if (type === 'Wall' && (popup.gw > 1 || popup.gh > 1)) {
      // Wall: create only the perimeter segments when the selection is multi-cell
      this._placeOnEmptyCells('Wall', wallPerimeterCells(popup), lvl);
    } else if (type === 'Conveyor' || type === 'Wall') {
      // Conveyor or 1×1 Wall: place cell-by-cell, skipping occupied cells
      this._placeOnEmptyCells(type, rectCells(popup), lvl);
    } else {
      this.state.addItem(type, popup.gx, popup.gy, popup.gw, popup.gh, lvl);
    }

    this.state.drawPopup.set(null);
    this.state.emptySelection.set(null);
    this.state.saveHistory();
  }

  private _startLocDrawFlow(type: string, popup: DrawPopupState): void {
    this.drawPopupPendingType   = type;
    this.drawPopupStep          = 'area-name';
    // Always suggest the next available area name to avoid duplicates
    this.drawPopupAreaName      = this.state.nextAreaName();
    this.drawPopupPrefilledCode = this.state.generateBayCode(popup.gx, popup.gy, popup.gw, popup.gh, 1) ?? '';
    // ✔ Pre-fill row/col range from the drawn selection dimensions
    this.popupGenRInit = 1;
    this.popupGenREnd  = popup.gh;  // rows  = height of drawn rect
    this.popupGenBInit = 1;
    this.popupGenBEnd  = popup.gw;  // cols  = width of drawn rect
  }

  /** True when a 1x1 cell is already occupied by a non-Area item */
  private _isCellOccupied(cx: number, cy: number): boolean {
    return this.state.items().some(i =>
      i.type !== 'Area' &&
      i.gx <= cx && cx < i.gx + i.gw &&
      i.gy <= cy && cy < i.gy + i.gh
    );
  }

  /** Places 1x1 items only on empty cells */
  private _placeOnEmptyCells(itemType: string, cells: { x: number; y: number }[], lvl: number): void {
    for (const c of cells) {
      if (!this._isCellOccupied(c.x, c.y)) {
        this.state.addItem(itemType, c.x, c.y, 1, 1, lvl);
      }
    }
  }

  onDrawPopupConfirmArea(areaName: string, popup: DrawPopupState): void {
    const name     = this.sanitizeAreaInput(areaName) || 'A';
    const lvlStart = levelNumberFromLetter(this.popupGenLevelStart);
    const lvlEnd   = levelNumberFromLetter(this.popupGenLevelEnd);
    if (lvlEnd < lvlStart) return;

    if (this.drawPopupPendingType === 'LocBody') {
      this._createLocBody(popup, name, lvlStart, lvlEnd);
    } else if (!this._createLocGrid(popup, name, lvlStart, lvlEnd)) {
      return; // finalizeDuplicateConfirm() will handle the rest
    }

    this.state.drawPopup.set(null);
    this.drawPopupPendingType = null;
    this.drawPopupStep        = null;
    this.state.emptySelection.set(null);
    this.state.saveHistory();
  }

  /** LocBody: one big Loc (per level) spanning the whole drawn area */
  private _createLocBody(popup: DrawPopupState, name: string, lvlStart: number, lvlEnd: number): void {
    const area = this.state.addItem('Area', popup.gx, popup.gy, popup.gw, popup.gh, lvlStart);
    this._patchItem(area.id, { name, colDir: this.popupColDir, rowDir: this.popupRowDir });

    for (let lvl = lvlStart; lvl <= lvlEnd; lvl++) {
      const lvlLetter = String.fromCodePoint(64 + lvl);
      const code      = this.state.formatLocationCode(name, 1, 1, lvlLetter);
      const loc       = this.state.addItem('Loc', popup.gx, popup.gy, popup.gw, popup.gh, lvl, {
        customId: code,
        category: this.popupGenCategory,
        bayType:  this.popupGenType,
        zoneId:   this.popupGenZone || undefined,
      });
      this._patchItem(loc.id, { name: code, fullScale: true, locked: true, zoneId: this.popupGenZone || undefined });
    }
  }

  /**
   * Plans a grid of 1×1 Locs (with hallway gaps) and creates it. When some
   * codes already exist, stores the plan and opens the duplicate dialog
   * instead, returning false.
   */
  private _createLocGrid(popup: DrawPopupState, name: string, lvlStart: number, lvlEnd: number): boolean {
    // ── Hallway settings from global state ────────────────────────────────────
    const hwEveryCol = this.state.hallwayEveryCol();
    const hwEveryRow = this.state.hallwayEveryRow();
    const hwWidth    = this.state.hallwayWidth();

    const numRows = Math.max(1, this.popupGenREnd - this.popupGenRInit + 1);
    const numCols = Math.max(1, this.popupGenBEnd - this.popupGenBInit + 1);

    // Horizontal: cols → X, rows → Y (same as Generate panel default)
    const { offsets: colOffsets, totalSpan: totalW } = buildHallwayOffsets(numCols, hwEveryCol, hwWidth);
    const { offsets: rowOffsets, totalSpan: totalH } = buildHallwayOffsets(numRows, hwEveryRow, hwWidth);

    const ctx: AreaLocBuildContext = {
      popup, name, lvlStart,
      colDir: this.popupColDir, rowDir: this.popupRowDir,
      colOffsets, rowOffsets,
      totalW, totalH,
      numCols, numRows,
      hwEveryCol, hwEveryRow, hwWidth,
      category: this.popupGenCategory, bayType: this.popupGenType, zoneId: this.popupGenZone || undefined,
    };

    // ── Build the full list of (code, gx, gy, level) that WOULD be created
    const existingNames = new Set(this.state.items().map(i => i.name).filter(Boolean));
    const planned       = this._planLocGrid(ctx, lvlEnd);

    // ── Detect duplicates ─────────────────────────────────────────────────
    const duplicateCodes = planned.filter(p => existingNames.has(p.code)).map(p => p.code);
    const uniquePlanned  = planned.filter(p => !existingNames.has(p.code));

    if (duplicateCodes.length > 0) {
      // ── Store ALL context needed to create geometry later ──────────────
      this.dupDialogCodes.set(duplicateCodes);
      this.dupPendingItems.set(uniquePlanned);
      this._dupPendingContext = ctx;
      this.dupDialogVisible.set(true);

      // Close the draw popup while the dialog is open
      this.state.drawPopup.set(null);
      this.drawPopupPendingType = null;
      this.drawPopupStep        = null;
      this.state.emptySelection.set(null);
      return false;
    }

    // ── No duplicates — create everything directly ────────────────────────
    this._createAreaHallwaysAndLocs(uniquePlanned, ctx);
    return true;
  }

  private _planLocGrid(ctx: AreaLocBuildContext, lvlEnd: number): LocPlan[] {
    const planned: LocPlan[] = [];
    for (let lvl = ctx.lvlStart; lvl <= lvlEnd; lvl++) {
      const lvlLetter = String.fromCodePoint(64 + lvl);
      for (let ri = 0; ri < ctx.numRows; ri++) {
        for (let bi = 0; bi < ctx.numCols; bi++) {
          const logicCol = ctx.colDir === 'rtl' ? (ctx.numCols - 1 - bi) : bi;
          const logicRow = ctx.rowDir === 'btt' ? (ctx.numRows - 1 - ri) : ri;
          const bay  = logicCol + this.popupGenBInit;
          const row  = logicRow + this.popupGenRInit;
          const gx   = ctx.popup.gx + ctx.colOffsets[bi];
          const gy   = ctx.popup.gy + ctx.rowOffsets[ri];
          const code = this.state.formatLocationCode(ctx.name, bay, row, lvlLetter);
          planned.push({ code, gx, gy, lvl });
        }
      }
    }
    return planned;
  }

  /** Called when the user clicks "Create remaining" in the duplicate dialog */
  finalizeDuplicateConfirm(): void {
    this.dupDialogVisible.set(false);
    const pending = this.dupPendingItems();
    const ctx     = this._dupPendingContext;

    if (pending.length > 0 && ctx) {
      this._createAreaHallwaysAndLocs(pending, ctx);
      this.state.saveHistory();
    }

    this.dupPendingItems.set([]);
    this._dupPendingContext = null;
  }

  /** Called when the user clicks "Cancel" in the duplicate dialog */
  finalizeDuplicateCancel(): void {
    this.dupDialogVisible.set(false);
    this.dupPendingItems.set([]);
    this._dupPendingContext = null;
  }

  /**
   * Creates an Area sized to exactly fit the given loc plans,
   * plus only the hallways adjacent to those locs, then the locs themselves.
   */
  private _createAreaHallwaysAndLocs(plans: LocPlan[], ctx: AreaLocBuildContext): void {
    if (plans.length === 0) return;

    // ── Create per-loc Areas (one 1×1 area per loc cell) ────────────────────
    // This avoids areas covering hallway positions. The visual merge CSS
    // makes adjacent same-name areas look like one unified area.
    const createdAreaPositions = new Set<string>();
    for (const plan of plans) {
      const posKey = `${plan.gx},${plan.gy}`;
      if (createdAreaPositions.has(posKey)) continue;
      createdAreaPositions.add(posKey);
      const area = this.state.addItem('Area', plan.gx, plan.gy, 1, 1, ctx.lvlStart);
      this._patchItem(area.id, { name: ctx.name, colDir: ctx.colDir, rowDir: ctx.rowDir });
    }

    // ── Place only the Hallways adjacent to valid locs ───────────────────────
    this._createAdjacentHallways(plans, ctx);

    // ── Create the Locs ─────────────────────────────────────────────────────
    for (const plan of plans) {
      const loc = this.state.addItem('Loc', plan.gx, plan.gy, 1, 1, plan.lvl, {
        customId: plan.code,
        category: ctx.category,
        bayType:  ctx.bayType,
        zoneId:   ctx.zoneId,
      });
      this._patchItem(loc.id, { name: plan.code, locked: true, zoneId: ctx.zoneId });
    }
  }

  /** Grid column/row indices that contain at least one planned loc. */
  private _validGridIndices(plans: LocPlan[], ctx: AreaLocBuildContext): { validColIndices: Set<number>; validRowIndices: Set<number> } {
    const { popup, colOffsets, rowOffsets } = ctx;
    const validColIndices = new Set<number>();
    const validRowIndices = new Set<number>();
    for (const p of plans) {
      const ci = colOffsets.indexOf(p.gx - popup.gx);
      const ri = rowOffsets.indexOf(p.gy - popup.gy);
      if (ci >= 0) validColIndices.add(ci);
      if (ri >= 0) validRowIndices.add(ri);
    }
    return { validColIndices, validRowIndices };
  }

  /** Creates the vertical/horizontal hallways that border at least one planned loc. */
  private _createAdjacentHallways(plans: LocPlan[], ctx: AreaLocBuildContext): void {
    const { popup, colOffsets, rowOffsets, hwEveryCol, hwEveryRow, hwWidth, lvlStart } = ctx;

    // ── Determine which grid columns/rows have at least one valid loc ──────
    const { validColIndices, validRowIndices } = this._validGridIndices(plans, ctx);

    // ── Compute bounding box over valid locs ────────────────────────────────
    // Area spans from the min loc to max loc + 1 (each loc is 1×1)
    const areaGx = Math.min(...plans.map(p => p.gx));
    const areaGy = Math.min(...plans.map(p => p.gy));
    const areaW  = Math.max(...plans.map(p => p.gx)) - areaGx + 1;
    const areaH  = Math.max(...plans.map(p => p.gy)) - areaGy + 1;

    if (hwEveryCol > 0) {
      for (let i = hwEveryCol - 1; i < ctx.numCols - 1; i += hwEveryCol) {
        // A vertical hallway sits between column i and column i+1
        if (validColIndices.has(i) || validColIndices.has(i + 1)) {
          const hw = this.state.addItem('Hallway', popup.gx + colOffsets[i] + 1, areaGy, hwWidth, areaH, lvlStart, { skipReorder: true });
          this._patchItem(hw.id, { hallwayOrientation: 'vertical' });
        }
      }
    }

    if (hwEveryRow > 0) {
      for (let i = hwEveryRow - 1; i < ctx.numRows - 1; i += hwEveryRow) {
        // A horizontal hallway sits between row i and row i+1
        if (validRowIndices.has(i) || validRowIndices.has(i + 1)) {
          const hw = this.state.addItem('Hallway', areaGx, popup.gy + rowOffsets[i] + 1, areaW, hwWidth, lvlStart, { skipReorder: true });
          this._patchItem(hw.id, { hallwayOrientation: 'horizontal' });
        }
      }
    }
  }


  // ─── Row / Column bulk-select ─────────────────────────────────────────────

  /** Deselects everything and selects all Locs with the given gy (grid row). */
  selectRow(gy: number): void {
    this.state.items.update(items => items.map(i => ({
      ...i,
      selected: i.type === 'Loc' && i.gy === gy,
    })));
  }

  /** Deselects everything and selects all Locs with the given gx (grid column). */
  selectCol(gx: number): void {
    this.state.items.update(items => items.map(i => ({
      ...i,
      selected: i.type === 'Loc' && i.gx === gx,
    })));
  }

  // ─── Selection helpers ────────────────────────────────────────────────────

  private _convertSelectedType(newType: string): void {
    this.state.items.update(items => items.map(i => i.selected ? { ...i, type: newType } : i));
    this.state.saveHistory();
  }

  rotateGroup(dir: 'cw' | 'ccw'): void {
    const bounds = this.state.getSelectionBounds();
    if (!bounds) return;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;

    this.state.items.update(items => items.map(item =>
      item.selected ? rotateItemAround(item, dir, cx, cy) : item
    ));

    this.state.saveHistory();
  }


  // ─── Main event listener setup ────────────────────────────────────────────

  private _setupListeners(): void {
    this.ngZone.runOutsideAngular(() => {
      const vp  = this.viewportRef.nativeElement;
      const cnt = this.containerRef.nativeElement;

      // ── Wheel zoom ──────────────────────────────────────────────────────
      const onWheel = (e: WheelEvent) => this._onWheelZoom(e, vp, cnt);
      vp.addEventListener('wheel', onWheel, { passive: false });
      this.unlisteners.push(() => vp.removeEventListener('wheel', onWheel));

      // ── Opt 1: Viewport Culling — update visibleRect on scroll/resize/zoom ──
      const updateVisibleRect = () => this._updateVisibleRect(vp);

      // Initial measurement (after the first paint)
      setTimeout(updateVisibleRect, 50);

      // Update on scroll
      vp.addEventListener('scroll', updateVisibleRect, { passive: true });
      this.unlisteners.push(() => vp.removeEventListener('scroll', updateVisibleRect));

      // Update on viewport resize
      const resizeObs = new ResizeObserver(updateVisibleRect);
      resizeObs.observe(vp);
      this.unlisteners.push(() => resizeObs.disconnect());

      // Also update after wheel zoom (scale changes visible area)
      const onWheelPost = () => requestAnimationFrame(updateVisibleRect);
      vp.addEventListener('wheel', onWheelPost, { passive: true });
      this.unlisteners.push(() => vp.removeEventListener('wheel', onWheelPost));

      // ── Keyboard ────────────────────────────────────────────────────────
      const onKeyDown = (e: KeyboardEvent) => this._onKeyDown(e, vp);
      globalThis.addEventListener('keydown', onKeyDown);
      this.unlisteners.push(() => globalThis.removeEventListener('keydown', onKeyDown));

      const onKeyUp = (e: KeyboardEvent) => this._onKeyUp(e, vp);
      globalThis.addEventListener('keyup', onKeyUp);
      this.unlisteners.push(() => globalThis.removeEventListener('keyup', onKeyUp));

      // ── MouseDown on viewport ────────────────────────────────────────────
      const onVpMouseDown = (e: MouseEvent) => this._onViewportMouseDown(e, vp, cnt);
      vp.addEventListener('mousedown', onVpMouseDown);
      this.unlisteners.push(() => vp.removeEventListener('mousedown', onVpMouseDown));

      // ── Prevent native context menu on empty viewport space (right-click = pan) ──
      // Item right-clicks use stopPropagation so their context menu still works.
      const onContextMenu = (e: MouseEvent) => {
        e.preventDefault();
      };
      vp.addEventListener('contextmenu', onContextMenu);
      this.unlisteners.push(() => vp.removeEventListener('contextmenu', onContextMenu));

      // ── MouseMove on window ──────────────────────────────────────────────
      const onMouseMove = (e: MouseEvent) => this._onWindowMouseMove(e, vp, cnt);
      globalThis.addEventListener('mousemove', onMouseMove);
      this.unlisteners.push(() => globalThis.removeEventListener('mousemove', onMouseMove));

      // Also hide the preview when the mouse leaves the viewport
      const onVpMouseLeave = () => this._hideHallwayPreview();
      vp.addEventListener('mouseleave', onVpMouseLeave);
      this.unlisteners.push(() => vp.removeEventListener('mouseleave', onVpMouseLeave));

      // ── MouseUp on window ────────────────────────────────────────────────
      const onMouseUp = (e: MouseEvent) => this._onWindowMouseUp(e, vp);
      globalThis.addEventListener('mouseup', onMouseUp);
      this.unlisteners.push(() => globalThis.removeEventListener('mouseup', onMouseUp));
    });
  }

  // ─── Zoom / culling ───────────────────────────────────────────────────────

  private _onWheelZoom(e: WheelEvent, vp: HTMLElement, cnt: HTMLElement): void {
    if (!e.shiftKey) return;
    e.preventDefault();
    const rect = vp.getBoundingClientRect();
    const nextScale = Math.max(0.4, Math.min(this.scale + (e.deltaY > 0 ? -0.1 : 0.1), 3));
    this._zoomAt(vp, cnt, e.clientX - rect.left, e.clientY - rect.top, nextScale);
  }

  /** Applies `nextScale` while keeping the content point under (mx, my) fixed on screen. */
  private _zoomAt(vp: HTMLElement, cnt: HTMLElement, mx: number, my: number, nextScale: number): void {
    const cx = (mx + vp.scrollLeft) / this.scale;
    const cy = (my + vp.scrollTop)  / this.scale;
    this.scale = nextScale;
    cnt.style.transform = `scale(${this.scale})`;
    vp.scrollLeft = cx * this.scale - mx;
    vp.scrollTop  = cy * this.scale - my;
  }

  /** Converts the current scroll position + viewport size into grid-cell coords. */
  private _updateVisibleRect(vp: HTMLElement): void {
    const gs = this.state.gridSize;
    const s  = this.scale;
    // Visible pixel rect in unscaled container coordinates
    const x1 = Math.floor(vp.scrollLeft  / (gs * s));
    const y1 = Math.floor(vp.scrollTop   / (gs * s));
    const x2 = Math.ceil((vp.scrollLeft  + vp.clientWidth)  / (gs * s));
    const y2 = Math.ceil((vp.scrollTop   + vp.clientHeight) / (gs * s));
    this.ngZone.run(() => this.visibleRect.set({ x1, y1, x2, y2 }));
  }

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  private _onKeyDown(e: KeyboardEvent, vp: HTMLElement): void {
    // ── Ignore shortcuts when the user is typing in a form field ─────
    if (this._isEditingFormField()) return;

    if (e.code === 'Space') { e.preventDefault(); this.isSpaceHeld = true; vp.style.cursor = 'grab'; }

    if (isShiftKey(e) && this._toolBeforeShift === null) {
      this._toolBeforeShift = this.state.activeTool();
      if (this.state.activeTool() !== 'hand') {
        this.ngZone.run(() => this.state.activeTool.set('hand'));
      }
    }

    if (e.key === 'Escape') {
      this.ngZone.run(() => {
        this.drawPopupPendingType = null;
        this.drawPopupStep        = null;
        this.state.drawPopup.set(null);
        this.state.emptySelection.set(null);
      });
    }

    const shortcutTool = toolForShortcutKey(e.key);
    if (shortcutTool) {
      this.ngZone.run(() => { this.state.activeTool.set(shortcutTool); this._toolBeforeShift = null; });
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Before deleting, strip any locs blocked by the active level filter
      // so that hidden-level locs are never accidentally deleted.
      this._deselectLocsOutsideActiveLevel();
      this.ngZone.run(() => this.state.deleteSelected());
    }

    this._handleUndoRedoShortcut(e);
  }

  private _onKeyUp(e: KeyboardEvent, vp: HTMLElement): void {
    if (e.code === 'Space') { this.isSpaceHeld = false; this.isPanning = false; this._updateCursor(vp); }
    if (isShiftKey(e) && this._toolBeforeShift !== null) {
      const prev = this._toolBeforeShift;
      this._toolBeforeShift = null;
      this.ngZone.run(() => this.state.activeTool.set(prev));
    }
  }

  private _handleUndoRedoShortcut(e: KeyboardEvent): void {
    if (!e.ctrlKey && !e.metaKey) return;
    if (e.key === 'z') { e.preventDefault(); this.ngZone.run(() => this.state.undo()); }
    if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); this.ngZone.run(() => this.state.redo()); }
  }

  /** True while focus is inside a text input / select / editable PrimeNG control. */
  private _isEditingFormField(): boolean {
    const active = document.activeElement as HTMLElement | null;
    const tag    = active?.tagName?.toUpperCase() ?? '';
    return (
      tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' ||
      !!active?.isContentEditable ||
      active?.closest('p-inputnumber, p-inputtext, p-autocomplete, p-select, p-dropdown, p-chips, p-textarea') != null
    );
  }

  /** Deselects Locs that belong to a level other than the active level filter. */
  private _deselectLocsOutsideActiveLevel(): void {
    const lv = this.state.activeLevelView();
    if (lv === 'All') return;
    const level = Number.parseInt(lv);
    this.state.items.update(items => items.map(i =>
      i.selected && i.type === 'Loc' && i.level !== level
        ? { ...i, selected: false }
        : i
    ));
  }

  // ─── Pointer helpers ──────────────────────────────────────────────────────

  /** Mouse position in unscaled grid-container pixels. */
  private _containerPoint(e: MouseEvent, cnt: HTMLElement): { px: number; py: number } {
    const rect = cnt.getBoundingClientRect();
    return {
      px: (e.clientX - rect.left) / this.scale,
      py: (e.clientY - rect.top)  / this.scale,
    };
  }

  /** Mouse position in unscaled grid-container pixels, clamped to the grid bounds. */
  private _clampedContainerPoint(e: MouseEvent, cnt: HTMLElement): { px: number; py: number } {
    const { px, py } = this._containerPoint(e, cnt);
    const maxPxX = this.state.gridWidth() * this.state.gridSize;
    const maxPxY = this.state.gridDepth() * this.state.gridSize;
    return {
      px: Math.max(0, Math.min(px, maxPxX)),
      py: Math.max(0, Math.min(py, maxPxY)),
    };
  }

  /** Grid cell under the mouse. */
  private _getCell(e: MouseEvent, cnt: HTMLElement): { gx: number; gy: number } {
    const { px, py } = this._containerPoint(e, cnt);
    const gs = this.state.gridSize;
    return {
      gx: Math.max(0, Math.min(Math.floor(px / gs), this.state.gridWidth()  - 1)),
      gy: Math.max(0, Math.min(Math.floor(py / gs), this.state.gridDepth() - 1)),
    };
  }

  /**
   * Nearest BOUNDARY between cells (Math.round) — used for hallway preview
   * and insertion so the preview appears *between* locs, not on top of them.
   */
  private _getSnapBoundary(e: MouseEvent, cnt: HTMLElement): { gx: number; gy: number } {
    const { px, py } = this._containerPoint(e, cnt);
    const gs = this.state.gridSize;
    return {
      gx: Math.max(0, Math.min(Math.round(px / gs), this.state.gridWidth())),
      gy: Math.max(0, Math.min(Math.round(py / gs), this.state.gridDepth())),
    };
  }

  /** Popup anchor (position:fixed, client coords) right+below the cursor, clamped on screen. */
  private _popupPositionNear(e: MouseEvent): { px: number; py: number } {
    const POPUP_W = 300; // estimated max-width with padding/borders
    const POPUP_H = 550; // estimated max-height for large forms
    const MARGIN  = 20;
    return {
      px: Math.max(MARGIN, Math.min(e.clientX + 12, globalThis.innerWidth  - POPUP_W - MARGIN)),
      py: Math.max(MARGIN, Math.min(e.clientY + 12, globalThis.innerHeight - POPUP_H - MARGIN)),
    };
  }

  /** Replaces the given fields of a single item. */
  private _patchItem(id: string, patch: Partial<GridItem>): void {
    this.state.items.update(items => items.map(i => i.id === id ? { ...i, ...patch } : i));
  }

  // ─── Brush ────────────────────────────────────────────────────────────────

  private _paintBrushCell(gx: number, gy: number): void {
    const key = `${gx},${gy}`;
    if (this.brushPaintedCells.has(key)) return;
    this.brushPaintedCells.add(key);

    const type = this.state.brushType();
    const lvl  = Number.parseInt(this.state.activeLevelView()) || 1;

    if (type === 'Loc' && !this.state.getContainingArea(gx, gy, 1, 1)) {
      const areaName = this._brushPendingAreaName || this.state.nextAreaName();
      this.ngZone.run(() => {
        const area = this.state.addItem('Area', gx, gy, 1, 1, lvl);
        this._patchItem(area.id, { name: areaName });
      });
    }

    const { w, h } = this._brushDimensions();

    this.ngZone.run(() => {
      const item = this.state.addItem(type, gx, gy, w, h, lvl);
      // Brush-created Locs start unnamed — user must assign a name
      if (type === 'Loc') {
        this._patchItem(item.id, { name: '', unnamed: true });
      }
    });
  }

  private _brushDimensions(): { w: number; h: number } {
    const size = this.state.brushSize();
    if (size === 'custom') return { w: this.state.brushCustomW(), h: this.state.brushCustomH() };
    if (size === 'shape')  return { w: this.state.brushShapeW(),  h: this.state.brushShapeH()  };
    return { w: 1, h: 1 };
  }

  // ─── MouseDown ────────────────────────────────────────────────────────────

  private _onViewportMouseDown(e: MouseEvent, vp: HTMLElement, cnt: HTMLElement): void {
    // ── Right-click pan: pan camera on right mouse button (empty space) ──
    // Items have stopPropagation in onItemContextMenu, so this only fires on empty space
    if (e.button === 2) {
      this._startPan(e, vp);
      return;
    }

    if (e.button !== 0) return;

    // Space+drag → pan; Pan Lock mode: left-click also pans when pan button is active
    if (this.isSpaceHeld || this.state.panLockMode()) {
      this._startPan(e, vp);
      return;
    }

    const tool   = this.state.activeTool();
    const target = e.target as HTMLElement;
    const itemEl = target.closest<HTMLElement>('.grid-item');
    const itemId = itemEl?.dataset['itemId'];
    const { gx, gy } = this._getCell(e, cnt);

    if (tool === 'brush') {
      this.isBrushPainting = true;
      this.brushPaintedCells.clear();
      this._paintBrushCell(gx, gy);
      return;
    }

    // ── Hallway tool: record cell + auto-orientation on click ────────
    if (tool === 'hallway') {
      this._startHallwayDrag(e, cnt, gx, gy);
      return;
    }

    if (itemId && (tool === 'hand' || tool === 'arrow')) {
      // Click on item — start drag (item mousedown handles selection)
      return;
    }

    if (tool === 'arrow') {
      this._startRubberBand(e, cnt, false);
      this.ngZone.run(() => {
        this.state.emptySelection.set({ x: gx, y: gy, w: 0, h: 0 });
        this.state.drawPopup.set(null);
        this.drawPopupPendingType = null;
      });
      return;
    }

    if (tool === 'hand') {
      // Drag on empty space with hand tool → rubber-band select (no create popup)
      this._startRubberBand(e, cnt, true);
      this.ngZone.run(() => this.state.emptySelection.set({ x: gx, y: gy, w: 0, h: 0 }));
    }
  }

  private _startPan(e: MouseEvent, vp: HTMLElement): void {
    e.preventDefault();
    this.isPanning         = true;
    this.panStartX         = e.clientX;
    this.panStartY         = e.clientY;
    this.initialScrollLeft = vp.scrollLeft;
    this.initialScrollTop  = vp.scrollTop;
    vp.style.cursor = 'grabbing';
  }

  private _startHallwayDrag(e: MouseEvent, cnt: HTMLElement, gx: number, gy: number): void {
    this.isHallwayDragging = true;
    // Orientation is whatever was auto-detected on the last mousemove
    this.hallwayDragOrientation = this.state.hallwayOrientation();
    // Floor cell for area containment detection
    this.hallwayDragCell        = { gx, gy };
    // Boundary-snapped position for actual insertion (appears between locs)
    const snap         = this._getSnapBoundary(e, cnt);
    this.hallwaySnapGx = snap.gx;
    this.hallwaySnapGy = snap.gy;
  }

  private _startRubberBand(e: MouseEvent, cnt: HTMLElement, isHand: boolean): void {
    if (!e.shiftKey) this.ngZone.run(() => this.state.clearSelection());
    const start = this._clampedContainerPoint(e, cnt);
    this.startPxX        = start.px;
    this.startPxY        = start.py;
    this.isSelecting     = true;
    this.isHandSelecting = isHand;
  }

  // ─── MouseMove ────────────────────────────────────────────────────────────

  private _onWindowMouseMove(e: MouseEvent, vp: HTMLElement, cnt: HTMLElement): void {
    if (this.isPanning) {
      vp.scrollLeft = this.initialScrollLeft + (this.panStartX - e.clientX);
      vp.scrollTop  = this.initialScrollTop  + (this.panStartY - e.clientY);
      return;
    }

    if (this.isDraggingItems) {
      this._dragSelectedItems(e);
      return;
    }

    if (this.isSelecting) this._updateRubberBand(e, cnt);

    if (this.isBrushPainting) {
      const { gx, gy } = this._getCell(e, cnt);
      this._paintBrushCell(gx, gy);
    }

    if (this.isResizingGizmo) this._resizeGizmoTo(e);

    // ── Hallway tool: live preview line on grid borders (auto-orientation) ──
    if (this.state.activeTool() === 'hallway') {
      this._updateHallwayPreview(e, cnt);
    } else {
      // Hide preview when not using the hallway tool
      this._hideHallwayPreview();
    }
  }

  private _dragSelectedItems(e: MouseEvent): void {
    const gs   = this.state.gridSize;
    const dxG  = Math.round((e.clientX - this.dragStartX) / (gs * this.scale));
    const dyG  = Math.round((e.clientY - this.dragStartY) / (gs * this.scale));
    const maxX = this.state.gridWidth();
    const maxY = this.state.gridDepth();
    this.ngZone.run(() => {
      this.state.items.update(items => items.map(i => {
        const orig = this.dragStartContext.get(i.id);
        if (!orig) return i;
        const clampedGx = Math.max(0, Math.min(orig.x + dxG, maxX - i.gw));
        const clampedGy = Math.max(0, Math.min(orig.y + dyG, maxY - i.gh));
        return { ...i, gx: clampedGx, gy: clampedGy };
      }));
      this._updateDragCollisionState();
    });
  }

  /**
   * Collision detection for the items being dragged.
   * Rules:
   * 1. Areas are ignored entirely (never collide).
   * 2. Hallways can overlap Locs (they push them), but NOT Walls.
   * 3. Locs from the SAME area can stack on the same position if
   *    they have different levels (multi-level rack behaviour).
   * 4. Locs from DIFFERENT areas always collide when overlapping.
   * 5. Non-hallway items collide with Walls and other non-Hallway items.
   */
  private _updateDragCollisionState(): void {
    const allItems   = this.state.items();
    const dragged    = allItems.filter(i => this.dragStartContext.has(i.id));
    const stationary = allItems.filter(i =>
      !this.dragStartContext.has(i.id) && i.type !== 'Area'
    );

    const hasCollision = dragged.some(d =>
      d.type !== 'Area' && stationary.some(s => dragItemsCollide(d, s))
    );

    // Detect if the collision was specifically due to different-area overlap
    const hasCrossAreaCollision = hasCollision && dragged.some(d =>
      d.type === 'Loc' && stationary.some(s => isCrossAreaLocOverlap(d, s))
    );

    // ── Cross-area move detection ──────────────────────────────
    // Prevent Locs from being dragged into a different Area.
    const areas = allItems.filter(i => i.type === 'Area');
    const crossAreaMove = !hasCollision && dragged.some(d => isCrossAreaMove(d, dragged, areas));

    this.dragHasCollision.set(hasCollision || crossAreaMove);
    this.dragAreaWarning.set(crossAreaMove || hasCrossAreaCollision);
  }

  private _updateRubberBand(e: MouseEvent, cnt: HTMLElement): void {
    const { px: curX, py: curY } = this._clampedContainerPoint(e, cnt);
    const gs    = this.state.gridSize;
    const maxGx = this.state.gridWidth();
    const maxGy = this.state.gridDepth();
    const x1 = Math.max(0, Math.floor(Math.min(this.startPxX, curX) / gs));
    const y1 = Math.max(0, Math.floor(Math.min(this.startPxY, curY) / gs));
    const x2 = Math.min(maxGx, Math.ceil( Math.max(this.startPxX, curX) / gs));
    const y2 = Math.min(maxGy, Math.ceil( Math.max(this.startPxY, curY) / gs));
    this.ngZone.run(() => this.state.emptySelection.set({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }));
  }

  private _resizeGizmoTo(e: MouseEvent): void {
    const orig = this.resizeStartCtx;
    const gs   = this.state.gridSize;
    const dxG  = Math.round((e.clientX - orig.startMouseX) / (gs * this.scale));
    const dyG  = Math.round((e.clientY - orig.startMouseY) / (gs * this.scale));
    const dir  = this.resizeDir;
    const maxX = this.state.gridWidth();
    const maxY = this.state.gridDepth();
    let newGx = orig.itemGx, newGy = orig.itemGy;
    let newGw = orig.itemGw, newGh = orig.itemGh;
    if (dir.includes('e')) newGw = Math.max(1, orig.itemGw + dxG);
    if (dir.includes('s')) newGh = Math.max(1, orig.itemGh + dyG);
    if (dir.includes('w')) { newGx = orig.itemGx + Math.min(orig.itemGw - 1, dxG); newGw = Math.max(1, orig.itemGw - dxG); }
    if (dir.includes('n')) { newGy = orig.itemGy + Math.min(orig.itemGh - 1, dyG); newGh = Math.max(1, orig.itemGh - dyG); }
    // Clamp position to grid bounds
    newGx = Math.max(0, newGx);
    newGy = Math.max(0, newGy);
    // Clamp size so item doesn't extend past grid edge
    newGw = Math.min(newGw, maxX - newGx);
    newGh = Math.min(newGh, maxY - newGy);
    this.ngZone.run(() => this._patchItem(orig.itemId, { gx: newGx, gy: newGy, gw: newGw, gh: newGh }));
  }

  // ─── Hallway preview ──────────────────────────────────────────────────────

  private _hideHallwayPreview(): void {
    const previewEl = document.getElementById('hallway-preview-line');
    if (previewEl) previewEl.classList.add('hidden');
  }

  private _updateHallwayPreview(e: MouseEvent, cnt: HTMLElement): void {
    const previewEl = cnt.querySelector<HTMLElement>('#hallway-preview-line')
                   ?? document.getElementById('hallway-preview-line');
    if (!previewEl) return;

    const { px, py } = this._containerPoint(e, cnt);
    const gs         = this.state.gridSize;
    const hw         = this.state.hallwayWidth();

    // Position within the current cell (0..gs)
    const inCellX = ((px % gs) + gs) % gs;
    const inCellY = ((py % gs) + gs) % gs;

    // Distance to nearest vertical border vs nearest horizontal border
    const distToVert  = Math.min(inCellX, gs - inCellX);
    const distToHoriz = Math.min(inCellY, gs - inCellY);

    // Auto-detect: whichever border the cursor is closest to
    const orientation: 'horizontal' | 'vertical' =
      distToHoriz <= distToVert ? 'horizontal' : 'vertical';

    // Keep the toolbar toggle in sync so it reflects the current auto-detect
    if (this.state.hallwayOrientation() !== orientation) {
      this.state.hallwayOrientation.set(orientation);
    }

    // Floor cell under the cursor
    const hx = Math.floor(px / gs);
    const hy = Math.floor(py / gs);

    // Snapped boundary (nearest grid line)
    const snapGx = Math.round(px / gs);
    const snapGy = Math.round(py / gs);

    // ── Only show preview when a Loc is adjacent to (or overlaps) the snapped border ──
    if (!this._hasLocAlongHallwayLine(orientation, snapGx, snapGy, hx, hy)) {
      previewEl.classList.add('hidden');
      return;
    }

    // Preview line: very thin (4px) line sitting on the grid border
    // For horizontal: full-span width, 4px tall, centered on the row border
    // For vertical:   4px wide, full-span height, centered on the col border
    const LINE_PX = 4; // visual thickness in grid-container pixels
    const span    = this._hallwayLineSpan(orientation, snapGx, snapGy, hx, hy);
    const spanLen = span.end - span.start;

    // Store the computed span for use at creation time
    if (orientation === 'horizontal') {
      previewEl.style.left   = span.start * gs + 'px';
      previewEl.style.top    = snapGy * gs - LINE_PX / 2 + 'px';
      previewEl.style.width  = spanLen * gs + 'px';
      previewEl.style.height = LINE_PX + 'px';
      this._hallwayPreviewSpan = {
        gx: Number.parseInt(previewEl.style.left) / gs, gy: snapGy,
        gw: Number.parseInt(previewEl.style.width) / gs, gh: hw,
      };
    } else {
      previewEl.style.left   = snapGx * gs - LINE_PX / 2 + 'px';
      previewEl.style.top    = span.start * gs + 'px';
      previewEl.style.width  = LINE_PX + 'px';
      previewEl.style.height = spanLen * gs + 'px';
      this._hallwayPreviewSpan = {
        gx: snapGx, gy: Number.parseInt(previewEl.style.top) / gs,
        gw: hw, gh: Number.parseInt(previewEl.style.height) / gs,
      };
    }
    previewEl.classList.remove('hidden');
  }

  /**
   * True when some Loc borders (or overlaps) the hallway grid line at the
   * snapped boundary, and spans the cursor cell (cx, cy) along the line.
   */
  private _hasLocAlongHallwayLine(
    orientation: 'horizontal' | 'vertical',
    snapGx: number, snapGy: number,
    cx: number, cy: number,
  ): boolean {
    const locs = this.state.items().filter(i => i.type === 'Loc');
    if (orientation === 'horizontal') {
      return locs.some(l => touchesGridLine(l.gy, l.gh, snapGy) && spanCovers(l.gx, l.gw, cx));
    }
    return locs.some(l => touchesGridLine(l.gx, l.gw, snapGx) && spanCovers(l.gy, l.gh, cy));
  }

  /**
   * Contiguous span (along the line) of Locs + Hallways touching the hallway
   * grid line, picking the run that contains the cursor.
   */
  private _hallwayLineSpan(
    orientation: 'horizontal' | 'vertical',
    snapGx: number, snapGy: number,
    hx: number, hy: number,
  ): { start: number; end: number } {
    const horizontal = orientation === 'horizontal';
    const line       = horizontal ? snapGy : snapGx;
    const cursor     = horizontal ? hx : hy;
    // Find all locs AND hallways touching or overlapping this line
    const elements = this.state.items().filter(i => i.type === 'Loc' || i.type === 'Hallway');
    const touching = elements.filter(l =>
      horizontal ? touchesGridLine(l.gy, l.gh, line) : touchesGridLine(l.gx, l.gw, line)
    );
    const ranges = touching.map(l =>
      horizontal ? { start: l.gx, end: l.gx + l.gw } : { start: l.gy, end: l.gy + l.gh }
    );
    // Flood-fill: find the contiguous group connected to the cursor
    const merged = mergeRanges(ranges);
    return merged.find(s => cursor >= s.start && cursor < s.end)
        ?? { start: Math.min(...ranges.map(r => r.start)), end: Math.max(...ranges.map(r => r.end)) };
  }

  // ─── MouseUp ──────────────────────────────────────────────────────────────

  private _onWindowMouseUp(e: MouseEvent, vp: HTMLElement): void {
    if (this.isPanning)     { this.isPanning = false; this._updateCursor(vp); return; }

    if (this.isDraggingItems) {
      this._finishItemDrag();
      return;
    }

    if (this.isSelecting) {
      this._finishRubberBand(e);
      return;
    }

    if (this.isBrushPainting) {
      this.isBrushPainting = false;
      this.brushPaintedCells.clear();
      this.ngZone.run(() => this.state.saveHistory());
      return;
    }

    // ── Hallway tool mouseup: insert hallway at clicked position ──────
    if (this.isHallwayDragging) {
      this._finishHallwayDrag();
      return;
    }

    if (this.isResizingGizmo) {
      this._finishGizmoResize();
    }
  }

  private _finishItemDrag(): void {
    this.isDraggingItems = false;
    const hadCollision = this.dragHasCollision();
    const hadAreaWarning = this.dragAreaWarning();
    this.dragHasCollision.set(false);
    this.dragAreaWarning.set(false);

    // ── Special case: a single Hallway was dragged ──────────────────────
    const hwOrigin = this.hallwayMoveOrigin;
    if (hwOrigin) {
      this.hallwayMoveOrigin = null;
      this._finishHallwayMove(hwOrigin);
      return;
    }

    // ── General items drag ─────────────────────────────────────────────
    if (hadCollision) {
      // Collision detected → snap all dragged items back to original position
      this.ngZone.run(() => this._restoreDraggedItems());
      // Show cross-area warning message
      if (hadAreaWarning) {
        this.ngZone.run(() => this._showCrossAreaWarning());
      }
    } else {
      // No collision → commit the move, then re-fit areas to their locs
      this.ngZone.run(() => {
        this.state.fitAreasToLocs();
        this.state.saveHistory();
      });
    }
  }

  private _finishHallwayMove(hwOrigin: { id: string; gx: number; gy: number; orientation: 'horizontal' | 'vertical' }): void {
    const movedHw = this.state.items().find(i => i.id === hwOrigin.id);
    if (!movedHw) {
      this.ngZone.run(() => this.state.saveHistory());
      return;
    }

    const newGridLine = hwOrigin.orientation === 'horizontal' ? movedHw.gy : movedHw.gx;
    const origLine    = hwOrigin.orientation === 'horizontal' ? hwOrigin.gy : hwOrigin.gx;

    if (newGridLine === origLine) {
      this.ngZone.run(() => this.state.saveHistory());
      return;
    }

    this._patchItem(hwOrigin.id, { gx: hwOrigin.gx, gy: hwOrigin.gy });
    this.ngZone.run(() => this.state.moveHallway(hwOrigin.id, newGridLine));
  }

  private _restoreDraggedItems(): void {
    this.state.items.update(items => items.map(i => {
      const orig = this.dragStartContext.get(i.id);
      if (!orig) return i;
      return { ...i, gx: orig.x, gy: orig.y };
    }));
  }

  private _showCrossAreaWarning(): void {
    this.state.warningMessage.set(this.translate.instant('preferences.location.cross_area_warning'));
    clearTimeout(this.dragAreaWarningTimer);
    this.dragAreaWarningTimer = setTimeout(() => this.state.warningMessage.set(null), 3000);
  }

  private _finishRubberBand(e: MouseEvent): void {
    this.isSelecting = false;
    const isHand = this.isHandSelecting;
    this.isHandSelecting = false;

    const sel = this.state.emptySelection();
    if (!sel) {
      this.ngZone.run(() => this.state.emptySelection.set(null));
      return;
    }

    // Ensure at least 1×1 grid cell on single click (no drag)
    if (sel.w === 0 && sel.h === 0) {
      sel.w = 1;
      sel.h = 1;
    }

    const hit = this._itemsInSelection(sel);
    const isArrowDrag = !isHand && sel.w > 0 && sel.h > 0;

    if (hit.length > 0 && isArrowDrag) {
      // Arrow tool + items found → show popup with only Wall/Conveyor
      const { px, py } = this._popupPositionNear(e);
      this.ngZone.run(() => {
        this.state.drawPopup.set({ px, py, gx: sel.x, gy: sel.y, gw: sel.w, gh: sel.h, types: ['Wall', 'Conveyor'] });
      });
    } else if (hit.length > 0) {
      // Hand tool or single click → select items
      this.ngZone.run(() => {
        this._addToSelection(hit);
        this.state.emptySelection.set(null);
      });
    } else if (isArrowDrag) {
      // Arrow tool on empty area → show create popup (position:fixed, uses client coords)
      const { px, py } = this._popupPositionNear(e);
      const types = this.state.getTypesAllowedAt(sel.x, sel.y, sel.w, sel.h);
      this.ngZone.run(() => {
        this.state.drawPopup.set({ px, py, gx: sel.x, gy: sel.y, gw: sel.w, gh: sel.h, types });
      });
    } else {
      // Hand tool on empty area → just clear
      this.ngZone.run(() => this.state.emptySelection.set(null));
    }
  }

  /** Items overlapping the selection rect (Locs outside the active level are not selectable). */
  private _itemsInSelection(sel: { x: number; y: number; w: number; h: number }): GridItem[] {
    const items = this.state.items();
    const lvFilter = this.state.activeLevelView();
    return items.filter(i => {
      // Must overlap the selection rectangle
      if (!(i.gx < sel.x + sel.w && i.gx + i.gw > sel.x &&
            i.gy < sel.y + sel.h && i.gy + i.gh > sel.y)) return false;
      // Loc items outside the active level are not selectable
      if (lvFilter !== 'All' && i.type === 'Loc' && i.level !== Number.parseInt(lvFilter)) return false;
      return true;
    });
  }

  private _addToSelection(hit: GridItem[]): void {
    this.state.items.update(items => items.map(i => ({
      ...i, selected: hit.some(h => h.id === i.id) || i.selected
    })));
  }

  private _finishHallwayDrag(): void {
    this.isHallwayDragging = false;
    const cell = this.hallwayDragCell;
    if (cell) {
      const orientation = this.hallwayDragOrientation;
      // ── Guard: only place hallway when a Loc is adjacent to or at the border ──
      if (this._hasLocAlongHallwayLine(orientation, this.hallwaySnapGx, this.hallwaySnapGy, cell.gx, cell.gy)) {
        // Always use the computed preview span for full-line hallway creation
        this.ngZone.run(() => this._createHallwayAtPreview(cell, orientation));
      }
    }
    this.hallwayDragCell = null;
    this._hallwayPreviewSpan = null;
  }

  private _createHallwayAtPreview(cell: { gx: number; gy: number }, orientation: 'horizontal' | 'vertical'): void {
    const hw   = this.state.hallwayWidth();
    const lvl  = Number.parseInt(this.state.activeLevelView()) || 1;
    const isHoriz = orientation === 'horizontal';
    const span = this._hallwayPreviewSpan ?? {
      gx: cell.gx,
      gy: cell.gy,
      gw: isHoriz ? 5 : hw,
      gh: isHoriz ? hw : 5,
    };
    const item = this.state.addItem('Hallway', span.gx, span.gy, span.gw, span.gh, lvl);
    this._patchItem(item.id, { hallwayOrientation: orientation });
    this.state.saveHistory();
  }

  private _finishGizmoResize(): void {
    this.isResizingGizmo = false;
    const ctx = this.resizeStartCtx;

    if (ctx?.itemType !== 'Hallway') {
      this.ngZone.run(() => this.state.saveHistory());
      return;
    }

    // Get the current (dragged) hallway dimensions
    const current = this.state.items().find(i => i.id === ctx.itemId);
    if (!current) return;

    const isHoriz = ctx.hallwayOrientation === 'horizontal';
    const newThickness = isHoriz ? current.gh : current.gw;

    // Revert the hallway to its original dimensions first —
    // the generic drag only updated the hallway itself without
    // adjusting neighbors or the area
    this._patchItem(ctx.itemId, { gx: ctx.itemGx, gy: ctx.itemGy, gw: ctx.itemGw, gh: ctx.itemGh });

    // Now apply via the proper method that shifts everything
    this.ngZone.run(() => {
      this.state.resizeHallway(ctx.itemId, newThickness, this.resizeDir);
    });
  }

  // ─── Bin Planner ────────────────────────────────────────────────────────────

  onOpenBinPlanner(item: GridItem): void {
    this.binPlannerLocationCode.set(item.name);
    this.showBinPlanner.set(true);
  }

  onBinPlannerApply(result: BinPlannerResult): void {
    console.log('[Viewport] Bin Planner applied for', this.binPlannerLocationCode(), ':', result.bins.length, 'bins');
    this.showBinPlanner.set(false);
  }

  onOpenBulkBinPlanner(locs: GridItem[]): void {
    this.bulkBinPlannerCodes.set(locs.map(l => l.name));
    this.showBulkBinPlanner.set(true);
  }

  onBulkBinPlannerApply(result: BinPlannerResult): void {
    console.log('[Viewport] Bulk Bin Planner applied for', this.bulkBinPlannerCodes().length, 'locations:', result.bins.length, 'bins');
    this.showBulkBinPlanner.set(false);
  }
}
