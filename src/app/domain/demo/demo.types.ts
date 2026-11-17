/**
 * Demo domain types — mock data interfaces for the demo page.
 * In production, these would match the backend's API contracts.
 */

export interface DemoOrder {
  id: number
  order_number: string
  customer_name: string
  status: string
  items_count: number
  total_amount: number
  created_at: string
  shipping_method: string
  tracking_number: string
  warehouse: string
}

export interface DemoOrderFilters {
  page: number
  limit: number
  sort_by?: string
  sort_order?: string
  search?: string
  status?: string
}
