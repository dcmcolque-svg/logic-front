import { Order, OrderItemError } from '../types/order.types'
import { FilterValue } from './order-filter.util'

/** An action offered in the row (⋮) and bulk ("Selected") menus of an order list. */
export interface OrderMenuAction {
  labelKey: string
  icon: string
  /** Upper-case statuses the action applies to; omitted means every order. */
  statuses?: readonly string[]
  run: (orders: Order[]) => void
}

/** Text, numeric or date filter rendered in the custom filter row. */
export interface OrderInputColumnFilter {
  kind: 'text' | 'numeric' | 'date'
  placeholder: string
}

/** Multiselect filter rendered in the custom filter row. */
export interface OrderMultiselectColumnFilter {
  kind: 'multiselect'
  placeholder: string
  optionLabel: string
  optionValue: string
  options: () => FilterValue[]
  selected: () => string[]
  showFilter: () => boolean
}

export type OrderColumnFilter = OrderInputColumnFilter | OrderMultiselectColumnFilter

/** Minimal `{ order_id, status, error }` shape shared by the batch endpoints' results. */
export interface OrderBatchItemResult {
  order_id: string
  status: string
  error?: OrderItemError
}
