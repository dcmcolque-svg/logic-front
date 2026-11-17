import { Injectable, Provider, signal } from '@angular/core'
import { ShColumnDef } from '../types/table.types'

/**
 * TableColumnsBus — lets the header's export menu read the columns the table is
 * actually rendering, without the two having to be bound to the same field.
 *
 * The menu and the table are siblings, often in different structural blocks
 * (`@if`), so neither a template reference nor content projection reaches
 * across. A bus provided by the view they both live in does: the table
 * publishes, the menu reads.
 *
 * It exists because the two drifted apart in practice — a view gained a column
 * selector, its table moved to the new array and the export kept pointing at
 * the old one, so unchecking a column hid it on screen and still shipped it in
 * the file. What the table publishes is `visibleColumns()`, which is what the
 * reader sees: the user's selection minus whatever the facility scope hides.
 *
 * Add it to the view's providers with `provideTableColumns()`. Without it both
 * components fall back to their own inputs, so a view that does not opt in
 * keeps working exactly as before — as does a view whose table is inside an
 * `@if` that is currently false, since an empty bus falls back too.
 *
 * One bus holds one table's columns. A view rendering two tables at once would
 * need one bus each, scoped to the subtrees, or the second would overwrite the
 * first.
 */
@Injectable()
export class TableColumnsBus {
  private readonly _columns = signal<ShColumnDef[]>([])
  private readonly _rowCount = signal<number | null>(null)

  /** The columns the table is rendering right now. */
  readonly columns = this._columns.asReadonly()

  /**
   * How many rows the table is rendering right now, or `null` when no table is
   * reporting — none has mounted yet, or the one that was there is gone. The
   * menu reads it to disable Export when there is nothing on screen to write:
   * a file with a header row and no data is a support ticket, not an export.
   *
   * `null` is not zero, and the difference is the whole point. Zero means a
   * table is on screen with no rows in it; `null` means nobody can say. A view
   * that swaps its table for another rendering — History's timeline — would
   * otherwise report an empty table it no longer has, and kill an export that
   * works.
   *
   * It is what the table renders, not what the endpoint holds: an empty result
   * for the active filters is nothing to export, the same as an empty table.
   */
  readonly rowCount = this._rowCount.asReadonly()

  /** Called by the table on every column change. */
  publish(columns: ShColumnDef[]): void {
    this._columns.set(columns)
  }

  /**
   * Called by the table whenever the rows it renders change, and with `null`
   * when it goes away.
   */
  publishRowCount(count: number | null): void {
    this._rowCount.set(count)
  }
}

/** Provides one bus for a view, shared by its table and its export menu. */
export function provideTableColumns(): Provider {
  return TableColumnsBus
}
