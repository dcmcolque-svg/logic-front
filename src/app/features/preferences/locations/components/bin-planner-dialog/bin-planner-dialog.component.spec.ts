import { ComponentFixture, TestBed } from '@angular/core/testing'
import { HttpClientTestingModule } from '@angular/common/http/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of, throwError } from 'rxjs'

import { BinPlannerDialogComponent } from './bin-planner-dialog.component'
import { LocationService } from '../../location.service'
import { PlannedBin, BinPlannerResult, PlannerState, PlannerWall } from './bin-planner.types'

// ── Mock canvas for headless environment ───────────────────────────
function mockCanvas2DContext(): CanvasRenderingContext2D {
  return {
    scale: jasmine.createSpy('scale'),
    fillRect: jasmine.createSpy('fillRect'),
    strokeRect: jasmine.createSpy('strokeRect'),
    beginPath: jasmine.createSpy('beginPath'),
    moveTo: jasmine.createSpy('moveTo'),
    lineTo: jasmine.createSpy('lineTo'),
    stroke: jasmine.createSpy('stroke'),
    fill: jasmine.createSpy('fill'),
    fillText: jasmine.createSpy('fillText'),
    measureText: jasmine.createSpy('measureText').and.returnValue({ width: 50 }),
    roundRect: jasmine.createSpy('roundRect'),
    setLineDash: jasmine.createSpy('setLineDash'),
    save: jasmine.createSpy('save'),
    restore: jasmine.createSpy('restore'),
    clearRect: jasmine.createSpy('clearRect'),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textAlign: 'left',
    textBaseline: 'top',
    shadowBlur: 0,
    shadowColor: '',
  } as unknown as CanvasRenderingContext2D
}

