/**
 * Location domain types — mirrors the v2 WMS API contracts.
 *
 * Entity types map 1:1 to the Go backend structs.
 * Filter/Request/Response types follow the core.MatchModel pattern.
 */

// ============================================================
// Core filter primitives (shared with other v2 modules)
// ============================================================

export interface MatchModel {
  match_mode: 'equals' | 'contains' | 'in' | 'lte' | 'gte'
  value: any
}

export interface ConfigFilter {
  page: number
  rows: number
  sort_field?: { field: string; order: number }[]
}

export interface MetaData {
  page: number
  rows: number
  total_records: number
}

// ============================================================
// Location
// ============================================================

export interface Location {
  id: string
  operator_id: string
  facility_id: string
  facility_name?: string
  content_kardex?: number
  content_skus?: number
  content_units?: number
  bin_qty?: number
  zone_id?: string
  location_code: string
  aisle?: string
  section?: string
  level?: string
  tags?: Record<string, any>
  travel_sequence: number
  is_active: boolean
  gx?: number
  gy?: number
  gw?: number
  gh?: number
  level_num?: number
  location_profile_id: string
  location_profile_code?: string
  operational_category_id: number
  operational_category_code?: string
  created_at: string
  created_by_id?: string
  updated_at?: string
  updated_by_id?: string
}

export interface LocationCreateInput {
  facility_id: string
  zone_id?: string
  location_code: string
  aisle?: string
  section?: string
  level?: string
  tags?: Record<string, any>
  travel_sequence: number
  location_profile_code: string
  operational_category_code: string
  gx?: number
  gy?: number
  gw?: number
  gh?: number
  level_num?: number
}

export interface LocationUpdateInput {
  zone_id?: string
  aisle?: string
  section?: string
  level?: string
  tags?: Record<string, any>
  travel_sequence?: number
  is_active?: boolean
  location_profile_code?: string
  operational_category_code?: string
  gx?: number
  gy?: number
  gw?: number
  gh?: number
  level_num?: number
}

export interface LocationFilter {
  id?: MatchModel
  operator_id?: MatchModel
  facility_id?: MatchModel
  zone_id?: MatchModel
  location_code?: MatchModel
  aisle?: MatchModel
  section?: MatchModel
  level?: MatchModel
  is_active?: MatchModel
  location_profile_id?: MatchModel
  operational_category_id?: MatchModel
  bin_qty?: MatchModel
  content?: MatchModel
}

export interface LocationListRequest {
  filter: LocationFilter
  config: ConfigFilter
}

export interface LocationListResponse {
  data: Location[]
  meta_data: MetaData
}

// ============================================================
// Location Profile
// ============================================================

export interface LocationProfile {
  id: string
  operator_id: string
  code: string
  name: string
  description?: string
  micro_priority: number
  cost_value: number
  max_skus?: number
  max_units?: number
  max_volume?: number
  max_weight?: number
  max_containers?: number
}

export interface LocationProfileCreateInput {
  operator_id: string
  code: string
  name: string
  description?: string
  micro_priority: number
  cost_value: number
  max_skus?: number
  max_units?: number
  max_volume?: number
  max_weight?: number
  max_containers?: number
}

export interface LocationProfileFilter {
  id?: MatchModel
  operator_id?: MatchModel
  code?: MatchModel
  name?: MatchModel
}

export interface LocationProfileListRequest {
  filter: LocationProfileFilter
  config: ConfigFilter
}

export interface LocationProfileListResponse {
  data: LocationProfile[]
  meta_data: MetaData
}

// ============================================================
// Location Generator
// ============================================================

export interface LocationGenerateInput {
  facility_id: string
  zone_id?: string
  location_profile_code: string
  operational_category_code: string
  aisle: string
  section_start: number
  section_end: number
  bay_start: number
  bay_end: number
  level_start: string
  level_end: string
}

export interface LocationGenerateResponse {
  created: number
}

// ============================================================
// Zone
// ============================================================

export interface Zone {
  id: string
  operator_id: string
  facility_id: string
  name: string
  type?: string
  is_active: boolean
  gx?: number
  gy?: number
  gw?: number
  gh?: number
  created_at: string
  created_by_id?: string
  updated_at?: string
  updated_by_id?: string
}

export interface ZoneCreateInput {
  facility_id: string
  name: string
  type?: string
  gx?: number
  gy?: number
  gw?: number
  gh?: number
}

