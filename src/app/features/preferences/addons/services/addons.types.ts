export interface FilterConfig {
  page: number;
  rows: number;
  sort_field: { field: string; order: number }[];
}

export interface FilterPayload<T = any> {
  filter: T;
  config: FilterConfig;
}

export interface MetaData {
  page: number;
  rows: number;
  total_records: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta_data: MetaData;
}

export interface AddonApplicationApiConfig {
  api_base_path: string;
  api_check: string;
  api_header: string[];
}

export interface AddonApplicationDto {
  id: string;
  name: string;
  description: string;
  icon_url: string;
  is_active: boolean;
  api_config: AddonApplicationApiConfig;
}

export interface AddonConfigSettings {
  check_connection?: boolean;
}

export interface AddonConfigDto {
  id?: string;
  application_id: string;
  company_id: string;
  name: string;
  endpoint_url: string;
  auth_token: string;
  contact_email: string;
  is_active: boolean;
  settings?: AddonConfigSettings;
  // Optional relations
  company_name?: string; // Sometimes APIs return the resolved name
}

// For UI convenience to merge the two lists
export interface AddonApplicationWithConfig extends AddonApplicationDto {
  config?: AddonConfigDto;
}
