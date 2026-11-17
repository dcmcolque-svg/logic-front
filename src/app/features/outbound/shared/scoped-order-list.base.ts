import { Directive, effect, inject, signal } from '@angular/core'
import { map } from 'rxjs'

import { ExportPageFetcher } from '@/app/shared/components/import-export-menu/base-import-export-menu.component'
import { FilterPresetService } from '@/app/shared/services/filter-preset.service'
import { FilterPreset, buildFiltersFromConditions } from '@/app/shared/types/filter-preset.types'
import { ActiveFilterChip } from '@/app/shared/types/table.types'
import { buildFilterChipsFromColumns } from '@/app/shared/utils/filter-chips.util'

import { Order } from '../types/order.types'
import { FilterValue, orderSortField, UiFilters } from './order-filter.util'
import { OrderListBase } from './order-list.base'

/**
 * Order list that supports saved filter presets, filter chips and export
 * (All Orders, Backorders).
 */
@Directive()
export abstract class ScopedOrderListBase extends OrderListBase {
  protected readonly filterPresetService = inject(FilterPresetService)

  /** Page key under which filter presets are stored. */
  abstract readonly PRESET_PAGE_KEY: string

  // Preset indicator
  activePresetColor = signal<string | null>(null)
  activePresetName = signal<string | null>(null)

  // Filter chips
  activeFilters = signal<ActiveFilterChip[]>([])

  constructor() {
    super()
    // Restore active preset color when navigating back to this page
    effect(() => {
      const presets = this.filterPresetService.presets()
      const lastId = this.filterPresetService.lastAppliedPresetId()
      if (presets.length > 0 && lastId) {
        const active = presets.find(p => p.id === lastId)
        if (active) {
          this.activePresetColor.set(active.color ?? null)
          this.activePresetName.set(active.name)
        }
      }
    })
  }

  protected override onFiltersRestored(): void {
    this.filterPresetService.loadPresets(this.PRESET_PAGE_KEY)
  }

  protected override resetFilterExtras(): void {
    this.activeFilters.set([])
    this.activePresetColor.set(null)
    this.activePresetName.set(null)
    this.filterPresetService.clearLastApplied()
    this.baseTable?.clearSelection()
  }

  // === Presets ===

  /** Syncs the filter widgets with `activeBackendFilters` after a preset is applied. */
  protected syncFilterWidgets(): void {
    this.facilityFilter.set(this.activeBackendFilters['facility_id']?.value ?? [])
  }

  /** Hook run after a preset is applied, right before reloading. */
  protected onPresetApplied(): void {
    // No-op by default
  }

  /**
   * Restores filters and sort from a saved preset.
   */
  onPresetSelected(preset: FilterPreset): void {
    this.activePresetColor.set(preset.color ?? null)
    this.activePresetName.set(preset.name)
    this.activeBackendFilters = buildFiltersFromConditions(preset.conditions ?? [])
    this.syncFilterWidgets()
    if (preset.sort_field) {
      this.currentSort.set({ field: preset.sort_field, order: (preset.sort_order as 'asc' | 'desc') ?? 'asc' })
    } else {
      this.currentSort.set(undefined)
    }
    this.applyFilters(this.activeBackendFilters)
    this.baseTable?.resetColumnFilters()
    this.pagination.update(p => ({ ...p, page: 1 }))
    this.onPresetApplied()
    this.loadData()
  }

  // === Filter chips ===

  /** Filters shown as chips (defaults to every active filter). */
  protected visibleChipFilters(): UiFilters {
    return this.activeBackendFilters
  }

  /** Value → label resolvers for the chips. */
  protected chipResolvers(): Record<string, (v: FilterValue) => string> {
    return {
      facility_id: (id: string) => this.facilityMap().get(id) ?? id,
    }
  }

  protected override buildFilterChips(): void {
    this.activeFilters.set(
      buildFilterChipsFromColumns(this.visibleChipFilters(), this.cols, this.translate, this.chipResolvers())
    )
  }

  /** Returns the active filters without `field`, resetting its widget. */
  protected withoutFilter(field: string): UiFilters {
    const filters = { ...this.activeBackendFilters }
    delete filters[field]
    if (field === 'facility_id') this.facilityFilter.set([])
    return filters
  }

  removeFilterChip(field: string): void {
    this.applyFilters(this.withoutFilter(field))
    this.baseTable?.clearFiltersForFields([field])
    this.reloadFirstPage()
  }

  // === Bulk actions ===

  /** Re-evaluates stock for BACKORDER orders (moves them to PENDING, or PROCESSING with auto-processing, when possible). */
  confirmEvaluate(orders: Order[]) {
    this.confirmAction('orders.confirm_evaluate', orders, o => this.evaluateInBulk(o))
  }

  private evaluateInBulk(orders: Order[]) {
    const orderNumberMap = new Map(orders.map(o => [o.id, o.order_number]))
    this.runBatch(this.orderService.evaluateOrdersBatch(orders.map(o => o.id)), {
      successStatus: ['PENDING', 'PROCESSING'],
      successKey: 'messages.orders_evaluated',
      successLife: 4000,
      clearTableSelection: true,
      failureToast: r => ({
        severity: r.status === 'BACKORDER' ? 'warn' : 'error',
        summary: `Order ${orderNumberMap.get(r.order_id) ?? r.order_id}`,
        detail: r.error?.message || this.translate.instant('messages.order_still_backorder'),
      }),
    })
  }

  // === Export ===

  /** Translated status label — same text the badge shows. */
  protected statusLabel(status: string): string {
    if (!status) return ''
    const key = `labels.order_statuses.${status}`
    const label = this.translate.instant(key)
    return label === key ? status : label
  }

  /**
   * Feeds the header's export menu: pages the order list with the same
   * filters and sort the table uses, covering every matching record.
   */
  readonly fetchExportPage: ExportPageFetcher = (page, rows) => {
    return this.orderService
      .listOrders({
        config: { page, rows, sort_field: orderSortField(this.currentSort()) },
        filter: this.scopedRequestFilter(),
      })
      .pipe(map(resp => ({ data: resp.data || [], total: resp.meta_data?.total_records || 0 })))
  }
}
