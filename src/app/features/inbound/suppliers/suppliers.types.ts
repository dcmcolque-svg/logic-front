import { MatchModel, MetaData, SortField } from '../receivings/receivings.types'

/** Row of inb_suppliers — a supplier belongs to one company of the operator. */
export interface Supplier {
  id: string
  company_id: string
  company_name?: string | null
  code?: string | null
  name: string
  tax_id?: string | null
  contact_name?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  notes?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Body of POST /v2/inbound/supplier/create and PUT /v2/inbound/supplier/:id. company_id is fixed after creation. */
export interface SupplierInput {
  company_id: string
  code?: string | null
  name: string
  tax_id?: string | null
  contact_name?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  notes?: string | null
  is_active?: boolean
}

/** Column filters — every field is a MatchModel (equals, contains, in, lte, gte…), like the other v2 lists. */
export interface SupplierFilter {
  id?: MatchModel
  company_id?: MatchModel
  code?: MatchModel
  name?: MatchModel
  tax_id?: MatchModel
  contact_name?: MatchModel
  email?: MatchModel
  phone?: MatchModel
  address?: MatchModel
  is_active?: MatchModel
  created_at?: MatchModel
  updated_at?: MatchModel
  /** name, code, tax_id or contact name (contains) — always ANDed. */
  search?: MatchModel
}

export interface SupplierListRequest {
  filter: SupplierFilter
  config: { page: number; rows: number; sort_field?: SortField[] }
}

export interface SupplierListResponse {
  data: Supplier[]
  meta_data: MetaData
}
