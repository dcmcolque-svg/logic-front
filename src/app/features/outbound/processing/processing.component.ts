import { Component, inject, signal } from '@angular/core'
import { Router } from '@angular/router'

import { ButtonModule } from 'primeng/button'
import { map } from 'rxjs'
import { TranslateModule } from '@ngx-translate/core'
import { BaseImportExportMenu, ExportPageFetcher } from '@/app/shared/components/import-export-menu/base-import-export-menu.component'

import { ActiveFilterChip, ShColumnDef } from '@/app/shared/types/table.types'
import { buildFilterChipsFromColumns } from '@/app/shared/utils/filter-chips.util'

import { Order, OrderFilter } from '../types/order.types'
import { OrderListBase } from '../shared/order-list.base'
import { orderSortField } from '../shared/order-filter.util'
import { OrderColumnFilter, OrderMenuAction } from '../shared/order-list.types'
import { ORDER_LIST_IMPORTS, provideOrderList } from '../shared/order-list.imports'

const PROCESSING_STATUS = 'PROCESSING'

@Component({
  selector: 'app-processing',
  standalone: true,
  imports: [ORDER_LIST_IMPORTS, ButtonModule, TranslateModule, BaseImportExportMenu],
  providers: provideOrderList(() => ProcessingComponent),
  templateUrl: './processing.component.html',
  styleUrl: './processing.component.scss',
})
export default class ProcessingComponent extends OrderListBase {
  private readonly router = inject(Router)

  protected readonly stateKey = 'logic:processing'
  protected override readonly formatDateFilters = true

  readonly columnFilters: Record<string, OrderColumnFilter> = {
    facility_id: this.facilityColumnFilter,
    order_number: { kind: 'text', placeholder: 'labels.order_number' },
    ship_to: { kind: 'text', placeholder: 'labels.ship_to' },
    created_at: { kind: 'date', placeholder: 'labels.order_date' },
    required_delivery_date: { kind: 'date', placeholder: 'labels.required_delivery_date' },
  }

  /** Feeds the export menu: every PROCESSING order matching the filters and sort in use. */
  readonly fetchExportPage: ExportPageFetcher = (page, rows) =>
    this.orderService
      .listOrders({
        config: { page, rows, sort_field: orderSortField(this.currentSort()) },
        filter: this.scopedRequestFilter(),
      })
      .pipe(map(resp => ({ data: resp.data || [], total: resp.meta_data?.total_records || 0 })))

  // Filter chips
  activeFilters = signal<ActiveFilterChip[]>([])

  protected buildColumns(): ShColumnDef[] {
    return [
      { field: 'order_number',           header: 'labels.order_number', sortable: true,  filterable: true,  filterType: 'text', width: '14rem',  template: 'order_number' },
      { field: 'status',                 header: 'labels.status',       sortable: true,  filterable: false,                      width: '10rem',  template: 'status' },
      { field: 'facility_id',            header: 'labels.facility',     sortable: false, filterable: true,                       width: '12rem',  template: 'facility' },
      { field: 'ship_to',                header: 'labels.ship_to',      sortable: false, filterable: true,  filterType: 'text', width: '16rem',  template: 'ship_to' },
      { field: 'created_at',             header: 'labels.order_date',   sortable: true,  filterable: true,  filterType: 'date', width: '13rem',  template: 'created_at' },
      { field: 'required_delivery_date', header: 'labels.required_delivery_date', sortable: true,  filterable: true,  filterType: 'date', width: '13rem',  template: 'required_delivery_date' },
    ]
  }

  /** Processing only ever lists orders in PROCESSING status. */
  protected override requestFilter(): OrderFilter {
    return {
      ...this.currentFilters(),
      status: { match_mode: 'eq', value: PROCESSING_STATUS },
    }
  }

  // === Filter chips ===
  protected override buildFilterChips(): void {
    const resolvers: Record<string, (v: any) => string> = {
      facility_id: (id: string) => this.facilityMap().get(id) ?? id,
    }
    this.activeFilters.set(
      buildFilterChipsFromColumns(this.activeBackendFilters, this.cols, this.translate, resolvers)
    )
  }

  removeFilterChip(field: string): void {
    const filters = { ...this.activeBackendFilters }
    delete filters[field]
    if (field === 'facility_id') this.facilityFilter.set([])
    this.activeBackendFilters = filters
    this.currentFilters.set(this.buildApiFilter(filters))
    this.buildFilterChips()
    this.baseTable?.clearFiltersForFields([field])
    this.pagination.update(p => ({ ...p, page: 1 }))
    this.loadData()
  }

  // === Row actions ===
  protected menuActions(): OrderMenuAction[] {
    return [
      { labelKey: 'labels.revert_to_pending', icon: 'pi pi-replay', run: orders => this.confirmRevert(orders) },
    ]
  }

  confirmRevert(orders: Order[]) {
    this.confirmAction('orders.confirm_revert', orders, o =>
      this.runBatch(this.orderService.revertProcessBatch(o.map(x => x.id)), {
        successStatus: 'PENDING',
        successKey: 'messages.orders_revert_success',
        successLife: 3000,
        clearTableSelection: true,
      })
    )
  }

  // === Navigation ===
  goToPicking() {
    this.router.navigateByUrl('/picker')
  }
}
