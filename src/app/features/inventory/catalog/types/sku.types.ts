/**
 * SKU & Product v2 domain types.
 *
 * Maps 1:1 to the Go backend structs — aligned with edge-03 schema.
 *   src/api/v2/cat/product/product.types.go
 *   src/api/v2/cat/sku/sku.types.go
 */

import { CategoryRef } from './catalog.types'

// ============================================================
// Shared
// ============================================================

export interface Dimensions {
  l: number
  w: number
  h: number
  /** Custom key-value attributes stored in the same JSONB column */
  custom?: Record<string, any>
}

// ============================================================
// Product (cat_products)
// ============================================================

/**
 * Single product row returned by the backend.
 * "description" maps to cat_products.name.
 */
export interface Product {
  id: string
  company_id: string
  /** cat_products.name → displayed as "description" in the UI */
  name: string
  brand: string | null
  description?: string | null
  category?: string | null
  created_at: string
  /** Linked categories (id + name) */
  categories: CategoryRef[]
}

/**
 * Input for creating a product on its own (no SKU).
 * POST /v2/cat/product — used by the product workspace inside the SKU dialogs.
 */
export interface ProductStandaloneCreateInput {
  company_id: string
  name: string
  brand?: string | null
  description?: string | null
  /** Existing cat_categories ids of the same company */
  category_ids?: string[]
}

/**
 * Input for creating a product + SKU in one atomic operation.
 * POST /v2/cat/product/bulk-upsert — send as { items: [ProductCreateInput] }
 */
export interface ProductCreateInput {
  /** UUID of the company that owns this product */
  company_id: string
  /** Product title — maps to cat_products.name */
  description: string
  brand?: string | null
  /** Product description — maps to cat_products.description */
  product_description?: string | null
  /** Product category — maps to cat_products.category */
  category?: string | null
  /** SKU code — maps to cat_skus.sku_code */
  sku: string
  barcode?: string | null
  weight?: number
  dimensions?: Dimensions
  hs_code?: string | null
  retail_price?: number
  wholesale_price?: number
  /** cat_skus.cost — null when not reported */
  cost?: number | null
  explicit_volume?: number
  unit_factor?: number
  /** SKU name — maps to cat_skus.name (was variant_name) */
  variant_name?: string | null
  serial_control_mode?: string
}

/** Wraps the array expected by bulk-upsert */
export interface ProductBulkUpsertRequest {
  items: ProductCreateInput[]
}

/** Summary result from bulk-upsert */
export interface ProductBulkUpsertResult {
  total: number
  products_inserted: number
  products_skipped: number
  skus_inserted: number
  skus_skipped: number
}

/**
 * Summary result from POST /v2/cat/sku/bulk-upsert.
 * The endpoint upserts with ON CONFLICT (sku_code, company_id) DO NOTHING,
 * so a duplicate SKU comes back as `inserted: 0` / `skipped: 1` — NOT as an HTTP error.
 */
export interface SkuBulkUpsertResult {
  total: number
  inserted: number
  skipped: number
}

/**
 * Input for updating an existing product.
 * PUT /v2/cat/product/:id
 */
export interface ProductUpdateInput {
  /** cat_products.name — backend receives this as json:"description" */
  description: string
  brand?: string | null
  /** cat_products.description */
  product_description?: string | null
  /** cat_products.category (legacy free text) */
  category?: string | null
  /** Replaces the linked categories. Omit = no change, [] = unassign all */
  category_ids?: string[]
}

// ============================================================
// SKU (cat_skus) — edge-03 schema
// ============================================================

export interface Sku {
  id: string
  company_id: string
  product_id: string | null
  sku_code: string
  barcode: string | null
  weight: number
  dimensions: Dimensions | null
  is_active: boolean
  name: string | null
  description: string | null
  images: string[]
  hs_code: string | null
  retail_price: number
  wholesale_price: number
  /** cat_skus.cost — null when not reported */
  cost: number | null
  explicit_volume: number
  unit_factor: number
  serial_control_mode: string | null
}

/**
 * SKU row returned by POST /v2/cat/sku/list — the SKU plus its product fields.
 * Unlike the catalog list, this endpoint does not require the SKU to have stock.
 */
export interface SkuListItem extends Sku {
  product_name: string
  product_description: string
  product_brand: string
  product_category: string
  /** Total on-hand stock across FLOW/PICKING/REGULAR/REPOSITORY locations */
  available: number
}

/**
 * Input for creating a SKU directly (without product).
 * POST /v2/cat/sku/bulk-upsert
 */
export interface SkuCreateInput {
  company_id: string
  product_id?: string | null
  sku_code: string
  barcode?: string | null
  weight?: number
  dimensions?: Dimensions
  name?: string | null
  description?: string | null
  serial_control_mode?: string
  retail_price?: number
  wholesale_price?: number
  /** cat_skus.cost — null when not reported */
  cost?: number | null
  explicit_volume?: number
  hs_code?: string | null
  unit_factor?: number
}

/**
 * Input for updating an existing SKU's mutable fields.
 * PUT /v2/cat/sku/:id
 */
export interface SkuUpdateInput {
  barcode?: string | null
  weight?: number
  dimensions?: Dimensions | null
  name?: string | null
  description?: string | null
  is_active?: boolean
  serial_control_mode?: string
  retail_price?: number
  wholesale_price?: number
  /** cat_skus.cost — null when not reported */
  cost?: number | null
  explicit_volume?: number
  hs_code?: string | null
  unit_factor?: number
}

/**
 * Unified input for updating both cat_products and cat_skus in a single
 * transactional endpoint.
 * PUT /v2/cat/catalog/:skuId
 */
export interface CatalogUpdateInput {
  /** cat_products.name */
  product_name?: string | null
  brand?: string | null
  /** cat_products.description */
  product_description?: string | null
  /** cat_products.category */
  category?: string | null
  /** Re-points the SKU to another product of the same company */
  product_id?: string | null
  /** Clears the product link (wins over product_id) */
  unlink_product?: boolean
  barcode?: string | null
  weight?: number
  dimensions?: Dimensions | null
  hs_code?: string | null
  retail_price?: number
  wholesale_price?: number
  /** cat_skus.cost — null when not reported */
  cost?: number | null
  explicit_volume?: number
  unit_factor?: number
  /** cat_skus.name (was variant_name) */
  name?: string | null
  /** cat_skus.description */
  description?: string | null
  serial_control_mode?: string
}

/** Response from the unified catalog update endpoint. */
export interface CatalogUpdateResult {
  product_id: string | null
  sku_id: string
  message: string
}
