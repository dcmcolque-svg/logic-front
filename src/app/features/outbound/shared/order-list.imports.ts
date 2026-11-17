import { forwardRef, Provider, Type } from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { TableModule } from 'primeng/table'
import { ChipModule } from 'primeng/chip'
import { ToastModule } from 'primeng/toast'
import { SkeletonModule } from 'primeng/skeleton'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { ConfirmationService, MessageService } from 'primeng/api'
import { MenuModule } from 'primeng/menu'

import { BaseDataTable } from '@/app/shared/components/datatable/data-table/base-data-table.component'
import { BaseImportExportMenu } from '@/app/shared/components/import-export-menu/base-import-export-menu.component'

import { OrderDetailDialogComponent } from '../components/order-detail-dialog/order-detail-dialog.component'
import { OrderListBase } from './order-list.base'
import { ScopedOrderListBase } from './scoped-order-list.base'
import { OrderListHeaderComponent } from './components/order-list-header/order-list-header.component'
import { OrderColumnToggleComponent } from './components/order-column-toggle/order-column-toggle.component'
import { OrderColumnFilterComponent } from './components/order-column-filter/order-column-filter.component'
import { OrderCellComponent } from './components/order-cell/order-cell.component'
import { OrderMenuButtonComponent } from './components/order-menu-button/order-menu-button.component'
import { OrderPresetCardComponent } from './components/order-preset-card/order-preset-card.component'

/** Standalone imports used by every outbound order list page. */
export const ORDER_LIST_IMPORTS = [
  CommonModule,
  TranslateModule,
  TableModule,
  ChipModule,
  ToastModule,
  ConfirmDialogModule,
  MenuModule,
  BaseDataTable,
  OrderDetailDialogComponent,
  OrderListHeaderComponent,
  OrderColumnToggleComponent,
  OrderColumnFilterComponent,
  OrderCellComponent,
  OrderMenuButtonComponent,
] as const

/** Extra imports of the facility-scoped lists: presets, export and row expansion. */
export const SCOPED_ORDER_LIST_IMPORTS = [
  SkeletonModule,
  BaseImportExportMenu,
  OrderPresetCardComponent,
] as const

/**
 * Page-level providers of an order list: its own toast/confirmation services
 * and the `OrderListBase` token the shared sub-components inject.
 */
export function provideOrderList(component: () => Type<OrderListBase>): Provider[] {
  return [
    MessageService,
    ConfirmationService,
    { provide: OrderListBase, useExisting: forwardRef(component) },
  ]
}

/** `provideOrderList` for lists with presets, also exposing the `ScopedOrderListBase` token. */
export function provideScopedOrderList(component: () => Type<ScopedOrderListBase>): Provider[] {
  return [
    ...provideOrderList(component),
    { provide: ScopedOrderListBase, useExisting: forwardRef(component) },
  ]
}
