import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { GridItem, Warehouse2dStateService } from '../components/warehouse-planner/services/warehouse-2d-state.service';
import { LocationService } from '../location.service';
import { LayoutResponse, Location } from '../types/location.types';

/** Locations sharing one physical position (same area-aisle-bay, any level) */
interface PositionGroup {
  key: string;
  locs: Location[];
}

@Injectable({ providedIn: 'root' })
export class FacilityPlannerService {
  private readonly state = inject(Warehouse2dStateService);
  private readonly locationService = inject(LocationService);
  private readonly messageService = inject(MessageService);

  loadLayout(facilityId: string): void {
    this.state.isLoadingLayout.set(true);
    this.locationService.getWarehouseLayout(facilityId).subscribe({
      next: (layout) => {
        const hasLocations = layout.locations?.length > 0;
        const hasItems = layout.layout_items?.length > 0;

        if (!hasLocations && !hasItems) {
          this.state.setItems([]);
          this.state.isLoadingLayout.set(false);
          this.messageService.add({
            severity: 'info',
            summary: 'Info',
            detail: 'No elements found in this facility, start creating'
          });
          return;
        }

        // Detect if layout is "unpositioned" (no items and all locations at 0,0)
        const isUnpositioned = (layout.layout_items?.length === 0) && 
                              (hasLocations) &&
                              (layout.locations.every(l => l.gx === 0 && l.gy === 0));

        if (isUnpositioned) {
          this.generateAutoLayout(layout.locations);
          this.state.isLoadingLayout.set(false);
          this.messageService.add({
            key: 'autoLayout',
            severity: 'warn',
            summary: 'Layout Reorganized',
            detail: 'Your locations were reordered because they didn\'t have a position added, save changes to assign the position',
            sticky: true
          });
          return;
        }

        const items = this.mapLayoutToGridItems(layout);
        if (items.length === 0) {
          // Fallback to mock if no layout exists yet
          this.generateMockLayout(facilityId);
        } else {
          this.state.setItems(items);
        }
        this.state.isLoadingLayout.set(false);
      },
      error: (err) => {
        this.state.isLoadingLayout.set(false);
        console.error('Error loading layout:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load facility layout'
        });
      }
    });
  }


  private mapLayoutToGridItems(layout: LayoutResponse): GridItem[] {
    const items: GridItem[] = [];

    // 1. Map locations (Loc items)
    const locItems: GridItem[] = [];
    if (layout.locations) {
      layout.locations.forEach(loc => {
        // Only include if it has coordinates
        if (loc.gx !== undefined && loc.gy !== undefined) {
          locItems.push({
            id: loc.id,
            name: loc.location_code,
            type: 'Loc',
            gx: loc.gx,
            gy: loc.gy,
            gw: loc.gw || 1,
            gh: loc.gh || 1,
            level: loc.level_num || 1,
            baseZ: 20, // Default for locations
            locked: true,
            category: loc.operational_category_code || 'REGULAR',
            bayType: loc.location_profile_code || undefined,  // the profile code (e.g. 'F', 'L', 'M')
            zoneId: loc.zone_id || undefined,
          });
        }
      });
    }

    // 2. Derive Area items from Locs by grouping on the leading-letter prefix.
    //    Instead of one big bounding-box per prefix (which spans hallways),
    //    we split into contiguous row-bands so areas only cover actual loc rows.
    const areaMap = new Map<string, GridItem[]>();
    locItems.forEach(loc => {
      const match = /^([A-Z]{1,2})/.exec(loc.name);
      if (!match) return;
      const prefix = match[1];
      if (!areaMap.has(prefix)) areaMap.set(prefix, []);
      areaMap.get(prefix)!.push(loc);
    });

    areaMap.forEach((locsInArea, prefix) => {
      // Group locs by their gy (row) and find contiguous row-bands
      const rowMap = new Map<number, GridItem[]>();
      for (const loc of locsInArea) {
        const arr = rowMap.get(loc.gy) ?? [];
        arr.push(loc);
        rowMap.set(loc.gy, arr);
      }
      const sortedRows = [...rowMap.keys()].sort((a, b) => a - b);

      // Split into contiguous bands (consecutive gy values)
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

      // Create one area per contiguous band
      bands.forEach((band, idx) => {
        const bandLocs = band.flatMap(row => rowMap.get(row)!);
        const minGx = Math.min(...bandLocs.map(l => l.gx));
        const minGy = Math.min(...bandLocs.map(l => l.gy));
        const maxGx = Math.max(...bandLocs.map(l => l.gx + l.gw));
        const maxGy = Math.max(...bandLocs.map(l => l.gy + l.gh));

        items.push({
          id:    bands.length === 1 ? `area-${prefix}` : `area-${prefix}-${idx}`,
          name:  prefix,
          type:  'Area',
          gx:    minGx,
          gy:    minGy,
          gw:    maxGx - minGx,
          gh:    maxGy - minGy,
          level: 1,
          baseZ: 1,
        });
      });
    });

    items.push(...locItems);

    // 3. Map visual layout items (Walls, Hallways, Doors)
    if (layout.layout_items) {
      layout.layout_items.forEach(item => {
        if (!item.type) return; // skip items with no type (defensive guard)
        items.push({
          id: item.id,
          name: item.metadata?.name || item.type,
          type: item.type as any,
          gx: item.gx,
          gy: item.gy,
          gw: item.gw || 1,
          gh: item.gh || 1,
          level: 1,
          baseZ: item.type === 'Hallway' ? 5 : 10,
          connections: item.metadata?.connections,
          hallwayOrientation: item.metadata?.hallwayOrientation
        });
      });
    }

    return items;
  }



  generateMockLayout(facilityId: string): void {
    const items: GridItem[] = [];
    
    // Main Entrance Door
    items.push({
      id: 'Door_1', name: 'Main Entrance', type: 'Door',
      gx: 5, gy: 2, gw: 3, gh: 2, level: 1, baseZ: 10
    });

    // Use facilityId to determine the pattern (sum char codes for better variance)
    const seed = facilityId.split('').reduce((acc, char) => acc + (char.codePointAt(0) ?? 0), 0) % 5;

    if (seed === 0) {
      // Pattern 1: Grid of Vertical Aisles
      for (let i = 0; i < 6; i++) {
        this.addLocBlock(items, 10 + (i * 4), 8, 2, 12, `F1-${i+1}`);
      }
    } else if (seed === 1) {
      // Pattern 2: Horizontal Rows
      for (let i = 0; i < 4; i++) {
        this.addLocBlock(items, 10, 10 + (i * 4), 20, 2, `F2-${i+1}`);
      }
    } else if (seed === 2) {
      // Pattern 3: Peripheral Layout
      this.addLocBlock(items, 5, 8, 2, 20, 'F3-P1');
      this.addLocBlock(items, 30, 8, 2, 20, 'F3-P2');
      this.addLocBlock(items, 8, 30, 20, 2, 'F3-P3');
    } else if (seed === 3) {
      // Pattern 4: Compact Blocks
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          this.addLocBlock(items, 12 + (c * 8), 10 + (r * 8), 6, 6, `F4-${r}${c}`);
        }
      }
    } else {
      // Pattern 5: Large Central Block
      this.addLocBlock(items, 15, 10, 10, 10, 'F5-C');
      // Some satellite blocks
      this.addLocBlock(items, 5, 10, 4, 4, 'F5-S1');
      this.addLocBlock(items, 30, 10, 4, 4, 'F5-S2');
    }

    this.state.setItems(items);
  }

  private generateAutoLayout(locations: Location[]): void {
    const items: GridItem[] = [];
    
    // 1. Sort locations alphanumerically
    const sortedLocs = [...locations].sort((a, b) => 
      a.location_code.localeCompare(b.location_code, undefined, { numeric: true, sensitivity: 'base' })
    );

    // 2. Group locations by physical position (same area-aisle-bay, ignoring level).
    const positionGroups = this.groupByPosition(sortedLocs);

    const maxLocsPerRow = 15;
    const rackDepth = 2;
    const startGx = 2;
    const startGy = 2;

    let posIndex = 0;
    let currentGy = startGy;
    let maxGxReached = startGx;

    // 3. Build racks — one grid cell per physical position
    while (posIndex < positionGroups.length) {
      const posLeft = positionGroups.length - posIndex;
      // Use a single row when few positions remain; otherwise pair into 2-row racks
      const effectiveDepth = posLeft <= maxLocsPerRow ? 1 : rackDepth;
      const currentRackPosCount = Math.min(posLeft, maxLocsPerRow * effectiveDepth);
      const rackWidth = Math.ceil(currentRackPosCount / effectiveDepth);
      
      // Add Rack rows
      ({ posIndex, maxGxReached } = this.placeAutoLayoutRack(items, positionGroups, {
        posIndex, maxGxReached, effectiveDepth, rackWidth, startGx, rackGy: currentGy,
      }));

      currentGy += effectiveDepth;

      // Add a horizontal hallway if there are more positions
      if (posIndex < positionGroups.length) {
        items.push(this.createHallwayItem(`H_Aisle_${currentGy}`, startGx, currentGy, rackWidth, 1, 'horizontal'));
        currentGy += 1;
      }
    }

    // 3. Add perimeter hallways
    const totalWidth = maxGxReached - startGx + 1;
    const totalHeight = currentGy - startGy;

    items.push(
      // Top
      this.createHallwayItem('H_Perim_Top', startGx - 1, startGy - 1, totalWidth + 2, 1, 'horizontal'),
      // Bottom
      this.createHallwayItem('H_Perim_Bottom', startGx - 1, currentGy, totalWidth + 2, 1, 'horizontal'),
      // Left
      this.createHallwayItem('H_Perim_Left', startGx - 1, startGy, 1, totalHeight, 'vertical'),
      // Right
      this.createHallwayItem('H_Perim_Right', maxGxReached + 1, startGy, 1, totalHeight, 'vertical'),
    );

    // Build snapshot of the original backend state (positions are 0,0)
    // so dirty detection knows which locations need their positions updated on save.
    const backendItems: GridItem[] = locations.map(loc => ({
      id: loc.id,
      name: loc.location_code,
      type: 'Loc' as string,
      gx: loc.gx ?? 0,
      gy: loc.gy ?? 0,
      gw: loc.gw || 1,
      gh: loc.gh || 1,
      level: loc.level_num || 1,
      baseZ: 20,
      locked: true,
      category: loc.operational_category_code || 'REGULAR',
      bayType: loc.location_profile_code || undefined,
    }));

    this.state.setItems(items, false);            // don't mark as clean — positions differ from backend
    this.state.setBackendSnapshot(backendItems);  // snapshot the real backend state for dirty detection
  }

  /**
   * Groups locations by physical position (same area-aisle-bay, ignoring level),
   * preserving the input order. Levels are vertical shelves at the same gx/gy.
   * Location code format: {Area}-{Aisle}-{Bay}-{Level}
   */
  private groupByPosition(sortedLocs: Location[]): PositionGroup[] {
    const positionGroups: PositionGroup[] = [];
    const positionMap = new Map<string, Location[]>();

    for (const loc of sortedLocs) {
      const parts = loc.location_code.split('-');
      // Key is everything except the level (last part)
      const posKey = parts.length >= 4
        ? parts.slice(0, 3).join('-')
        : loc.location_code;

      if (!positionMap.has(posKey)) {
        const group: Location[] = [];
        positionMap.set(posKey, group);
        positionGroups.push({ key: posKey, locs: group });
      }
      positionMap.get(posKey)!.push(loc);
    }
    return positionGroups;
  }

  /** Places one rack (effectiveDepth rows × rackWidth cols) of positions; returns the next position index and max gx */
  private placeAutoLayoutRack(
    items: GridItem[],
    positionGroups: PositionGroup[],
    rack: { posIndex: number; maxGxReached: number; effectiveDepth: number; rackWidth: number; startGx: number; rackGy: number },
  ): { posIndex: number; maxGxReached: number } {
    let { posIndex, maxGxReached } = rack;
    for (let row = 0; row < rack.effectiveDepth; row++) {
      for (let col = 0; col < rack.rackWidth; col++) {
        if (posIndex < positionGroups.length) {
          const group = positionGroups[posIndex++];
          const gx = rack.startGx + col;
          const gy = rack.rackGy + row;

          // All levels at this position share the same gx/gy
          for (const loc of group.locs) {
            items.push(this.autoLayoutLocItem(loc, gx, gy));
          }
          
          if (gx > maxGxReached) maxGxReached = gx;
        }
      }
    }
    return { posIndex, maxGxReached };
  }

  private autoLayoutLocItem(loc: Location, gx: number, gy: number): GridItem {
    return {
      id: loc.id,
      name: loc.location_code,
      type: 'Loc',
      gx,
      gy,
      gw: 1,
      gh: 1,
      level: loc.level_num || 1,
      baseZ: 20,
      locked: true,
      category: loc.operational_category_code || 'REGULAR',
      bayType: loc.location_profile_code || undefined
    };
  }

  private createHallwayItem(id: string, gx: number, gy: number, gw: number, gh: number, orientation: 'horizontal' | 'vertical'): GridItem {
    return {
      id,
      name: 'Hallway',
      type: 'Hallway',
      gx,
      gy,
      gw,
      gh,
      level: 1,
      baseZ: 5,
      hallwayOrientation: orientation
    };
  }

  private addLocBlock(items: GridItem[], gx: number, gy: number, gw: number, gh: number, prefix: string): void {
    const hZ = 5;
    items.push(
      // Top strip
      {
        id: `H-T-${prefix}`, name: 'Aisle', type: 'Hallway',
        gx: gx - 1, gy: gy - 1, gw: gw + 2, gh: 1,
        level: 1, baseZ: hZ, hallwayOrientation: 'horizontal'
      },
      // Bottom strip
      {
        id: `H-B-${prefix}`, name: 'Aisle', type: 'Hallway',
        gx: gx - 1, gy: gy + gh, gw: gw + 2, gh: 1,
        level: 1, baseZ: hZ, hallwayOrientation: 'horizontal'
      },
      // Left strip
      {
        id: `H-L-${prefix}`, name: 'Aisle', type: 'Hallway',
        gx: gx - 1, gy: gy, gw: 1, gh: gh,
        level: 1, baseZ: hZ, hallwayOrientation: 'vertical'
      },
      // Right strip
      {
        id: `H-R-${prefix}`, name: 'Aisle', type: 'Hallway',
        gx: gx + gw, gy: gy, gw: 1, gh: gh,
        level: 1, baseZ: hZ, hallwayOrientation: 'vertical'
      },
    );

    // Add locations
    for (let r = 0; r < gh; r++) {
      for (let c = 0; c < gw; c++) {
        const id = `${prefix}-${(r + 1).toString().padStart(2, '0')}-${(c + 1).toString().padStart(2, '0')}`;
        items.push({
          id, name: id, type: 'Loc',
          gx: gx + c, gy: gy + r, gw: 1, gh: 1,
          level: 1, baseZ: 20
        });
      }
    }
  }
}
