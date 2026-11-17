import { Injectable, signal, inject, computed } from '@angular/core';
import { forkJoin } from 'rxjs';
import { Warehouse2dStateService, GridItem } from '../../preferences/locations/components/warehouse-planner/services/warehouse-2d-state.service';
import { PickingRouteService, SkuInfo, OrderRouteInput } from '../../preferences/locations/components/warehouse-planner/services/picking-route.service';
import { LocationService } from '../../preferences/locations/location.service';
import { FacilityPlannerService } from '../../preferences/locations/services/facility-planner.service';
import { Facility, LayoutItem, LayoutResponse, Location as WarehouseLocation } from '../../preferences/locations/types/location.types';

// ─── Simulation Order Definitions ─────────────────────────────────────────────

interface SimulationOrder {
  id: string;
  skus: SkuInfo[];
}

const SIMULATION_ORDERS: SimulationOrder[] = [
  {
    id: 'SeriousOrder01',
    skus: [
      { code: 'sku001', quantity: 3 },
      { code: 'sku002', quantity: 5 },
    ]
  },
  {
    id: 'SeriousOrder02',
    skus: [
      { code: 'sku003', quantity: 3 },
      { code: 'sku001', quantity: 4 },
      { code: 'sku004', quantity: 3 },
    ]
  },
  {
    id: 'SeriousOrder03',
    skus: [
      { code: 'sku001', quantity: 5 },
      { code: 'sku002', quantity: 5 },
      { code: 'sku003', quantity: 1 },
      { code: 'sku005', quantity: 2 },
    ]
  },
  {
    id: 'SeriousWaveOrder01',
    skus: [
      { code: 'sku002', quantity: 6 },
      { code: 'sku004', quantity: 2 },
      { code: 'sku006', quantity: 4 },
    ]
  },
  {
    id: 'SeriousWaveOrder02',
    skus: [
      { code: 'sku001', quantity: 2 },
      { code: 'sku003', quantity: 7 },
      { code: 'sku005', quantity: 3 },
      { code: 'sku006', quantity: 1 },
    ]
  },
  {
    id: 'SeriousOrder04-12SKU',
    skus: [
      { code: 'sku001', quantity: 2 },
      { code: 'sku002', quantity: 4 },
      { code: 'sku003', quantity: 1 },
      { code: 'sku004', quantity: 3 },
      { code: 'sku005', quantity: 5 },
      { code: 'sku006', quantity: 2 },
      { code: 'sku007', quantity: 1 },
      { code: 'sku008', quantity: 6 },
      { code: 'sku009', quantity: 3 },
      { code: 'sku010', quantity: 2 },
      { code: 'sku011', quantity: 4 },
      { code: 'sku012', quantity: 1 },
    ]
  }
];

// ─── Picker Order (what the component sees) ───────────────────────────────────

