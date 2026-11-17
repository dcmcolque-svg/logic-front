import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  effect,
  inject,
  signal,
  untracked,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { FormsModule } from '@angular/forms';

import { TranslateLanService } from '../../../../core/services/translate-lan.service';
import { BaseDataTable } from '../../../../shared/components/datatable/data-table/base-data-table.component';
import { BaseStatusBadge } from '../../../../shared/components/status/status-badge/base-status-badge.component';
import { ShColumnDef, ShPaginationConfig, ShTableEvent } from '../../../../shared/types/table.types';
import { persistedConfigOverrides, pickColumns, removedColumnFields, translateColumnDefs } from '../../../shared/list-columns.util';
import { DateSeparatePipe } from '../../../../shared/pipes/date-separate.pipe';
import { TimeSeparatePipe } from '../../../../shared/pipes/time-separate.pipe';
import { ReportsService } from '../reports.service';
import {
  GeneratedReport as GeneratedReportDTO,
  GeneratedReportListResponse,
  ReportBaseFilter,
  ReportFilterDTO,
} from '../reports.types';
import { TableStateService } from '../../../../shared/services/table-state.service';

// ── Default filter DTO ─────────────────────────────────────────────────────

const DEFAULT_FILTER: ReportFilterDTO = {
  config: { populate_data: true, page: 1, rows: 15, sort_field: [] },
  filter: {},
};

@Component({
  selector: 'app-generated-report',
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    ButtonModule,
    ChipModule,
    MultiSelectModule,
    SelectModule,
    DatePickerModule,
    BaseDataTable,
    BaseStatusBadge,
    DateSeparatePipe,
    TimeSeparatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './generated-report.html',
  styleUrl: './generated-report.scss',
})
export default class GeneratedReport implements OnInit {

  // ── Services ───────────────────────────────────────────────────────────────
  private readonly svc             = inject(ReportsService);
  private readonly translate       = inject(TranslateService);
  private readonly translateLanSvc = inject(TranslateLanService);
  private readonly cdr             = inject(ChangeDetectorRef);
  private readonly destroyRef      = inject(DestroyRef);
  private readonly tableState      = inject(TableStateService);
  private readonly STATE_KEY       = 'binlogic:generated-reports';
  /** Resets the sort icon on Clear */
  @ViewChild(BaseDataTable) private readonly baseTable!: BaseDataTable;

  /** Monotonic counter to discard stale HTTP responses */
  private currentRequestId = 0;

  // ── State ──────────────────────────────────────────────────────────────────
  rows      = signal<GeneratedReportDTO[]>([]);
  loading   = signal(false);
  error     = signal<unknown>(null);
  filterDto = signal<ReportFilterDTO>({ ...DEFAULT_FILTER, config: { ...DEFAULT_FILTER.config } });

  pagination = signal<ShPaginationConfig>({
    page: 1, limit: 15, total: 0, rows_per_page: [15, 30, 50],
  });

  /** Raw arrays stored to allow rebuilding labels on language change */
  private rawStatusOptions: string[] = [];
  private rawTypeOptions:   string[] = [];

  /** Translated select options */
  statusSelectOptions = signal<{ label: string; value: string }[]>([]);
  typeSelectOptions   = signal<{ label: string; value: string }[]>([]);

  /** Currently selected filter values */
  selectedStatus = signal<string | null>(null);
  selectedType   = signal<string | null>(null);
  selectedDate   = signal<Date | null>(null);

  // ── Active filter chips ────────────────────────────────────────────────────
  activeFilters = signal<{ field: string; label: string; displayValue: string }[]>([]);
  protected activeRawFilters: Record<string, { value: unknown; matchMode?: string }> = {};

  private readonly fieldLabelMap: Record<string, string> = {
    status:       'labels.status',
    report_type:  'labels.type',
    generated_at: 'labels.generated_date',
  };

  // ── Column definitions ──────────────────────────────────────────────────────
  columnDefs: ShColumnDef[] = [
    { field: 'status',        header: 'labels.status',         width: '10rem', sortable: true,  filterable: true,  template: 'status',   mobileLabel: true },
    { field: 'template_name', header: 'labels.name',           width: '14rem', sortable: true,  filterable: false                                          },
    { field: 'description',   header: 'labels.description',    width: '18rem', sortable: false, filterable: false                                          },
    { field: 'report_type',   header: 'labels.type',           width: '10rem', sortable: true,  filterable: true,  template: 'type'                        },
    { field: 'generated_at',  header: 'labels.generated_date', width: '12rem', sortable: true,  filterable: true,  template: 'datetime'                    },
  ];

