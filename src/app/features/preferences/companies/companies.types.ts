import { MatchModel, MetaData, SortField } from '../../inbound/receivings/receivings.types'

/** Row of core_companies — a legal owner of inventory within the operator. */
export interface Company {
  id: string
  operator_id: string
  name: string
  tax_id?: string | null
  co_code?: string | null
  is_host_company: boolean
  created_at: string
}

/** Body of POST /v2/company and PUT /v2/company/:id (update replaces all three). */
export interface CompanyInput {
  name: string
  tax_id: string | null
  co_code: string | null
}

export interface CompanyFilter {
  id?: MatchModel
  name?: MatchModel
  tax_id?: MatchModel
  co_code?: MatchModel
  search?: MatchModel
}

export interface CompanyListRequest {
  filter: CompanyFilter
  config: { page: number; rows: number; sort_field?: SortField[] }
}

export interface CompanyListResponse {
  data: Company[]
  meta_data: MetaData
}
