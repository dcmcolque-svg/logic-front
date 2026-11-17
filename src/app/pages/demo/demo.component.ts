import { Component, inject, OnInit, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { ChipModule } from 'primeng/chip'
import { MultiSelectModule } from 'primeng/multiselect'

// Shared components
import { BaseDataTable } from '@/app/shared/components/datatable/data-table/base-data-table.component'
import { BaseFormField } from '@/app/shared/components/form/form-field/base-form-field.component'
import { BaseActionMenu } from '@/app/shared/components/actions/action-menu/base-action-menu.component'
import { BaseIconButton } from '@/app/shared/components/actions/icon-button/base-icon-button.component'
import { BaseStatusBadge } from '@/app/shared/components/status/status-badge/base-status-badge.component'

// Sub-components (dialog pattern from edge-frontend)
import { DemoFormDialogComponent } from './components/demo-form-dialog/demo-form-dialog.component'
import { DemoConfirmDialogComponent } from './components/demo-confirm-dialog/demo-confirm-dialog.component'

// Types
import {
  ShColumnDef,
  ShPaginationConfig,
  ShSortConfig,
  ShTableEvent,
} from '@/app/shared/types/table.types'
import { ShActionItem } from '@/app/shared/types/api.types'

// Domain
import { DemoService } from '@/app/domain/demo/demo.service'
import { DemoOrder } from '@/app/domain/demo/demo.types'

/**
 * DemoComponent — Showcase page demonstrating all reusable components.
 *
 * This page follows the edge-frontend pattern:
 * - The component is the **orchestrator** (fetching, state, layout)
 * - Sub-components in `components/` handle dialogs (form, confirm)
 * - Reusable components handle rendering (BaseDataTable, etc.)
 * - Domain service handles data access (DemoService)
 */
@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    ChipModule,
    MultiSelectModule,
    BaseDataTable,
    BaseFormField,
    BaseActionMenu,
    BaseIconButton,
    BaseStatusBadge,
    // Sub-components
    DemoFormDialogComponent,
    DemoConfirmDialogComponent,
  ],
  templateUrl: './demo.component.html',
  styleUrl: './demo.component.scss',
})
export default class DemoComponent implements OnInit {
  private readonly demoService = inject(DemoService)

  // === State ===
  orders = signal<DemoOrder[]>([])
  loading = signal(false)
  pagination = signal<ShPaginationConfig>({
    page: 1,
    limit: 10,
    total: 0,
    rows_per_page: [5, 10, 25, 50],
  })
  currentSort = signal<ShSortConfig | undefined>(undefined)
  selectedOrders = signal<DemoOrder[]>([])
  showDialog = signal(false)
  showDeleteConfirm = signal(false)
  savingOrder = signal(false)
  editingOrder = signal<DemoOrder | null>(null)
  deleteTarget = signal<DemoOrder | null>(null)

  // === Stats ===
  stats = signal([
    {
      label: 'demo.total_orders',
      value: 0,
      icon: 'pi pi-shopping-cart',
      bgClass: 'bg-blue-100 dark:bg-blue-900/30',
      iconClass: 'text-blue-600',
    },
    {
      label: 'demo.shipped',
      value: 0,
      icon: 'pi pi-truck',
      bgClass: 'bg-green-100 dark:bg-green-900/30',
      iconClass: 'text-green-600',
    },
    {
      label: 'demo.pending',
      value: 0,
      icon: 'pi pi-clock',
      bgClass: 'bg-yellow-100 dark:bg-yellow-900/30',
      iconClass: 'text-yellow-600',
    },
    {
      label: 'demo.cancelled',
      value: 0,
      icon: 'pi pi-times-circle',
      bgClass: 'bg-red-100 dark:bg-red-900/30',
      iconClass: 'text-red-600',
    },
  ])

  // === Column definitions ===
  cols: ShColumnDef[] = [
    {
      field: 'order_number',
      header: 'labels.order_number',
      sortable: true,
      filterable: true,
      filterType: 'text',
      width: '10rem',
      template: 'order_number',
      mobileLabel: true,
    },
    {
      field: 'customer_name',
      header: 'labels.customer_name',
      sortable: true,
      filterable: true,
      filterType: 'text',
      mobileVisible: true,
    },
    {
      field: 'status',
      header: 'labels.status',
      sortable: true,
      filterable: true,
      filterType: 'multiselect',
      width: '9rem',
      template: 'status',
      mobileVisible: true,
      filterOptions: [
        { label: 'Shipped', value: 'shipped' },
        { label: 'Pending', value: 'pending' },
        { label: 'Processing', value: 'processing' },
        { label: 'Delivered', value: 'delivered' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'Backorder', value: 'backorder' },
      ],
    },
    {
      field: 'items_count',
      header: 'labels.items',
      sortable: true,
      filterable: true,
      filterType: 'numeric',
      width: '6rem',
      align: 'center',
    },
    {
      field: 'total_amount',
      header: 'labels.amount',
      sortable: true,
      width: '9rem',
      align: 'right',
      template: 'amount',
      mobileVisible: true,
    },
    {
      field: 'shipping_method',
      header: 'labels.shipping_method',
      sortable: false,
      width: '10rem',
    },
    {
      field: 'tracking_number',
      header: 'labels.tracking',
      sortable: false,
      width: '10rem',
    },
    {
      field: 'warehouse',
      header: 'labels.warehouse',
      sortable: true,
      filterable: true,
      filterType: 'multiselect',
      width: '8rem',
      filterOptions: [
        { label: 'WH-Miami', value: 'WH-Miami' },
        { label: 'WH-Dallas', value: 'WH-Dallas' },
        { label: 'WH-LA', value: 'WH-LA' },
      ],
    },
    {
      field: 'created_at',
      header: 'labels.created_at',
      sortable: true,
      filterable: true,
      filterType: 'date',
      width: '9rem',
    },
  ]
  selectedColumns: ShColumnDef[] = this.cols