  selectedCols: ShColumnDef[] = this.columnDefs;
  translatedColumnDefs: (ShColumnDef & { translatedHeader: string })[] = [];

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  constructor() {
    effect(() => {
      this.translate.use(this.translateLanSvc.changeLanguage());
    });

    // Restore persisted state BEFORE the first effect run triggers loadData()
    this.restoreSavedState();

    effect(() => {
      this.filterDto();
      untracked(() => this.loadData());
    });
  }

  /** Restores persisted filters, sort and page from table state storage. */
  private restoreSavedState(): void {
    const saved = this.tableState.load(this.STATE_KEY);
    if (!saved?.filters || Object.keys(saved.filters).length === 0) return;

    this.activeRawFilters = saved.filters as Record<string, { value: unknown; matchMode?: string }>;
    // Restore filter select signals
    this.restoreFilterSelects();
    // Rebuild the DTO so the first load uses saved filters
    const filter: ReportBaseFilter = {};
    for (const [f, val] of Object.entries(this.activeRawFilters)) {
      if (val?.value !== null && val?.value !== undefined && val?.value !== '') {
        filter[f] = { value: val.value, match_mode: val.matchMode ?? 'equals' };
      }
    }
    this.filterDto.update(dto => ({
      ...dto,
      filter,
      config: {
        ...dto.config,
        ...persistedConfigOverrides(saved),
      },
    }));
    if (saved.page) this.pagination.update(p => ({ ...p, page: saved.page! }));
  }

  private restoreFilterSelects(): void {
    if (this.activeRawFilters['status']?.value)       this.selectedStatus.set(this.activeRawFilters['status'].value as string);
    if (this.activeRawFilters['report_type']?.value)  this.selectedType.set(this.activeRawFilters['report_type'].value as string);
    if (this.activeRawFilters['generated_at']?.value) this.selectedDate.set(new Date(this.activeRawFilters['generated_at'].value as string));
  }

