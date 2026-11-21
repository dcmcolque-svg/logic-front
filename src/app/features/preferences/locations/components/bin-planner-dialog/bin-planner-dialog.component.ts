import {
  Component,
  DestroyRef,
  inject,
  signal,
  computed,
  input,
  output,
  model,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { DialogModule } from 'primeng/dialog'
import { BaseDialog } from '@/app/shared/components'
import { ButtonModule } from 'primeng/button'
import { InputNumberModule } from 'primeng/inputnumber'
import { InputTextModule } from 'primeng/inputtext'
import { Select } from 'primeng/select'
import { TooltipModule } from 'primeng/tooltip'
import { ContextMenu, ContextMenuModule } from 'primeng/contextmenu'
import { MenuItem, MessageService } from 'primeng/api'
import { ToastModule } from 'primeng/toast'
import { LocationService } from '../../location.service'

import {
  BinType,
  BinPlannerResult,
  PlannedBin,
  PlannerCell,
  PlannerState,
  PlannerWall,
  VerticalOrder,
  HorizontalOrder,
} from './bin-planner.types'

// ── Storage key prefix ────────────────────────────────────────
const STORAGE_PREFIX = 'bin-planner::'

// ── Visual constants ──────────────────────────────────────────
// Non-theme-dependent constants
const BIN_RADIUS   = 8
const BIN_GAP      = 4        // gap between bins in px

// Theme-aware constants — accent colors work in both themes
const WALL_HOVER    = '#3B82F6'
const WALL_SELECTED = '#F59E0B'
const WALL_DRAG     = '#10B981'

/** Returns the current theme palette at render time */
function getThemeColors() {
  const isDark = document.documentElement.classList.contains('app-dark')
  return {
    canvasBg:    isDark ? '#1e293b' : '#f8fafc',
    gridMajor:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    gridMinor:   isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
    binFill:     isDark ? '#334155' : '#ffffff',
    binStroke:   isDark ? '#475569' : '#cbd5e1',
    wallColor:   isDark ? '#64748b' : '#94a3b8',
    textColor:   isDark ? '#e2e8f0' : '#334155',
    outerBorder: isDark ? '#334155' : '#e2e8f0',
    subText:     isDark ? '#64748b' : '#94a3b8',
  }
}

interface WallRenderState {
  isHovered: boolean
  isSelected: boolean
  isDragging: boolean
}

interface GridCell {
  row: number
  col: number
}

/** True when the wall separates cells (r1,c1) and (r2,c2), in either direction */
function wallConnects(w: PlannerWall, r1: number, c1: number, r2: number, c2: number): boolean {
  return (w.row1 === r1 && w.col1 === c1 && w.row2 === r2 && w.col2 === c2) ||
    (w.row1 === r2 && w.col1 === c2 && w.row2 === r1 && w.col2 === c1)
}

/** Build the full set of active walls for a uniform rows × cols grid */
function buildUniformWalls(rows: number, cols: number): PlannerWall[] {
  const walls: PlannerWall[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols - 1; col++) {
      walls.push({
        row1: row, col1: col, row2: row, col2: col + 1,
        orientation: 'vertical', active: true,
      })
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      walls.push({
        row1: row, col1: col, row2: row + 1, col2: col,
        orientation: 'horizontal', active: true,
      })
    }
  }
  return walls
}

@Component({
  selector: 'app-bin-planner-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DialogModule,
    BaseDialog,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    Select,
    TooltipModule,
    ToastModule,
    ContextMenuModule,
  ],
  templateUrl: './bin-planner-dialog.component.html',
  styleUrl: './bin-planner-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
})
export class BinPlannerDialogComponent {
  @ViewChild('plannerCanvas') canvasRef!: ElementRef<HTMLCanvasElement>
  @ViewChild('binContextMenu') binContextMenu!: ContextMenu

  private readonly translate = inject(TranslateService)
  private readonly messageService = inject(MessageService)
  private readonly locationService = inject(LocationService)
  private readonly destroyRef = inject(DestroyRef)

  // ── Inputs / Outputs ──────────────────────────────────────────
  visible = model<boolean>(false)
  locationCode = input<string>('')
  locationId = input<string>('')
  facilityId = input<string>('')
  locationCodes = input<string[]>([])
  applyPlan = output<BinPlannerResult>()

  // ── Bulk mode helpers ───────────────────────────────────────
  isBulkMode = computed(() => this.locationCodes().length > 1)
  bulkCount = computed(() => this.locationCodes().length)
  /** In bulk mode use the first code for preview; in single mode use locationCode */
  private readonly effectiveCode = computed(() => {
    const codes = this.locationCodes()
    return codes.length > 0 ? codes[0] : this.locationCode()
  })

  // ── Limits ─────────────────────────────────────────────────────
  readonly MAX_ROWS = 25
  readonly MAX_COLS = 25
  readonly MAX_BINS = 10_000
  readonly MAX_NAME_FORMAT_LENGTH = 50

  // ── Grid config ───────────────────────────────────────────────
  rows = signal(2)
  cols = signal(4)
  verticalOrder = signal<VerticalOrder>('ltr')
  horizontalOrder = signal<HorizontalOrder>('ttb')

  // ── Bin Type ────────────────────────────────────────────────────
  // For now new bins can only be of type BIN
  binTypeOptions = [{ label: 'Bin', value: 'BIN' }]
  binType = signal<BinType>('BIN')

  // ── Tags ───────────────────────────────────────────────────────
  tags = signal<string[]>([])
  tagInput = signal('')

  /** Computed: join tags with comma for bin attribute */
  private readonly tagsJoined = computed(() => this.tags().join(','))

  // ── Internal state ────────────────────────────────────────────
  _walls: PlannerWall[] = []
  bins = signal<PlannedBin[]>([])
  totalItems = computed(() => this.bins().length)

  /** Validation error message shown below the rows/cols inputs */
  gridError = signal<string | null>(null)
  private gridErrorTimer: ReturnType<typeof setTimeout> | null = null

