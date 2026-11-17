import { Component, input, output, computed, TemplateRef } from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { ShColumnDef } from '../../../types/table.types'

/**
 * ShDataTableMobile — Card-based mobile view for data tables.
 * Equivalent to agetic's CustomMobileTableMobile.
 *
 * Renders each row as a card, showing only mobileVisible fields.
 * The field marked as mobileLabel becomes the card title.
 */
@Component({
  selector: 'base-data-table-mobile',
  standalone: true,
  imports: [CommonModule, TranslateModule, ButtonModule],
  templateUrl: './base-data-table-mobile.component.html',
  styleUrl: './base-data-table-mobile.component.scss',
})
export class BaseDataTableMobile {
  /** Row data array */
  data = input<any[]>([])
  /** Column definitions */
  columns = input<ShColumnDef[]>([])
  /** Optional cell template from parent for custom cell rendering */
  cellTemplate = input<TemplateRef<any> | null>(null)
  /** Optional actions template from parent — rendered top-right of each card */
  actionsTemplate = input<TemplateRef<any> | null>(null)
  /** Optional expanded-row template (e.g. inline SKUs). Receives { $implicit: row } context. */
  expandedRowTemplate = input<TemplateRef<any> | null>(null)
  /** Set of expanded row keys (matching row.id) */
  expandedRowKeys = input<Record<string, boolean>>({})

  /** Emitted when a card's expand-content toggle is clicked */
  toggleRowExpansion = output<any>()

  /** Track which rows are expanded */
  expandedRows = new Set<number>()

  /** Column used as card title */
  titleColumn = computed(() => this.columns().find((c) => c.mobileLabel))

  /** Columns visible in mobile (mobileVisible=true or mobileLabel=true) */
  mobileColumns = computed(() =>
    this.columns().filter((c) => c.mobileVisible || c.mobileLabel)
  )

  /** Columns hidden in mobile (available on expand) */
  hiddenMobileColumns = computed(() =>
    this.columns().filter(
      (c) => !c.mobileVisible && !c.mobileLabel && c.visible !== false
    )
  )

  /** Whether there are columns not shown by default */
  hasHiddenColumns = computed(() => this.hiddenMobileColumns().length > 0)

  getFieldValue(row: any, field: string): any {
    // Support nested fields like 'customer.name'
    return field.split('.').reduce((obj, key) => obj?.[key], row) ?? '—'
  }

  toggleExpand(index: number) {
    if (this.expandedRows.has(index)) {
      this.expandedRows.delete(index)
    } else {
      this.expandedRows.add(index)
    }
  }
}
