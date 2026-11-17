import {
  Component,
  ChangeDetectionStrategy,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
  untracked,
  NgZone,
  Input,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { CheckboxModule } from 'primeng/checkbox';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmationService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';

import { Warehouse2dStateService } from './services/warehouse-2d-state.service';
import { PickingRouteService, PickStop } from './services/picking-route.service';
import { Warehouse2dPlannerComponent } from './warehouse-2d/planner/planner';
import { Warehouse3dViewerComponent } from './warehouse-3d/viewer/viewer';
import { Warehouse3dPropertiesComponent } from './warehouse-3d/properties/properties';
import { PickScannerDialogComponent } from '../../../../picker/components/pick-scanner-dialog.component';

// ─── Local types ──────────────────────────────────────────────────────────────

type ViewMode    = '2d' | '3d';
type RightPanel  = 'data' | 'settings' | 'displays' | 'generate' | 'bins' | 'facilities';
type LayerFilter = 'floor' | 'zones' | 'all';
type PickScanStep = 'sku' | 'location' | 'tote';

/** Subset of the generate payload needed to enumerate Loc cells/codes */
interface GenLocGridParams {
  lvlStart: number;
  lvlEnd: number;
  numRows: number;
  numCols: number;
  colDir: string;
  rowDir: string;
  areaName: string;
  bInit: number;
  rInit: number;
}

/** Inputs of the generate grid layout */
interface GenLayoutParams {
  numRows: number;
  numCols: number;
  hwEveryCol: number;
  hwEveryRow: number;
  hwWidth: number;
  isHorizontal: boolean;
}

/** Generate grid layout: cell offsets per axis plus total span */
interface GenGridLayout extends GenLayoutParams {
  colOffsets: number[];
  rowOffsets: number[];
  totalW: number;
  totalH: number;
}

/** Hallway strip relative to the generate origin */
interface GenHallwaySpec {
  rx: number;
  ry: number;
  rw: number;
  rh: number;
  orientation: string;
}

interface PanelButton {
  id:          RightPanel;
  label:       string;
  icon:        string;
  activeColor: string;
  border:      string;
}

interface BrushType {
  type:     string;
  label:    string;
  icon:     string;
  color:    string;
  bg:       string;
  activeBg: string;
}

interface ConveyorDir {
  key:   'north' | 'south' | 'east' | 'west';
  label: string;
}

/** Code point of the first character (NaN for an empty string, like `charCodeAt(0)`) */
function firstCodePoint(value: string): number {
  return value.codePointAt(0) ?? Number.NaN;
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-warehouse-planner',
  standalone: true,
  imports: [
    FormsModule,
    TitleCasePipe,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    TooltipModule,
    SelectButtonModule,
    ConfirmDialogModule,
    DialogModule,
    CheckboxModule,
    ToggleSwitchModule,
    Warehouse2dPlannerComponent,
    Warehouse3dViewerComponent,
    Warehouse3dPropertiesComponent,
    PickScannerDialogComponent,
  ],
  providers: [ConfirmationService],
  templateUrl: './warehouse-planner.html',
  styleUrl: './warehouse-planner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WarehousePlannerComponent implements OnDestroy {

  @Input() isStandalonePicker = false;

  // ── DI ────────────────────────────────────────────────────────────────────
  readonly stateService       = inject(Warehouse2dStateService);
  readonly pickingService     = inject(PickingRouteService);
  private readonly ngZone     = inject(NgZone);
  private readonly confirmSvc = inject(ConfirmationService);
  private readonly translate   = inject(TranslateService);
  private warningTimer: any = null;

  // ── View state ────────────────────────────────────────────────────────────
  readonly viewMode        = signal<ViewMode>('2d');
  readonly activeRightPanel = signal<RightPanel>('data');
  readonly useMeters        = signal(true);

  // ── Picking mode ──────────────────────────────────────────────────────────
  readonly isPickingMode = computed(() => this.stateService.pickingMode());

  togglePickingMode(): void {
    const next = !this.stateService.pickingMode();
    this.stateService.pickingMode.set(next);
    if (next) {
      this.viewMode.set('2d');
      this.stateService.activeLayer.set('floor');
      this.stateService.clearSelection();
      this.stateService.activeTool.set('hand');
      this.pickingService.generateMockRoute();
    } else {
      this.stateService.panLockMode.set(false);
      this.pickingService.clearRoute();
    }
  }

  // ── Picker settings dialog ────────────────────────────────────────────────
  pickerSettingsVisible = false;

  // ── Pick scan flow ────────────────────────────────────────────────────────
  pickScannerVisible = false;
  pickScanStepLabel  = '';
  pickScanExpectedValue = '';
  pickScanAcceptAny = false;
  pickScanCurrentType: PickScanStep = 'location';
  private pickScanTargetStop: PickStop | null = null;
  private pickScanStep: PickScanStep = 'location';

  @ViewChild('pickScannerRef') pickScannerRef: any;

  /** Called when a stop card is clicked */
  onStopCardClick(stop: PickStop): void {
    if (stop.picked) return;
    if (this.pickingService.anyScanEnabled()) {
      this.pickScanTargetStop = stop;
      this.pickScanStep = this._getFirstScanStep();
      this._openScanStep();
    } else {
      this.pickingService.toggleStopPicked(stop.order);
    }
  }

  onPickScanVerified(): void {
    const nextStep = this._getNextScanStep(this.pickScanStep);
    if (nextStep) {
      // Advance to next scan step — keep dialog open
      this.pickScanStep = nextStep;
      this._updateScanStepValues();
      // Restart scanner with new expected value (dialog stays open)
      setTimeout(() => {
        if (this.pickScannerRef) {
          this.pickScannerRef.restartScanner();
        }
      }, 600);
    } else {
      // All scan steps done — mark as picked and close dialog
      if (this.pickScanTargetStop) {
        this.pickingService.toggleStopPicked(this.pickScanTargetStop.order);
        this.pickScanTargetStop = null;
      }
      this.pickScannerVisible = false;
    }
  }

  onPickScanFailed(scannedValue: string): void {
    // Toast handled inside the scanner dialog (shows red result)
    // Scanner auto-retries after 1.5s
  }

  /** Trigger scan/pick for the current active stop (same as clicking the card) */
  onNextStop(): void {
    const stops = this.pickingService.stops();
    const current = this.pickingService.currentStopIndex();
    if (current >= stops.length) return;
    const stop = stops[current];
    if (stop.picked) return;
    this.onStopCardClick(stop);
  }

  /** Next button is always enabled if the current stop is not yet picked */
  canAdvanceToNext(): boolean {
    const stops = this.pickingService.stops();
    const current = this.pickingService.currentStopIndex();
    if (current >= stops.length) return false;
    return !stops[current].picked;
  }

  private _getFirstScanStep(): PickScanStep {
    if (this.pickingService.scanLocationEnabled()) return 'location';
    if (this.pickingService.scanSkuEnabled()) return 'sku';
    return 'tote';
  }

  private _getNextScanStep(current: PickScanStep): PickScanStep | null {
    // Order: location → sku → tote
    const steps: PickScanStep[] = ['location', 'sku', 'tote'];
    const enabledMap = {
      sku: this.pickingService.scanSkuEnabled(),
      location: this.pickingService.scanLocationEnabled(),
      tote: this.pickingService.scanToteEnabled(),
    };
    const currentIdx = steps.indexOf(current);
    for (let i = currentIdx + 1; i < steps.length; i++) {
      if (enabledMap[steps[i]]) return steps[i];
    }
    return null;
  }

  /** Update step label and expected value based on current scan step */
  private _updateScanStepValues(): void {
    const stop = this.pickScanTargetStop;
    if (!stop) return;
    this.pickScanCurrentType = this.pickScanStep;
    switch (this.pickScanStep) {
      case 'location':
        this.pickScanStepLabel = `Scan Location: ${stop.locName}`;
        this.pickScanExpectedValue = stop.locName;
        this.pickScanAcceptAny = false;
        break;
      case 'sku':
        this.pickScanStepLabel = `Scan SKU: ${stop.sku}`;
        this.pickScanExpectedValue = stop.sku;
        this.pickScanAcceptAny = false;
        break;
      case 'tote':
        this.pickScanStepLabel = `Scan Tote`;
        this.pickScanExpectedValue = '';
        this.pickScanAcceptAny = true;
        break;
    }
  }

  /** Open the scanner dialog for the first time */
  private _openScanStep(): void {
    this._updateScanStepValues();
    this.pickScannerVisible = true;
  }

  // ── Layout sizing ─────────────────────────────────────────────────────────
  readonly canvasWidth     = signal(0);   // 0 → auto (flex fills remaining)
  readonly rightPanelWidth = signal(340);

  private _isDraggingDivider = false;
  private _dividerStartX     = 0;
  private _dividerStartW     = 0;
  private _dividerMouseMove!: (e: MouseEvent) => void;
  private _dividerMouseUp!:   (e: MouseEvent) => void;

  // ── Settings form fields ──────────────────────────────────────────────────
  settingsGridW = this.stateService.gridWidth();
  settingsGridH = this.stateService.gridDepth();
  dupTargetLvl  = 'B';

  // ── Generate duplicate-codes dialog ──────────────────────────────────────
  readonly genDupDialogVisible  = signal(false);
  readonly genDupCodes          = signal<string[]>([]);
  /** Non-duplicate locs waiting to be created after user confirms */
  private genDupPendingPayload: unknown = null;
  private genDupPendingOrigin: { gx: number; gy: number } | null = null;
  /** Whether there are remaining non-duplicate locs to create */
  readonly genDupHasRemaining = signal(false);

  // Intermediate models for the batch Loc p-inputnumber in right panel
  batchRowValRp: number | null = null;
  batchColValRp: number | null = null;

  // ── Generate form fields ───────────────────────────────────────────────────
  genArea        = this.stateService.nextAreaName();
  genZone        = '';
  genOrientation = 'horizontal';
  genRInit       = 1;
  genREnd        = 10;
  genBInit       = 1;
  genBEnd        = 10;
  genLevelStart  = 'a';
  genLevelEnd    = 'a';
  genCategory2   = 'REGULAR';
  genType2       = 'F'; // location_profile_code
  genColDir: 'ltr' | 'rtl' = 'ltr';
  genRowDir: 'ttb' | 'btt' = 'ttb';

  /**
   * Called when the user changes the Area code in the generate form.
   * If the area already has Locs, auto-fills Row/Col First to max+1
   * and adjusts Last to keep the same range size.
   */
  onGenAreaChange(areaCode: string): void {
    const maxes = this.stateService.getAreaMaxColRow(areaCode);
    if (!maxes) return; // area doesn't exist yet, keep defaults

    const colCount = Math.max(1, (this.genBEnd - this.genBInit) + 1);
    const rowCount = Math.max(1, (this.genREnd - this.genRInit) + 1);

    this.genBInit = maxes.maxCol + 1;
    this.genBEnd  = this.genBInit + colCount - 1;
    this.genRInit = maxes.maxRow + 1;
    this.genREnd  = this.genRInit + rowCount - 1;
  }
  /** Hallway every N cols in generate form (0 = off). Mirrors stateService.hallwayEveryCol on submit. */
  genHwEveryCol  = 0;
  /** Hallway every N rows in generate form (0 = off). Mirrors stateService.hallwayEveryRow on submit. */
  genHwEveryRow  = 2;

  readonly genZoneOptions = this.stateService.zoneOptions;

  readonly genLevelLetterOptions = [
    'a','b','c','d','e','f','g','h','i','j',
  ].map(l => ({ label: l.toUpperCase(), value: l }));

  /** Clamp Level Last so it's never below Level First */
  onGenLevelStartChange(): void {
    if (this.genLevelEnd < this.genLevelStart) {
      this.genLevelEnd = this.genLevelStart;
    }
  }

  readonly genOrientationOptions = [
    { label: 'Horizontal (Rows across, locs down)', value: 'horizontal' },
    { label: 'Vertical (Rows down, locs across)',   value: 'vertical'   },
  ];

  sanitizeArea(value: string): string {
    return value.toUpperCase().replaceAll(/[^A-Z]/g, '').slice(0, 2);
  }

  /** Phase 1: compute layout, set preview ghost — no items created yet */
  onGenerate(event: SubmitEvent): void {
    event.preventDefault();

    const rInit = this.genRInit ?? 1;
    const rEnd  = this.genREnd  ?? 10;
    const bInit = this.genBInit ?? 1;
    const bEnd  = this.genBEnd  ?? 10;

    if (rEnd < rInit || bEnd < bInit) return;

    const lvlStart = firstCodePoint(this.genLevelStart) - 96;
    const lvlEnd   = firstCodePoint(this.genLevelEnd)   - 96;
    if (lvlEnd < lvlStart) return;
    const numRows  = rEnd - rInit + 1;
    const numCols  = bEnd - bInit + 1;

    const areaName = (this.genArea || '').trim().toUpperCase() || this.stateService.nextAreaName();

    this.stateService.hallwayEveryCol.set(this.genHwEveryCol);
    this.stateService.hallwayEveryRow.set(this.genHwEveryRow);
    const layout = this._computeGenLayout({
      numRows,
      numCols,
      hwEveryCol:   this.genHwEveryCol,
      hwEveryRow:   this.genHwEveryRow,
      hwWidth:      this.stateService.hallwayWidth(),
      isHorizontal: this.genOrientation === 'horizontal',
    });
    const { colOffsets, rowOffsets, totalW, totalH, isHorizontal, hwEveryCol, hwEveryRow, hwWidth } = layout;

    // ── Compute hallway strips (relative to origin 0,0) ──────────────────────
    const hallwaySpecs = this._computeGenHallwaySpecs(layout);

    // Build hallway cell set for loc-exclusion in the preview
    const hwCells = this._genHallwayCellSet(hallwaySpecs);

    // ── Compute loc cell positions (level-1 only, unique grid positions) ──────
    const locCells = this._computeGenLocCells(layout, hwCells);

    // ── Use existing preview position or default to viewport center ──────────
    const existing = this.stateService.generatePreview();
    const originX  = existing?.gx ?? 0;
    const originY  = existing?.gy ?? 0;

    // Set the rich preview signal
    this.stateService.generatePreview.set({
      gx: originX,
      gy: originY,
      gw: totalW,
      gh: totalH,
      label: areaName,
      locCells,
      hallways: hallwaySpecs.map(h => ({ rx: h.rx, ry: h.ry, rw: h.rw, rh: h.rh })),
      payload: {
        areaName, lvlStart, lvlEnd, numRows, numCols,
        rInit, bInit,
        colOffsets, rowOffsets, totalW, totalH,
        isHorizontal, hwEveryCol, hwEveryRow, hwWidth,
        colDir: this.genColDir, rowDir: this.genRowDir,
        genCategory: this.genCategory2, genType: this.genType2,
        genZone: this.genZone || undefined,
        hallwaySpecs,
      },
    });

    // Switch to 2D and scroll to show the preview
    this.stateService.scrollTo(originX + Math.floor(totalW / 2), originY + Math.floor(totalH / 2));
  }

  /** Grid offsets along one axis, inserting `hwWidth` hallway cells after every `hwEvery` cells */
  private _buildGenOffsets(count: number, hwEvery: number, hwWidth: number): { offsets: number[]; totalSpan: number } {
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

  /** colOffsets = X-axis positions, rowOffsets = Y-axis positions (both orientations) */
  private _computeGenLayout(params: GenLayoutParams): GenGridLayout {
    const { numRows, numCols, hwEveryCol, hwEveryRow, hwWidth, isHorizontal } = params;

    const { offsets: colOffsets, totalSpan: spanX } = isHorizontal
      ? this._buildGenOffsets(numCols, hwEveryCol, hwWidth)
      : this._buildGenOffsets(numRows, hwEveryRow, hwWidth);

    const { offsets: rowOffsets, totalSpan: spanY } = isHorizontal
      ? this._buildGenOffsets(numRows, hwEveryRow, hwWidth)
      : this._buildGenOffsets(numCols, hwEveryCol, hwWidth);

    return { ...params, colOffsets, rowOffsets, totalW: spanX, totalH: spanY };
  }

  /** Hallway strips (relative to origin 0,0) between column groups and row groups */
  private _computeGenHallwaySpecs(layout: GenGridLayout): GenHallwaySpec[] {
    const { numRows, numCols, isHorizontal, hwEveryCol, hwEveryRow, hwWidth, colOffsets, rowOffsets, totalW, totalH } = layout;
    const hallwaySpecs: GenHallwaySpec[] = [];

    if (hwEveryCol > 0) {
      // always iterating over columns
      hallwaySpecs.push(...this._genHallwayStrips(
        isHorizontal ? colOffsets : rowOffsets, numCols, hwEveryCol, hwWidth,
        isHorizontal ? totalH : totalW, isHorizontal,
      ));
    }

    if (hwEveryRow > 0) {
      // always iterating over rows
      hallwaySpecs.push(...this._genHallwayStrips(
        isHorizontal ? rowOffsets : colOffsets, numRows, hwEveryRow, hwWidth,
        isHorizontal ? totalW : totalH, !isHorizontal,
      ));
    }

    return hallwaySpecs;
  }

  /** One hallway strip after every `hwEvery` cells along an axis (vertical strips cross X, horizontal cross Y) */
  private _genHallwayStrips(
    axisOffsets: number[],
    axisCount: number,
    hwEvery: number,
    hwWidth: number,
    areaSpan: number,
    vertical: boolean,
  ): GenHallwaySpec[] {
    const specs: GenHallwaySpec[] = [];
    for (let i = hwEvery - 1; i < axisCount - 1; i += hwEvery) {
      const after = axisOffsets[i];
      specs.push(vertical
        ? { rx: after + 1, ry: 0,         rw: hwWidth,  rh: areaSpan, orientation: 'vertical' }
        : { rx: 0,         ry: after + 1, rw: areaSpan, rh: hwWidth,  orientation: 'horizontal' });
    }
    return specs;
  }

  /** Set of "x,y" cells covered by the given hallway strips */
  private _genHallwayCellSet(hallwaySpecs: GenHallwaySpec[]): Set<string> {
    const hwCells = new Set<string>();
    for (const hw of hallwaySpecs) {
      for (let dy = 0; dy < hw.rh; dy++) {
        for (let dx = 0; dx < hw.rw; dx++) {
          hwCells.add(`${hw.rx + dx},${hw.ry + dy}`);
        }
      }
    }
    return hwCells;
  }

  /** Loc cell positions (level-1 only, unique grid positions), excluding hallway cells */
  private _computeGenLocCells(layout: GenGridLayout, hwCells: Set<string>): Array<{ rx: number; ry: number }> {
    const { numRows, numCols, isHorizontal, colOffsets, rowOffsets } = layout;
    const locCells: Array<{ rx: number; ry: number }> = [];
    for (let ri = 0; ri < numRows; ri++) {
      for (let bi = 0; bi < numCols; bi++) {
        const rx = isHorizontal ? colOffsets[bi] : colOffsets[ri];
        const ry = isHorizontal ? rowOffsets[ri] : rowOffsets[bi];
        if (!hwCells.has(`${rx},${ry}`)) {
          locCells.push({ rx, ry });
        }
      }
    }
    return locCells;
  }

  /** Phase 2: commit — create all items at the ghost's current position */
  onConfirmPreview(): void {
    const gp = this.stateService.generatePreview();
    if (!gp) return;

    const p       = gp.payload as any;
    const originX = gp.gx;
    const originY = gp.gy;

    // ── Pre-compute full loc code list to detect duplicates ──────────────────
    const existingNames = new Set(this.stateService.items().map(i => i.name).filter(Boolean));
    const allCodes: string[] = [];
    this._forEachGenLocCell(p, (code) => allCodes.push(code));

    const duplicateCodes = allCodes.filter(c => existingNames.has(c));

    if (duplicateCodes.length > 0) {
      // ── Defer everything — show the dup dialog ──────────────────────────────
      this.genDupCodes.set(duplicateCodes);
      this.genDupPendingPayload = p;
      this.genDupPendingOrigin  = { gx: originX, gy: originY };
      this.genDupHasRemaining.set(duplicateCodes.length < allCodes.length);
      this.genDupDialogVisible.set(true);
      this.stateService.generatePreview.set(null);
      return;
    }

    // No duplicates — create Area, Hallways, and all locs immediately
    this._commitGenerateAreaAndHallways(p, originX, originY);
    this._commitGenerateLocs(p, originX, originY, new Set<string>());
    this.stateService.generatePreview.set(null);
    this.stateService.scrollTo(originX + Math.floor(p.totalW / 2), originY + Math.floor(p.totalH / 2));
    this.stateService.saveHistory();
    // Auto-advance area name for the next generation
    this.genArea = this.stateService.nextAreaName();
  }

  /** Creates only the Area and Hallway items */
  private _commitGenerateAreaAndHallways(p: any, originX: number, originY: number): void {
    const area = this.stateService.addItem('Area', originX, originY, p.totalW, p.totalH, p.lvlStart);
    this.stateService.items.update(items => items.map(i =>
      i.id === area.id ? { ...i, name: p.areaName, colDir: p.colDir, rowDir: p.rowDir } : i
    ));
    for (const hw of p.hallwaySpecs as Array<any>) {
      const added = this.stateService.addItem('Hallway', originX + hw.rx, originY + hw.ry, hw.rw, hw.rh, p.lvlStart);
      this.stateService.items.update(items => items.map(i =>
        i.id === added.id ? { ...i, hallwayOrientation: hw.orientation } : i
      ));
    }
  }

  /** Creates Loc items, skipping any code present in `skipCodes` */
  private _commitGenerateLocs(p: any, originX: number, originY: number, skipCodes: Set<string>): void {
    this._forEachGenLocCell(p, (code, lvl, ri, bi) => {
      if (skipCodes.has(code)) return;
      const rx   = p.isHorizontal ? p.colOffsets[bi] : p.colOffsets[ri];
      const ry   = p.isHorizontal ? p.rowOffsets[ri] : p.rowOffsets[bi];
      const loc = this.stateService.addItem('Loc', originX + rx, originY + ry, 1, 1, lvl, {
        customId: code, category: p.genCategory, bayType: p.genType, zoneId: p.genZone,
      });
      this.stateService.items.update(items => items.map(i =>
        i.id === loc.id ? { ...i, name: code, category: p.genCategory, bayType: p.genType, zoneId: p.genZone, locked: true } : i
      ));
    });
  }

  /** Iterates every generated Loc cell (level → row → col) and yields its location code. */
  private _forEachGenLocCell(
    p: GenLocGridParams,
    visit: (code: string, lvl: number, ri: number, bi: number) => void,
  ): void {
    for (let lvl = p.lvlStart; lvl <= p.lvlEnd; lvl++) {
      const lvlLetter = String.fromCodePoint(64 + lvl);
      for (let ri = 0; ri < p.numRows; ri++) {
        for (let bi = 0; bi < p.numCols; bi++) {
          const logicCol = p.colDir === 'rtl' ? (p.numCols - 1 - bi) : bi;
          const logicRow = p.rowDir === 'btt' ? (p.numRows - 1 - ri) : ri;
          visit(this.stateService.formatLocationCode(p.areaName, logicCol + p.bInit, logicRow + p.rInit, lvlLetter), lvl, ri, bi);
        }
      }
    }
  }

  /** User clicked "Create remaining" in the generate dup dialog */
  finalizeGenDuplicateConfirm(): void {
    this.genDupDialogVisible.set(false);
    const p = this.genDupPendingPayload as any;
    const origin = this.genDupPendingOrigin;
    if (!p || !origin) return;

    // Now create Area + Hallways + only non-duplicate locs
    this._commitGenerateAreaAndHallways(p, origin.gx, origin.gy);
    this._commitGenerateLocs(p, origin.gx, origin.gy, new Set(this.genDupCodes()));

    this.genDupPendingPayload = null;
    this.genDupPendingOrigin  = null;
    this.genDupCodes.set([]);
    this.genDupHasRemaining.set(false);
    this.stateService.scrollTo(origin.gx + Math.floor(p.totalW / 2), origin.gy + Math.floor(p.totalH / 2));
    this.stateService.saveHistory();
    // Auto-advance area name for the next generation
    this.genArea = this.stateService.nextAreaName();
  }

  /** User clicked "Cancel" in the generate dup dialog — nothing created */
  finalizeGenDuplicateCancel(): void {
    this.genDupDialogVisible.set(false);
    this.genDupPendingPayload = null;
    this.genDupPendingOrigin  = null;
    this.genDupCodes.set([]);
    this.genDupHasRemaining.set(false);
  }

  /** Cancel the preview ghost without creating anything */
  onCancelPreview(): void {
    this.stateService.generatePreview.set(null);
  }

  // ── List (Outliner) fields ─────────────────────────────────────────────────
  selectedFolderId = '';

  readonly folderOptions = computed(() => [
    { label: 'Select Folder...', value: '' },
    ...this.stateService.folders().map(f => ({ label: f.name, value: f.id })),
  ]);

  getFolderItems(folderId: string) {
    const folder = this.stateService.folders().find(f => f.id === folderId);
    if (!folder) return [];
    return folder.itemIds
      .map(id => this.stateService.items().find(i => i.id === id))
      .filter(i => !!i);
  }

  getUnassignedItems() {
    const assigned = new Set(this.stateService.folders().flatMap(f => f.itemIds));
    return this.stateService.items().filter(i => !assigned.has(i.id));
  }

  addToFolder(): void {
    if (!this.selectedFolderId) return;
    const ids = this.stateService.selectedItems().map(i => i.id);
    this.stateService.assignItemsToFolder(this.selectedFolderId, ids);
  }

  renameFolder(folderId: string, event: FocusEvent): void {
    const el = event.target as HTMLElement;
    this.stateService.renameFolderItem(folderId, el.innerText.trim());
  }

  renameBayCode(itemId: string, event: FocusEvent): void {
    const el   = event.target as HTMLElement;
    const name = el.innerText.trim().slice(0, 15);
    el.innerText = name; // reflect the truncated value back to the UI
    this.stateService.items.update(items =>
      items.map(i => i.id === itemId ? { ...i, name, id: name, locked: true } : i)
    );
    this.stateService.saveHistory();
  }

  onListItemClick(event: Event, itemId: string): void {
    if (!(event as MouseEvent | KeyboardEvent).shiftKey) this.stateService.clearSelection();
    this.stateService.items.update(items =>
      items.map(i => i.id === itemId ? { ...i, selected: true } : i)
    );
  }

  onListItemDblClick(itemId: string): void {
    const item = this.stateService.items().find(i => i.id === itemId);
    if (item) {
      this.stateService.scrollToCell.set({ gx: item.gx, gy: item.gy });
    }
  }

  blurTarget(event: Event): void {
    (event.target as HTMLElement).blur();
  }

  /** Prevents typing beyond maxLen characters in a contenteditable element. */
  limitInput(event: KeyboardEvent, maxLen = 15): void {
    const el = event.target as HTMLElement;
    const text = el.innerText.trim();
    // Allow control keys: backspace, delete, arrows, home, end, tab, enter, select-all
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
                     'Home', 'End', 'Tab', 'Enter', 'Escape'];
    if (allowed.includes(event.key) || event.ctrlKey || event.metaKey) return;
    if (text.length >= maxLen) {
      event.preventDefault();
    }
  }

  // ── Stats (replaces locCount / areaCount pipes) ───────────────────────────
  readonly totalLocCount  = computed(() => this.stateService.items().filter(i => i.type === 'Loc').length);
  readonly uniqueAreaCount = computed(() => new Set(this.stateService.items().filter(i => i.type === 'Area').map(i => i.id)).size);

  // ── Batch Loc edit ────────────────────────────────────────────────────────
  readonly locBatchSharedRow = computed<number | null>(() => {
    const locs = this.stateService.selectedItems().filter(i => i.type === 'Loc');
    if (locs.length < 1) return null;
    const rows = locs.map(l => {
      // Prefer the explicit locRow field; fall back to parsing from the name
      if (l.locRow != null) return l.locRow;
      const parsed = this.stateService.parseLocationCode(l.name);
      return parsed?.row ?? null;
    }).filter((r): r is number => r !== null);
    if (rows.length === 0) return null;
    const first = rows[0];
    return rows.every(r => r === first) ? first : null;
  });

  readonly locBatchSharedCol = computed<number | null>(() => {
    const locs = this.stateService.selectedItems().filter(i => i.type === 'Loc');
    if (locs.length < 1) return null;
    const cols = locs.map(l => {
      // Prefer the explicit locCol field; fall back to parsing from the name
      if (l.locCol != null) return l.locCol;
      const parsed = this.stateService.parseLocationCode(l.name);
      return parsed?.col ?? null;
    }).filter((c): c is number => c !== null);
    if (cols.length === 0) return null;
    const first = cols[0];
    return cols.every(c => c === first) ? first : null;
  });

  /** Number of currently-selected Loc items */
  readonly selectedLocCount = computed(() =>
    this.stateService.selectedItems().filter(i => i.type === 'Loc').length
  );

  /** Context-aware label for the batch row/col editor */
  readonly batchLocLabel = computed(() => {
    const hasRow = this.locBatchSharedRow() !== null;
    const hasCol = this.locBatchSharedCol() !== null;
    if (hasRow && hasCol) return 'Batch Loc Edit';
    if (hasRow) return 'Row Selection';
    return 'Column Selection';
  });


  readonly panelButtons: PanelButton[] = [
    { id: 'data',     label: 'Data',     icon: 'pi pi-pencil', activeColor: 'rgba(59,130,246,0.25)',  border: '#3B82F6' },
    { id: 'generate', label: 'Generate', icon: 'pi pi-plus-circle', activeColor: 'rgba(139,92,246,0.25)',  border: '#8B5CF6' },
    { id: 'bins',     label: 'Locs',     icon: 'pi pi-box', activeColor: 'rgba(6,182,212,0.25)',   border: '#06B6D4' },
    { id: 'settings', label: 'Settings', icon: 'pi pi-cog', activeColor: 'rgba(100,116,139,0.25)', border: '#64748B' },
  ];

  // ── Toolbar toggle ────────────────────────────────────────────────────────
  toolbarCollapsed = false;

  // ── Brush types ───────────────────────────────────────────────────────────
  readonly brushTypes: BrushType[] = [
    { type: 'Wall',     label: 'Wall',     icon: 'pi pi-stop', color: '#94A3B8', bg: 'rgba(255,255,255,0.06)', activeBg: 'rgba(148,163,184,0.25)' },
    { type: 'Conveyor', label: 'Conveyor', icon: 'pi pi-sync', color: '#F97316', bg: 'rgba(249,115,22,0.06)',  activeBg: 'rgba(249,115,22,0.25)'  },
    { type: 'Loc',      label: 'Loc',      icon: 'pi pi-check-square', color: '#10B981', bg: 'rgba(16,185,129,0.06)',  activeBg: 'rgba(16,185,129,0.25)'  },
  ];


  // ── Conveyor directions ───────────────────────────────────────────────────
  readonly conveyorDirs: ConveyorDir[] = [
    { key: 'north', label: 'North' },
    { key: 'south', label: 'South' },
    { key: 'east',  label: 'East'  },
    { key: 'west',  label: 'West'  },
  ];

  // ── Taxonomy ──────────────────────────────────────────────────────────────
  readonly bayCategories      = this.stateService.bayCategories;
  /** value = location_profile_code (the code stored in wms_location_profiles) */
  readonly bayTypes            = this.stateService.bayTypes;
  readonly availableLevels    = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  /** Typed so @for in the template infers the union, not string */
  readonly nomenclatureFormats: Array<'standard' | 'compact' | 'custom'> = ['standard', 'compact', 'custom'];

  /** Level view select options — computed outside template (no arrow fns in bindings) */
  readonly levelViewOptions = [
    { label: 'All Levels', value: 'All' as number | string },
    ...([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).map(l => ({
      label: String.fromCodePoint(64 + Math.max(1, Math.min(l, 26))),
      value: l as number | string,
    })),
  ];

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  constructor() {
    // Auto-populate batch inputs whenever the shared row/col value changes
    // (e.g. after clicking a row/col selector button on the canvas)
    effect(() => {
      const sharedRow = this.locBatchSharedRow();
      if (sharedRow !== null) this.batchRowValRp = sharedRow;
    });
    effect(() => {
      const sharedCol = this.locBatchSharedCol();
      if (sharedCol !== null) this.batchColValRp = sharedCol;
    });
    // Commit the generate preview when the viewport "Place" button is clicked.
    // untracked() prevents generatePreview() (read inside onConfirmPreview) from
    // becoming a reactive dependency of this effect — otherwise setting
    // generatePreview in onGenerate() would re-trigger the effect prematurely.
    effect(() => {
      const tick = this.stateService.commitGeneratePreview();
      if (tick > 0) untracked(() => this.onConfirmPreview());
    });
  }


  ngOnDestroy(): void {
    globalThis.removeEventListener('mousemove', this._dividerMouseMove);
    globalThis.removeEventListener('mouseup',   this._dividerMouseUp);
  }

  // ─── View helpers ─────────────────────────────────────────────────────────

  setView(mode: ViewMode, layer: LayerFilter): void {
    this.viewMode.set(mode);
    this.stateService.activeLayer.set(layer);
  }

  // ─── Resizable divider ────────────────────────────────────────────────────

  startResizeDivider(e: MouseEvent): void {
    e.preventDefault();
    this._isDraggingDivider = true;
    this._dividerStartX     = e.clientX;
    this._dividerStartW     = this.rightPanelWidth();

    this._dividerMouseMove = (me: MouseEvent) => {
      if (!this._isDraggingDivider) return;
      const delta  = this._dividerStartX - me.clientX;
      const newW   = Math.max(320, Math.min(700, this._dividerStartW + delta));
      this.ngZone.run(() => this.rightPanelWidth.set(newW));
    };

    this._dividerMouseUp = () => {
      this._isDraggingDivider = false;
      globalThis.removeEventListener('mousemove', this._dividerMouseMove);
      globalThis.removeEventListener('mouseup',   this._dividerMouseUp);
    };

    globalThis.addEventListener('mousemove', this._dividerMouseMove);
    globalThis.addEventListener('mouseup',   this._dividerMouseUp);
  }

  // ─── Item property editing ────────────────────────────────────────────────

  updateSingle(field: string, value: unknown): void {
    // ── Duplicate name check ─────────────────────────────────────────
    if (field === 'name' && typeof value === 'string' && value.trim().length > 0) {
      const nameUpper = value.trim().toUpperCase();
      const selected  = this.stateService.selectedItems();
      const selectedId = selected.length === 1 ? selected[0].id : null;
      const isDuplicate = this.stateService.items().some(i =>
        i.id !== selectedId && i.type === 'Loc' && i.name.toUpperCase() === nameUpper
      );
      if (isDuplicate) {
        this.stateService.warningMessage.set(
          this.translate.instant('preferences.location.duplicate_name_warning', { name: value.trim() })
        );
        clearTimeout(this.warningTimer);
        this.warningTimer = setTimeout(() => this.stateService.warningMessage.set(null), 3000);
        return; // reject the rename
      }
    }

    this.stateService.items.update(items => items.map(i =>
      i.selected ? { ...i, [field]: value } : i
    ));
    this.stateService.saveHistory();
  }

  /** Sanitize and update Area name + propagate to contained Locs */
  updateAreaName(value: string): void {
    const clean = value.toUpperCase().replaceAll(/[^A-Z]/g, '').slice(0, 2);
    if (!clean) return;
    const selected = this.stateService.selectedItems();
    if (selected.length !== 1 || selected[0].type !== 'Area') return;
    this.stateService.renameAreaWithLocs(selected[0].id, clean);
    this.stateService.saveHistory();
  }

  getConnection(dir: 'north' | 'south' | 'east' | 'west'): boolean {
    const item = this.stateService.selectedItems()[0];
    return !!(item?.connections as any)?.[dir];
  }

  getCommonLevel(): string {
    const items = this.stateService.selectedItems();
    if (!items.length) return 'A';
    const lvls  = items.map(i => i.level ?? 1);
    const first = lvls[0];
    return lvls.every(l => l === first) ? this.levelToLetter(first) : 'A';
  }

  setCommonLevel(letter: string): void {
    const lvl = this.letterToLevel(letter);
    this.stateService.items.update(items => items.map(i =>
      i.selected ? { ...i, level: lvl } : i
    ));
    this.stateService.saveHistory();
  }

  letterToLevel(letter: string): number {
    return (firstCodePoint(letter.toUpperCase()) - 64);
  }

  levelToLetter(level: number): string {
    return String.fromCodePoint(64 + Math.max(1, Math.min(level, 26)));
  }

  /** Convert meters (cells) to feet, rounded. 1 m ≈ 3.28084 ft */
  toFeet(meters: number): number {
    return Math.round(meters * 3.28084);
  }

  // ─── Batch Loc editing ────────────────────────────────────────────────────

  applyLocBatchRow(newRow: number): void {
    if (!newRow || newRow < 1) return;
    const locs = this.stateService.selectedItems().filter(i => i.type === 'Loc');
    this.stateService.items.update(items => items.map(i => {
      if (!locs.some(l => l.id === i.id)) return i;
      const updated = { ...i, locRow: newRow };
      updated.name  = this.stateService.rebuildLocName(updated);
      return updated;
    }));
    this.stateService.saveHistory();
  }

  applyLocBatchCol(newCol: number): void {
    if (!newCol || newCol < 1) return;
    const locs = this.stateService.selectedItems().filter(i => i.type === 'Loc');
    this.stateService.items.update(items => items.map(i => {
      if (!locs.some(l => l.id === i.id)) return i;
      const updated = { ...i, locCol: newCol };
      updated.name  = this.stateService.rebuildLocName(updated);
      return updated;
    }));
    this.stateService.saveHistory();
  }

  // ─── Grid settings ────────────────────────────────────────────────────────

  applyGridSize(): void {
    this.stateService.gridWidth.set(Math.max(10, Math.min(500, this.settingsGridW)));
    this.stateService.gridDepth.set(Math.max(10, Math.min(500, this.settingsGridH)));
  }

  // ─── Zoom / Center ────────────────────────────────────────────────────────

  onZoomIn():  void { this.stateService.zoomIn(); }
  onZoomOut(): void { this.stateService.zoomOut(); }
  onCenter():  void { this.stateService.centerViewport.set(Date.now()); }

  // ─── Clear all ────────────────────────────────────────────────────────────

  clearAll(): void {
    this.confirmSvc.confirm({
      message:           'Are you sure you want to clear all items from the grid?',
      header:            'Clear Grid',
      icon:              'pi pi-exclamation-triangle',
      acceptLabel:       'Yes, clear all',
      rejectLabel:       'Cancel',
      acceptButtonProps: { severity: 'danger' },
      accept: () => {
        const defaultLocs = this.stateService.items().filter(i => this.stateService.isDefaultLoc(i));
        this.stateService.items.set(defaultLocs);
        this.stateService.saveHistory();
      },
    });
  }
}
