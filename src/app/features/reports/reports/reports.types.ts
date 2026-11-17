// ── Reports Feature Types ──────────────────────────────────────────────────

export interface ReportScheduleConfig {
  enabled: boolean;
  recipients: string[];
  frequency: string;
  time?: string;
  file_type?: string;
  email_subject?: string;
  email_body?: string;
}

export interface Report {
  id: string;
  name: string;
  description?: string;
  report_type: string;
  category_report?: string;
  company_id?: string;
  color?: string;
  icon?: string;
  fields?: FieldStructure[];
  schedule_config: ReportScheduleConfig;
  is_active?: boolean;
}

// ── Field structure (server-defined filter/export columns) ─────────────────

export interface FieldParameter {
  name: string;
  value: unknown;
}

export interface FieldStructure {
  label: string;
  selected: boolean;
  operator?: string;
  value?: unknown;
  order?: number;
  type_field: 'NORMAL' | 'COUNT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | '';
  filter_enabled?: boolean;
  parameter?: FieldParameter;
}

// ── Dialog data payload ────────────────────────────────────────────────────

export interface ReportDialogData {
  action: 'create' | 'edit';
  title: string;
  reportData: Report;
  reportStructure: ReportStructure;
  file_type: string[];
  report_frequency: string[];
  fields: FieldStructure[];
  facilities?: { id: string; code: string; name: string }[] | null;
  operator?: unknown;
}


export interface ReportStructure {
  file_type: string[];
  report_frequency: string[];
  facilities?: { id: string; code: string; name: string }[] | null;
  [key: string]: unknown;
}

// ── Filter DTO (matches backend shape) ────────────────────────────────────

export interface SortField {
  field: string;
  order: 1 | -1;
}

export interface ReportFilterConfig {
  populate_data: boolean;
  page: number;
  rows: number;
  sort_field: SortField[];
}

export interface ReportBaseFilter {
  company_id?:  { value: unknown; match_mode: string };
  status?:      { value: string | string[] | null; match_mode: string };
  report_type?: { value: string | string[] | null; match_mode: string };
  generated_at?: { value: string | null; match_mode: string };
  [key: string]: { value: unknown; match_mode: string } | undefined;
}

export interface ReportFilterDTO {
  config: ReportFilterConfig;
  filter: ReportBaseFilter;
}

// ── Generated report history entry ────────────────────────────────────────

export interface GeneratedReport {
  id: string;
  report_name: string;
  template_name?: string;
  description?: string;
  report_description?: string;
  report_type: string;
  status: string;
  generated_at: string;
  file_url?: string;
}

// ── Paginated API response ─────────────────────────────────────────────────

export interface ReportMetaData {
  page: number;
  rows: number;
  total_records: number;
}

export interface GeneratedReportListResponse {
  data: GeneratedReport[];
  status: string[];
  type_reports: string[];
  meta_data: ReportMetaData;
}

// ── Base reports API response ─────────────────────────────────────────────

export interface BaseReportsResponse {
  data: Report[];
  facilities: { id: string; code: string; name: string }[] | null;
  operator: {
    id: string;
    name: string;
    slug: string;
    settings: Record<string, unknown>;
    is_active: boolean;
    created_at: string;
  } | null;
  file_type: string[];
  report_frequency: string[];
}

// ── Generate report DTO (POST /v2/reports-template/generate) ──────────────
// Note: the generate endpoint uses `type_report` (not `report_type`).

export interface GenerateReportDTO {
  id: string;
  company_id?: string;
  fields: FieldStructure[];
  file_type: string;
  initial_date?: string;
  final_date?: string;
  type_report: string;
}

// ── Update report DTO (PUT /v2/reports-template/{id}) ─────────────────────
// id goes in the URL — NOT in the body.

export interface UpdateReportDTO {
  name: string;
  description?: string;
  company_id?: string;
  is_active?: boolean;
  fields?: FieldStructure[];
  schedule_config: ReportScheduleConfig;
}

// ── Report view mode ──────────────────────────────────────────────────────

export type ReportViewMode = 'STANDARD' | 'CUSTOM' | 'GENERATED';

export interface ReportMenuOption {
  label: string;   // i18n key suffix, e.g. 'standard_reports'
  value: ReportViewMode;
}

// ── Standard card category colors ─────────────────────────────────────────

export const CATEGORY_COLORS: Record<string, string> = {
  INBOUNDS:  '#36cf85',
  INVENTORY: '#3185f3',
  OUTBOUNDS: '#f9433c',
  PARCELS:   '#f0e224',
};

// ── Legacy ReportFilter (kept for ReportsService) ─────────────────────────

export interface ReportFilter {
  current_page: number;
  page_size: number;
  sort_field?: string;
  sort_order?: number;
  filters?: Record<string, unknown>;
}

export interface GeneratedReportResponse {
  data: Report[];
  total: number;
  current_page: number;
  page_size: number;
}
