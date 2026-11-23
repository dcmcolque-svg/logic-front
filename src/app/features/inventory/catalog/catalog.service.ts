import { inject, Injectable, signal } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { map, Observable } from 'rxjs'
import { environment } from '@/environments/environment'
import { commonCurrency, CostingSettings, enteredAmountDigits } from '@/app/shared/utils/costing.util'
import {
  CatalogListRequest,
  CatalogListResponse,
  Category,
  CategoryCreateInput,
  CategoryListRequest,
  CategoryListResponse,
  CategoryUpdateInput,
  CompanyListRequest,
  CompanyListResponse,
  ProductListItem,
  ProductListRequest,
  ProductListResponse,
} from './types/catalog.types'
import {
  Product,
  ProductBulkUpsertRequest,
  ProductBulkUpsertResult,
  ProductStandaloneCreateInput,
  ProductUpdateInput,
  Sku,
  SkuCreateInput,
  SkuUpdateInput,
  CatalogUpdateInput,
  CatalogUpdateResult,
  SkuBulkUpsertResult,
  SkuListItem,
} from './types/sku.types'

/**
 * CatalogService — Angular HttpClient service for v2 catalog endpoints.
 *
 * Base paths:
 *   {URL_API}v2/cat/catalog   — aggregated inventory view
 *   {URL_API}v2/cat/product   — product CRUD
 *   {URL_API}v2/cat/category  — category CRUD (global per company, N:M with products)
 *   {URL_API}v2/cat/sku       — SKU CRUD + image upload
 *   {URL_API}v2/company       — company filter dropdown
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient)

  private readonly catalogUrl  = environment.URL_API + 'v2/cat/catalog'
  private readonly productUrl  = environment.URL_API + 'v2/cat/product'
  private readonly categoryUrl = environment.URL_API + 'v2/cat/category'
  private readonly skuUrl      = environment.URL_API + 'v2/cat/sku'
  private readonly companyUrl  = environment.URL_API + 'v2/company'

  /**
   * DecimalPipe digitsInfo for catalog cost / prices: shows what was typed,
   * capped by the facilities' currency (CLP → no decimals, BOB/USD → up to 2).
   * Catalog is per company and currency per facility, so it uses the
   * currency all of the user's facilities share; mixed → up to 2.
   */
  readonly moneyDigits = signal(enteredAmountDigits(null))
  private moneyDigitsLoaded = false

  /** Loads moneyDigits once per session from POST /v2/facility/my. */
  loadMoneyDigits(): void {
    if (this.moneyDigitsLoaded) return
    this.moneyDigitsLoaded = true
    this.http
      .post<{ data: Array<{ settings?: { costing?: CostingSettings } }> }>(`${environment.URL_API}v2/facility/my`, {
        filter: {},
        config: { page: 1, rows: 500, populate_data: false },
      })
      .subscribe({
        next: res => this.moneyDigits.set(enteredAmountDigits(commonCurrency((res.data ?? []).map(f => f.settings?.costing)))),
        error: () => (this.moneyDigitsLoaded = false),
      })
  }

  // ── Catalog (aggregated view) ─────────────────────────────

  listCatalog(req: CatalogListRequest): Observable<CatalogListResponse> {
    return this.http.post<CatalogListResponse>(`${this.catalogUrl}/list`, req)
  }

  /**
   * Updates both cat_products and cat_skus atomically in a single transaction.
   * PUT /v2/cat/catalog/:skuId
   */
  updateCatalogItem(skuId: string, input: CatalogUpdateInput): Observable<CatalogUpdateResult> {
    return this.http.put<CatalogUpdateResult>(`${this.catalogUrl}/${skuId}`, input)
  }

  // ── Product ───────────────────────────────────────────────

  /**
   * Creates a product + SKU atomically via bulk-upsert.
   * Send a single-element array for the create-SKU dialog flow.
   */
  createProduct(req: ProductBulkUpsertRequest): Observable<ProductBulkUpsertResult> {
    return this.http.post<ProductBulkUpsertResult>(
      `${this.productUrl}/bulk-upsert`,
      req,
    )
  }

  /**
   * Creates a product without a SKU (the SKU links to it afterwards by product_id).
   * POST /v2/cat/product — 409 PRODUCT_ALREADY_EXISTS when (name, company) is taken.
   */
  createProductOnly(input: ProductStandaloneCreateInput): Observable<Product> {
    return this.http.post<Product>(this.productUrl, input)
  }

  getProductById(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.productUrl}/${id}`)
  }

  /** Looks up one product in the enriched list shape (company_name, sku_count, categories). */
  getProductListItemById(id: string): Observable<ProductListItem | null> {
    return this.listProducts({
      filter: { id: { match_mode: 'equals', value: id } },
      config: { page: 1, rows: 1 },
    }).pipe(map(res => res.data?.[0] ?? null))
  }

  updateProduct(id: string, input: ProductUpdateInput): Observable<Product> {
    return this.http.put<Product>(`${this.productUrl}/${id}`, input)
  }

  /** Lists products with sku_count and company_name (enriched view for Products tab). */
  listProducts(req: ProductListRequest): Observable<ProductListResponse> {
    return this.http.post<ProductListResponse>(`${this.productUrl}/list`, req)
  }

  /**
   * Creates SKUs directly via the SKU bulk-upsert endpoint.
   * POST /v2/cat/sku/bulk-upsert
   * Product is optional (product_id can be null for standalone SKUs).
   */
  createSkusForProduct(items: SkuCreateInput[]): Observable<SkuBulkUpsertResult> {
    return this.http.post<SkuBulkUpsertResult>(`${this.skuUrl}/bulk-upsert`, { items })
  }

  /**
   * Checks whether a SKU code is already taken inside a company.
   * SKU codes are unique per company (unique index on cat_skus (sku_code, company_id)),
   * and the column is `citext`, so the `equals` match is case-insensitive — same as the DB.
   * The catalog list reads straight from cat_skus (stock is a LEFT JOIN), so SKUs
   * without stock are found too.
   */
  skuCodeExists(skuCode: string, companyId: string): Observable<boolean> {
    return this.listCatalog({
      filter: {
        sku: { match_mode: 'equals', value: skuCode },
        company_id: { match_mode: 'equals', value: companyId },
      },
      config: { page: 1, rows: 1 },
    }).pipe(map(res => (res.data?.length ?? 0) > 0))
  }

  // ── SKU ───────────────────────────────────────────────────

  getSkuById(id: string): Observable<Sku> {
    return this.http.get<Sku>(`${this.skuUrl}/${id}`)
  }

  /**
   * Looks up one SKU together with its product fields (name, category).
   * POST /v2/cat/sku/list reads straight from cat_skus, so — unlike the
   * catalog view — a SKU that has never had stock is returned too.
   */
  getSkuListItemById(skuId: string): Observable<SkuListItem | null> {
    return this.http
      .post<{ data: SkuListItem[] }>(`${this.skuUrl}/list`, {
        filter: { id: { match_mode: 'equals', value: skuId } },
        config: { page: 1, rows: 1 },
      })
      .pipe(map(res => res.data?.[0] ?? null))
  }

  updateSku(id: string, input: SkuUpdateInput): Observable<Sku> {
    return this.http.put<Sku>(`${this.skuUrl}/${id}`, input)
  }

  /**
   * Uploads an image for an existing SKU.
   * Requires the sku UUID (sku_id) and the company UUID (company_id).
   */
  uploadSkuImage(skuId: string, companyId: string, file: File): Observable<any> {
    const form = new FormData()
    form.append('file', file)
    form.append('sku_id', skuId)
    form.append('company_id', companyId)
    return this.http.post<any>(`${this.skuUrl}/image/upload`, form)
  }

  /**
   * Deletes a specific image from a SKU.
   * DELETE /v2/cat/sku/image/delete
   */
  deleteSkuImage(skuId: string, url: string): Observable<any> {
    return this.http.delete<any>(`${this.skuUrl}/image/delete`, {
      body: { sku_id: skuId, url },
    })
  }

  /**
   * Sets a specific image as the primary (index 0) for a SKU.
   * PATCH /v2/cat/sku/image/set-primary
   */
  setSkuImagePrimary(skuId: string, url: string): Observable<any> {
    return this.http.patch<any>(`${this.skuUrl}/image/set-primary`, {
      sku_id: skuId,
      url,
    })
  }

  /**
   * Returns distinct custom attribute key names.
   * GET /v2/cat/sku/attribute-keys[?company_id=...]
   */
  getAttributeKeys(companyId?: string): Observable<string[]> {
    const params: Record<string, string> = {}
    if (companyId) params['company_id'] = companyId
    return this.http.get<string[]>(`${this.skuUrl}/attribute-keys`, { params })
  }

  // ── Categories ────────────────────────────────────────────

  listCategories(req: CategoryListRequest): Observable<CategoryListResponse> {
    return this.http.post<CategoryListResponse>(`${this.categoryUrl}/list`, req)
  }

  /** POST /v2/cat/category — 409 CATEGORY_ALREADY_EXISTS when the name is taken in the company. */
  createCategory(input: CategoryCreateInput): Observable<Category> {
    return this.http.post<Category>(this.categoryUrl, input)
  }

  updateCategory(id: string, input: CategoryUpdateInput): Observable<Category> {
    return this.http.put<Category>(`${this.categoryUrl}/${id}`, input)
  }

  /** DELETE /v2/cat/category/:id — 409 CATEGORY_IN_USE while products are still assigned. */
  deleteCategory(id: string): Observable<void> {
    return this.http.delete<void>(`${this.categoryUrl}/${id}`)
  }

  // ── Companies (filter dropdown) ───────────────────────────

  listCompanies(req: CompanyListRequest): Observable<CompanyListResponse> {
    return this.http.post<CompanyListResponse>(`${this.companyUrl}/list`, req)
  }
}
