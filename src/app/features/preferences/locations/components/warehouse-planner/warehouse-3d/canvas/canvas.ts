import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  NgZone,
  Injector,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Subject, takeUntil, debounceTime } from 'rxjs';

import { Warehouse2dStateService, GridItem } from '../../services/warehouse-2d-state.service';
import { PickingRouteService, PickingRoute } from '../../services/picking-route.service';
import * as BABYLON from 'babylonjs';

// ─── Constants ────────────────────────────────────────────────────────────────
const SCALE        = 2;     // 1 grid cell → 2 Babylon units
const LOC_H        = 1.6;   // height of each rack level (Babylon units)
const GAP          = 0.12;  // visual gap between boxes
const POST_T       = 0.14;  // rack upright/panel thickness
const FLOOR_OFFSET = 0.75;  // clearance between floor and first shelf
const WALL_H_MIN   = 0.05;  // wall height when cut away (camera facing it)

/** Contiguous non-hallway depth segment of an Area (world Z) */
interface DepthSegment { z0: number; z1: number; cz: number; d: number }

/** Precomputed Area layout shared by the rack renderers */
interface AreaLayout {
  item:           GridItem;
  colCount:       number;
  hallwayCols:    Set<number>;
  maxLevelPerCol: number[];
  segs:           DepthSegment[];
}