  ngOnInit(): void {
    // Build filter chips now that translate service is ready
    if (Object.keys(this.activeRawFilters).length > 0) {
      this.buildFilterChips(this.activeRawFilters);
    }
    this.buildTranslatedColumns();
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.buildTranslatedColumns();
        this.buildSelectOptions();
      });
  }

  private saveState(): void {
    const cfg = this.filterDto().config;
    const sf  = cfg.sort_field?.[0];
    this.tableState.save(this.STATE_KEY, {
      filters: this.activeRawFilters as Record<string, unknown>,
      page:    cfg.page,
      sort:    sf ? { field: sf.field, order: sf.order === 1 ? 'asc' : 'desc' } : undefined,
    });
  }

  // ── Column helpers ─────────────────────────────────────────────────────────

  private buildTranslatedColumns(): void {
    this.translatedColumnDefs = translateColumnDefs(this.columnDefs, this.translate);
    this.selectedCols = pickColumns(this.translatedColumnDefs, this.selectedCols);
    this.cdr.markForCheck();
  }

  onColSelectChange(event: { value: ShColumnDef[] }, ms: { hide: () => void }): void {
    const previous = this.selectedCols
    this.selectedCols = pickColumns(this.translatedColumnDefs, event.value)
    const removedFields = removedColumnFields(previous, this.selectedCols)
    if (removedFields.length > 0) this.clearFiltersForHiddenColumns(removedFields)
    if (event.value.length === 0 || event.value.length === this.translatedColumnDefs.length) {
      ms.hide()
    }
  }

  /** Clears filter state for columns that were just hidden by the user. */
  private clearFiltersForHiddenColumns(removedFields: string[]): void {
    let changed = false
    for (const field of removedFields) {
      if (field in this.activeRawFilters) { delete this.activeRawFilters[field]; changed = true }
      if (field === 'status')       this.selectedStatus.set(null)
      if (field === 'report_type')  this.selectedType.set(null)
      if (field === 'generated_at') this.selectedDate.set(null)
    }
    if (!changed) return
    this.buildFilterChips(this.activeRawFilters)
    this.baseTable?.clearFiltersForFields(removedFields)
    const filter: ReportBaseFilter = {}
    for (const [f, val] of Object.entries(this.activeRawFilters)) {
      if (val?.value !== null && val?.value !== undefined && val?.value !== '') {
        filter[f] = { value: val.value, match_mode: val.matchMode ?? 'equals' }
      }
    }
    this.filterDto.update(dto => ({ ...dto, config: { ...dto.config, page: 1 }, filter }))
    this.saveState()
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  loadData(): void {
    this.loading.set(true);
    const requestId = ++this.currentRequestId;

    this.svc.getGeneratedReportList(this.filterDto()).subscribe({
      next: (resp: GeneratedReportListResponse) => {
        // Discard stale responses from previous requests
        if (requestId !== this.currentRequestId) return;

        this.rows.set(resp.data ?? []);

        // Store raw values so we can rebuild on language change
        this.rawStatusOptions = resp.status ?? [];
        this.rawTypeOptions   = resp.type_reports ?? [];
        this.buildSelectOptions();

        this.pagination.set({
          page:          resp.meta_data.page,
          limit:         resp.meta_data.rows,
          total:         resp.meta_data.total_records,
          rows_per_page: [15, 30, 50],
        });
        this.loading.set(false);
        this.error.set(null);
      },
      error: (err: unknown) => {
        if (requestId !== this.currentRequestId) return;
        this.error.set(err);
        this.loading.set(false);
      },
    });
  }

  // ── Custom filter helpers ──────────────────────────────────────────────────

  private buildSelectOptions(): void {
    this.statusSelectOptions.set(
      this.rawStatusOptions.map(s => ({
        label: this.translate.instant(`reports.status.${s}`),
        value: s,
      }))
    );
    this.typeSelectOptions.set(
      this.rawTypeOptions.map(t => ({
        label: this.translate.instant(`reports.types.${t}`),
        value: t,
      }))
    );
    this.cdr.markForCheck();
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  private formatTypeName(type: string): string {
    return type.split('_').map(w => this.capitalize(w)).join(' ');
  }

  applyCustomFilters(): void {
    const filter: ReportBaseFilter = {};
    this.activeRawFilters = {};

    if (this.selectedStatus()) {
      filter['status']                = { value: this.selectedStatus(), match_mode: 'equals' };
      this.activeRawFilters['status'] = { value: this.selectedStatus() };
    }
    if (this.selectedType()) {
      filter['report_type']                = { value: this.selectedType(), match_mode: 'equals' };
      this.activeRawFilters['report_type'] = { value: this.selectedType() };
    }
    if (this.selectedDate()) {
      const iso = (this.selectedDate() as Date).toISOString().split('T')[0];
      filter['generated_at']                = { value: iso, match_mode: 'date_equals' };
      this.activeRawFilters['generated_at'] = { value: iso };
    }

    this.buildFilterChips(this.activeRawFilters);
    this.filterDto.update(dto => ({
      ...dto,
      config: { ...dto.config, page: 1 },
      filter,
    }));
    this.saveState();
  }

  // ── Table state change (pagination & sort only) ────────────────────────────

  onTableStateChange(event: ShTableEvent): void {
    this.filterDto.update(dto => ({
      ...dto,
      config: {
        populate_data: true,
        page:       event.pagination.page,
        rows:       event.pagination.limit,
        sort_field: event.sort
          ? [{ field: event.sort.field, order: event.sort.order === 'asc' ? 1 : -1 }]
          : dto.config.sort_field,
      },
    }));
    this.saveState();
  }

  clearFilters(): void {
    this.tableState.clear(this.STATE_KEY);
    this.selectedStatus.set(null);
    this.selectedType.set(null);
    this.selectedDate.set(null);
    this.activeRawFilters = {};
    this.activeFilters.set([]);
    this.baseTable?.clearSort();
    this.filterDto.set({ ...DEFAULT_FILTER, config: { ...DEFAULT_FILTER.config } });
  }

  removeFilterChip(field: string): void {
    if (field === 'status')       this.selectedStatus.set(null);
    if (field === 'report_type')  this.selectedType.set(null);
    if (field === 'generated_at') this.selectedDate.set(null);

    delete this.activeRawFilters[field];
    this.buildFilterChips(this.activeRawFilters);

    const filter: ReportBaseFilter = {};
    for (const [f, val] of Object.entries(this.activeRawFilters)) {
      if (val?.value !== null && val?.value !== undefined && val?.value !== '') {
        filter[f] = { value: val.value, match_mode: val.matchMode ?? 'equals' };
      }
    }
    this.filterDto.update(dto => ({ ...dto, config: { ...dto.config, page: 1 }, filter }));
    this.saveState();
  }

  getActiveFilterValue(field: string): unknown {
    return this.activeRawFilters[field]?.value ?? null;
  }

  private buildFilterChips(filters: Record<string, { value: unknown; matchMode?: string }>): void {
    const chips = [];
    for (const field of Object.keys(filters)) {
      const f = filters[field];
      if (f?.value === null || f?.value === undefined || f?.value === '') continue;
      const labelKey = this.fieldLabelMap[field] ?? field;
      const label    = this.translate.instant(labelKey);
      const raw      = f.value as string;
      // Show translated value in chips
      let displayValue: string;
      if (field === 'status') {
        displayValue = this.translate.instant(`reports.status.${raw}`) || raw;
      } else if (field === 'report_type') {
        displayValue = this.translate.instant(`reports.types.${raw}`) || raw;
      } else {
        displayValue = Array.isArray(raw) ? (raw as unknown[]).join(', ') : String(raw);
      }
      chips.push({ field, label, displayValue });
    }
    this.activeFilters.set(chips);
  }
}