  // Cleanup timer on destroy (fix: timer could fire after component is destroyed)
  private readonly _cleanupTimer = this.destroyRef.onDestroy(() => {
    if (this.gridErrorTimer) {
      clearTimeout(this.gridErrorTimer)
      this.gridErrorTimer = null
    }
  })

  // ── Confirmation dialog ───────────────────────────────────────
  confirmVisible = signal(false)
  /** Shown when bins exist but no layout is saved */
  unorderedBinsWarning = signal(false)
  totalBinsToCreate = computed(() => {
    const binCount = this.bins().length
    const locationCount = this.isBulkMode() ? this.bulkCount() : 1
    return binCount * locationCount
  })

  // ── Name format ──────────────────────────────────────────
  nameFormat = signal('{loc}/{bin}')
  nameFormatError = signal<string | null>(null)
  namePreview = computed(() => {
    const fmt = this.nameFormat()
    const loc = this.effectiveCode() || 'LOC-001'
    return fmt.replace('{loc}', loc).replace('{bin}', '0001')
  })

  // Proportional sizes: colWidths[i] = relative width of column i
  colWidths: number[] = []
  rowHeights: number[] = []

  // ── Tooltip threshold ──────────────────────────────────────────
  readonly COL_TOOLTIP_THRESHOLD = 14

  // ── Selection / Drag state ────────────────────────────────────
  selectedWallIndex = signal<number | null>(null)
  private hoveredWallIndex: number | null = null
  private hoveredBinIndex: number | null = null
  private draggingWallIndex: number | null = null
  private dragStartPos = 0       // mouse position at drag start
  private dragStartVal = 0       // wall position value at drag start

  // ── Multi-select bins ──────────────────────────────────────────
  selectedBinIds = signal<Set<string>>(new Set())
  private selectionAnchor: { row: number; col: number } | null = null

  // ── Context menu ───────────────────────────────────────────────
  contextMenuItems = signal<MenuItem[]>([])
  contextMenuVisible = false
  private contextMenuCell: { row: number; col: number } | null = null
  // Edit dialog for per-bin type/tags
  editBinDialogVisible = signal(false)
  editBinType = signal<BinType>('BIN')
  editBinTags = signal<string[]>([])
  editBinTagInput = signal('')

  // ── Canvas state ──────────────────────────────────────────────
  private ctx: CanvasRenderingContext2D | null = null
  private canvasWidth = 0
  private canvasHeight = 0
  private readonly PADDING = 30
  private readonly WALL_HIT_ZONE = 10

  // ── Dialog visibility ─────────────────────────────────────────
  onDialogShow() {
    setTimeout(() => {
      this.initCanvas()
      if (this.isBulkMode()) {
        // Bulk mode: always start fresh
        this.rebuildGrid()
      } else {
        this.loadStateFromServer()
      }
    }, 150)
  }

  onDialogHide() {
    this.visible.set(false)
  }

  // ── Canvas setup ──────────────────────────────────────────────
  private initCanvas() {
    const canvas = this.canvasRef?.nativeElement
    if (!canvas) return
    const container = canvas.parentElement
    if (!container) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.canvasWidth = rect.width
    this.canvasHeight = rect.height

    canvas.width = this.canvasWidth * dpr
    canvas.height = this.canvasHeight * dpr
    canvas.style.width = `${this.canvasWidth}px`
    canvas.style.height = `${this.canvasHeight}px`

    this.ctx = canvas.getContext('2d')
    if (this.ctx) this.ctx.scale(dpr, dpr)

    canvas.onmousemove = (e) => this.onMouseMove(e)
    canvas.onmousedown = (e) => this.onMouseDown(e)
    canvas.onmouseup = (e) => this.onMouseUp(e)
    canvas.onmouseleave = (e) => this.onMouseLeave(e)
    canvas.oncontextmenu = (e) => this.onContextMenu(e)
  }

  // ── Grid rebuild ──────────────────────────────────────────────
  rebuildGrid() {
    const r = this.rows()
    const c = this.cols()
    if (r < 1 || c < 1) return

    // Equal proportions
    this.colWidths = new Array(c).fill(1)
    this.rowHeights = new Array(r).fill(1)

    // Build walls
    this._walls = buildUniformWalls(r, c)

    this.selectedWallIndex.set(null)
    this.selectedBinIds.set(new Set())
    this.hoveredWallIndex = null
    this.draggingWallIndex = null
    this.recalcBins()
    this.render()
  }

  onRowsChange(val: number) {
    if (val < 1 || val > this.MAX_ROWS) {
      this.showGridError(this.translate.instant('preferences.bin_planner.error_rows', { max: this.MAX_ROWS }))
      return
    }
    this.gridError.set(null)
    this.rows.set(val)
    this.rebuildGrid()
  }
  onColsChange(val: number) {
    if (val < 1 || val > this.MAX_COLS) {
      this.showGridError(this.translate.instant('preferences.bin_planner.error_columns', { max: this.MAX_COLS }))
      return
    }
    this.gridError.set(null)
    this.cols.set(val)
    this.rebuildGrid()
  }

  private showGridError(msg: string) {
    this.gridError.set(msg)
    if (this.gridErrorTimer) clearTimeout(this.gridErrorTimer)
    this.gridErrorTimer = setTimeout(() => this.gridError.set(null), 4000)
  }

  /** Dynamic max for rows input based on current cols */
  maxRows = computed(() => Math.min(this.MAX_ROWS, Math.floor(this.MAX_BINS / Math.max(this.cols(), 1))))
  /** Dynamic max for cols input based on current rows */
  maxCols = computed(() => Math.min(this.MAX_COLS, Math.floor(this.MAX_BINS / Math.max(this.rows(), 1))))
  toggleVerticalOrder() {
    this.verticalOrder.update(v => v === 'ltr' ? 'rtl' : 'ltr')
    this.recalcBins(); this.render()
  }
  toggleHorizontalOrder() {
    this.horizontalOrder.update(v => v === 'ttb' ? 'btt' : 'ttb')
    this.recalcBins(); this.render()
  }

