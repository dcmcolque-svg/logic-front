/**
 * Catalog domain types — mirrors the v2 cat/catalog API contracts.
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
// Catalog Item (aggregated view)
// ============================================================

export interface CatalogItem {
  company_id: string
  company_name: string
  product_id: string | null
  sku_id: string
  image_path: string | null
  sku: string
  barcode: string | null
  description: string
  brand: string | null
  weight: number
  dimensions: { l: number; w: number; h: number; custom?: Record<string, any> } | null

  // Product detail fields (null when product_id is null)
  category: string | null
  product_description: string | null

  // SKU extended fields
  hs_code: string | null
  retail_price: number
  wholesale_price: number
  /** cat_skus.cost — null when not reported */
  cost: number | null
  explicit_volume: number
  unit_factor: number
  /** cat_skus.name — was variant_name */
  name: string | null
  serial_control_mode: string
  /** cat_skus.description */
  sku_description: string | null

  available: number
  asign: number
  blocked: number
  hurt: number
  reserved: number
  in_transit: number
  back_order: number
}

// ============================================================
// Catalog Filter
// ============================================================

export interface CatalogFilter {
  [key: string]: MatchModel | undefined
  company_id?: MatchModel
  company_name?: MatchModel
  product_id?: MatchModel
  sku?: MatchModel
  barcode?: MatchModel
  description?: MatchModel
  available?: MatchModel
  asign?: MatchModel
  blocked?: MatchModel
  hurt?: MatchModel
  reserved?: MatchModel
  in_transit?: MatchModel
  back_order?: MatchModel
  cost?: MatchModel
  retail_price?: MatchModel
  wholesale_price?: MatchModel
}

// ============================================================
// Catalog Request / Response
// ============================================================

export interface CatalogListRequest {
  filter: CatalogFilter
  config: ConfigFilter
}

export interface CatalogListResponse {
  data: CatalogItem[]
  meta_data: MetaData
}

// ============================================================
// Company (for filter dropdowns — from core_companies)
// ============================================================

export interface Company {
  id: string
  name: string
}

export interface CompanyFilter {
  id?: MatchModel
  name?: MatchModel
}

export interface CompanyListRequest {
  filter: CompanyFilter
  config: ConfigFilter
}

export interface CompanyListResponse {
  data: Company[]
  meta_data: MetaData
}

// ============================================================
// Product List Item (enriched view for Products tab)
// ============================================================

/** Enriched product returned by POST /v2/cat/product/list */
export interface ProductListItem {
  id: string
  company_id: string
  company_name: string
  name: string
  brand: string | null
  description: string | null
  /** Display string: linked category names joined by ", " (legacy cat_products.category as fallback) */
  category: string | null
  /** Linked cat_categories rows (N:M via cat_product_categories) */
  categories: CategoryRef[]
  sku_count: number
  created_at: string
}

export interface ProductFilter {
  [key: string]: MatchModel | undefined
  id?: MatchModel
  company_id?: MatchModel
  company_name?: MatchModel
  name?: MatchModel
  brand?: MatchModel
  category?: MatchModel
  /** Products linked to a category id (equals) or ids (in) */
  category_id?: MatchModel
  /** OR search across name, brand, description */
  search?: MatchModel
}

export interface ProductListRequest {
  filter: ProductFilter
  config: ConfigFilter
}

export interface ProductListResponse {
  data: ProductListItem[]
  meta_data: MetaData
}

// ============================================================
// Category (cat_categories — global per company, N:M with products)
// ============================================================

/** Minimal category projection carried by products */
export interface CategoryRef {
  id: string
  name: string
}

export interface Category {
  id: string
  operator_id: string
  company_id: string
  parent_id: string | null
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

/** Category row returned by POST /v2/cat/category/list */
export interface CategoryListItem extends Category {
  /** Number of products assigned — deletion is blocked while > 0 */
  product_count: number
}

export interface CategoryCreateInput {
  company_id: string
  name: string
  description?: string | null
  parent_id?: string | null
}

export interface CategoryUpdateInput {
  name?: string
  description?: string | null
  /** "" clears the parent */
  parent_id?: string | null
}

export interface CategoryFilter {
  [key: string]: MatchModel | undefined
  id?: MatchModel
  company_id?: MatchModel
  parent_id?: MatchModel
  name?: MatchModel
  /** OR search across name and description */
  search?: MatchModel
}

export interface CategoryListRequest {
  filter: CategoryFilter
  config: ConfigFilter
}

export interface CategoryListResponse {
  data: CategoryListItem[]
  meta_data: MetaData
}
