/**
 * Bin Planner internal types for grid-based bin layout planning.
 */

/** Bin type classification */
// New bins are always BIN; BOX/PALLET/TOTE remain for bins created before that rule.
export type BinType = 'BIN' | 'BOX' | 'PALLET' | 'TOTE'

/** A single cell in the planner grid */
export interface PlannerCell {
  row: number
  col: number
  binId: string
}

/** A planned bin = 1 or more contiguous merged cells */
export interface PlannedBin {
  id: string
  label: string
  cells: PlannerCell[]
  color: string
  tag: string
  type: BinType
}

/** Wall between two adjacent cells */
export interface PlannerWall {
  row1: number; col1: number
  row2: number; col2: number
  orientation: 'vertical' | 'horizontal'
  active: boolean
}

/** Label ordering direction */
export type VerticalOrder = 'ltr' | 'rtl'
export type HorizontalOrder = 'ttb' | 'btt'

/** Full planner state */
export interface PlannerState {
  rows: number
  cols: number
  verticalOrder: VerticalOrder
  horizontalOrder: HorizontalOrder
  bins: PlannedBin[]
  walls: PlannerWall[]
  locationCode: string
  colWidths: number[]
  rowHeights: number[]
  nameFormat: string
  tag: string
  type: BinType
}

/** Result emitted by the bin planner dialog */
export interface BinPlannerResult {
  bins: PlannedBin[]
  nameFormat: string
}

/** Palette for bin colors (soft, distinct) */
export const BIN_COLORS: string[] = [
  '#E3F2FD', '#E8F5E9', '#FFF3E0', '#F3E5F5',
  '#E0F7FA', '#FBE9E7', '#F1F8E9', '#EDE7F6',
  '#E8EAF6', '#FFF8E1', '#E0F2F1', '#FCE4EC',
  '#ECEFF1', '#F9FBE7', '#E1F5FE', '#FFF9C4',
]
