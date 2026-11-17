// ── Generic API Response ─────────────────────────────────────────────────────

/** * Unifica el éxito y el error en un solo tipo. 
 * Útil para servicios que devuelven un objeto consistente.
 */
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    meta_data?: MetaData;
    // Campos de error integrados
    code?: string;
    message?: string;
    errors?: ApiErrorDetail[];
}
// ── Warehouse / Facility Models ─────────────────────────────────────────────

export interface BaseFilter {
    match_mode?: string;
    value?: any;
}

export interface SortField {
    field: string;
    order: number;
}

export interface MetaData {
    page: number;
    rows: number;
    total_records: number;
}

export interface Coordinates {
    lat: number;
    lng: number;
}

export interface Address {
    city: string;
    street: string;
    zip_code: string;
    state_province: string;
    country_code: string;
    reference?: string;
    coordinates: Coordinates;
}

export interface ActivityPODSettings {
    is_verification_required: boolean;
    is_id_photo_required: boolean;
    is_signature_required: boolean;
    enable_id_validation: boolean;
    /** GPS location requirement. Renamed from is_ubication_required (backend contract aligned). */
    is_location_required: boolean;
}

export interface DefaultLocationSetting {
    enabled: boolean;
    id?: string;
    location_code?: string;
}

export interface FacilitySettings {
    auto_blocked_expired: boolean;
    auto_processing: boolean;
    include_batch_picking: boolean;

    delivery_pod_setting?: ActivityPODSettings;
    collect_pod_setting?: ActivityPODSettings;
    default_location?: DefaultLocationSetting;
}

// ── Error Handling ──────────────────────────────────────────────────────────

/** Estructura de error individual dentro del array de errores */
export interface ApiErrorDetail {
    field: string;
    rule: string;
    context?: Record<string, any>;
}

/** Respuesta de error estándar de la API */
export interface ApiErrorResponse {
    success: boolean;
    code: string;
    message: string;
    errors?: ApiErrorDetail[];
}

/** Dropdown option for the Xenvio connection select */
export interface OptionSelect {
    id: string;
    name: string;
    company?: string;
    /** Shown but not selectable (a connected location Xenvio did not list) */
    disabled?: boolean;
}

/** Representa la entidad principal del JSON (Warehouse/Facility) */
export interface Facility {
    id: string;
    code: string;
    name: string;
    operator_id: string;
    external_ref_id?: string;
    is_active: boolean;
    created_at: string | Date;
    address: Address;
    settings: FacilitySettings;
    sso_users: string[];
}

// ── DTOs & Filtering ────────────────────────────────────────────────────────

export interface FacilityFilter {
    name?: BaseFilter;
    code?: BaseFilter;
    operator_id?: BaseFilter;
    is_active?: BaseFilter;
    'address.city'?: BaseFilter;
    external_ref_id?: BaseFilter;
    id?: BaseFilter;
}

export interface FacilityDTO {
    filter?: FacilityFilter;
    config: {
        sort_field?: SortField[];
        page: number;
        rows: number;
        populate_data: boolean;
    };
}

/** Respuesta genérica para listas de almacenes */
export interface FacilityListResponse {
    data: Facility[];
    meta_data: MetaData;
}

// ── Helpers / UI Constants ──────────────────────────────────────────────────

export interface Column {
    field: string;
    header: string;
}

export const FACILITY_COLUMNS: Column[] = [
    { field: 'code', header: 'Code' },
    { field: 'name', header: 'Name' },
    { field: 'address.city', header: 'City' },
    { field: 'is_active', header: 'Status' },
    { field: 'created_at', header: 'Created At' },
];

// ── Xenvio Connection Types ──────────────────────────────────────────────────

/** GET v2/integration/providers/xenvio/fulfillment-locations */
export interface XenvioFulfillmentLocationsResponse {
    data: { id: number; name: string; company?: string }[];
}

/** A facility's Xenvio fulfillment location (core_facility_integrations) */
export interface XenvioFacility {
    facility_id: string;
    fulfillment_location_id: string;
    name: string;
    company?: string;
}

/** GET v2/integration/providers/xenvio/facilities */
export interface XenvioFacilitiesResponse {
    data: XenvioFacility[];
}