describe('BinPlannerDialogComponent', () => {
  let component: BinPlannerDialogComponent
  let fixture: ComponentFixture<BinPlannerDialogComponent>
  let locationServiceSpy: jasmine.SpyObj<LocationService>

  beforeEach(async () => {
    locationServiceSpy = jasmine.createSpyObj('LocationService', [
      'saveBinLayout',
      'getBinLayout',
      'getContainerTree',
    ])
    // Defaults for service methods
    locationServiceSpy.saveBinLayout.and.returnValue(of({} as any))
    locationServiceSpy.getBinLayout.and.returnValue(throwError(() => new Error('not found')))
    locationServiceSpy.getContainerTree.and.returnValue(of([]))

    await TestBed.configureTestingModule({
      imports: [
        BinPlannerDialogComponent,
        HttpClientTestingModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: LocationService, useValue: locationServiceSpy },
      ],
    }).compileComponents()

    fixture = TestBed.createComponent(BinPlannerDialogComponent)
    component = fixture.componentInstance

    // Inject a mock canvas context so render() doesn't crash
    ;(component as any).ctx = mockCanvas2DContext()
    ;(component as any).canvasWidth = 800
    ;(component as any).canvasHeight = 600

    await fixture.whenStable()
  })

  // ─────────────────────────────────────────────────────────────────
  // Component creation
  // ─────────────────────────────────────────────────────────────────
  it('should create', () => {
    expect(component).toBeTruthy()
  })

  // ─────────────────────────────────────────────────────────────────
  // Default state
  // ─────────────────────────────────────────────────────────────────
  it('should have default 2×4 grid', () => {
    expect(component.rows()).toBe(2)
    expect(component.cols()).toBe(4)
  })

  it('should have default name format {loc}/{bin}', () => {
    expect(component.nameFormat()).toBe('{loc}/{bin}')
  })

  it('should default to BIN bin type', () => {
    expect(component.binType()).toBe('BIN')
  })

  it('should have empty tags by default', () => {
    expect(component.tags()).toEqual([])
  })

  // ─────────────────────────────────────────────────────────────────
  // Grid rebuild
  // ─────────────────────────────────────────────────────────────────
  describe('rebuildGrid', () => {
    it('should create correct number of bins for 2×4 grid (all walls active)', () => {
      component.rebuildGrid()
      expect(component.bins().length).toBe(8)
    })

    it('should create correct number of bins for 3×3 grid', () => {
      component.rows.set(3)
      component.cols.set(3)
      component.rebuildGrid()
      expect(component.bins().length).toBe(9)
    })

    it('should create correct number of bins for 1×1 grid', () => {
      component.rows.set(1)
      component.cols.set(1)
      component.rebuildGrid()
      expect(component.bins().length).toBe(1)
    })

    it('should set equal colWidths and rowHeights', () => {
      component.rows.set(3)
      component.cols.set(5)
      component.rebuildGrid()
      expect(component.colWidths.length).toBe(5)
      expect(component.rowHeights.length).toBe(3)
      expect(component.colWidths.every(w => w === 1)).toBeTrue()
      expect(component.rowHeights.every(h => h === 1)).toBeTrue()
    })

    it('should build vertical and horizontal walls', () => {
      component.rows.set(2)
      component.cols.set(3)
      component.rebuildGrid()
      // Vertical walls: 2 rows × (3-1) cols = 4
      const verticalWalls = component._walls.filter(w => w.orientation === 'vertical')
      expect(verticalWalls.length).toBe(4)
      // Horizontal walls: (2-1) rows × 3 cols = 3
      const horizontalWalls = component._walls.filter(w => w.orientation === 'horizontal')
      expect(horizontalWalls.length).toBe(3)
    })

    it('should clear selected wall and bin selections on rebuild', () => {
      component.selectedWallIndex.set(2)
      component.selectedBinIds.set(new Set(['0001', '0002']))
      component.rebuildGrid()
      expect(component.selectedWallIndex()).toBeNull()
      expect(component.selectedBinIds().size).toBe(0)
    })

    it('should not rebuild for invalid rows (< 1)', () => {
      component.rebuildGrid()
      const initialBinCount = component.bins().length
      component.rows.set(0)
      component.rebuildGrid()
      // Bins remain from previous call since r < 1 returns early
      expect(component.bins().length).toBe(initialBinCount)
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Row/Col change validation
  // ─────────────────────────────────────────────────────────────────
  describe('onRowsChange / onColsChange', () => {
    it('should update rows when value is valid', () => {
      component.onRowsChange(5)
      expect(component.rows()).toBe(5)
    })

    it('should reject rows < 1', () => {
      component.rows.set(3)
      component.onRowsChange(0)
      expect(component.rows()).toBe(3) // unchanged
    })

    it('should reject rows > MAX_ROWS', () => {
      component.rows.set(3)
      component.onRowsChange(26)
      expect(component.rows()).toBe(3) // unchanged
      expect(component.gridError()).toBeTruthy()
    })

    it('should update cols when value is valid', () => {
      component.onColsChange(6)
      expect(component.cols()).toBe(6)
    })

    it('should reject cols < 1', () => {
      component.cols.set(4)
      component.onColsChange(0)
      expect(component.cols()).toBe(4) // unchanged
    })

    it('should reject cols > MAX_COLS', () => {
      component.cols.set(4)
      component.onColsChange(26)
      expect(component.cols()).toBe(4) // unchanged
      expect(component.gridError()).toBeTruthy()
    })

    // MAX_ROWS × MAX_COLS (25 × 25 = 625) is far below MAX_BINS, so the
    // per-axis limits are what bound the grid; the dynamic max follows them.
    it('caps the dynamic row/column max at MAX_ROWS / MAX_COLS', () => {
      component.onRowsChange(25)
      component.onColsChange(25)
      expect(component.rows() * component.cols()).toBeLessThanOrEqual(component.MAX_BINS)
      expect(component.maxRows()).toBe(component.MAX_ROWS)
      expect(component.maxCols()).toBe(component.MAX_COLS)
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Dynamic max computations
  // ─────────────────────────────────────────────────────────────────
  describe('maxRows / maxCols', () => {
    it('should compute maxRows based on current cols', () => {
      component.cols.set(4)
      // Math.min(25, floor(10000/4)) = Math.min(25, 2500) = 25
      expect(component.maxRows()).toBe(25)
    })

    it('should compute maxCols based on current rows', () => {
      component.rows.set(2)
      // Math.min(25, floor(10000/2)) = Math.min(25, 5000) = 25
      expect(component.maxCols()).toBe(25)
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Orientation toggles
  // ─────────────────────────────────────────────────────────────────
  describe('orientation toggles', () => {
    it('should toggle vertical order from ltr to rtl', () => {
      component.rebuildGrid()
      expect(component.verticalOrder()).toBe('ltr')
      component.toggleVerticalOrder()
      expect(component.verticalOrder()).toBe('rtl')
    })

    it('should toggle vertical order back to ltr', () => {
      component.rebuildGrid()
      component.toggleVerticalOrder()
      component.toggleVerticalOrder()
      expect(component.verticalOrder()).toBe('ltr')
    })

    it('should toggle horizontal order from ttb to btt', () => {
      component.rebuildGrid()
      expect(component.horizontalOrder()).toBe('ttb')
      component.toggleHorizontalOrder()
      expect(component.horizontalOrder()).toBe('btt')
    })

    it('should toggle horizontal order back to ttb', () => {
      component.rebuildGrid()
      component.toggleHorizontalOrder()
      component.toggleHorizontalOrder()
      expect(component.horizontalOrder()).toBe('ttb')
    })

    it('should recalculate bins when orientation changes', () => {
      component.rebuildGrid()
      const binsBefore = component.bins().map(b => b.id)
      component.toggleVerticalOrder()
      const binsAfter = component.bins().map(b => b.id)
      // Same bin IDs but potentially different cell ordering
      expect(binsAfter.length).toBe(binsBefore.length)
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Name format
  // ─────────────────────────────────────────────────────────────────
  describe('nameFormat', () => {
    it('should update name format', () => {
      component.onNameFormatChange('BIN-{bin}')
      expect(component.nameFormat()).toBe('BIN-{bin}')
    })

    it('should update namePreview based on format', () => {
      fixture.componentRef.setInput('locationCode', 'A-01')
      component.onNameFormatChange('{loc}-{bin}')
      expect(component.namePreview()).toBe('A-01-0001')
    })

    it('should use LOC-001 as fallback preview when no locationCode', () => {
      fixture.componentRef.setInput('locationCode', '')
      fixture.componentRef.setInput('locationCodes', [])
      component.onNameFormatChange('{loc}/{bin}')
      expect(component.namePreview()).toBe('LOC-001/0001')
    })

    it('should insert token at end of format', () => {
      component.nameFormat.set('PREFIX-')
      component.insertToken('{bin}')
      expect(component.nameFormat()).toBe('PREFIX-{bin}')
    })

    it('should update bin labels when format changes', () => {
      fixture.componentRef.setInput('locationCode', 'LOC-A')
      component.rebuildGrid()
      component.onNameFormatChange('{loc}/{bin}')
      const firstBin = component.bins()[0]
      expect(firstBin.label).toBe('LOC-A/0001')
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Bin type
  // ─────────────────────────────────────────────────────────────────
  describe('binType', () => {
    it('should update bin type on change', () => {
      component.onBinTypeChange('PALLET')
      expect(component.binType()).toBe('PALLET')
    })

    it('should recalculate bins with new type', () => {
      component.rebuildGrid()
      component.onBinTypeChange('TOTE')
      const bins = component.bins()
      expect(bins.every(b => b.type === 'TOTE')).toBeTrue()
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Tags
  // ─────────────────────────────────────────────────────────────────
  describe('tags', () => {
    it('should add a tag', () => {
      component.tagInput.set('fragile')
      component.addTag()
      expect(component.tags()).toContain('fragile')
    })

    it('should not add duplicate tags', () => {
      component.tagInput.set('fragile')
      component.addTag()
      component.tagInput.set('fragile')
      component.addTag()
      expect(component.tags().filter(t => t === 'fragile').length).toBe(1)
    })

    it('should not add empty tag', () => {
      component.tagInput.set('  ')
      component.addTag()
      expect(component.tags().length).toBe(0)
    })

    it('should clear tag input after adding', () => {
      component.tagInput.set('heavy')
      component.addTag()
      expect(component.tagInput()).toBe('')
    })

    it('should remove a tag', () => {
      component.tagInput.set('fragile')
      component.addTag()
      component.tagInput.set('heavy')
      component.addTag()
      component.removeTag('fragile')
      expect(component.tags()).not.toContain('fragile')
      expect(component.tags()).toContain('heavy')
    })

    it('should apply tags to bins as comma-separated string', () => {
      component.tagInput.set('fragile')
      component.addTag()
      component.tagInput.set('heavy')
      component.addTag()
      component.rebuildGrid()
      const firstBin = component.bins()[0]
      expect(firstBin.tag).toBe('fragile,heavy')
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Edit bin dialog (per-bin type/tags)
  // ─────────────────────────────────────────────────────────────────
  describe('edit bin type/tags', () => {
    beforeEach(() => {
      component.rebuildGrid()
    })

    it('should add edit tag', () => {
      component.editBinTagInput.set('cold-chain')
      component.addEditTag()
      expect(component.editBinTags()).toContain('cold-chain')
    })

    it('should not add duplicate edit tag', () => {
      component.editBinTagInput.set('cold-chain')
      component.addEditTag()
      component.editBinTagInput.set('cold-chain')
      component.addEditTag()
      expect(component.editBinTags().filter(t => t === 'cold-chain').length).toBe(1)
    })

    it('should not add empty edit tag', () => {
      component.editBinTagInput.set('')
      component.addEditTag()
      expect(component.editBinTags().length).toBe(0)
    })

    it('should remove edit tag', () => {
      component.editBinTags.set(['a', 'b'])
      component.removeEditTag('a')
      expect(component.editBinTags()).toEqual(['b'])
    })

    it('should apply edited type and tags to selected bins', () => {
      // Select first two bins
      const bins = component.bins()
      component.selectedBinIds.set(new Set([bins[0].id, bins[1].id]))
      component.editBinType.set('PALLET')
      component.editBinTags.set(['cold', 'priority'])
      component.applyEditBin()

      const updatedBins = component.bins()
      const modified = updatedBins.filter(b =>
        b.id === bins[0].id || b.id === bins[1].id
      )
      expect(modified.every(b => b.type === 'PALLET')).toBeTrue()
      expect(modified.every(b => b.tag === 'cold,priority')).toBeTrue()
      expect(component.editBinDialogVisible()).toBeFalse()
    })

    it('should not modify unselected bins', () => {
      const bins = component.bins()
      component.selectedBinIds.set(new Set([bins[0].id]))
      component.editBinType.set('TOTE')
      component.editBinTags.set(['special'])
      component.applyEditBin()

      const unmodified = component.bins().filter(b => b.id !== bins[0].id)
      expect(unmodified.every(b => b.type === 'BIN')).toBeTrue()
    })

    it('should open edit bin dialog with BIN type and first selected bin tags', () => {
      const bins = component.bins()
      // Set different type/tag on first bin
      component.selectedBinIds.set(new Set([bins[0].id]))
      component.editBinType.set('PALLET')
      component.editBinTags.set(['hazmat'])
      component.applyEditBin()

      // Now open edit dialog with that bin selected
      component.selectedBinIds.set(new Set([bins[0].id]))
      component.openEditBinDialog()
      expect(component.editBinDialogVisible()).toBeTrue()
      expect(component.editBinType()).toBe('BIN')
      expect(component.editBinTags()).toEqual(['hazmat'])
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Wall management
  // ─────────────────────────────────────────────────────────────────
  describe('wall management', () => {
    it('should create all walls as active on rebuild', () => {
      component.rebuildGrid()
      expect(component._walls.every(w => w.active)).toBeTrue()
    })

    it('should merge bins when a wall is deactivated', () => {
      component.rows.set(1)
      component.cols.set(2)
      component.rebuildGrid()
      expect(component.bins().length).toBe(2)

      // Deactivate the only wall between the two cells
      const wall = component._walls[0]
      wall.active = false
      ;(component as any).recalcBins()
      expect(component.bins().length).toBe(1)
      expect(component.bins()[0].cells.length).toBe(2)
    })

    it('should split bins when a wall is reactivated', () => {
      component.rows.set(1)
      component.cols.set(2)
      component.rebuildGrid()

      // Deactivate then reactivate
      component._walls[0].active = false
      ;(component as any).recalcBins()
      expect(component.bins().length).toBe(1)

      component._walls[0].active = true
      ;(component as any).recalcBins()
      expect(component.bins().length).toBe(2)
    })

    it('should removeSelectedWall toggle wall state', () => {
      component.rebuildGrid()
      component.selectedWallIndex.set(0)
      const wallBefore = component._walls[0].active
      component.removeSelectedWall()
      expect(component._walls[0].active).toBe(!wallBefore)
      expect(component.selectedWallIndex()).toBeNull()
    })

    it('removeSelectedWall should noop when no wall selected', () => {
      component.rebuildGrid()
      const wallCount = component._walls.length
      component.selectedWallIndex.set(null)
      component.removeSelectedWall()
      expect(component._walls.length).toBe(wallCount) // unchanged
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Flood-fill bin recalculation
  // ─────────────────────────────────────────────────────────────────
  describe('recalcBins (flood-fill)', () => {
    it('should create single bin when all walls are inactive (1 big merged area)', () => {
      component.rows.set(2)
      component.cols.set(3)
      component.rebuildGrid()

      // Deactivate all walls
      component._walls.forEach(w => w.active = false)
      ;(component as any).recalcBins()

      expect(component.bins().length).toBe(1)
      expect(component.bins()[0].cells.length).toBe(6) // 2×3
    })

    it('should create separate bins for each cell when all walls are active', () => {
      component.rows.set(3)
      component.cols.set(3)
      component.rebuildGrid()
      expect(component.bins().length).toBe(9)
      expect(component.bins().every(b => b.cells.length === 1)).toBeTrue()
    })

    it('should merge L-shaped regions correctly', () => {
      // 2×2 grid
      component.rows.set(2)
      component.cols.set(2)
      component.rebuildGrid()
      // Walls: V(0,0)-(0,1), V(1,0)-(1,1), H(0,0)-(1,0), H(0,1)-(1,1)

      // Deactivate wall between (0,0) and (0,1) → merge top row
      const topWall = component._walls.find(w =>
        w.orientation === 'vertical' && w.row1 === 0
      )
      if (topWall) topWall.active = false

      // Deactivate wall between (0,0) and (1,0) → extend merged area down-left
      const leftWall = component._walls.find(w =>
        w.orientation === 'horizontal' && w.col1 === 0
      )
      if (leftWall) leftWall.active = false

      ;(component as any).recalcBins()

      // (0,0), (0,1), (1,0) should be one bin; (1,1) separate
      expect(component.bins().length).toBe(2)
      const largeBin = component.bins().find(b => b.cells.length === 3)
      expect(largeBin).toBeTruthy()
    })

    it('should generate sequential bin IDs padded to 4 digits', () => {
      component.rows.set(2)
      component.cols.set(2)
      component.rebuildGrid()
      const ids = component.bins().map(b => b.id)
      expect(ids).toEqual(['0001', '0002', '0003', '0004'])
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Bulk mode
  // ─────────────────────────────────────────────────────────────────
  describe('bulk mode', () => {
    it('should not be in bulk mode with single location', () => {
      fixture.componentRef.setInput('locationCodes', ['LOC-001'])
      expect(component.isBulkMode()).toBeFalse()
    })

    it('should be in bulk mode with multiple locations', () => {
      fixture.componentRef.setInput('locationCodes', ['LOC-001', 'LOC-002', 'LOC-003'])
      expect(component.isBulkMode()).toBeTrue()
    })

    it('should report correct bulk count', () => {
      fixture.componentRef.setInput('locationCodes', ['LOC-001', 'LOC-002', 'LOC-003'])
      expect(component.bulkCount()).toBe(3)
    })

    it('should compute totalBinsToCreate correctly in bulk mode', () => {
      fixture.componentRef.setInput('locationCodes', ['LOC-001', 'LOC-002'])
      component.rows.set(2)
      component.cols.set(2)
      component.rebuildGrid()
      // 4 bins × 2 locations = 8
      expect(component.totalBinsToCreate()).toBe(8)
    })

    it('should compute totalBinsToCreate correctly in single mode', () => {
      fixture.componentRef.setInput('locationCodes', [])
      component.rows.set(2)
      component.cols.set(3)
      component.rebuildGrid()
      // 6 bins × 1 location = 6
      expect(component.totalBinsToCreate()).toBe(6)
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // totalItems computed
  // ─────────────────────────────────────────────────────────────────
  describe('totalItems', () => {
    it('should reflect current bin count', () => {
      component.rows.set(3)
      component.cols.set(3)
      component.rebuildGrid()
      expect(component.totalItems()).toBe(9)
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // State building
  // ─────────────────────────────────────────────────────────────────
  describe('buildPlannerState', () => {
    it('should build full planner state', () => {
      fixture.componentRef.setInput('locationCode', 'A-01')
      component.rows.set(2)
      component.cols.set(3)
      component.rebuildGrid()
      component.onBinTypeChange('PALLET')
      component.tagInput.set('cold')
      component.addTag()

      const state: PlannerState = (component as any).buildPlannerState()

      expect(state.rows).toBe(2)
      expect(state.cols).toBe(3)
      expect(state.verticalOrder).toBe('ltr')
      expect(state.horizontalOrder).toBe('ttb')
      expect(state.bins.length).toBe(6)
      expect(state.walls.length).toBe(component._walls.length)
      expect(state.locationCode).toBe('A-01')
      expect(state.colWidths.length).toBe(3)
      expect(state.rowHeights.length).toBe(2)
      expect(state.nameFormat).toBe('{loc}/{bin}')
      expect(state.tag).toBe('cold')
      expect(state.type).toBe('PALLET')
    })

    it('should build state with custom code parameter', () => {
      fixture.componentRef.setInput('locationCode', 'A-01')
      component.rebuildGrid()
      const state: PlannerState = (component as any).buildPlannerState('B-02')
      expect(state.locationCode).toBe('B-02')
      expect(state.bins[0].label).toContain('B-02')
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // State restoration
  // ─────────────────────────────────────────────────────────────────
  describe('restoreState', () => {
    it('should restore all state fields from a PlannerState', () => {
      const walls: PlannerWall[] = [
        { row1: 0, col1: 0, row2: 0, col2: 1, orientation: 'vertical', active: true },
        { row1: 0, col1: 1, row2: 0, col2: 2, orientation: 'vertical', active: false },
      ]
      const state: PlannerState = {
        rows: 1,
        cols: 3,
        verticalOrder: 'rtl',
        horizontalOrder: 'btt',
        bins: [],
        walls,
        locationCode: 'X-99',
        colWidths: [2, 1, 1],
        rowHeights: [1],
        nameFormat: 'BIN-{bin}',
        tag: 'priority,rush',
        type: 'TOTE',
      }

      ;(component as any).restoreState(state)

      expect(component.rows()).toBe(1)
      expect(component.cols()).toBe(3)
      expect(component.verticalOrder()).toBe('rtl')
      expect(component.horizontalOrder()).toBe('btt')
      expect(component.nameFormat()).toBe('BIN-{bin}')
      expect(component.tags()).toEqual(['priority', 'rush'])
      expect(component.binType()).toBe('BIN')
      expect(component.colWidths).toEqual([2, 1, 1])
      expect(component.rowHeights).toEqual([1])
      expect(component._walls.length).toBe(2)
    })

    it('should default colWidths/rowHeights when not matching dimensions', () => {
      const state: PlannerState = {
        rows: 2,
        cols: 2,
        verticalOrder: 'ltr',
        horizontalOrder: 'ttb',
        bins: [],
        walls: [],
        locationCode: 'A',
        colWidths: [1], // doesn't match cols=2
        rowHeights: [1, 1, 1], // doesn't match rows=2
        nameFormat: '{loc}/{bin}',
        tag: '',
        type: 'BOX',
      }

      ;(component as any).restoreState(state)

      expect(component.colWidths).toEqual([1, 1]) // defaulted
      expect(component.rowHeights).toEqual([1, 1]) // defaulted
    })

    it('should handle empty tag string', () => {
      const state: PlannerState = {
        rows: 1, cols: 1,
        verticalOrder: 'ltr', horizontalOrder: 'ttb',
        bins: [], walls: [], locationCode: 'A',
        colWidths: [1], rowHeights: [1],
        nameFormat: '{loc}/{bin}', tag: '', type: 'BOX',
      }

      ;(component as any).restoreState(state)
      expect(component.tags()).toEqual([])
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Action flows
  // ─────────────────────────────────────────────────────────────────
  describe('action flows', () => {
    it('onApply should show confirmation dialog', () => {
      component.rebuildGrid() // a plan needs bins to apply
      expect(component.confirmVisible()).toBeFalse()
      component.onApply()
      expect(component.confirmVisible()).toBeTrue()
    })

    it('onApply without bins shows an error instead of the confirmation', () => {
      component.bins.set([])
      component.onApply()
      expect(component.confirmVisible()).toBeFalse()
      expect(component.gridError()).toBeTruthy()
    })

    it('onCancelConfirm should hide confirmation dialog', () => {
      component.confirmVisible.set(true)
      component.onCancelConfirm()
      expect(component.confirmVisible()).toBeFalse()
    })

    it('onConfirmApply should emit applyPlan, save state, and close', () => {
      fixture.componentRef.setInput('locationId', 'loc-123')
      fixture.componentRef.setInput('facilityId', 'fac-456')
      component.rebuildGrid()
      component.visible.set(true)
      spyOn(component.applyPlan, 'emit')

      component.onConfirmApply()

      expect(component.confirmVisible()).toBeFalse()
      expect(component.applyPlan.emit).toHaveBeenCalledOnceWith({
        bins: component.bins(),
        nameFormat: component.nameFormat(),
      })
      expect(component.visible()).toBeFalse()
      expect(locationServiceSpy.saveBinLayout).toHaveBeenCalled()
    })

    it('onCancel should hide dialog', () => {
      component.visible.set(true)
      component.onCancel()
      expect(component.visible()).toBeFalse()
    })

    it('onDialogHide should set visible to false', () => {
      component.visible.set(true)
      component.onDialogHide()
      expect(component.visible()).toBeFalse()
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // buildGridFromContainers
  // ─────────────────────────────────────────────────────────────────
  describe('buildGridFromContainers', () => {
    it('should build a grid from 4 containers', () => {
      const containers = [
        { lpn_code: 'BIN-A', type: 'PALLET', tags: ['cold'] },
        { lpn_code: 'BIN-B', type: 'BOX', tags: [] },
        { lpn_code: 'BIN-C', type: 'TOTE', tags: ['fragile', 'priority'] },
        { lpn_code: 'BIN-D', type: 'BOX', tags: [] },
      ]

      ;(component as any).buildGridFromContainers(containers)

      // 4 containers → ceil(sqrt(4))=2 cols, ceil(4/2)=2 rows → 2×2
      expect(component.rows()).toBe(2)
      expect(component.cols()).toBe(2)
      expect(component.bins().length).toBe(4)

      const bins = component.bins()
      expect(bins[0].label).toBe('BIN-A')
      expect(bins[0].type).toBe('PALLET')
      expect(bins[0].tag).toBe('cold')
      expect(bins[2].label).toBe('BIN-C')
      expect(bins[2].tag).toBe('fragile,priority')
    })

    it('should build a grid from 5 containers', () => {
      const containers = Array.from({ length: 5 }, (_, i) => ({
        lpn_code: `BIN-${i}`,
        type: 'BOX',
        tags: [],
      }))

      ;(component as any).buildGridFromContainers(containers)

      // 5 containers → ceil(sqrt(5))=3 cols, ceil(5/3)=2 rows → 2×3 = 6 cells
      expect(component.rows()).toBe(2)
      expect(component.cols()).toBe(3)
      expect(component.bins().length).toBe(6)
      // First 5 have container labels, last one keeps generated label
      expect(component.bins()[4].label).toBe('BIN-4')
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // divideBinCell
  // ─────────────────────────────────────────────────────────────────
  describe('divideBinCell', () => {
    it('should increase rows and cols by 1', () => {
      component.rows.set(2)
      component.cols.set(2)
      component.rebuildGrid()

      ;(component as any).contextMenuCell = { row: 0, col: 0 }
      component.divideBinCell()

      expect(component.rows()).toBe(3)
      expect(component.cols()).toBe(3)
    })

    it('should split colWidths and rowHeights of the divided cell', () => {
      component.rows.set(1)
      component.cols.set(2)
      component.colWidths = [2, 3]
      component.rowHeights = [4]
      component.rebuildGrid()
      // Rebuild resets widths, so set them again
      component.colWidths = [2, 3]
      component.rowHeights = [4]

      ;(component as any).contextMenuCell = { row: 0, col: 0 }
      component.divideBinCell()

      // col 0 (width 2) is split into [1, 1], col 1 stays 3 → [1, 1, 3]
      expect(component.colWidths).toEqual([1, 1, 3])
      // row 0 (height 4) is split into [2, 2] → [2, 2]
      expect(component.rowHeights).toEqual([2, 2])
    })

    it('should noop when no cell is targeted', () => {
      component.rows.set(2)
      component.cols.set(2)
      component.rebuildGrid()

      ;(component as any).contextMenuCell = null
      const prevRows = component.rows()
      component.divideBinCell()
      expect(component.rows()).toBe(prevRows)
    })

    it('should clear selections after divide', () => {
      component.rows.set(2)
      component.cols.set(2)
      component.rebuildGrid()
      component.selectedBinIds.set(new Set(['0001']))

      ;(component as any).contextMenuCell = { row: 0, col: 0 }
      component.divideBinCell()

      expect(component.selectedBinIds().size).toBe(0)
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Bin label generation with ordering
  // ─────────────────────────────────────────────────────────────────
  describe('bin label generation with ordering', () => {
    it('should number bins left-to-right, top-to-bottom by default', () => {
      fixture.componentRef.setInput('locationCode', 'L')
      component.rows.set(2)
      component.cols.set(2)
      component.nameFormat.set('{bin}')
      component.rebuildGrid()

      const labels = component.bins().map(b => b.label)
      // Default: ttb + ltr → (0,0), (0,1), (1,0), (1,1)
      expect(labels).toEqual(['0001', '0002', '0003', '0004'])
    })

    it('should number bins right-to-left when verticalOrder is rtl', () => {
      fixture.componentRef.setInput('locationCode', 'L')
      component.rows.set(1)
      component.cols.set(3)
      component.nameFormat.set('{bin}')
      component.rebuildGrid()
      component.toggleVerticalOrder() // ltr → rtl

      const labels = component.bins().map(b => b.label)
      // rtl: (0,2), (0,1), (0,0)
      expect(labels).toEqual(['0001', '0002', '0003'])
      // But cells should be in reverse col order
      expect(component.bins()[0].cells[0].col).toBe(2)
      expect(component.bins()[2].cells[0].col).toBe(0)
    })

    it('should number bins bottom-to-top when horizontalOrder is btt', () => {
      fixture.componentRef.setInput('locationCode', 'L')
      component.rows.set(2)
      component.cols.set(1)
      component.nameFormat.set('{bin}')
      component.rebuildGrid()
      component.toggleHorizontalOrder() // ttb → btt

      const labels = component.bins().map(b => b.label)
      expect(labels).toEqual(['0001', '0002'])
      // Bottom row first
      expect(component.bins()[0].cells[0].row).toBe(1)
      expect(component.bins()[1].cells[0].row).toBe(0)
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // Limits and constants
  // ─────────────────────────────────────────────────────────────────
  describe('limits', () => {
    it('should have MAX_ROWS = 25', () => {
      expect(component.MAX_ROWS).toBe(25)
    })

    it('should have MAX_COLS = 25', () => {
      expect(component.MAX_COLS).toBe(25)
    })

    it('should have MAX_BINS = 10000', () => {
      expect(component.MAX_BINS).toBe(10_000)
    })

    it('should have COL_TOOLTIP_THRESHOLD = 14', () => {
      expect(component.COL_TOOLTIP_THRESHOLD).toBe(14)
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // binTypeOptions
  // ─────────────────────────────────────────────────────────────────
  describe('binTypeOptions', () => {
    it('should only provide the BIN option', () => {
      const values = component.binTypeOptions.map(o => o.value)
      expect(values).toEqual(['BIN'])
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // gridError / nameFormatError
  // ─────────────────────────────────────────────────────────────────
  describe('gridError / nameFormatError', () => {
    it('should set gridError on invalid rows and clear after timeout', (done) => {
      component.rows.set(3)
      component.onRowsChange(0)
      expect(component.gridError()).toBeTruthy()
      // Error should auto-clear after 4000ms
      setTimeout(() => {
        expect(component.gridError()).toBeNull()
        done()
      }, 4500)
    }, 6000)

    it('should set gridError on invalid cols', () => {
      component.cols.set(4)
      component.onColsChange(-1)
      expect(component.gridError()).toBeTruthy()
    })

    it('should set nameFormatError when format exceeds max length', () => {
      const longFormat = 'x'.repeat(component.MAX_NAME_FORMAT_LENGTH + 1)
      component.onNameFormatChange(longFormat)
      expect(component.nameFormatError()).toBeTruthy()
    })

    it('should clear nameFormatError when format is valid', () => {
      component.nameFormatError.set('some error')
      component.onNameFormatChange('{loc}/{bin}')
      expect(component.nameFormatError()).toBeNull()
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // onApply with no bins
  // ─────────────────────────────────────────────────────────────────
  describe('onApply edge cases', () => {
    it('should show gridError when bins list is empty', () => {
      // Create a 1x1 grid, then clear all bins by setting rows to 0 internally
      component.rows.set(1)
      component.cols.set(1)
      component.rebuildGrid()
      // Manually set bins to empty to simulate edge case
      component.bins.set([])

      component.onApply()
      expect(component.gridError()).toBeTruthy()
      expect(component.confirmVisible()).toBeFalse()
    })

    it('should show confirmation when bins exist', () => {
      component.rebuildGrid()
      expect(component.bins().length).toBeGreaterThan(0)
      component.onApply()
      expect(component.confirmVisible()).toBeTrue()
    })
  })

  // ─────────────────────────────────────────────────────────────────
  // BinPlannerResult output
  // ─────────────────────────────────────────────────────────────────
  describe('BinPlannerResult output', () => {
    it('should emit nameFormat along with bins on confirm', () => {
      fixture.componentRef.setInput('locationCode', 'LOC-X')
      component.rebuildGrid()
      component.visible.set(true)
      component.nameFormat.set('CUSTOM-{loc}-{bin}')

      spyOn(component.applyPlan, 'emit')
      component.onConfirmApply()

      const emitted = (component.applyPlan.emit as jasmine.Spy).calls.mostRecent().args[0] as BinPlannerResult
      expect(emitted.nameFormat).toBe('CUSTOM-{loc}-{bin}')
      expect(emitted.bins.length).toBeGreaterThan(0)
    })
  })
})