  onNameFormatChange(value: string) {
    if (value.length > this.MAX_NAME_FORMAT_LENGTH) {
      this.nameFormatError.set(this.translate.instant('preferences.bin_planner.error_name_format', { max: this.MAX_NAME_FORMAT_LENGTH }))
      return
    }
    this.nameFormatError.set(null)
    this.nameFormat.set(value)
    this.recalcBins()
    this.render()
  }

  insertToken(token: string) {
    const next = this.nameFormat() + token
    if (next.length > this.MAX_NAME_FORMAT_LENGTH) {
      this.nameFormatError.set(this.translate.instant('preferences.bin_planner.error_name_format', { max: this.MAX_NAME_FORMAT_LENGTH }))
      return
    }
    this.nameFormatError.set(null)
    this.nameFormat.set(next)
    this.recalcBins()
    this.render()
  }

  // ── Coordinate helpers (proportional → pixels) ────────────────
  private getGridArea() {
    const w = this.canvasWidth - this.PADDING * 2
    const h = this.canvasHeight - this.PADDING * 2
    return { x: this.PADDING, y: this.PADDING, w, h }
  }

  /** Get the pixel X for a column boundary (0 = left edge, cols = right edge) */
  private colX(colIdx: number): number {
    const { x, w } = this.getGridArea()
    const totalW = this.colWidths.reduce((a, b) => a + b, 0)
    let sum = 0
    for (let i = 0; i < colIdx; i++) sum += this.colWidths[i]
    return x + (sum / totalW) * w
  }

  /** Get the pixel Y for a row boundary */
  private rowY(rowIdx: number): number {
    const { y, h } = this.getGridArea()
    const totalH = this.rowHeights.reduce((a, b) => a + b, 0)
    let sum = 0
    for (let i = 0; i < rowIdx; i++) sum += this.rowHeights[i]
    return y + (sum / totalH) * h
  }

  /** Get pixel rect for a cell */
  private cellRect(row: number, col: number) {
    const x1 = this.colX(col)
    const x2 = this.colX(col + 1)
    const y1 = this.rowY(row)
    const y2 = this.rowY(row + 1)
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
  }

  // ── Bin recalculation (flood-fill) ────────────────────────────
  private recalcBins() {
    const r = this.rows()
    const c = this.cols()
    const walls = this._walls
    const visited = Array.from({ length: r }, () => new Array(c).fill(false) as boolean[])

    const floodFill = (row: number, col: number, cells: PlannerCell[]) => {
      if (row < 0 || row >= r || col < 0 || col >= c || visited[row][col]) return
      visited[row][col] = true
      cells.push({ row, col, binId: '' })

      const neighbors: [number, number][] = [
        [row, col - 1], [row, col + 1], [row - 1, col], [row + 1, col],
      ]
      for (const [nr, nc] of neighbors) {
        if (nr < 0 || nr >= r || nc < 0 || nc >= c || visited[nr][nc]) continue
        const orient = row === nr ? 'vertical' : 'horizontal'
        const blocked = walls.some(w =>
          w.orientation === orient && w.active && wallConnects(w, row, col, nr, nc)
        )
        if (!blocked) floodFill(nr, nc, cells)
      }
    }

    const rowOrder = this.horizontalOrder() === 'ttb'
      ? Array.from({ length: r }, (_, i) => i)
      : Array.from({ length: r }, (_, i) => r - 1 - i)
    const colOrder = this.verticalOrder() === 'ltr'
      ? Array.from({ length: c }, (_, i) => i)
      : Array.from({ length: c }, (_, i) => c - 1 - i)

    const newBins: PlannedBin[] = []
    let idx = 0
    const loc = this.effectiveCode()
    const fmt = this.nameFormat()

    for (const ri of rowOrder) {
      for (const ci of colOrder) {
        if (visited[ri][ci]) continue
        const cells: PlannerCell[] = []
        floodFill(ri, ci, cells)
        if (cells.length > 0) {
          const num = String(idx + 1).padStart(4, '0')
          const label = fmt
            .replace('{loc}', loc)
            .replace('{bin}', num)
          cells.forEach(c => c.binId = num)
          newBins.push({ id: num, label, cells, color: '', tag: this.tagsJoined(), type: this.binType() })
          idx++
        }
      }
    }
    this.bins.set(newBins)
  }

  // ── Rendering ─────────────────────────────────────────────────
  private _theme = getThemeColors()

  private render() {
    if (!this.ctx) return
    const ctx = this.ctx
    const r = this.rows()
    const c = this.cols()
    if (r < 1 || c < 1) return

    // Refresh theme colors each render pass (supports live theme toggle)
    this._theme = getThemeColors()

    // Background
    ctx.fillStyle = this._theme.canvasBg
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight)

    // Minor grid
    this.drawGridLines(ctx, this._theme.gridMinor, 40)
    // Major grid
    this.drawGridLines(ctx, this._theme.gridMajor, 200)

    // ── Draw each bin as a solid rounded-rect container ────────
    const bins = this.bins()
    const selIdx = this.selectedWallIndex()
    const selectedIds = this.selectedBinIds()

    for (const bin of bins) {
      this.drawBin(ctx, bin, selectedIds.has(bin.id))
    }

    // ── Draw interior walls ───────────────────────────────────
    for (let i = 0; i < this._walls.length; i++) {
      const wall = this._walls[i]
      if (!wall.active) continue // don't draw inactive walls
      this.drawActiveWall(ctx, wall, {
        isHovered: this.hoveredWallIndex === i,
        isSelected: selIdx === i,
        isDragging: this.draggingWallIndex === i,
      })
    }

    // ── Draw inactive walls as faint dashed lines ─────────────
    for (let i = 0; i < this._walls.length; i++) {
      const wall = this._walls[i]
      if (wall.active) continue
      this.drawInactiveWall(ctx, wall, this.hoveredWallIndex === i)
    }

    // ── Hover tooltip (walls) ─────────────────────────────────
    if (this.hoveredWallIndex !== null && this.draggingWallIndex === null) {
      this.drawWallHint(ctx, this._walls[this.hoveredWallIndex])
    }