export interface ZoneFilter {
  id?: MatchModel
  operator_id?: MatchModel
  facility_id?: MatchModel
  name?: MatchModel
  type?: MatchModel
  is_active?: MatchModel
}

export interface ZoneListRequest {
  filter: ZoneFilter
  config: ConfigFilter
}

export interface ZoneListResponse {
  data: Zone[]
  meta_data: MetaData
}

// ============================================================
// Operational Category
// ============================================================

export interface OperationalCategory {
  id: number
  code: string
  description?: string
  macro_priority: number
  is_allocatable: boolean
  created_at: string
}

export interface OperationalCategoryFilter {
  id?: MatchModel
  code?: MatchModel
  is_allocatable?: MatchModel
}

export interface OperationalCategoryListRequest {
  filter: OperationalCategoryFilter
  config: ConfigFilter
}

export interface OperationalCategoryListResponse {
  data: OperationalCategory[]
  meta_data: MetaData
}

// ============================================================
// Facility (from core_facilities)
// ============================================================

export interface Facility {
  id: string
  operator_id: string
  name: string
  code?: string
  is_active: boolean
}

export interface FacilityFilter {
  id?: MatchModel
  operator_id?: MatchModel
  name?: MatchModel
  code?: MatchModel
  is_active?: MatchModel
}

export interface FacilityListRequest {
  filter: FacilityFilter
  config: ConfigFilter
}

export interface FacilityListResponse {
  data: Facility[]
  meta_data: MetaData
}

// ============================================================
// Container (Bin) Tree
// ============================================================

export interface ContainerTreeNode {
  id: string
  lpn_code: string
  type: string
  parent_id?: string
  container_profile_code?: string
  tags: string[]
  content_kardex: number
  content_skus: number
  content_units: number
  children: ContainerTreeNode[]
}

export interface ContainerCreateInput {
  facility_id: string
  location_code: string
  parent_id?: string
  lpn_code: string
  type: string
  container_profile_code?: string
  tags?: string[]
}

export interface ContainerUpdateInput {
  location_id?: string
  parent_id?: string
  type?: string
  container_profile_code?: string
  tags?: string[]
}

export interface Container {
  id: string
  operator_id: string
  facility_id: string
  location_id?: string
  parent_id?: string
  lpn_code: string
  type: string
  container_profile_id?: string
  created_at: string
}

export interface ContainerProfile {
  id: string
  operator_id: string
  code: string
  name: string
  description?: string
  max_skus?: number
  max_units?: number
  max_volume?: number
  max_weight?: number
}

export interface ContainerProfileListResponse {
  data: ContainerProfile[]
  metadata: MetaData
}

// ============================================================
// Layout
// ============================================================

export interface LayoutItem {
  id: string
  facility_id: string
  type: string
  gx: number
  gy: number
  gw: number
  gh: number
  metadata: any
  created_at: string
  updated_at: string
}

export interface LayoutItemInput {
  type: string
  gx: number
  gy: number
  gw: number
  gh: number
  metadata: any
}

export interface LayoutSyncInput {
  facility_id: string
  items: LayoutItemInput[]
}

export interface LayoutResponse {
  locations: Location[]
  zones: Zone[]
  layout_items: LayoutItem[]
}

// ============================================================
// Warehouse Planner — Bulk position update
// ============================================================

export interface LocationBatchPositionItem {
  id:        string
  gx:        number
  gy:        number
  gw:        number
  gh:        number
  level_num: number
}

export interface LocationBatchPositionResponse {
  updated: number
}

// ============================================================
// Container — Batch Create (Bin Planner)
// ============================================================

export interface BatchContainerItem {
  lpn_code: string
  type: string
  tags?: string[]
}

export interface BatchCreateContainerInput {
  facility_id: string
  location_code: string
  containers: BatchContainerItem[]
}

export interface BatchCreateContainerError {
  lpn_code: string
  code: string
  message: string
}

export interface BatchCreateContainerResponse {
  created: number
  errors: BatchCreateContainerError[]
}

// ============================================================
// Bin Layout (visual grid persistence)
// ============================================================

export interface BinLayout {
  id: string
  operator_id: string
  facility_id: string
  location_id: string
  layout: any
  created_at: string
  updated_at: string
}

export interface BinLayoutSaveInput {
  facility_id: string
  location_id: string
  layout: any
}