  // === Filter controls ===
  searchControl = new FormControl('')
  statusFilter = new FormControl('')

  statusOptions = [
    { label: 'All', value: '' },
    { label: 'Shipped', value: 'shipped' },
    { label: 'Pending', value: 'pending' },
    { label: 'Processing', value: 'processing' },
    { label: 'Delivered', value: 'delivered' },
    { label: 'Cancelled', value: 'cancelled' },
    { label: 'Backorder', value: 'backorder' },
  ]

  // === Lifecycle ===
  ngOnInit() {
    this.loadData()
  }

  // === Data loading ===
  async loadData() {
    this.loading.set(true)
    try {
      const result = await this.demoService.getOrders({
        page: this.pagination().page,
        limit: this.pagination().limit,
        sort_by: this.currentSort()?.field,
        sort_order: this.currentSort()?.order,
        search: this.searchControl.value || undefined,
        status: this.statusFilter.value || undefined,
      })

      this.orders.set(result.data)
      this.pagination.update((p) => ({ ...p, total: result.total }))
      this.updateStats()
    } finally {
      this.loading.set(false)
    }
  }

  private updateStats() {
    this.demoService.getOrders({ page: 1, limit: 100 }).then((all) => {
      this.stats.set([
        { ...this.stats()[0], value: all.total },
        {
          ...this.stats()[1],
          value: all.data.filter((o) => o.status === 'shipped').length,
        },
        {
          ...this.stats()[2],
          value: all.data.filter((o) => o.status === 'pending').length,
        },
        {
          ...this.stats()[3],
          value: all.data.filter((o) => o.status === 'cancelled').length,
        },
      ])
    })
  }

  // === Table events ===
  onTableStateChange(event: ShTableEvent) {
    this.pagination.set(event.pagination)
    if (event.sort) {
      this.currentSort.set(event.sort)
    }
    this.loadData()
  }

  onSelectionChange(selection: DemoOrder[]) {
    this.selectedOrders.set(selection)
  }

  clearSelection() {
    this.selectedOrders.set([])
  }

  // === Filters ===
  applyFilters() {
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadData()
  }

  clearFilters() {
    this.searchControl.setValue('')
    this.statusFilter.setValue('')
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.loadData()
  }

  // === Row actions ===
  getRowActions(row: DemoOrder): ShActionItem[] {
    return [
      {
        label: 'labels.edit',
        icon: 'pi pi-pencil',
        command: () => this.openEditDialog(row),
      },
      { label: 'labels.view', icon: 'pi pi-eye', command: () => {} },
      { label: 'labels.duplicate', icon: 'pi pi-copy', command: () => {} },
      {
        label: 'labels.delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.onDeleteRow(row),
        separator: true,
      },
    ]
  }

  // === Dialog ===
  openCreateDialog() {
    this.editingOrder.set(null)
    this.showDialog.set(true)
  }

  openEditDialog(order: DemoOrder) {
    this.editingOrder.set(order)
    this.showDialog.set(true)
  }

  async onSaveOrder(formValue: Record<string, any>) {
    this.savingOrder.set(true)
    // Simulate save
    await new Promise((resolve) => setTimeout(resolve, 800))
    this.savingOrder.set(false)
    this.showDialog.set(false)
    this.loadData()
  }

  // === Bulk actions ===
  getBulkActions(): ShActionItem[] {
    const count = this.selectedOrders().length
    if (count === 0) return []
    return [
      {
        label: `Delete ${count} selected`,
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.onBulkDelete(),
      },
      {
        label: 'Clear selection',
        icon: 'pi pi-times',
        command: () => this.clearSelection(),
      },
    ]
  }

  // === Delete ===
  onDeleteRow(order: DemoOrder) {
    this.deleteTarget.set(order)
    this.showDeleteConfirm.set(true)
  }

  onBulkDelete() {
    this.deleteTarget.set(null)
    this.showDeleteConfirm.set(true)
  }

  async onConfirmDelete() {
    // Simulate delete
    await new Promise((resolve) => setTimeout(resolve, 500))
    this.showDeleteConfirm.set(false)
    this.deleteTarget.set(null)
    this.selectedOrders.set([])
    this.loadData()
  }
}
