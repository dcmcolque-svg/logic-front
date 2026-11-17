import { Component, input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { SkeletonModule } from 'primeng/skeleton'

/**
 * ShTableSkeleton — Skeleton loader specifically for tables.
 * Used internally by ShDataTable when loading=true.
 */
@Component({
  selector: 'base-table-skeleton',
  standalone: true,
  imports: [CommonModule, SkeletonModule],
  templateUrl: './base-table-skeleton.component.html',
  styleUrl: './base-table-skeleton.component.scss',
})
export class BaseTableSkeleton {
  /** Number of rows to show */
  rows = input(8)
  /** Number of columns to show */
  columns = input(5)
  /** Whether to show checkbox column */
  selectable = input(false)

  rowArray = () => Array.from({ length: this.rows() })
  colArray = () => Array.from({ length: this.columns() })
}