/** Adds every integer in [from, to) to the set */
function addRange(set: Set<number>, from: number, to: number): void {
  for (let i = from; i < to; i++) set.add(i);
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-warehouse-3d-canvas',
  standalone: true,
  imports: [],
  templateUrl: './canvas.html',
  styleUrl: './canvas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Warehouse3dCanvasComponent implements OnInit, OnDestroy {

  // ── DI ────────────────────────────────────────────────────────────────────
  private readonly ngZone          = inject(NgZone);
  private readonly state2d         = inject(Warehouse2dStateService);
  private readonly pickingService  = inject(PickingRouteService);
  private readonly injector        = inject(Injector);

  // ── View refs ─────────────────────────────────────────────────────────────
  @ViewChild('renderCanvas', { static: true }) canvasRef!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('tooltip3d',    { static: true }) tooltipRef!: ElementRef<HTMLDivElement>;

  // ── Babylon internals ─────────────────────────────────────────────────────
  private engine!: BABYLON.Engine;
  private scene!:  BABYLON.Scene;
  private camera!: BABYLON.ArcRotateCamera;

  /** Shared materials – created once, reused for all 2D-synced meshes */
  private mats: Record<string, BABYLON.StandardMaterial> = {};

  /** Wall meshes tracked for dynamic camera-proximity height scaling */
  private wallMeshInfo: Array<{ mesh: BABYLON.Mesh; baseH: number; cx: number; cz: number }> = [];
  private wallHookRegistered = false;
  private wallMaxH = 3.5;

  private readonly pickingArrows: BABYLON.AbstractMesh[] = [];
  private pickingLocs: BABYLON.Mesh[] = [];
  private pulseTime = 0;

  private sceneReady    = false;
  private readonly unsubscribe$  = new Subject<void>();

  /** Tracks the current drag action for the UI indicator */
  readonly activeAction = signal<'pan' | 'orbit' | 'zoom' | null>(null);

  /** Active left-click mode */
  readonly activeMode = signal<'pan' | 'orbit' | 'zoom'>('pan');

  /** Zoom percentage for the UI */
  readonly zoomLevel = signal(100);

  /** Initial camera radius at 100% zoom */
  private baseRadius = 70;

  /** Last known cursor position for zoom-to-cursor */
  private lastCursorX = 0;
  private lastCursorY = 0;

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.ngZone.runOutsideAngular(() => this._initBabylon());

    // React to any change in the 2D items signal
    toObservable(this.state2d.items, { injector: this.injector })
      .pipe(takeUntil(this.unsubscribe$), debounceTime(80))
      .subscribe(items => {
        if (this.sceneReady) {
          this.ngZone.runOutsideAngular(() => this._syncFrom2d(items));
        }
      });

    // React to picking route changes
    toObservable(this.pickingService.route, { injector: this.injector })
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(route => {
        if (!this.sceneReady) return;
        this.ngZone.runOutsideAngular(() => {
          this._clearPickingRoute();
          if (this.state2d.pickingMode() && route) this._renderPickingRoute(route);
          this._updateLocHighlights();
        });
      });

    // React to scrollToCell
    toObservable(this.state2d.scrollToCell, { injector: this.injector })
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(cell => {
        if (!this.sceneReady || !cell) return;
        this.ngZone.runOutsideAngular(() => {
          const targetX = (cell.gx + 0.5) * SCALE;
          const targetZ = (cell.gy + 0.5) * SCALE;
          
          BABYLON.Animation.CreateAndStartAnimation(
            'camFocusX', this.camera, 'target.x', 30, 20, 
            this.camera.target.x, targetX, 
            BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
          );
          BABYLON.Animation.CreateAndStartAnimation(
            'camFocusZ', this.camera, 'target.z', 30, 20, 
            this.camera.target.z, targetZ, 
            BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
          );
          
          this.state2d.scrollToCell.set(null);
        });
      });

    // React to picking mode toggle
    toObservable(this.state2d.pickingMode, { injector: this.injector })
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(picking => {
        if (!this.sceneReady) return;
        this.ngZone.runOutsideAngular(() => {
          this._clearPickingRoute();
          if (picking) {
            const route = this.pickingService.route();
            if (route) this._renderPickingRoute(route);
          }
          this._updateLocHighlights();
        });
      });
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.engine?.dispose();
  }

  // ─── Mode selection ──────────────────────────────────────────────────────────

  setMode(mode: 'pan' | 'orbit' | 'zoom'): void {
    this.activeMode.set(mode);
  }

  // ─── Zoom controls ──────────────────────────────────────────────────────────

  zoomIn():  void { this._zoomToCenter(0.85); }
  zoomOut(): void { this._zoomToCenter(1.18); }

  /**
   * Zoom toward/away from the center of the viewport.
   * `factor < 1` = zoom in, `factor > 1` = zoom out.
   */
  private _zoomToCenter(factor: number): void {
    if (!this.camera) return;
    const lo = this.camera.lowerRadiusLimit ?? 10;
    const hi = this.camera.upperRadiusLimit ?? 600;
    const newRadius = Math.min(Math.max(this.camera.radius * factor, lo), hi);

    const startRadius = this.camera.radius;
    const steps = 10;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const ease = 1 - Math.pow(1 - step / steps, 3);
      this.camera.radius = startRadius + (newRadius - startRadius) * ease;
      if (step >= steps) {
        this.camera.radius = newRadius;
        clearInterval(id);
        this._updateZoomLevel();
      }
    }, 16);
  }

  /**
   * Zoom toward/away from the world point under the cursor.
   * `factor < 1` = zoom in, `factor > 1` = zoom out.
   */
  private _zoomTowardCursor(factor: number, clientX: number, clientY: number): void {
    if (!this.camera) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;

    // Raycast to find the ground point under cursor
    const groundPoint = this._getGroundPoint(offsetX, offsetY);

    const lo = this.camera.lowerRadiusLimit ?? 10;
    const hi = this.camera.upperRadiusLimit ?? 600;
    const newRadius = Math.min(Math.max(this.camera.radius * factor, lo), hi);
    const actualFactor = newRadius / this.camera.radius;

    if (groundPoint) {
      // Move target toward the ground point proportionally to zoom
      const shiftFactor = 1 - actualFactor;
      const targetShift = groundPoint.subtract(this.camera.target).scale(shiftFactor * 0.3);
      this.camera.target.addInPlace(targetShift);
    }

    this.camera.radius = newRadius;
    this._updateZoomLevel();
  }

  /**
   * Raycast from screen coordinates to the ground plane (y=0).
   * Returns the world XZ point or null.
   */
  private _getGroundPoint(offsetX: number, offsetY: number): BABYLON.Vector3 | null {
    const ray = this.scene.createPickingRay(offsetX, offsetY, BABYLON.Matrix.Identity(), this.camera);
    // Intersect with y=0 plane
    if (Math.abs(ray.direction.y) < 0.0001) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (t < 0) return null;
    return ray.origin.add(ray.direction.scale(t));
  }

  /** Recalculate zoom level percentage based on initial radius */
  private _updateZoomLevel(): void {
    const pct = Math.round((this.baseRadius / this.camera.radius) * 100);
    this.zoomLevel.set(Math.min(Math.max(pct, 5), 2000));
  }

  // ─── Custom pointer controls ──────────────────────────────────────────────

  /**
   * Left-drag  → performs activeMode action (pan/orbit/zoom).
   * Right-drag → always orbit.
   *
   * Pan uses ground-plane raycasting so the point under the cursor stays
   * locked to the cursor while dragging (like Google Maps).
   */
  private _attachCustomPointerControls(canvas: HTMLCanvasElement): void {
    let activeBtn: number | null = null;
    let lastX = 0;
    let lastY = 0;

    /** Ground-plane anchor captured on pointerdown when panning */
    let panAnchor: BABYLON.Vector3 | null = null;

    const ORBIT_SPEED = 0.005;  // radians per pixel
    const ZOOM_SPEED  = 0.006;  // zoom factor per pixel

    /** Orbit the camera. */
    const doOrbit = (dx: number, dy: number) => {
      this.camera.alpha -= dx * ORBIT_SPEED;
      const newBeta = this.camera.beta + dy * ORBIT_SPEED;
      const lo = this.camera.lowerBetaLimit ?? 0.15;
      const hi = this.camera.upperBetaLimit ?? Math.PI / 2.1;
      this.camera.beta = Math.min(Math.max(newBeta, lo), hi);
    };

    /**
     * Ground-plane drag: move the camera target so the anchor point
     * stays under the cursor (1:1 tracking like dragging a map).
     */
    const doPanDrag = (clientX: number, clientY: number) => {
      if (!panAnchor) return;
      const rect = canvas.getBoundingClientRect();
      const currentGround = this._getGroundPoint(clientX - rect.left, clientY - rect.top);
      if (!currentGround) return;

      // Shift camera target so the anchor returns under the cursor
      const delta = currentGround.subtract(panAnchor);
      this.camera.target.x -= delta.x;
      this.camera.target.z -= delta.z;
    };

    const doZoomDrag = (dy: number, clientX: number, clientY: number) => {
      const factor = 1 + dy * ZOOM_SPEED;
      this._zoomTowardCursor(factor, clientX, clientY);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      activeBtn = e.button;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);

      if (e.button === 2) {
        this.activeAction.set('orbit');
      } else {
        const mode = this.activeMode();
        this.activeAction.set(mode);
        // Capture ground anchor when starting a pan drag
        if (mode === 'pan') {
          const rect = canvas.getBoundingClientRect();
          panAnchor = this._getGroundPoint(e.clientX - rect.left, e.clientY - rect.top);
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      // Always track cursor for zoom-to-cursor
      this.lastCursorX = e.clientX;
      this.lastCursorY = e.clientY;

      if (activeBtn === null) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      if (activeBtn === 2) {
        // Right-drag → always orbit
        doOrbit(dx, dy);
      } else {
        // Left-drag → active mode
        switch (this.activeMode()) {
          case 'pan':   doPanDrag(e.clientX, e.clientY); break;
          case 'orbit': doOrbit(dx, dy); break;
          case 'zoom':  doZoomDrag(dy, e.clientX, e.clientY); break;
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button === activeBtn) {
        activeBtn = null;
        panAnchor = null;
        canvas.releasePointerCapture(e.pointerId);
        this.activeAction.set(null);
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup',   onPointerUp);
  }

  // ─── Babylon setup ────────────────────────────────────────────────────────

  private _initBabylon(): void {
    const canvas   = this.canvasRef.nativeElement;
    this.engine    = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.scene     = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.1, 0.12, 0.17, 1);

    // Camera (isometric-ish)
    this.camera = new BABYLON.ArcRotateCamera(
      'cam', -Math.PI * 0.75, Math.PI / 3.8, 70,
      BABYLON.Vector3.Zero(), this.scene
    );
    this.baseRadius = this.camera.radius;

    // Clamp beta so the camera never goes below the ground plane
    this.camera.lowerBetaLimit  = 0.15;          // nearly top-down
    this.camera.upperBetaLimit  = Math.PI / 2.1; // just above horizon
    this.camera.lowerRadiusLimit = 10;
    this.camera.upperRadiusLimit = 600;

    // ── Detach ALL default camera inputs ──────────────────────────────────
    // We handle panning, orbiting and zoom manually below.
    this.camera.inputs.clear();

    // Prevent browser context menu on right-click inside the canvas
    canvas.addEventListener('contextmenu', (e: Event) => e.preventDefault());

    // ── Custom pointer controls ──────────────────────────────────────────
    this._attachCustomPointerControls(canvas);

    // ── Scroll wheel → zoom toward cursor ────────────────────────────────
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 0.88;  // scroll down = zoom out
      this._zoomTowardCursor(factor, e.clientX, e.clientY);
    }, { passive: false });

    // Lights
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), this.scene);
    hemi.intensity   = 0.65;
    hemi.groundColor = new BABYLON.Color3(0.25, 0.28, 0.33);

    const dir  = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-1, -2.5, -1), this.scene);
    dir.position  = new BABYLON.Vector3(60, 100, 60);
    dir.intensity = 0.7;

    this._buildFloor();
    this._buildSharedMaterials();

    window.addEventListener('resize', () => this.engine.resize());
    this.engine.runRenderLoop(() => this.scene.render());

    // Hover tooltip via Babylon ray-pick
    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      const pick   = this.scene.pick(e.offsetX, e.offsetY);
      const itemId = pick?.pickedMesh?.metadata?.itemId as string | undefined;
      if (!itemId) { this._hideTooltip(); return; }
      const item   = this.state2d.items().find(i => i.id === itemId);
      if (!item)   { this._hideTooltip(); return; }
      this._showTooltip(item, e.clientX, e.clientY);
    });
    canvas.addEventListener('mouseleave', () => this._hideTooltip());

    this.sceneReady = true;
    this._syncFrom2d(this.state2d.items());
  }

  private _buildFloor(): void {
    const ground   = BABYLON.MeshBuilder.CreateGround('ground', { width: 1000, height: 1000 }, this.scene);
    const m        = new BABYLON.StandardMaterial('groundMat', this.scene);
    m.diffuseColor  = new BABYLON.Color3(0.13, 0.15, 0.19);
    m.specularColor = new BABYLON.Color3(0, 0, 0);
    ground.material = m;
    ground.receiveShadows = true;
  }

  private _buildSharedMaterials(): void {
    const def = (name: string, r: number, g: number, b: number, alpha = 1) => {
      const m = new BABYLON.StandardMaterial(name, this.scene);
      m.diffuseColor  = new BABYLON.Color3(r, g, b);
      m.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
      if (alpha < 1) { m.alpha = alpha; m.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND; }
      this.mats[name] = m;
    };

    def('rack',       0.1, 0.4, 0.9);
    def('rackSlab',   0.1, 0.35, 0.8, 0.55);     // Area floor slab — more visible
    def('loc',        0.97, 0.73, 0.08);
    def('locShade',   0.85, 0.6, 0.05);
    def('levelSlab',  0.8, 0.88, 1, 0.25);       // Shelf level floor — more visible
    def('wall',       0.48, 0.52, 0.57);
    def('door',       0.88, 0.22, 0.22);
    def('doorGap',    0.1, 0.06, 0.04, 0.75);
    def('conveyor',   0.92, 0.43, 0.06);
    def('pallet',     0.65, 0.42, 0.15);
    def('zone',       0.52, 0.25, 0.9, 0.22);
    def('hallway',    0.25, 0.27, 0.3);       // dark slate gray (plomo oscuro)

    const pickTargetMat = new BABYLON.StandardMaterial('locPickTarget', this.scene);
    pickTargetMat.diffuseColor = new BABYLON.Color3(0.98, 0.22, 0.22);
    pickTargetMat.emissiveColor = new BABYLON.Color3(0.5, 0.05, 0.05);
    pickTargetMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    this.mats['locPickTarget'] = pickTargetMat;
  }

  // ─── 2D → 3D sync ────────────────────────────────────────────────────────

  private _syncFrom2d(items: GridItem[]): void {
    // Dispose all previously synced meshes
    [...this.scene.meshes]
      .filter(m => m.metadata?.src === '2d')
      .forEach(m => m.dispose());

    this.wallMeshInfo = [];

    const locs       = items.filter(i => i.type === 'Loc');
    const maxLocLevel = locs.length > 0 ? Math.max(...locs.map(l => l.level ?? 1)) : 3;
    this.wallMaxH    = maxLocLevel * LOC_H;

    // Register the before-render hook once (reads wallMaxH live each frame)
    if (!this.wallHookRegistered) {
      this.wallHookRegistered = true;
      this.scene.registerBeforeRender(() => this._onBeforeRender());
    }

    if (items.length === 0) return;

    // Render ordered: opaque on top of transparent slabs
    items.filter(i => i.type === 'Zone').forEach(i     => this._renderZone(i));
    items.filter(i => i.type === 'Hallway').forEach(i  => this._renderHallway(i));
    items.filter(i => i.type === 'Area').forEach(i     => this._renderArea(i, items));
    items.filter(i => i.type === 'Wall').forEach(i     => this._renderWall(i));
    items.filter(i => i.type === 'Door').forEach(i     => this._renderDoor(i));
    items.filter(i => i.type === 'Conveyor').forEach(i => this._renderConveyor(i));
    items.filter(i => i.type === 'Pallet').forEach(i   => this._renderPallet(i));
    items.filter(i => i.type === 'Loc').forEach(i      => this._renderLoc(i));

    this._centerCamera(items);
    this._updateLocHighlights();
  }

  /** Per-frame animations: wall cutaway + picking route pulsing */
  private _onBeforeRender(): void {
    // 1. Wall Cutaway Animation
    this._animateWallCutaway();

    // 2. Picking Route Animations (Blinking/pulsing)
    this._animatePickingPulse();
  }

  private _animateWallCutaway(): void {
    if (this.wallMeshInfo.length === 0) return;
    const cam    = this.camera.position;
    const target = this.camera.target;
    const hMax   = this.wallMaxH;
    const camDx  = cam.x - target.x;
    const camDz  = cam.z - target.z;

    for (const w of this.wallMeshInfo) {
      if (!w.mesh || w.mesh.isDisposed()) continue;
      const dot  = (w.cx - target.x) * camDx + (w.cz - target.z) * camDz;
      const newH = dot > 0 ? WALL_H_MIN : hMax;
      w.mesh.scaling.y  = newH / w.baseH;
      w.mesh.position.y = newH / 2;
    }
  }

  private _animatePickingPulse(): void {
    this.pulseTime += this.scene.getEngine().getDeltaTime() * 0.005;
    const alphaPulse = 0.25 + 0.75 * Math.abs(Math.sin(this.pulseTime));

    for (const arrow of this.pickingArrows) {
      if (arrow && !arrow.isDisposed()) {
        arrow.visibility = alphaPulse;
      }
    }

    const emissivePulse = 0.2 + 0.7 * Math.abs(Math.sin(this.pulseTime * 1.5));
    for (const loc of this.pickingLocs) {
      if (loc && !loc.isDisposed() && loc.material) {
        const mat = loc.material as BABYLON.StandardMaterial;
        mat.emissiveColor.set(emissivePulse, 0.05 * emissivePulse, 0.05 * emissivePulse);
      }
    }
  }

  private _updateLocHighlights(): void {
    const activeRoute = this.pickingService.route();
    const picking = this.state2d.pickingMode();
    const stops = (picking && activeRoute) ? activeRoute.stops : [];
    const stopLocIds = new Set(stops.map(s => s.locId));

    // Clear previous tracking array
    this.pickingLocs = [];

    for (const mesh of this.scene.meshes) {
      if (mesh.name.startsWith('loc_') && mesh.metadata?.itemId) {
        const isStop = stopLocIds.has(mesh.metadata.itemId);
        if (isStop) {
          mesh.material = this.mats['locPickTarget'];
          if (mesh instanceof BABYLON.Mesh) {
            this.pickingLocs.push(mesh);
          }
        } else {
          mesh.material = this.mats['loc'];
        }
      }
    }
  }

  // ─── Coordinate helpers ───────────────────────────────────────────────────

  private _gx(i: GridItem): number { return i.gx * SCALE; }
  private _gz(i: GridItem): number { return i.gy * SCALE; }
  private _gw(i: GridItem): number { return i.gw * SCALE; }
  private _gd(i: GridItem): number { return i.gh * SCALE; }
  private _cx(i: GridItem): number { return this._gx(i) + this._gw(i) / 2; }
  private _cz(i: GridItem): number { return this._gz(i) + this._gd(i) / 2; }

  private _tag<T extends BABYLON.AbstractMesh>(mesh: T, itemId?: string): T {
    mesh.metadata = { src: '2d', itemId };
    return mesh;
  }

  private _box(name: string, w: number, h: number, d: number): BABYLON.Mesh {
    return BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
  }

  // ─── Tooltip ──────────────────────────────────────────────────────────────

  private _showTooltip(item: GridItem, cx: number, cy: number): void {
    const tip      = this.tooltipRef.nativeElement;
    const lvlLetter = String.fromCodePoint(96 + Math.max(1, Math.min(item.level, 26)));

    tip.innerHTML = [
      `<div class="t3d-name">${item.name}</div>`,
      `<div class="t3d-row"><span>Type</span><span>${item.type}</span></div>`,
      `<div class="t3d-row"><span>Size</span><span>${item.gw}×${item.gh} m</span></div>`,
      `<div class="t3d-row"><span>Position</span><span>(${item.gx}, ${item.gy})</span></div>`,
      item.level    ? `<div class="t3d-row"><span>Level</span><span>${lvlLetter.toUpperCase()} (${item.level})</span></div>` : '',
      `<div class="t3d-row"><span>Bin Count</span><span>—</span></div>`,
      item.category ? `<div class="t3d-row"><span>Category</span><span>${item.category}</span></div>` : '',
      item.bayType  ? `<div class="t3d-row"><span>Storage</span><span>${item.bayType}</span></div>`   : '',
    ].join('');

    tip.style.visibility = 'hidden';
    tip.style.display    = 'block';

    const OFFSET = 16;
    const TIP_W  = 210;
    const TIP_H  = tip.offsetHeight;
    let x = cx + OFFSET;
    let y = cy + OFFSET;
    if (x + TIP_W > window.innerWidth)  x = cx - TIP_W - OFFSET;
    if (y + TIP_H > window.innerHeight) y = cy - TIP_H - OFFSET;

    tip.style.left       = `${x}px`;
    tip.style.top        = `${y}px`;
    tip.style.visibility = '';
  }

  private _hideTooltip(): void {
    this.tooltipRef.nativeElement.style.display = 'none';
  }

  // ─── Type renderers ───────────────────────────────────────────────────────

  /** Zone – thin violet transparent floor slab */
  private _renderZone(item: GridItem): void {
    const s = this._box(`zone_${item.id}`, this._gw(item), 0.06, this._gd(item));
    s.position.set(this._cx(item), 0.03, this._cz(item));
    s.material = this.mats['zone'];
    this._tag(s, item.id);
  }

  /** Hallway – solid amber floor stripe (like a door but amber, sits flush on the floor) */
  private _renderHallway(item: GridItem): void {
    const h = 0.08;
    const s = this._box(`hw_${item.id}`, this._gw(item), h, this._gd(item));
    s.position.set(this._cx(item), h / 2, this._cz(item));
    s.material = this.mats['hallway'];
    this._tag(s, item.id);
  }

  /** Area – industrial rack structure with per-column height */
  private _renderArea(item: GridItem, allItems: GridItem[]): void {
    const locsInArea = allItems.filter(l =>
      l.type === 'Loc' &&
      l.gx >= item.gx && l.gy >= item.gy &&
      (l.gx + l.gw) <= (item.gx + item.gw) &&
      (l.gy + l.gh) <= (item.gy + item.gh)
    );

    // ── Hallway cells inside this area (for beam/slab/posts exclusion) ──────────
    const { hallwayCols, hallwayRows } = this._areaHallwayCells(item, allItems);

    const layout: AreaLayout = {
      item,
      colCount:       item.gw,
      hallwayCols,
      maxLevelPerCol: this._areaMaxLevelPerCol(item, locsInArea, hallwayCols),
      // Build contiguous non-hallway depth segments (world Z)
      segs:           this._areaDepthSegments(item, hallwayRows),
    };

    this._renderAreaFloorSlabs(layout);
    this._renderAreaUprights(layout);
    this._renderAreaBeams(layout);
    this._renderAreaShelfFloors(layout);
  }

  /** Hallway cells overlapping an area: vertical hallways → relative cols, horizontal → relative rows */
  private _areaHallwayCells(item: GridItem, allItems: GridItem[]): { hallwayCols: Set<number>; hallwayRows: Set<number> } {
    const hallwayCols = new Set<number>();  // relative X cols — skip beams/slabs
    const hallwayRows = new Set<number>();  // relative Z rows — split cross-braces
    for (const hw of allItems) {
      // Check overlap (not strict containment — hallway may be partially outside area)
      if (hw.type !== 'Hallway' || !this._overlapsArea(hw, item)) continue;

      const isVertical = hw.gh >= hw.gw;
      if (isVertical) {
        const cLeft  = Math.max(hw.gx, item.gx) - item.gx;
        const cRight = Math.min(hw.gx + hw.gw, item.gx + item.gw) - item.gx;
        addRange(hallwayCols, cLeft, cRight);
      } else {
        const rTop   = Math.max(hw.gy, item.gy) - item.gy;
        const rBot   = Math.min(hw.gy + hw.gh, item.gy + item.gh) - item.gy;
        addRange(hallwayRows, rTop, rBot);
      }
    }
    return { hallwayCols, hallwayRows };
  }

  private _overlapsArea(hw: GridItem, item: GridItem): boolean {
    if (hw.gx + hw.gw <= item.gx || hw.gx >= item.gx + item.gw) return false;
    return !(hw.gy + hw.gh <= item.gy || hw.gy >= item.gy + item.gh);
  }

  /** Highest loc level per relative column (0 for hallway columns, 1 for empty columns) */
  private _areaMaxLevelPerCol(item: GridItem, locsInArea: GridItem[], hallwayCols: Set<number>): number[] {
    const colCount = item.gw;
    const maxLevelPerCol: number[] = new Array<number>(colCount).fill(0);
    for (let c = 0; c < colCount; c++) {
      if (hallwayCols.has(c)) {
        maxLevelPerCol[c] = 0;
      } else {
        const locsInCol = locsInArea.filter(l => {
          const relLeft  = l.gx - item.gx;
          const relRight = l.gx + l.gw - item.gx;
          return c >= relLeft && c < relRight;
        });
        if (locsInCol.length > 0) {
          maxLevelPerCol[c] = Math.max(...locsInCol.map(l => l.level ?? 1));
        } else {
          maxLevelPerCol[c] = 1; // Default to level 1 for empty columns in Area (not hallway)
        }
      }
    }
    return maxLevelPerCol;
  }

  /** Contiguous non-hallway depth segments (world Z) */
  private _areaDepthSegments(item: GridItem, hallwayRows: Set<number>): DepthSegment[] {
    const rowCount = item.gh;
    const segs: DepthSegment[] = [];
    let start: number | null = null;
    for (let r = 0; r <= rowCount; r++) {
      const isHw = r < rowCount && hallwayRows.has(r);
      if (!isHw && start === null)              { start = r; }
      else if ((isHw || r === rowCount) && start !== null) {
        const z0 = this._gz(item) + start * SCALE;
        const z1 = this._gz(item) + r * SCALE;
        segs.push({ z0, z1, cz: (z0 + z1) / 2, d: z1 - z0 });
        start = null;
      }
    }
    return segs;
  }

  /** Y position of a rack level beam (level 0 = floor) */
  private _beamY(lvl: number): number {
    return lvl === 0 ? 0 : FLOOR_OFFSET + (lvl - 1) * LOC_H;
  }

  /** Floor slab (only where racks are, skip hallway cols/rows) */
  private _renderAreaFloorSlabs({ item, colCount, hallwayCols, maxLevelPerCol, segs }: AreaLayout): void {
    const rackSlabMat = this.mats['rackSlab'];
    for (let col = 0; col < colCount; col++) {
      if (hallwayCols.has(col)) continue;
      const colMaxLevel = maxLevelPerCol[col];
      if (colMaxLevel === 0) continue;
      const bx = this._gx(item) + col * SCALE + SCALE / 2;
      for (const seg of segs) {
        const s = this._box(`af_${item.id}_${col}_${Math.round(seg.z0)}`, SCALE, 0.06, seg.d);
        s.position.set(bx, 0.03, seg.cz); s.material = rackSlabMat; this._tag(s, item.id);
      }
    }
  }

  /**
   * Rack uprights per column boundary.
   * Use original panelLevel check — no hallwayCols gating here so rack
   * structure always appears where locs exist (even next to a hallway col).
   */
  private _renderAreaUprights({ item, colCount, maxLevelPerCol, segs }: AreaLayout): void {
    const rackMat = this.mats['rack'];
    for (let col = 0; col <= colCount; col++) {
      const panelLevel = Math.max(
        col > 0        ? maxLevelPerCol[col - 1] : 0,
        col < colCount ? maxLevelPerCol[col]     : 0
      );
      if (panelLevel === 0) continue;

      // Render per depth-segment so posts & braces don't span horizontal hallways
      for (const seg of segs) {
        this._renderAreaUprightSegment(item, col, panelLevel, seg, rackMat);
      }
    }
  }

  /** Front/back posts, cross-braces and intermediate posts of one upright within a depth segment */
  private _renderAreaUprightSegment(
    item: GridItem,
    col: number,
    panelLevel: number,
    seg: DepthSegment,
    rackMat: BABYLON.StandardMaterial
  ): void {
    const panelH = panelLevel * LOC_H + 0.25;
    const px     = this._gx(item) + col * SCALE;
    const cbT    = POST_T * 0.65;
    const ipT    = POST_T * 0.75;

    const fp = this._box(`fp_${item.id}_${col}_${Math.round(seg.z0)}`, POST_T, panelH, POST_T);
    fp.position.set(px, panelH / 2, seg.z0); fp.material = rackMat; this._tag(fp, item.id);

    const bp = this._box(`bp_${item.id}_${col}_${Math.round(seg.z1)}`, POST_T, panelH, POST_T);
    bp.position.set(px, panelH / 2, seg.z1); bp.material = rackMat; this._tag(bp, item.id);

    for (let lvl = 0; lvl <= panelLevel; lvl++) {
      const by = this._beamY(lvl);
      const cb = this._box(`cb_${item.id}_${col}_${lvl}_${Math.round(seg.z0)}`, cbT, cbT, seg.d);
      cb.position.set(px, by, seg.cz); cb.material = rackMat; this._tag(cb, item.id);
    }

    let ipOff = seg.z0 + SCALE * 2; let ipIdx = 0;
    while (ipOff < seg.z1 - SCALE * 0.5) {
      const ip = this._box(`ip_${item.id}_${col}_${ipIdx}_${Math.round(seg.z0)}`, ipT, panelH, ipT);
      ip.position.set(px, panelH / 2, ipOff); ip.material = rackMat; this._tag(ip, item.id);
      ipOff += SCALE * 2; ipIdx++;
    }
  }

  /** Horizontal shelf beams — skip hallway cols, split by depth segments */
  private _renderAreaBeams({ item, colCount, hallwayCols, maxLevelPerCol, segs }: AreaLayout): void {
    const rackMat = this.mats['rack'];
    const bh = POST_T * 0.55;
    for (let col = 0; col < colCount; col++) {
      if (hallwayCols.has(col)) continue;          // ← skip hallway columns
      const colMaxLevel = maxLevelPerCol[col];
      if (colMaxLevel === 0) continue;
      const bx = this._gx(item) + col * SCALE + SCALE / 2;
      for (const seg of segs) {
        for (let lvl = 0; lvl <= colMaxLevel; lvl++) {
          const by = this._beamY(lvl);
          const fb = this._box(`fb_${item.id}_${col}_${lvl}_${Math.round(seg.z0)}`, SCALE, bh, POST_T);
          fb.position.set(bx, by, seg.z0); fb.material = rackMat; this._tag(fb, item.id);
          const bb = this._box(`bb_${item.id}_${col}_${lvl}_${Math.round(seg.z1)}`, SCALE, bh, POST_T);
          bb.position.set(bx, by, seg.z1); bb.material = rackMat; this._tag(bb, item.id);
        }
      }
    }
  }

  /** Per-level shelf floors — skip hallway cols, split by depth segments */
  private _renderAreaShelfFloors({ item, colCount, hallwayCols, maxLevelPerCol, segs }: AreaLayout): void {
    const slabMat = this.mats['levelSlab'];
    for (let col = 0; col < colCount; col++) {
      if (hallwayCols.has(col)) continue;
      const colMaxLevel = maxLevelPerCol[col];
      if (colMaxLevel === 0) continue;
      const bx = this._gx(item) + col * SCALE + SCALE / 2;
      for (const seg of segs) {
        for (let lvl = 1; lvl <= colMaxLevel; lvl++) {
          const slabY = FLOOR_OFFSET + (lvl - 1) * LOC_H;
          const s = this._box(`ls_${item.id}_${col}_${lvl}_${Math.round(seg.z0)}`, SCALE - 0.02, 0.04, seg.d - 0.02);
          s.position.set(bx, slabY, seg.cz); s.material = slabMat; this._tag(s, item.id);
        }
      }
    }
  }

  /** Loc – yellow storage box offset by FLOOR_OFFSET so level-1 is above clearance gap */
  private _renderLoc(item: GridItem): void {
    const lvl = Math.max(1, item.level ?? 1);
    const w   = this._gw(item) - GAP * 2;
    const h   = LOC_H - GAP;
    const d   = this._gd(item) - GAP * 2;
    const y   = FLOOR_OFFSET + (lvl - 1) * LOC_H + h / 2;
    const b   = this._box(`loc_${item.id}`, w, h, d);
    b.position.set(this._cx(item), y, this._cz(item));
    b.material = this.mats['loc'];
    this._tag(b, item.id);
  }

  /** Wall – solid gray slab that shrinks when camera faces it (cutaway effect) */
  private _renderWall(item: GridItem): void {
    const baseH = 3.5;
    const b     = this._box(`wall_${item.id}`, this._gw(item), baseH, this._gd(item));
    b.position.set(this._cx(item), baseH / 2, this._cz(item));
    b.material  = this.mats['wall'];
    this._tag(b, item.id);
    this.wallMeshInfo.push({ mesh: b, baseH, cx: this._cx(item), cz: this._cz(item) });
  }

  /** Door – flat red slab at floor level, never scales with camera */
  private _renderDoor(item: GridItem): void {
    const doorH = 0.08;
    const frame = this._box(`door_${item.id}`, this._gw(item), doorH, this._gd(item));
    frame.position.set(this._cx(item), doorH / 2, this._cz(item));
    frame.material = this.mats['door'];
    this._tag(frame, item.id);
  }

  /** Conveyor – flat orange strip */
  private _renderConveyor(item: GridItem): void {
    const h = 0.35;
    const b = this._box(`conv_${item.id}`, this._gw(item) - GAP, h, this._gd(item) - GAP);
    b.position.set(this._cx(item), h / 2, this._cz(item));
    b.material = this.mats['conveyor'];
    this._tag(b, item.id);
  }

  /** Pallet – short brown block */
  private _renderPallet(item: GridItem): void {
    const h = 0.65;
    const b = this._box(`pallet_${item.id}`, this._gw(item) - GAP, h, this._gd(item) - GAP);
    b.position.set(this._cx(item), h / 2, this._cz(item));
    b.material = this.mats['pallet'];
    this._tag(b, item.id);
  }

  // ─── Camera ───────────────────────────────────────────────────────────────

  private _centerCamera(items: GridItem[]): void {
    const xs   = items.flatMap(i => [i.gx, i.gx + i.gw]);
    const zs   = items.flatMap(i => [i.gy, i.gy + i.gh]);
    const minX = Math.min(...xs) * SCALE;
    const maxX = Math.max(...xs) * SCALE;
    const minZ = Math.min(...zs) * SCALE;
    const maxZ = Math.max(...zs) * SCALE;
    const span = Math.max(maxX - minX, maxZ - minZ, 20);

    this.camera.target = new BABYLON.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.camera.radius = Math.min(Math.max(span * 1.4, 30), 600);
  }

  // ─── Picking route (3D overlay) ───────────────────────────────────────────

  /**
   * Renders the picking route as a glowing gradient tube through the hallway cells,
   * with directional arrows and numbered spheres at each stop access point.
   */
  private _renderPickingRoute(route: PickingRoute): void {
    if (!route.path.length) return;

    const Y_TUBE  = 0.18;  // height above floor
    const Y_STOP  = 0.45;  // stop sphere height
    const Y_START = 0.5;

    // Helper to create texture-based numbered/lettered materials for spheres
    const createSphereTextMat = (name: string, text: string, bgColor: string) => {
      const dynamicTexture = new BABYLON.DynamicTexture(`dt-${name}`, { width: 128, height: 128 }, this.scene, true);
      const ctx = dynamicTexture.getContext() as any;
      
      // Background color
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, 128, 128);
      
      // Centered text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 75px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 64, 64);
      
      dynamicTexture.update();
      
      const mat = new BABYLON.StandardMaterial(name, this.scene);
      mat.diffuseTexture = dynamicTexture;
      mat.emissiveTexture = dynamicTexture; // Self-glowing
      mat.specularColor = new BABYLON.Color3(0, 0, 0);
      return mat;
    };

    // ── Render gradient segments and directional cones ────────────────────
    let stepIdx = 0;
    const totalSteps = route.path.length;

    for (const step of route.path) {
      const t = totalSteps > 1 ? stepIdx / (totalSteps - 1) : 0;
      // Interpolate between Green (#10B981 -> RGB: 0.062, 0.725, 0.505) and Rust/Dark Orange (#b83d09 -> RGB: 0.721, 0.239, 0.035)
      const r = 0.062 + t * (0.721 - 0.062);
      const g = 0.725 + t * (0.239 - 0.725);
      const b = 0.505 + t * (0.035 - 0.505);

      const p0 = new BABYLON.Vector3((step.fromGx + 0.5) * SCALE, Y_TUBE, (step.fromGy + 0.5) * SCALE);
      const p1 = new BABYLON.Vector3((step.toGx + 0.5) * SCALE, Y_TUBE, (step.toGy + 0.5) * SCALE);

      // 1. Tube Segment
      const segment = BABYLON.MeshBuilder.CreateTube(`pr-seg-${stepIdx}`, {
        path: [p0, p1], radius: 0.08, tessellation: 8, updatable: false
      }, this.scene);

      const mat = new BABYLON.StandardMaterial(`pr-seg-mat-${stepIdx}`, this.scene);
      mat.diffuseColor = new BABYLON.Color3(r, g, b);
      mat.emissiveColor = new BABYLON.Color3(r * 0.6, g * 0.6, b * 0.6);
      mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
      segment.material = mat;
      segment.metadata = { src: 'picking' };

      // 2. Directional Cone Arrowhead (if the segment has non-trivial length)
      const dist = BABYLON.Vector3.Distance(p0, p1);
      if (dist > 0.1) {
        const dir = p1.subtract(p0).normalize();
        const mid = p0.add(p1).scale(0.5);

        const arrow = BABYLON.MeshBuilder.CreateCylinder(`pr-arr-${stepIdx}`, {
          diameterTop: 0,
          diameterBottom: 0.22,
          height: 0.32,
          tessellation: 6
        }, this.scene);
        arrow.position = mid;
        arrow.material = segment.material; // share segment material
        arrow.metadata = { src: 'picking' };

        // Rotate cone to align along the dir vector
        const up = new BABYLON.Vector3(0, 1, 0);
        const axis = BABYLON.Vector3.Cross(up, dir).normalize();
        const angle = Math.acos(BABYLON.Vector3.Dot(up, dir));
        if (axis.length() > 0.0001) {
          arrow.rotationQuaternion = BABYLON.Quaternion.RotationAxis(axis, angle);
        } else if (dir.y < 0) {
          arrow.rotation = new BABYLON.Vector3(Math.PI, 0, 0);
        }
      }

      stepIdx++;
    }

    // ── Start sphere (Green 'S') ──────────────────────────────────────────────
    const startSph = BABYLON.MeshBuilder.CreateSphere('pr-start', { diameter: 0.5 }, this.scene);
    startSph.position = new BABYLON.Vector3(
      (route.startPoint.gx + 0.5) * SCALE, Y_START, (route.startPoint.gy + 0.5) * SCALE);
    startSph.material = createSphereTextMat('start-sph-mat', 'S', '#10B981');
    startSph.metadata = { src: 'picking' };

    // ── Stop spheres (Rust/Orange numbered) ────────────────────────────────────
    for (const stop of route.stops) {
      const sph = BABYLON.MeshBuilder.CreateSphere(`pr-stop-${stop.order}`, { diameter: 0.42 }, this.scene);
      sph.position = new BABYLON.Vector3(
        (stop.accessGx + 0.5) * SCALE, Y_STOP, (stop.accessGy + 0.5) * SCALE);
      sph.material = createSphereTextMat(`stop-sph-mat-${stop.order}`, stop.order.toString(), '#b83d09');
      sph.metadata = { src: 'picking' };
    }
  }

  /** Disposes all picking-route meshes from the scene. */
  private _clearPickingRoute(): void {
    [...this.scene.meshes]
      .filter(m => m.metadata?.src === 'picking')
      .forEach(m => {
        if (m.material) {
          // Dispose dynamic textures to prevent memory leaks
          const stdMat = m.material as BABYLON.StandardMaterial;
          if (stdMat.diffuseTexture) stdMat.diffuseTexture.dispose();
          if (stdMat.emissiveTexture) stdMat.emissiveTexture.dispose();
          stdMat.dispose();
        }
        m.dispose();
      });
  }
}
