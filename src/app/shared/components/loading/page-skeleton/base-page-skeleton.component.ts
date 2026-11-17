import { Component, input } from '@angular/core'
import { CommonModule } from '@angular/common'
import { SkeletonModule } from 'primeng/skeleton'

/**
 * ShPageSkeleton — Generic skeleton loader for pages.
 * Equivalent to agetic's CustomSkeleton.
 *
 * Usage:
 * ```html
 * <sh-page-skeleton variant="table" [rows]="5" [columns]="4" />
 * <sh-page-skeleton variant="form" />
 * <sh-page-skeleton variant="cards" [rows]="3" />
 * ```
 */
@Component({
  selector: 'base-page-skeleton',
  standalone: true,
  imports: [CommonModule, SkeletonModule],
  templateUrl: './base-page-skeleton.component.html',
  styleUrl: './base-page-skeleton.component.scss',
})
export class BasePageSkeleton {
  /** Skeleton layout variant */
  variant = input<'table' | 'form' | 'cards' | 'detail'>('table')
  /** Number of rows to display */
  rows = input(5)
  /** Number of columns (for table variant) */
  columns = input(4)

  rowArray = () => Array.from({ length: this.rows() })
  colArray = () => Array.from({ length: this.columns() })
}