export interface PickerOrder {
  id: string;               // Simulation order ID (e.g. 'SeriousOrder01')
  facilityId: string;        // Real facility ID
  facilityName: string;      // Real facility name
  skus: SkuInfo[];           // SKUs in this order
  itemsCount: number;        // Total SKU count
  locationIds: string[];     // Location IDs assigned to each SKU
  layoutItems: GridItem[];   // Full layout of the facility
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PickerService {
  private readonly state = inject(Warehouse2dStateService);
  private readonly routeService = inject(PickingRouteService);
  private readonly locationService = inject(LocationService);
  private readonly facilityPlanner = inject(FacilityPlannerService);

  readonly facilities = signal<Facility[]>([]);
  readonly selectedFacilityId = signal<string | null>(null);
  readonly orders = signal<PickerOrder[]>([]);
  readonly selectedOrderIds = signal<string[]>([]);
  readonly loading = signal(false);

  /** Orders filtered by the selected facility */
  readonly ordersForFacility = computed(() => {
    const facId = this.selectedFacilityId();
    if (!facId) return [];
    return this.orders().filter(o => o.facilityId === facId);
  });

  /** True when at least one order is selected and in picking mode */
  readonly hasSelection = computed(() => this.selectedOrderIds().length > 0);

  selectFacility(facilityId: string | null): void {
    this.selectedFacilityId.set(facilityId);
    this.selectedOrderIds.set([]);
  }

  /**
   * Loads real facilities from the API and generates simulation orders.
   * Each facility gets one of the 3 predefined orders assigned randomly.
   */
  loadFacilitiesAndOrders(): void {
    this.loading.set(true);

    this.locationService.listMyFacilities({
      filter: { is_active: { value: true, match_mode: 'equals' } },
      config: { page: 1, rows: 500 },
    }).subscribe({
      next: (response) => {
        const facilities = response.data || [];
        this.facilities.set(facilities);
        if (facilities.length === 0) {
          this.orders.set([]);
          this.loading.set(false);
          return;
        }

        // For each facility, load its layout and build an order
        const layoutRequests = facilities.map(f =>
          this.locationService.getWarehouseLayout(f.id)
        );

        forkJoin(layoutRequests).subscribe({
          next: (layouts) => {
            const pickerOrders = facilities.flatMap((facility, index) =>
              this.buildOrdersForFacility(facility, layouts[index])
            );

            this.orders.set(pickerOrders);
            this.loading.set(false);
          },
          error: () => {
            this.loading.set(false);
          }
        });
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  /**
   * Builds every simulation order that fits in the given facility's layout.
   * Facilities with no locations produce no orders.
   */
  private buildOrdersForFacility(facility: Facility, layout: LayoutResponse): PickerOrder[] {
    const locations = layout.locations || [];
    if (locations.length === 0) return []; // skip facilities with no locations

    // Sort locations alphabetically by location_code for deterministic assignment
    // Only use level-1 (ground floor) locations — the picker walks on level 1
    // and multi-level locs share the same gx/gy; picking from higher levels
    // would produce IDs that the route builder can't match to level-1 grid items.
    const sortedLocs = locations
      .filter(l => (l.level_num || 1) === 1)
      .sort((a, b) => a.location_code.localeCompare(b.location_code, undefined, { numeric: true, sensitivity: 'base' }));
    const sortedLocIds = sortedLocs.map(l => l.id);

    // Convert layout to GridItems once per facility
    const layoutItems = this.mapLayoutToGridItems(layout);

    // Create all simulation orders for this facility
    const pickerOrders: PickerOrder[] = [];
    for (const simOrder of SIMULATION_ORDERS) {
      const locationIds = assignLocationIds(sortedLocIds, simOrder.skus.length);
      if (locationIds.length === 0) continue; // not enough locations for this order

      pickerOrders.push({
        id: simOrder.id,
        facilityId: facility.id,
        facilityName: facility.name,
        skus: simOrder.skus,
        itemsCount: simOrder.skus.length,
        locationIds,
        layoutItems,
      });
    }
    return pickerOrders;
  }

  selectOrders(orderIds: string[]): void {
    this.selectedOrderIds.set(orderIds);
    if (orderIds.length > 0) {
      const facId = this.selectedFacilityId();
      const allOrders = this.orders();
      const selected = allOrders.filter(o => orderIds.includes(o.id) && o.facilityId === facId);
      if (selected.length === 0) return;

      // Use layout from the first order (same facility = same layout)
      this.state.setItems(selected[0].layoutItems);

      // Build OrderRouteInput array with totes
      const routeInputs: OrderRouteInput[] = selected.map((o, idx) => ({
        orderId:     o.id,
        locationIds: o.locationIds,
        skuInfos:    o.skus,
        tote:        `TOTE-${String(idx + 1).padStart(3, '0')}`,
      }));

      setTimeout(() => {
        this.routeService.generateMultiOrderRoute(routeInputs);
      }, 50);

      setTimeout(() => {
        const firstStop = this.routeService.stops()[0];
        if (firstStop) {
          this.state.scrollTo(firstStop.gx, firstStop.gy);
        }
      }, 500);
    } else {
      this.routeService.clearRoute();
    }
  }

  /** Backward-compatible single-order select */
  selectOrder(orderId: string | null): void {
    this.selectOrders(orderId ? [orderId] : []);
  }

  // ── Private: Layout → GridItem mapping (mirrors FacilityPlannerService) ────

  private mapLayoutToGridItems(layout: LayoutResponse): GridItem[] {
    // 1. Map locations (Loc items)
    const locItems = mapLocationItems(layout.locations ?? []);

    // 2. Derive Area items from Locs by grouping on the leading-letter prefix.
    const items: GridItem[] = [...deriveAreaItems(locItems), ...locItems];

    // 3. Map visual layout items (Walls, Hallways, Doors)
    const visualItems = (layout.layout_items ?? []).filter(item => item.type);
    items.push(...visualItems.map(mapVisualItem));

    // 4. Auto-generate hallways if the facility has none
    //    Without hallways the BFS picking route has no walkable cells.
    const hasHallways = visualItems.some(item => item.type === 'Hallway');
    if (!hasHallways && locItems.length > 0) {
      items.push(...buildAutoHallways(locItems));
    }

    return items;
  }
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

type HallwayOrientation = 'horizontal' | 'vertical';

interface GridRect {
  gx: number;
  gy: number;
  gw: number;
  gh: number;
}

/** Leading one- or two-letter prefix of a location code (e.g. 'A' in 'A-01-02'). */
const AREA_PREFIX_RE = /^([A-Z]{1,2})/;

/**
 * Picks one location per SKU, spread evenly across the sorted locations:
 * positions interval, interval*2, interval*3, etc.
 * Returns an empty list when there are not enough locations.
 */
function assignLocationIds(sortedLocIds: string[], totalSkus: number): string[] {
  const interval = Math.floor(sortedLocIds.length / totalSkus);
  if (interval < 1) return [];

  const locationIds: string[] = [];
  for (let i = 0; i < totalSkus; i++) {
    const locIndex = (interval * (i + 1)) - 1;
    if (locIndex < sortedLocIds.length) {
      locationIds.push(sortedLocIds[locIndex]);
    }
  }
  return locationIds;
}

/** Smallest rectangle (in grid cells) containing every given item. */
function boundingRect(gridItems: GridItem[]): GridRect {
  const minGx = Math.min(...gridItems.map(l => l.gx));
  const minGy = Math.min(...gridItems.map(l => l.gy));
  const maxGx = Math.max(...gridItems.map(l => l.gx + l.gw));
  const maxGy = Math.max(...gridItems.map(l => l.gy + l.gh));
  return { gx: minGx, gy: minGy, gw: maxGx - minGx, gh: maxGy - minGy };
}

/** Maps backend locations with grid coordinates to Loc grid items. */
function mapLocationItems(locations: WarehouseLocation[]): GridItem[] {
  const locItems: GridItem[] = [];
  for (const loc of locations) {
    if (loc.gx === undefined || loc.gy === undefined) continue;
    locItems.push({
      id: loc.id,
      name: loc.location_code,
      type: 'Loc',
      gx: loc.gx,
      gy: loc.gy,
      gw: loc.gw || 1,
      gh: loc.gh || 1,
      level: loc.level_num || 1,
      baseZ: 20,
      locked: true,
      category: loc.operational_category_id ? String(loc.operational_category_id) : 'REGULAR',
      bayType: loc.location_profile_code || undefined
    });
  }
  return locItems;
}

/** One Area item per location-code prefix, covering all of its locations. */
function deriveAreaItems(locItems: GridItem[]): GridItem[] {
  const areaMap = new Map<string, GridItem[]>();
  for (const loc of locItems) {
    const prefix = AREA_PREFIX_RE.exec(loc.name)?.[1];
    if (!prefix) continue;
    const group = areaMap.get(prefix);
    if (group) {
      group.push(loc);
    } else {
      areaMap.set(prefix, [loc]);
    }
  }

  return Array.from(areaMap, ([prefix, locsInArea]) => ({
    id:    `area-${prefix}`,
    name:  prefix,
    type:  'Area',
    ...boundingRect(locsInArea),
    level: 1,
    baseZ: 1,
  }));
}

/** Maps a backend visual layout item (Wall, Hallway, Door…) to a grid item. */
function mapVisualItem(item: LayoutItem): GridItem {
  return {
    id: item.id,
    name: item.metadata?.name || item.type,
    type: item.type,
    gx: item.gx,
    gy: item.gy,
    gw: item.gw || 1,
    gh: item.gh || 1,
    level: 1,
    baseZ: item.type === 'Hallway' ? 5 : 10,
    connections: item.metadata?.connections,
    hallwayOrientation: item.metadata?.hallwayOrientation
  };
}

function autoHallway(id: string, rect: GridRect, orientation: HallwayOrientation): GridItem {
  return {
    id,
    name: 'Hallway',
    type: 'Hallway',
    ...rect,
    level: 1,
    baseZ: 5,
    hallwayOrientation: orientation
  };
}

/**
 * Generates hallway cells around locations so the picking route BFS can work.
 * Creates:
 *  - A hallway row between every 2 rows of racks
 *  - Perimeter hallways around all locations
 */
function buildAutoHallways(locItems: GridItem[]): GridItem[] {
  const bounds = boundingRect(locItems);
  const maxGx = bounds.gx + bounds.gw;
  const maxGy = bounds.gy + bounds.gh;

  // Create hallway for every row adjacent to locations (above & below each row)
  const hallwayRows = new Set<number>();
  for (const loc of locItems) {
    hallwayRows.add(loc.gy - 1); // row above
    hallwayRows.add(loc.gy + loc.gh); // row below
  }

  // Add perimeter
  hallwayRows.add(bounds.gy - 1);
  hallwayRows.add(maxGy);

  const horizontals = [...hallwayRows].map((y, idx) =>
    autoHallway(`auto-hw-h-${idx}`, { gx: bounds.gx - 1, gy: y, gw: bounds.gw + 2, gh: 1 }, 'horizontal')
  );

  // Left & right perimeter verticals
  return [
    ...horizontals,
    autoHallway('auto-hw-v-left', { gx: bounds.gx - 1, gy: bounds.gy, gw: 1, gh: bounds.gh }, 'vertical'),
    autoHallway('auto-hw-v-right', { gx: maxGx, gy: bounds.gy, gw: 1, gh: bounds.gh }, 'vertical'),
  ];
}
