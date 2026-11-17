export interface Zone {
  id: string
  name: string
  type: string
  is_active: boolean
  locs: number
}

export interface Facility {
  id: string
  name: string
  code?: string
}

export interface Company {
  id: string
  name: string
  operator_id?: string
  settings?: any
  created_at?: string
}

export interface InventoryRotation {
  id: string
  operator_id: string
  company_id: string
  facility_id: string
  facility?: string
  name: string
  default: boolean
  zones: string[]
  category: boolean
  kardex_sort: string
  first_rotation: string
  second_rotation: string
  created_at?: string
  updated_at?: string
}

export interface RotationCreateInput {
  company_id: string
  facility_id: string
  name: string
  default: boolean
  zones: string[]
  category: boolean
  kardex_sort: string
  first_rotation: string
  second_rotation: string
}

export interface RotationUpdateInput extends Partial<RotationCreateInput> {}

// --- V2 API specific types ---

export interface V2SortField {
  field: string
  order: number // 1 for asc, -1 for desc
}

export interface V2Config {
  page: number
  rows: number
  populate_data?: boolean
  sort_field?: V2SortField[]
}

export interface V2MatchMode {
  match_mode: string
  value: any
}

export interface RotationFilter {
  facility_id?: V2MatchMode
  name?: V2MatchMode
  [key: string]: any
}

export interface RotationListRequest {
  config: V2Config
  filter?: RotationFilter
}

export interface V2MetaData {
  total_records: number
  current_page: number
  total_pages: number
}

export interface RotationListResponse {
  data: InventoryRotation[]
  facilities?: Facility[]
  companies?: Company[]
  meta_data: V2MetaData
}

export interface ZoneListResponse {
  data: Zone[]
  meta_data?: V2MetaData
}