    // ── Hover tooltip (bins — only when labels are hidden) ────
    if (this.hoveredBinIndex !== null && this.cols() > this.COL_TOOLTIP_THRESHOLD && this.draggingWallIndex === null) {
      const bin = bins[this.hoveredBinIndex]
      if (bin) this.drawBinTooltip(ctx, bin)
    }
  }

  private drawGridLines(ctx: CanvasRenderingContext2D, color: string, step: number) {
    ctx.strokeStyle = color; ctx.lineWidth = 0.5
    for (let x = 0; x < this.canvasWidth; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.canvasHeight); ctx.stroke()
    }
    for (let y = 0; y < this.canvasHeight; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.canvasWidth, y); ctx.stroke()
    }
  }

  /** Pixel rect of a bin (bounding box of all its cells, inset by BIN_GAP) */
  private binRect(bin: PlannedBin) {
    const minCol = Math.min(...bin.cells.map(c => c.col))
    const maxCol = Math.max(...bin.cells.map(c => c.col))
    const minRow = Math.min(...bin.cells.map(c => c.row))
    const maxRow = Math.max(...bin.cells.map(c => c.row))
    return {
      x1: this.colX(minCol) + BIN_GAP,
      x2: this.colX(maxCol + 1) - BIN_GAP,
      y1: this.rowY(minRow) + BIN_GAP,
      y2: this.rowY(maxRow + 1) - BIN_GAP,
    }
  }

  /** Pixel segment of a wall (inset by BIN_GAP along its length) */
  private wallSegment(wall: PlannerWall) {
    if (wall.orientation === 'vertical') {
      const wx = this.colX(wall.col1 + 1)
      return { x1: wx, y1: this.rowY(wall.row1) + BIN_GAP, x2: wx, y2: this.rowY(wall.row1 + 1) - BIN_GAP }
    }
    const wy = this.rowY(wall.row1 + 1)
    return { x1: this.colX(wall.col1) + BIN_GAP, y1: wy, x2: this.colX(wall.col1 + 1) - BIN_GAP, y2: wy }
  }

  private drawBin(ctx: CanvasRenderingContext2D, bin: PlannedBin, isSelected: boolean) {
    const { x1, x2, y1, y2 } = this.binRect(bin)
    const bw = x2 - x1
    const bh = y2 - y1

    if (bw <= 0 || bh <= 0) return

    // Solid fill with rounded corners
    const isDark = document.documentElement.classList.contains('app-dark')
    ctx.fillStyle = isSelected
      ? (isDark ? '#1e3a5f' : '#EBF5FF')
      : this._theme.binFill
    ctx.beginPath()
    ctx.roundRect(x1, y1, bw, bh, BIN_RADIUS)
    ctx.fill()

    // Border
    ctx.strokeStyle = isSelected ? '#3B82F6' : this._theme.binStroke
    ctx.lineWidth = isSelected ? 3 : 2
    ctx.beginPath()
    ctx.roundRect(x1, y1, bw, bh, BIN_RADIUS)
    ctx.stroke()

    // Label (small, centered) — skip text when columns exceed tooltip threshold
    const showLabels = this.cols() <= this.COL_TOOLTIP_THRESHOLD
    if (showLabels) this.drawBinLabel(ctx, bin, { x: x1, y: y1, w: bw, h: bh }, isSelected)
  }

  private drawBinLabel(
    ctx: CanvasRenderingContext2D,
    bin: PlannedBin,
    rect: { x: number; y: number; w: number; h: number },
    isSelected = false
  ) {
    const { x: x1, y: y1, w: bw, h: bh } = rect
    const cx = x1 + bw / 2
    const pad = 6  // horizontal padding inside the cell
    const availW = bw - pad * 2
    const availH = bh - pad * 2

    // Build subtitle text from type/tag
    const subtitleParts: string[] = []
    if (bin.type) subtitleParts.push(bin.type)
    if (bin.tag) subtitleParts.push(bin.tag)
    const subtitle = subtitleParts.join(' · ')
    const hasSubtitle = subtitle.length > 0 && availH > 20

    if (!(availW > 8 && availH > 6)) return

    // Name position: shift up a bit if we have subtitle
    const cy = hasSubtitle ? y1 + bh * 0.42 : y1 + bh / 2

    // Scale font to fit: try proportional, clamp between 6 and 14
    const fontSize = Math.max(6, Math.min(availW / bin.label.length * 1.6, availH * (hasSubtitle ? 0.32 : 0.45), 14))
    ctx.font = `600 ${fontSize}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = isSelected
      ? (document.documentElement.classList.contains('app-dark') ? '#93c5fd' : '#1e40af')
      : this._theme.textColor

    // Measure and truncate with ellipsis if needed
    this.fillTextEllipsis(ctx, bin.label, cx, cy, availW)

    // Subtitle (type · tag) below the name
    if (hasSubtitle) {
      const subFontSize = Math.max(5, Math.min(fontSize * 0.7, 10))
      ctx.font = `500 ${subFontSize}px Inter, sans-serif`
      ctx.fillStyle = this._theme.subText
      const subY = cy + fontSize * 0.8 + 2
      this.fillTextEllipsis(ctx, subtitle, cx, subY, availW)
    }
  }

  /** Draw text, truncating it with an ellipsis when wider than maxW */
  private fillTextEllipsis(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number) {
    const measured = ctx.measureText(text).width
    if (measured <= maxW) {
      ctx.fillText(text, x, y)
      return
    }
    let truncated = text
    while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxW) {
      truncated = truncated.slice(0, -1)
    }
    ctx.fillText(truncated + '…', x, y)
  }

  private applyWallStyle(ctx: CanvasRenderingContext2D, state: WallRenderState) {
    ctx.shadowBlur = 0
    if (state.isDragging) {
      ctx.strokeStyle = WALL_DRAG
      ctx.lineWidth = 4
      ctx.shadowColor = 'rgba(16,185,129,0.5)'
      ctx.shadowBlur = 8
    } else if (state.isSelected) {
      ctx.strokeStyle = WALL_SELECTED
      ctx.lineWidth = 3
      ctx.shadowColor = 'rgba(245,158,11,0.5)'
      ctx.shadowBlur = 8
    } else if (state.isHovered) {
      ctx.strokeStyle = WALL_HOVER
      ctx.lineWidth = 3
      ctx.shadowColor = 'rgba(59,130,246,0.4)'
      ctx.shadowBlur = 6
    } else {
      ctx.strokeStyle = this._theme.wallColor
      ctx.lineWidth = 2
    }
  }

  private wallHandleColor(state: WallRenderState): string {
    if (state.isDragging) return WALL_DRAG
    if (state.isSelected) return WALL_SELECTED
    return WALL_HOVER
  }

  private drawActiveWall(ctx: CanvasRenderingContext2D, wall: PlannerWall, state: WallRenderState) {
    const { x1, y1, x2, y2 } = this.wallSegment(wall)

    // Style based on state
    this.applyWallStyle(ctx, state)

    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.shadowBlur = 0

    // Draw drag handle indicator on hovered/selected walls
    if (state.isHovered || state.isSelected || state.isDragging) {
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2

      // Arrow indicators
      ctx.fillStyle = this.wallHandleColor(state)
      ctx.font = '14px "Inter", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Vertical walls show ← → arrows, horizontal walls show ↑ ↓ arrows
      ctx.fillText(wall.orientation === 'vertical' ? '⇔' : '⇕', mx, my)
    }
  }

  private drawInactiveWall(ctx: CanvasRenderingContext2D, wall: PlannerWall, isHovered: boolean) {
    const { x1, y1, x2, y2 } = this.wallSegment(wall)

    ctx.strokeStyle = isHovered ? 'rgba(59,130,246,0.4)' : 'rgba(0,0,0,0.08)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  private drawWallHint(ctx: CanvasRenderingContext2D, wall: PlannerWall) {
    let hx: number, hy: number
    if (wall.orientation === 'vertical') {
      hx = this.colX(wall.col1 + 1)
      hy = this.rowY(wall.row1) + BIN_GAP - 2
    } else {
      hx = this.colX(wall.col1) + BIN_GAP
      hy = this.rowY(wall.row1 + 1) - 14
    }

    const hint = wall.active ? 'Click: select · Drag: resize' : 'Click: restore wall'
    ctx.font = '10px Inter, sans-serif'
    const tw = ctx.measureText(hint).width + 10
    ctx.fillStyle = 'rgba(15,23,42,0.85)'
    ctx.beginPath()
    ctx.roundRect(hx - 2, hy - 14, tw, 16, 3)
    ctx.fill()
    ctx.fillStyle = '#f1f5f9'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(hint, hx + 3, hy - 6)
  }

  private drawBinTooltip(ctx: CanvasRenderingContext2D, bin: PlannedBin) {
    const { x1: bx1, x2: bx2, y1: by1, y2: by2 } = this.binRect(bin)

    const tipX = bx1 + (bx2 - bx1) / 2
    const tipY = by1 - 4

    const tipText = bin.label
    ctx.font = '11px Inter, sans-serif'
    const tw = ctx.measureText(tipText).width + 14
    const th = 22

    // Position tooltip above the bin, clamp to canvas
    let tx = tipX - tw / 2
    let ty = tipY - th
    if (tx < 2) tx = 2
    if (tx + tw > this.canvasWidth - 2) tx = this.canvasWidth - tw - 2
    if (ty < 2) ty = by1 + (by2 - by1) + 4 // flip below if too high

    // Background
    ctx.fillStyle = 'rgba(15,23,42,0.9)'
    ctx.beginPath()
    ctx.roundRect(tx, ty, tw, th, 4)
    ctx.fill()

    // Text
    ctx.fillStyle = '#f1f5f9'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(tipText, tx + tw / 2, ty + th / 2)
  }

  // ── Mouse helpers ─────────────────────────────────────────────
  private getMousePos(e: MouseEvent): { x: number; y: number } {
    const canvas = this.canvasRef?.nativeElement
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  private findWallAtPos(x: number, y: number): number | null {
    const hz = this.WALL_HIT_ZONE

    for (let i = 0; i < this._walls.length; i++) {
      const wall = this._walls[i]
      const seg = this.wallSegment(wall)
      if (wall.orientation === 'vertical') {
        if (Math.abs(x - seg.x1) <= hz && y >= seg.y1 - hz && y <= seg.y2 + hz) return i
      } else if (Math.abs(y - seg.y1) <= hz && x >= seg.x1 - hz && x <= seg.x2 + hz) {
        return i
      }
    }
    return null
  }

  /** Find which bin (by index) the mouse is over */
  private findBinAtPos(x: number, y: number): number | null {
    const bins = this.bins()
    for (let i = 0; i < bins.length; i++) {
      const { x1: bx1, x2: bx2, y1: by1, y2: by2 } = this.binRect(bins[i])

      if (x >= bx1 && x <= bx2 && y >= by1 && y <= by2) return i
    }
    return null
  }

  /** Find which grid cell (row, col) the mouse is over */
  private findCellAtPos(x: number, y: number): { row: number; col: number } | null {
    const r = this.rows()
    const c = this.cols()
    for (let row = 0; row < r; row++) {
      for (let col = 0; col < c; col++) {
        const rect = this.cellRect(row, col)
        if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
          return { row, col }
        }
      }
    }
    return null
  }

  /** Get all bin IDs whose cells intersect the rectangular range */
  private getBinsInRange(
    r1: number, c1: number, r2: number, c2: number
  ): Set<string> {
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2)
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2)
    const ids = new Set<string>()
    for (const bin of this.bins()) {
      for (const cell of bin.cells) {
        if (cell.row >= minR && cell.row <= maxR && cell.col >= minC && cell.col <= maxC) {
          ids.add(bin.id)
          break
        }
      }
    }
    return ids
  }

  // ── Mouse events ──────────────────────────────────────────────
  onMouseMove(e: MouseEvent) {
    const { x, y } = this.getMousePos(e)
    const canvas = this.canvasRef?.nativeElement

    // If dragging a wall, resize columns/rows
    if (this.draggingWallIndex !== null) {
      const wall = this._walls[this.draggingWallIndex]
      const { w: gw, h: gh } = this.getGridArea()

      if (wall.orientation === 'vertical') {
        // Drag left-right → adjust colWidths
        this.resizeAdjacent(this.colWidths, wall.col1, x, gw)
      } else {
        // Drag up-down → adjust rowHeights
        this.resizeAdjacent(this.rowHeights, wall.row1, y, gh)
      }

      this.render()
      if (canvas) canvas.style.cursor = wall.orientation === 'vertical' ? 'col-resize' : 'row-resize'
      return
    }

    // Normal hover — walls take priority, then bins
    const wallIdx = this.findWallAtPos(x, y)
    const binIdx = wallIdx === null ? this.findBinAtPos(x, y) : null
    const wallChanged = wallIdx !== this.hoveredWallIndex
    const binChanged = binIdx !== this.hoveredBinIndex

    if (wallChanged || binChanged) {
      this.hoveredWallIndex = wallIdx
      this.hoveredBinIndex = binIdx
      if (canvas) canvas.style.cursor = this.hoverCursor(wallIdx)
      this.render()
    }
  }

  /**
   * Resize two adjacent proportional sizes (sizes[idx] and sizes[idx + 1]) while
   * dragging the wall between them; `pos` is the current mouse coordinate on the
   * drag axis and `span` the grid length in pixels along that axis.
   */
  private resizeAdjacent(sizes: number[], idx: number, pos: number, span: number) {
    const total = sizes.reduce((a, b) => a + b, 0)
    const delta = (pos - this.dragStartPos) / span * total
    const minSize = 0.2

    const newFirst = this.dragStartVal + delta
    const sum = sizes[idx] + sizes[idx + 1]

    if (newFirst >= minSize && (sum - newFirst) >= minSize) {
      sizes[idx] = newFirst
      sizes[idx + 1] = sum - newFirst
    }
  }

  private hoverCursor(wallIdx: number | null): string {
    if (wallIdx === null) return 'default'
    const w = this._walls[wallIdx]
    if (!w.active) return 'pointer'
    return w.orientation === 'vertical' ? 'col-resize' : 'row-resize'
  }

  onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return  // only left-click
    const { x, y } = this.getMousePos(e)
    const wallIdx = this.findWallAtPos(x, y)

    if (wallIdx === null) {
      this.handleBinAreaClick(e, x, y)
      this.selectedWallIndex.set(null)
      this.render()
      return
    }

    const wall = this._walls[wallIdx]

    if (!wall.active) {
      // Inactive wall → click to restore
      wall.active = true
      this.selectedWallIndex.set(null)
      this.recalcBins()
      this.render()
      return
    }

    // Active wall → start drag
    this.selectedWallIndex.set(wallIdx)
    this.draggingWallIndex = wallIdx

    if (wall.orientation === 'vertical') {
      this.dragStartPos = x
      this.dragStartVal = this.colWidths[wall.col1]
    } else {
      this.dragStartPos = y
      this.dragStartVal = this.rowHeights[wall.row1]
    }
    this.render()
  }

  /** Update bin selection for a left-click that did not hit a wall */
  private handleBinAreaClick(e: MouseEvent, x: number, y: number) {
    // Check if clicking on a bin
    const binIdx = this.findBinAtPos(x, y)
    const cell = this.findCellAtPos(x, y)

    if (binIdx === null || !cell) {
      // Click empty space → clear selection
      this.selectedBinIds.set(new Set())
      this.selectionAnchor = null
      return
    }

    const bin = this.bins()[binIdx]

    if (e.shiftKey && this.selectionAnchor) {
      // Shift-click: range select like Excel
      const ids = this.getBinsInRange(
        this.selectionAnchor.row, this.selectionAnchor.col,
        cell.row, cell.col
      )
      this.selectedBinIds.set(ids)
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd-click: toggle individual
      const next = new Set(this.selectedBinIds())
      if (next.has(bin.id)) next.delete(bin.id)
      else next.add(bin.id)
      this.selectedBinIds.set(next)
      this.selectionAnchor = cell
    } else {
      // Normal click: select only this bin, set anchor
      this.selectedBinIds.set(new Set([bin.id]))
      this.selectionAnchor = cell
    }
  }

  onMouseUp(e: MouseEvent) {
    if (this.draggingWallIndex !== null) {
      const { x, y } = this.getMousePos(e)
      const wall = this._walls[this.draggingWallIndex]

      // If barely moved, treat as click → toggle wall
      const dist = wall.orientation === 'vertical'
        ? Math.abs(x - this.dragStartPos)
        : Math.abs(y - this.dragStartPos)

      if (dist < 3) {
        // Toggle: remove wall
        wall.active = !wall.active
        this.selectedWallIndex.set(null)
        this.recalcBins()
      }

      this.draggingWallIndex = null
      this.render()
    }
  }

  onMouseLeave(_e: MouseEvent) {
    this.hoveredWallIndex = null
    this.hoveredBinIndex = null
    if (this.draggingWallIndex !== null) {
      this.draggingWallIndex = null
    }
    this.render()
  }

  // ── Toggle selected wall ──────────────────────────────────────
  removeSelectedWall() {
    const idx = this.selectedWallIndex()
    if (idx === null) return
    this._walls[idx].active = !this._walls[idx].active
    this.selectedWallIndex.set(null)
    this.recalcBins()
    this.render()
  }

  // ── Context menu (right-click) ────────────────────────────────
  onContextMenu(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const { x, y } = this.getMousePos(e)
    const binIdx = this.findBinAtPos(x, y)
    if (binIdx === null) return

    const bin = this.bins()[binIdx]
    const cell = this.findCellAtPos(x, y)
    this.contextMenuCell = cell

    // If the clicked bin is not in selection, select only it
    if (!this.selectedBinIds().has(bin.id)) {
      this.selectedBinIds.set(new Set([bin.id]))
      this.selectionAnchor = cell
      this.render()
    }

    const selectedCount = this.selectedBinIds().size
    const label = selectedCount > 1 ? `${selectedCount} bins` : bin.label

    // Build menu items — always show divide + edit
    const items: MenuItem[] = [
      {
        label: 'Divide into 4',
        icon: 'pi pi-th-large',
        command: () => this.divideBinCell(),
      },
      { separator: true },
      {
        label: `Edit type & tags (${label})`,
        icon: 'pi pi-pencil',
        command: () => this.openEditBinDialog(),
      },
    ]

    this.contextMenuItems.set(items)
    this.binContextMenu?.show(e)
  }

  /**
   * Divide the right-clicked cell into 4 by inserting a new row and column.
   * Only the target cell gets subdivided — adjacent cells stay merged via inactive walls.
   */
  divideBinCell() {
    const target = this.contextMenuCell
    if (!target) return

    const r = target.row
    const c = target.col
    const oldRows = this.rows()
    const oldCols = this.cols()
    const oldWalls = [...this._walls]

    // Mapping: new coord → old coord
    const toOld = (nr: number, nc: number): GridCell => ({
      row: nr <= r ? nr : nr - 1,
      col: nc <= c ? nc : nc - 1,
    })

    // Expand grid dimensions
    this.rows.set(oldRows + 1)
    this.cols.set(oldCols + 1)

    // Split proportional sizes
    const halfW = this.colWidths[c] / 2
    this.colWidths.splice(c, 1, halfW, halfW)
    const halfH = this.rowHeights[r] / 2
    this.rowHeights.splice(r, 1, halfH, halfH)

    const newRows = oldRows + 1
    const newCols = oldCols + 1

    // Rebuild all walls for the new grid
    this._walls = []

    // Vertical walls (between col and col+1 for each row)
    for (let row = 0; row < newRows; row++) {
      for (let col = 0; col < newCols - 1; col++) {
        const active = this.subdividedWallActive(
          oldWalls, target, 'vertical', toOld(row, col), toOld(row, col + 1)
        )
        this._walls.push({
          row1: row, col1: col, row2: row, col2: col + 1,
          orientation: 'vertical', active,
        })
      }
    }

    // Horizontal walls (between row and row+1 for each col)
    for (let row = 0; row < newRows - 1; row++) {
      for (let col = 0; col < newCols; col++) {
        const active = this.subdividedWallActive(
          oldWalls, target, 'horizontal', toOld(row, col), toOld(row + 1, col)
        )
        this._walls.push({
          row1: row, col1: col, row2: row + 1, col2: col,
          orientation: 'horizontal', active,
        })
      }
    }

    this.selectedBinIds.set(new Set())
    this.contextMenuCell = null
    this.recalcBins()
    this.render()
  }

  /**
   * Active state of a wall in the subdivided grid, given the old cells (a, b)
   * that its two sides map to.
   */
  private subdividedWallActive(
    oldWalls: PlannerWall[],
    target: GridCell,
    orient: 'vertical' | 'horizontal',
    a: GridCell,
    b: GridCell
  ): boolean {
    if (a.row === b.row && a.col === b.col) {
      // Both sides map to same old cell → internal subdivision wall,
      // only active inside the divided cell
      return a.row === target.row && a.col === target.col
    }
    // Maps to different old cells → inherit old wall state
    const old = oldWalls.find(w =>
      w.orientation === orient && wallConnects(w, a.row, a.col, b.row, b.col)
    )
    return old ? old.active : true
  }

  /** Open the edit dialog for per-bin type/tags */
  openEditBinDialog() {
    const selectedIds = this.selectedBinIds()
    const bins = this.bins().filter(b => selectedIds.has(b.id))
    if (bins.length === 0) return

    // Pre-populate with first selected bin's values
    this.editBinType.set('BIN')
    const tags = bins[0].tag ? bins[0].tag.split(',').map(t => t.trim()).filter(Boolean) : []
    this.editBinTags.set(tags)
    this.editBinTagInput.set('')
    this.editBinDialogVisible.set(true)
  }

  addEditTag() {
    const val = this.editBinTagInput().trim()
    if (!val || this.editBinTags().includes(val)) return
    this.editBinTags.update(t => [...t, val])
    this.editBinTagInput.set('')
  }

  removeEditTag(tag: string) {
    this.editBinTags.update(t => t.filter(v => v !== tag))
  }

  /** Apply edited type/tags to all selected bins */
  applyEditBin() {
    const selectedIds = this.selectedBinIds()
    const newType = this.editBinType()
    const newTag = this.editBinTags().join(',')

    this.bins.update(bins => bins.map(b => {
      if (!selectedIds.has(b.id)) return b
      return { ...b, type: newType, tag: newTag }
    }))

    this.editBinDialogVisible.set(false)
    this.render()
  }

  // ── Actions ───────────────────────────────────────────────────
  onApply() {
    if (this.bins().length === 0) {
      this.showGridError(this.translate.instant('preferences.bin_planner.error_no_bins'))
      return
    }
    // Show confirmation dialog instead of applying immediately
    this.confirmVisible.set(true)
  }

  onConfirmApply() {
    this.confirmVisible.set(false)
    this.saveStateToServer()
    this.applyPlan.emit({ bins: this.bins(), nameFormat: this.nameFormat() })
    this.unorderedBinsWarning.set(false)
    this.visible.set(false)
  }

  onCancelConfirm() {
    this.confirmVisible.set(false)
  }

  onCancel() {
    this.visible.set(false)
  }

  addTag() {
    const value = this.tagInput().trim()
    if (!value) return
    // Avoid duplicates
    if (!this.tags().includes(value)) {
      this.tags.update(t => [...t, value])
      this.recalcBins()
    }
    this.tagInput.set('')
  }

  removeTag(tag: string) {
    this.tags.update(t => t.filter(v => v !== tag))
    this.recalcBins()
  }

  onBinTypeChange(value: BinType) {
    this.binType.set(value)
    this.recalcBins()
  }

  // ── Backend + LocalStorage persistence ──────────────────────────
  private storageKey(code?: string): string {
    return STORAGE_PREFIX + (code || this.effectiveCode())
  }

  private buildPlannerState(code?: string): PlannerState {
    const fmt = this.nameFormat()
    const c = code || this.effectiveCode()
    return {
      rows: this.rows(),
      cols: this.cols(),
      verticalOrder: this.verticalOrder(),
      horizontalOrder: this.horizontalOrder(),
      bins: this.bins().map(b => ({
        ...b,
        label: fmt.replace('{loc}', c).replace('{bin}', b.id),
      })),
      walls: [...this._walls],
      locationCode: c,
      colWidths: [...this.colWidths],
      rowHeights: [...this.rowHeights],
      nameFormat: fmt,
      tag: this.tagsJoined(),
      type: this.binType(),
    }
  }

  /** Save layout to backend API (+ localStorage fallback) */
  private saveStateToServer(): void {
    const locId = this.locationId()
    const facId = this.facilityId()
    const state = this.buildPlannerState()

    // Always save to localStorage as fallback
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(state))
    } catch (e) {
      console.warn('[BinPlanner] Could not save state to localStorage', e)
    }

    // Save to backend if we have IDs
    if (locId && facId) {
      this.locationService.saveBinLayout({
        facility_id: facId,
        location_id: locId,
        layout: state,
      }).subscribe({
        next: () => console.log('[BinPlanner] Layout saved to server'),
        error: (err) => console.warn('[BinPlanner] Could not save layout to server', err),
      })
    }
  }

  /** Load layout from backend API, fallback to containers or default */
  private loadStateFromServer(): void {
    const locId = this.locationId()
    this.unorderedBinsWarning.set(false)

    if (!locId) {
      // No location ID → try localStorage
      const saved = this.loadStateFromLocalStorage()
      if (saved) this.restoreState(saved)
      else this.rebuildGrid()
      return
    }

    this.locationService.getBinLayout(locId).subscribe({
      next: (binLayout) => {
        if (binLayout?.layout) {
          const state = binLayout.layout as PlannerState
          if (state.rows && state.cols && state.walls) {
            this.restoreState(state)
            return
          }
        }
        // Invalid server state → check for existing containers
        this.loadFromExistingContainers(locId)
      },
      error: () => {
        // 404 or network error → show info toast with location_code
        const code = this.effectiveCode()
        this.messageService.add({
          severity: 'info',
          summary: 'Bin Layout',
          detail: `No saved layout found for '${code}'. Showing existing bins.`,
          life: 4000,
        })
        this.loadFromExistingContainers(locId)
      },
    })
  }

  /**
   * When no layout exists, check if the location has containers.
   * If yes → build a uniform grid from them + show warning.
   * If no  → show default empty planner.
   */
  private loadFromExistingContainers(locationId: string): void {
    this.locationService.getContainerTree(locationId).subscribe({
      next: (containers) => {
        if (containers && containers.length > 0) {
          // Bins exist but no layout → build a uniform grid
          this.buildGridFromContainers(containers)
          this.unorderedBinsWarning.set(true)
        } else {
          // No bins, no layout → default empty planner
          this.rebuildGrid()
        }
      },
      error: () => {
        // Could not fetch containers → default empty planner
        this.rebuildGrid()
      },
    })
  }

  /** Build a uniform grid layout from existing containers */
  private buildGridFromContainers(containers: any[]): void {
    const count = containers.length
    // Calculate grid dimensions (try to be roughly square, max 25)
    const cols = Math.min(Math.ceil(Math.sqrt(count)), this.MAX_COLS)
    const rows = Math.min(Math.ceil(count / cols), this.MAX_ROWS)

    this.rows.set(rows)
    this.cols.set(cols)
    this.colWidths = new Array(cols).fill(1)
    this.rowHeights = new Array(rows).fill(1)

    // Build all walls as active (each cell is a separate bin)
    this._walls = buildUniformWalls(rows, cols)

    this.selectedWallIndex.set(null)
    this.hoveredWallIndex = null
    this.draggingWallIndex = null
    this.recalcBins()

    // Override bin labels with actual container names/types
    const currentBins = this.bins()
    const updatedBins = currentBins.map((bin, i) => {
      if (i < containers.length) {
        const container = containers[i]
        return {
          ...bin,
          label: container.lpn_code || bin.label,
          type: (container.type || 'BIN') as BinType,
          tag: (container.tags || []).join(','),
        }
      }
      return bin
    })
    this.bins.set(updatedBins)
    this.render()
  }

  private loadStateFromLocalStorage(): PlannerState | null {
    const code = this.effectiveCode()
    if (!code) return null

    try {
      const raw = localStorage.getItem(this.storageKey())
      if (!raw) return null
      const state = JSON.parse(raw) as PlannerState
      if (!state.rows || !state.cols || !state.walls) return null
      return state
    } catch (e) {
      console.warn('[BinPlanner] Could not load state from localStorage', e)
      return null
    }
  }

  private restoreState(state: PlannerState): void {
    this.rows.set(state.rows)
    this.cols.set(state.cols)
    this.verticalOrder.set(state.verticalOrder)
    this.horizontalOrder.set(state.horizontalOrder)
    this.nameFormat.set(state.nameFormat || '{loc}/{bin}')
    const savedTag = state.tag || ''
    this.tags.set(savedTag ? savedTag.split(',') : [])
    this.binType.set('BIN')
    this._walls = state.walls
    this.colWidths = state.colWidths?.length === state.cols
      ? [...state.colWidths]
      : new Array(state.cols).fill(1)
    this.rowHeights = state.rowHeights?.length === state.rows
      ? [...state.rowHeights]
      : new Array(state.rows).fill(1)
    this.selectedWallIndex.set(null)
    this.hoveredWallIndex = null
    this.draggingWallIndex = null
    this.recalcBins()
    this.render()
  }

  clearSavedState(): void {
    try {
      localStorage.removeItem(this.storageKey())
    } catch (e) {
      console.warn('[BinPlanner] Could not clear state from localStorage', e)
    }
  }
}
