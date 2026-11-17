import { Injectable } from '@angular/core'
import { DemoOrder, DemoOrderFilters } from './demo.types'
import { ApiListResponse } from '../../shared/types/api.types'

/**
 * DemoService — Mock data service for the demo page.
 * Simulates the API pattern used in edge-frontend services
 * (e.g. AllordersService) without requiring a running backend.
 *
 * When ready to connect to real APIs, replace the mock logic with:
 *   return this.http.post<ApiListResponse<DemoOrder>>(`${this.url}order/all`, filters);
 */
@Injectable({ providedIn: 'root' })
export class DemoService {
  private readonly MOCK_DATA: DemoOrder[] = [
    {
      id: 1,
      order_number: 'ORD-2024-001',
      customer_name: 'Acme Corp',
      status: 'shipped',
      items_count: 3,
      total_amount: 245.99,
      created_at: '2024-03-15',
      shipping_method: 'FedEx Ground',
      tracking_number: 'FX123456789',
      warehouse: 'WH-Miami',
    },
    {
      id: 2,
      order_number: 'ORD-2024-002',
      customer_name: 'Global Industries',
      status: 'pending',
      items_count: 1,
      total_amount: 89.5,
      created_at: '2024-03-15',
      shipping_method: 'UPS 2-Day',
      tracking_number: '',
      warehouse: 'WH-Miami',
    },
    {
      id: 3,
      order_number: 'ORD-2024-003',
      customer_name: 'Tech Solutions LLC',
      status: 'processing',
      items_count: 5,
      total_amount: 1250,
      created_at: '2024-03-14',
      shipping_method: 'USPS Priority',
      tracking_number: 'US987654321',
      warehouse: 'WH-Dallas',
    },
    {
      id: 4,
      order_number: 'ORD-2024-004',
      customer_name: 'Smith & Associates',
      status: 'delivered',
      items_count: 2,
      total_amount: 175.25,
      created_at: '2024-03-14',
      shipping_method: 'FedEx Express',
      tracking_number: 'FX111222333',
      warehouse: 'WH-Miami',
    },
    {
      id: 5,
      order_number: 'ORD-2024-005',
      customer_name: 'Pacific Trading Co',
      status: 'cancelled',
      items_count: 8,
      total_amount: 3200,
      created_at: '2024-03-13',
      shipping_method: 'DHL International',
      tracking_number: 'DH444555666',
      warehouse: 'WH-LA',
    },
    {
      id: 6,
      order_number: 'ORD-2024-006',
      customer_name: 'Northern Logistics',
      status: 'shipped',
      items_count: 4,
      total_amount: 567.8,
      created_at: '2024-03-13',
      shipping_method: 'UPS Ground',
      tracking_number: 'UP777888999',
      warehouse: 'WH-Dallas',
    },
    {
      id: 7,
      order_number: 'ORD-2024-007',
      customer_name: 'Mountain View Inc',
      status: 'pending',
      items_count: 1,
      total_amount: 42.99,
      created_at: '2024-03-12',
      shipping_method: 'USPS First Class',
      tracking_number: '',
      warehouse: 'WH-LA',
    },
    {
      id: 8,
      order_number: 'ORD-2024-008',
      customer_name: 'Coastal Supplies',
      status: 'processing',
      items_count: 12,
      total_amount: 4890,
      created_at: '2024-03-12',
      shipping_method: 'FedEx Freight',
      tracking_number: 'FX000111222',
      warehouse: 'WH-Miami',
    },
    {
      id: 9,
      order_number: 'ORD-2024-009',
      customer_name: 'Summit Enterprises',
      status: 'shipped',
      items_count: 6,
      total_amount: 892.5,
      created_at: '2024-03-11',
      shipping_method: 'UPS Express',
      tracking_number: 'UP333444555',
      warehouse: 'WH-Dallas',
    },
    {
      id: 10,
      order_number: 'ORD-2024-010',
      customer_name: 'Valley Distributors',
      status: 'delivered',
      items_count: 3,
      total_amount: 335,
      created_at: '2024-03-11',
      shipping_method: 'FedEx Ground',
      tracking_number: 'FX666777888',
      warehouse: 'WH-LA',
    },
    {
      id: 11,
      order_number: 'ORD-2024-011',
      customer_name: 'Urban Goods LLC',
      status: 'pending',
      items_count: 2,
      total_amount: 128.75,
      created_at: '2024-03-10',
      shipping_method: 'USPS Priority',
      tracking_number: '',
      warehouse: 'WH-Miami',
    },
    {
      id: 12,
      order_number: 'ORD-2024-012',
      customer_name: 'Eastside Commerce',
      status: 'backorder',
      items_count: 7,
      total_amount: 2100,
      created_at: '2024-03-10',
      shipping_method: 'DHL Express',
      tracking_number: '',
      warehouse: 'WH-Dallas',
    },
    {
      id: 13,
      order_number: 'ORD-2024-013',
      customer_name: 'Westfield Trading',
      status: 'shipped',
      items_count: 1,
      total_amount: 59.99,
      created_at: '2024-03-09',
      shipping_method: 'UPS Ground',
      tracking_number: 'UP999000111',
      warehouse: 'WH-LA',
    },
    {
      id: 14,
      order_number: 'ORD-2024-014',
      customer_name: 'Pinnacle Solutions',
      status: 'delivered',
      items_count: 4,
      total_amount: 780,
      created_at: '2024-03-09',
      shipping_method: 'FedEx Express',
      tracking_number: 'FX222333444',
      warehouse: 'WH-Miami',
    },
    {
      id: 15,
      order_number: 'ORD-2024-015',
      customer_name: 'Horizon Partners',
      status: 'processing',
      items_count: 9,
      total_amount: 5600,
      created_at: '2024-03-08',
      shipping_method: 'UPS Freight',
      tracking_number: 'UP555666777',
      warehouse: 'WH-Dallas',
    },
  ]

  /**
   * Simulates a paginated API call.
   * Returns data with a configurable delay to demonstrate loading states.
   */
  getOrders(filters: DemoOrderFilters): Promise<ApiListResponse<DemoOrder>> {
    return new Promise((resolve) => {
      setTimeout(() => {
        let filtered = [...this.MOCK_DATA]

        // Search filter
        if (filters.search) {
          const search = filters.search.toLowerCase()
          filtered = filtered.filter(
            (o) =>
              o.order_number.toLowerCase().includes(search) ||
              o.customer_name.toLowerCase().includes(search)
          )
        }

        // Status filter
        if (filters.status) {
          filtered = filtered.filter((o) => o.status === filters.status)
        }

        // Sort
        if (filters.sort_by) {
          const sortField = filters.sort_by as keyof DemoOrder
          const sortDir = filters.sort_order === 'desc' ? -1 : 1
          filtered.sort((a, b) => {
            const aVal = a[sortField]
            const bVal = b[sortField]
            if (typeof aVal === 'string')
              return aVal.localeCompare(bVal as string) * sortDir
            return (aVal - (bVal as number)) * sortDir
          })
        }

        // Paginate
        const total = filtered.length
        const start = (filters.page - 1) * filters.limit
        const data = filtered.slice(start, start + filters.limit)

        resolve({ data, page: filters.page, limit: filters.limit, total })
      }, 600) // Simulate network delay
    })
  }
}
