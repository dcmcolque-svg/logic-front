// ── Generic filter / config types (reused from shared) ──────────────────────

export interface MatchModel {
    value: unknown;
    match_mode?: string;
}

export interface SortField {
    field: string;
    order: number;
}

export interface ConfigFilter {
    page: number;
    rows: number;
    sort_field?: SortField[];
}

// ── List: POST /v2/inventory/list ───────────────────────────────────────────

export interface InventoryListFilter {
    [key: string]: unknown;
    is_packaging?: MatchModel;
    sku?: MatchModel;
    barcode?: MatchModel;
    facility_id?: MatchModel;
    facility?: MatchModel;
    location?: MatchModel;
    quantity?: MatchModel;
    weight?: MatchModel;
    sku_description?: MatchModel;
    product_name?: MatchModel;
    company_id?: MatchModel;
    is_active?: MatchModel;
    container_profile_id?: MatchModel;
}

export interface InventoryListRequest {
    filter: InventoryListFilter;
    config: ConfigFilter;
    search?: MatchModel;
}

export interface PackagingListItem {
    kardex_id: string;
    sku_id: string;
    sku: string;
    sku_name: string;
    sku_description: string;
    barcode: string;
    quantity: number;
    weight: number;
    length: number;
    width: number;
    height: number;
    facility_id: string;
    facility: string;
    location_id: string;
    location: string;
    company_id: string;
    is_active: boolean;
    retail_price: number;
    wholesale_price: number;
    image: string[];
    container_profile_id?: string;
}

export interface PackagingListResponse {
    data: PackagingListItem[];
    total_records: number;
    page: number;
    rows: number;
}

// ── Create: POST /v2/cat/sku/packaging/intake ───────────────────────────────

export interface Dimensions {
    l: number;
    w: number;
    h: number;
}

export interface PackagingIntakeInput {
    sku_code: string;
    name?: string;
    description?: string;
    barcode?: string;
    weight: number;
    dimensions?: Dimensions;
    facility_id: string;
    qty: number;
    retail_price?: number;
    wholesale_price?: number;
    container_profile_id?: string;
}

export interface SkuModel {
    id: string;
    sku_code: string;
    name?: string;
    description?: string;
    barcode?: string;
    weight: number;
    dimensions?: Dimensions;
    company_id: string;
    is_active: boolean;
}

export interface PackagingIntakeResult {
    sku: SkuModel;
    sku_created: boolean;
    message: string;
    qty_on_hand?: number;
    location_id?: string;
}

// ── Update: PUT /v2/cat/sku/{id} ────────────────────────────────────────────

export interface SkuUpdateInput {
    name?: string;
    barcode?: string;
    weight?: number;
    dimensions?: Dimensions;
    description?: string;
    retail_price?: number;
    wholesale_price?: number;
    container_profile_id?: string;
}

// ── Column definition ───────────────────────────────────────────────────────

export interface Column {
    field: string;
    header: string;
}

// ── DTO helper ──────────────────────────────────────────────────────────────

export interface PackagingDTO {
    config: ConfigFilter;
    filter: InventoryListFilter;
    search?: MatchModel;
}

export const DEFAULT_PACKAGING_DTO: PackagingDTO = {
    config: { page: 1, rows: 15, sort_field: [] },
    filter: { is_packaging: { value: true, match_mode: 'equals' } },
};

// ── Container Profile (for Package Type column) ─────────────────────────────

export interface ContainerProfile {
    id: string;
    operator_id: string;
    code: string;
    name: string;
    container_type: string;
}

export interface ContainerProfileListResponse {
    data: ContainerProfile[];
    meta_data: {
        total_records: number;
        page: number;
        rows: number;
    };
}

// ── Recount: POST /v2/inventory/recount ─────────────────────────────────────

export interface RecountInput {
    kardex_id: string;
    qty: number;
    reason_code?: string;
}

export interface RecountResult {
    adjustment_id: string;
    kardex_id: string;
    qty_previous: number;
    qty_new: number;
    qty_delta: number;
}
