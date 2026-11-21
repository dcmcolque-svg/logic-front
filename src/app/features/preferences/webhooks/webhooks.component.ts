import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
  Signal,
  untracked,
  ViewChild,
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { CommonModule, TitleCasePipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { startWith } from 'rxjs'
import { ConfirmationService, MenuItem } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { TagModule } from 'primeng/tag'
import { MultiSelectModule } from 'primeng/multiselect'
import { Menu, MenuModule } from 'primeng/menu'
import { SelectModule } from 'primeng/select'
import { SkeletonModule } from 'primeng/skeleton'
import { Table, TableLazyLoadEvent, TableModule } from 'primeng/table'
import { InputTextModule } from 'primeng/inputtext'
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { ToastModule } from 'primeng/toast'
import { TooltipModule } from 'primeng/tooltip'
import { DatePickerModule } from 'primeng/datepicker'
import { ChipModule } from 'primeng/chip'

import { TranslateLanService } from '../../../core/services/translate-lan.service'
import { DateTimeSeparatePipe } from '../../../shared/pipes/datetime-separate.pipe'
import { WebhookService } from './webhooks.service'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { NO_FACILITY_ID } from '@/app/core/types/facility.types'
import { isFacilityColumn, scopeApiFilter } from '@/app/shared/utils/facility-scope.util'
import { WebhookFormDialogComponent } from './webhook-form.component'
import { WebhookLogsDialogComponent } from './webhook-logs.component'
import { WebhookScopeChooserComponent } from './webhook-scope-chooser.component'
import { FilterInputComponent } from '../../../shared/components/filter-input/filter-input.component'
import { FilterMultiselectComponent } from '../../../shared/components/filter-multiselect/filter-multiselect.component'
import { FilterApplyService } from '../../../shared/components/filter-clear/filter-apply.service'
import { TableStateService } from '../../../shared/services/table-state.service'
import { FilterMultiselectPanelComponent } from '../../../shared/components/filter-multiselect-panel/filter-multiselect-panel.component'
import { FilterTextInputComponent } from '../../../shared/components/filter-text-input/filter-text-input.component'
import {
  Webhook,
  WebhookFilter,
  WebhookFilterDto,
  WebhookResp,
  Facility,
  WebhookScope,
} from './webhooks.types'

interface Column {
  field: string
  header: string
  sortable?: boolean
  sortField?: string  // backend field name for sorting when it differs from display field
}

const ALL_COLUMNS: Column[] = [
  { field: 'scope',        header: 'labels.scope' },
  { field: 'facility',     header: 'labels.facility',    sortable: true,  sortField: 'facility_id'  },
  { field: 'endpoint_url', header: 'labels.endpoint_url', sortable: true },
  { field: 'description',  header: 'labels.description', sortable: true },
  { field: 'api_version',  header: 'labels.api_version', sortable: true },
  { field: 'events',       header: 'labels.events' },
  { field: 'created_at',   header: 'labels.created_at' },
  { field: 'status',       header: 'labels.status',      sortable: true },
]

@Component({
  selector: 'app-webhooks',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    TagModule,
    ConfirmDialogModule,
    TitleCasePipe,
    DateTimeSeparatePipe,
    MultiSelectModule,
    MenuModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    InputTextModule,
    ToastModule,
    TooltipModule,
    FilterInputComponent,
    FilterMultiselectComponent,
    FilterMultiselectPanelComponent,
    FilterTextInputComponent,
    DatePickerModule,
    ChipModule,
  ],
  providers: [DialogService, ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .scope-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
    }
    .scope-operator {
      background: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
    }
    .scope-facility {
      background: rgba(34, 197, 94, 0.1);
      color: #16a34a;
    }
  `],
  template: `
    <p-confirmDialog
      acceptButtonStyleClass="p-button-text"
      rejectButtonStyleClass="p-button-text"
    />
    <p-menu #menuitem [popup]="true" appendTo="body" [model]="menuItems" />
    <p-toast />

    <!-- ── Page Header ── -->
    @if (!embedded()) {
      <div class="flex items-center w-full mb-4">
        <div class="flex gap-2 items-center ml-auto">
          <p-button
            icon="pi pi-plus"
            [label]="'preferences.webhook.new_webhook' | translate"
            (click)="openScopeChooser()"
            size="small"
          />
          <p-button
            severity="secondary"
            [outlined]="true"
            icon="pi pi-filter-slash"
            [pTooltip]="'buttons.clear' | translate"
            tooltipPosition="top"
            size="small"
            (click)="clearFilters(dt)"
          />
        </div>
      </div>
    }


    <!-- ── Filter chips (top right) ── -->
    @if (webhookFilterChips.length > 0) {
      <div class="flex flex-wrap justify-end items-center gap-2 mb-3">
        <i class="pi pi-filter text-surface-500"></i>
        @for (chip of webhookFilterChips; track chip.field) {
          <p-chip
            [label]="chip.label + ': ' + chip.displayValue"
            [removable]="true"
            (onRemove)="removeWebhookFilterChip(chip.field)"
            styleClass="font-medium bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-0 text-sm"
          />
        }
      </div>
    }

    <!-- ── Table ── -->
    <div class="card bg-surface-0 dark:bg-surface-900 border-round-xl shadow-1 p-0">

      <p-table
        #dt
        [value]="columnsSelect.length > 0 ? webhookResp().data : []"
        dataKey="id"
        [paginator]="true"
        [rows]="webhookFilterDto().config.rows"
        [loading]="loading()"
        [rowHover]="true"
        [showCurrentPageReport]="true"
        [showPageLinks]="columnsSelect.length > 0"
        currentPageReportTemplate="{{ 'labels.showing_items' | translate }}"
        [rowsPerPageOptions]="columnsSelect.length > 0 ? [15, 30, 50, 100] : []"
        styleClass="p-datatable-sm"
        [lazy]="true"
        [totalRecords]="columnsSelect.length > 0 ? webhookResp().meta_data.total_records : 0"
        [sortMode]="'single'"
        [customSort]="true"
        [scrollable]="true"
        [columns]="renderedColumns()"
        paginatorPosition="bottom"
        (onSort)="onSortOrder($event)"
        (onLazyLoad)="getDataPaged($event)"
        scrollHeight="68vh"
      >
        <ng-template pTemplate="header" let-columns>
          <!-- Header row -->
          <tr>
            @if (columnsSelect.length > 0) {
              <th style="width: 3.5rem; text-align: center" class="bg-surface-50 dark:bg-surface-950"></th>
            }
            @for (col of columns; track col.field) {
              <th
                [pSortableColumn]="col.sortable ? (col.sortField ?? col.field) : null"
                class="bg-surface-50 dark:bg-surface-950 font-semibold text-muted-color"
              >
                <div class="flex justify-between items-center gap-1">
                  <span>{{ col.header | translate }}</span>
                  @if (col.sortable) { <p-sortIcon [field]="col.sortField ?? col.field" /> }
                </div>
              </th>
            }
          </tr>

          <!-- Filter row -->
          <tr>
            @if (columnsSelect.length > 0) {
              <th class="bg-surface-50 dark:bg-surface-950"></th>
            }
            @for (col of columns; track col.field) {
              <th class="bg-surface-50 dark:bg-surface-950 p-1">
                @switch (col.field) {
                  @case ('scope') {
                    <p-select
                      [(ngModel)]="filterScope"
                      (ngModelChange)="applyWebhookFilters()"
                      [options]="scopeOptions()"
                      optionLabel="label"
                      optionValue="value"
                      [placeholder]="'labels.scope' | translate"
                      [showClear]="true"
                      appendTo="body"
                      styleClass="w-full"
                    />
                  }
                  @case ('facility') {
                    <nuvex-filter-multiselect-panel
                      [options]="facilityFilterOptions()"
                      optionLabel="name"
                      optionValue="id"
                      [placeholder]="'labels.facility' | translate"
                      [showFilter]="scopedFacilities().length > 5"
                      [value]="filterFacilityIds"
                      (apply)="onWebhookFacilityApply($event)"
                      (clear)="onWebhookFacilityClear()"
                    />
                  }
                  @case ('endpoint_url') {
                    <nuvex-filter-text-input
                      [value]="filterEndpointUrl"
                      [placeholder]="'labels.endpoint_url' | translate"
                      (applyWithMode)="onWebhookTextApply('filterEndpointUrl', $event)"
                    />
                  }
                  @case ('description') {
                    <nuvex-filter-text-input
                      [value]="filterDescription"
                      [placeholder]="'labels.description' | translate"
                      (applyWithMode)="onWebhookTextApply('filterDescription', $event)"
                    />
                  }
                  @case ('api_version') {
                    <nuvex-filter-text-input
                      [value]="filterApiVersion"
                      [placeholder]="'labels.api_version' | translate"
                      (applyWithMode)="onWebhookTextApply('filterApiVersion', $event)"
                    />
                  }
                  @case ('status') {
                    <p-select
                      [(ngModel)]="filterStatus"
                      (ngModelChange)="applyWebhookFilters()"
                      [options]="statusOptions()"
                      optionLabel="label"
                      optionValue="value"
                      [placeholder]="'labels.status' | translate"
                      [showClear]="true"
                      appendTo="body"
                      styleClass="w-full"
                    />
                  }
                }
              </th>
            }
          </tr>
        </ng-template>

        <!-- ── Body ── -->
        <ng-template pTemplate="body" let-row let-columns="columns">
          @if (!loading()) {
            <tr class="transition-colors">
              <!-- Action button -->
              @if (columnsSelect.length > 0) {
                <td style="width: 3.5rem; text-align: center">
                  <p-button
                    icon="pi pi-ellipsis-v"
                    [text]="true"
                    [rounded]="true"
                    size="small"
                    severity="secondary"
                    (click)="onRowMenuClick($event, row, menuitem)"
                  />
                </td>
              }

              @for (col of columns; track col.field) {
                <td>
                  @switch (col.field) {
                    @case ('scope') {
                      @if (row.facility_id) {
                        <span class="scope-badge scope-facility">
                          <i class="pi pi-building" style="font-size: 0.7rem"></i>
                          {{ 'preferences.webhook.scope_facility_title' | translate }}
                        </span>
                      } @else {
                        <span class="scope-badge scope-operator">
                          <i class="pi pi-key" style="font-size: 0.7rem"></i>
                          {{ 'preferences.webhook.scope_operator_title' | translate }}
                        </span>
                      }
                    }
                    @case ('facility') {
                      <span class="text-sm">{{ getFacilityName(row.facility_id) }}</span>
                    }
                    @case ('endpoint_url') {
                      <span class="text-sm font-mono">{{ row.endpoint_url }}</span>
                    }
                    @case ('description') {
                      <span class="text-sm">{{ row.description || '—' }}</span>
                    }
                    @case ('api_version') {
                      <span class="font-bold">{{ row.api_version }}</span>
                    }
                    @case ('events') {
                      <div class="flex flex-wrap gap-1">
                        @for (event of row.subscribed_events; track event) {
                          <p-tag [value]="event | translate" severity="info" />
                        }
                      </div>
                    }
                    @case ('created_at') {
                      <div class="text-surface-400 text-sm">
                        <i class="pi pi-calendar text-surface-600 mr-1"></i>
                        {{ row.created_at | dateTimeSeparate }}
                      </div>
                    }
                    @case ('status') {
                      <p-tag
                        [value]="getStatusLabel(row.status)"
                        [severity]="getStatusSeverity(row.status)"
                        [rounded]="true"
                      />
                    }
                    @default {
                      <span class="text-sm">{{ row[col.field] ?? '—' }}</span>
                    }
                  }
                </td>
              }
            </tr>
          }
        </ng-template>

        <!-- ── Paginator left: column toggle ── -->
        <ng-template pTemplate="paginatorleft">
          <div class="flex items-center gap-2">
            <p-multiSelect
              #webhookMs
              [options]="translatedColumnDefs"
              [ngModel]="columnsSelect"
              (onChange)="onColSelectChange($event, webhookMs)"
              optionLabel="translatedHeader"
              [placeholder]="'labels.choose_columns' | translate"
              [selectedItemsLabel]="columnsSelect.length + ' ' + ('labels.columns_selected' | translate)"
              [maxSelectedLabels]="0"
              size="small"
              appendTo="body"
            >
              <ng-template let-col pTemplate="item">{{ col.translatedHeader }}</ng-template>
            </p-multiSelect>
          </div>
        </ng-template>

        <!-- ── Empty ── -->
        <ng-template pTemplate="emptymessage">
          <tr>
            <td [attr.colspan]="columnsSelect.length + 1" class="text-center py-8">
              @if (columnsSelect.length === 0) {
                <div class="flex flex-col items-center gap-2">
                  <i class="pi pi-table text-4xl text-surface-400"></i>
                  <span class="text-surface-500">{{ 'messages.no_columns_selected' | translate }}</span>
                </div>
              } @else {
                <div class="flex flex-col items-center gap-3 py-6 text-surface-400">
                  <i class="pi pi-link text-3xl"></i>
                  <span>{{ 'labels.no_webhooks_found' | translate }}</span>
                </div>
              }
            </td>
          </tr>
        </ng-template>

        <!-- ── Loading skeleton ── -->
        <ng-template pTemplate="loadingbody">
          @for (_ of skeletonRows; track $index) {
            <tr>
              @for (__ of skeletonCols; track $index) {
                <td><p-skeleton height="1.8rem" width="90%" borderRadius="6px" /></td>
              }
            </tr>
          }
        </ng-template>
      </p-table>
    </div>
  `,
})
export default class WebhooksComponent implements OnInit {
  @ViewChild('dt') table!: Table

  /** When true, hides the page-level header (h5 + clear button).
   * Used when this component is embedded inside the Integrations tabs. */
  embedded = input(false)
  requestOAuthTab = output<void>()

  private readonly webhookService = inject(WebhookService)
  private readonly facilityScope = inject(FacilityScopeService)
  /** Last observed global scope; null until the effect's first run. */
  private lastScope: { ids: string; single: boolean } | null = null
  private readonly translate = inject(TranslateService)
  private readonly translateLanService = inject(TranslateLanService)
  private readonly dialogService = inject(DialogService)
  private readonly confirmationService = inject(ConfirmationService)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly filterservice = inject(FilterApplyService)
  private readonly tableState = inject(TableStateService)
  private readonly STATE_KEY = 'logic:webhooks'

  dialogRef: DynamicDialogRef | null = null
  selectedWebhook: Webhook | undefined
  menuItems: MenuItem[] = []
  skeletonRows = new Array(10).fill(null)
  skeletonCols = new Array(9).fill(null)

  allColumns: Column[] = [...ALL_COLUMNS]
  columnsSelect: Column[] = [...ALL_COLUMNS]
  translatedColumnDefs: (Column & { translatedHeader: string })[] = []

  /** Memo for renderedColumns(), so p-table gets a stable array between checks. */
  private renderedMemo: { from: Column[]; single: boolean; cols: Column[] } | null = null

  private _skipFirstLazyLoad = true

  private readonly langChange = toSignal(
    this.translate.onLangChange.pipe(startWith(null)),
    { initialValue: null }
  )

  statusOptions = computed(() => {
    this.langChange()
    return [
      { label: this.translate.instant('labels.active'),   value: 'ACTIVE'   },
      { label: this.translate.instant('labels.inactive'), value: 'INACTIVE' },
    ]
  })

  scopeOptions = computed(() => {
    this.langChange()
    return [
      { label: this.translate.instant('labels.operator'), value: 'operator' },
      { label: this.translate.instant('labels.facility'), value: 'facility' },
    ]
  })

  // ── Manual filter state (survives pagination & sort) ──────────────────
  filterEndpointUrl  = ''
  filterDescription  = ''
  filterApiVersion   = ''
  filterScope: string | null = null
  filterStatus: string | null = null
  filterFacilityIds: string[] = []    // facility_id MatchModel with match_mode:'in'
  // Sentinel for the "No facility" filter option (operator-level webhooks).
  // Converted to null before sending to the backend, which reads it as IS NULL.
  private readonly NULL_FACILITY_ID = NO_FACILITY_ID
  private manualFilters: WebhookFilter = {}

  // ── State ─────────────────────────────────────────────────────────────
  loading = signal(true)

  webhookFilterDto = signal<WebhookFilterDto>({
    config: { populate_data: true, page: 1, rows: 15, sort_field: [] },
    filter: {} as WebhookFilter,
  })

  webhookResp = signal<WebhookResp>({
    facilities: [],
    data: [],
    meta_data: { page: 0, rows: 0, total_records: 0 },
  })

  // ── Computed ──────────────────────────────────────────────────────────
  /** Full list — the webhook dialog needs it to target any facility. */
  facilities: Signal<Facility[]> = computed(
    () => this.webhookResp().facilities ?? []
  )

  /**
   * Options for the facility column filter, bounded by the global topbar scope
   * so the local filter can only refine it. Falls back to the full list until
   * the scope has loaded.
   */
  scopedFacilities: Signal<Facility[]> = computed(() =>
    this.facilityScope.loaded() ? (this.facilityScope.inScope() as Facility[]) : this.facilities()
  )

  /**
   * The facility column filter: "No facility" first, then the facilities in
   * scope. Like any facility, "No facility" is only offered while the topbar
   * scope includes it.
   */
  facilityFilterOptions: Signal<Facility[]> = computed(() => {
    this.translateLanService.changeLanguage()
    if (!this.facilityScope.includesNoFacility()) return this.scopedFacilities()
    const noFacility = {
      id: this.NULL_FACILITY_ID,
      name: this.translate.instant('labels.no_facility_option'),
    } as Facility
    return [noFacility, ...this.scopedFacilities()]
  })

  availableEvents = computed(() => this.webhookResp().events)

  constructor() {
    effect(() => this.translate.use(this.translateLanService.changeLanguage()))

    // Restore persisted state BEFORE the data-loading effect so the first
    // API call already uses saved filters, page and sort (single request).
    const saved = this.tableState.load(this.STATE_KEY)
    if (saved?.filters && Object.keys(saved.filters).length > 0) {
      this.manualFilters = saved.filters as WebhookFilter
      const f = saved.filters
      this.filterEndpointUrl = (f['endpoint_url'] as any)?.value ?? ''
      this.filterDescription = (f['description'] as any)?.value ?? ''
      this.filterApiVersion  = (f['api_version']  as any)?.value ?? ''
      this.filterScope  = f['scope']  ? String((f['scope']  as any)?.value ?? f['scope'])  : null
      this.filterStatus = f['status'] ? String((f['status'] as any)?.value ?? f['status']) : null
      this.filterFacilityIds = (f['facility_id']  as any)?.value ?? []
    }
    this.webhookFilterDto.set({
      config: {
        populate_data: true,
        page:       saved?.page ?? 1,
        rows:       15,
        sort_field: saved?.sort
          ? [{ field: saved.sort.field, order: saved.sort.order === 'asc' ? 1 : -1 }]
          : [],
      },
      filter: this.manualFilters,
    })

    effect(() => {
      this.webhookFilterDto()
      untracked(() => this.initData())
    })

    // Global facility scope. Kept as its own effect so the write below cannot
    // re-trigger the one above, which reads the dto.
    // Whether the column hides is tracked too, but only a change in the
    // ticked ids sends a different request.
    effect(() => {
      const ids = this.facilityScope.selectedIds().join(',')
      const single = this.facilityScope.isSingleWithoutNulls()
      const last = this.lastScope
      this.lastScope = { ids, single }
      if (last === null || last.ids === ids) {
        // First run (the first load already ran) or only the column moved:
        // only a facility filter the now-hidden column would carry invisibly
        // is worth another load.
        if (!single || this.filterFacilityIds.length === 0) return
      }
      untracked(() => {
        // Drop the local facility filter: it may now point outside the scope,
        // and leaving it would survive invisibly once the scope is released.
        this.filterFacilityIds = []
        delete (this.manualFilters as Record<string, unknown>)['facility_id']
        this.webhookFilterDto.update((d) => ({
          ...d,
          config: { ...d.config, page: 1 },
          filter: this.manualFilters,
        }))
      })
    })
  }

  ngOnInit(): void {
    this.translate.get(this.allColumns.map((c) => c.header)).subscribe(() => {
      this.buildTranslatedColumns()
    })
    this.translate.onLangChange.subscribe(() => this.buildTranslatedColumns())
  }

  /**
   * Columns actually rendered: the user's own choice, minus the facility column
   * when the global scope covers a single facility — every row would repeat it.
   * Same rule base-data-table applies with `nullableFacility`; this view renders
   * a raw p-table, and operator-level webhooks have no facility.
   */
  renderedColumns(): Column[] {
    const single = this.facilityScope.isSingleWithoutNulls()
    const memo = this.renderedMemo
    if (memo && memo.from === this.columnsSelect && memo.single === single) return memo.cols
    const cols = single
      ? this.columnsSelect.filter((c) => !isFacilityColumn(c))
      : this.columnsSelect
    this.renderedMemo = { from: this.columnsSelect, single, cols }
    return cols
  }

  private buildTranslatedColumns(): void {
    this.translatedColumnDefs = this.allColumns.map((col) => ({
      ...col,
      translatedHeader: this.translate.instant(col.header),
    }))
    this.columnsSelect = this.translatedColumnDefs.filter((def) =>
      this.columnsSelect.some((s) => s.field === def.field)
    )
  }

  onColSelectChange(event: { value: Column[] }, ms: { hide: () => void }): void {
    const prevFields = new Set(this.columnsSelect.map((c) => c.field))
    this.columnsSelect = this.translatedColumnDefs.filter((def) =>
      event.value.some((c) => c.field === def.field)
    )
    const newFields = new Set(this. columnsSelect.map(c => c.field))
    const removedFields = [...prevFields].filter(f => !newFields.has(f))
    if (removedFields.length > 0) this.clearFiltersForHiddenColumns(removedFields)
    if (event.value.length === 0 || event.value.length === this.translatedColumnDefs.length) {
      ms.hide()
    }
  }

  /** Clears webhook filter properties for columns that were just hidden by the user. */
  private clearFiltersForHiddenColumns(removedFields: string[]): void {
    let changed = false
    for (const field of removedFields) {
      if (this.clearFilterForField(field)) changed = true
    }
    if (changed) {
      this.applyWebhookFilters()
    }
  }

  /** Resets the filter bound to the given column field. Returns true if a non-empty filter was cleared. */
  private clearFilterForField(field: string): boolean {
    switch (field) {
      case 'endpoint_url':
        if (!this.filterEndpointUrl) return false
        this.filterEndpointUrl = ''
        return true
      case 'description':
        if (!this.filterDescription) return false
        this.filterDescription = ''
        return true
      case 'api_version':
        if (!this.filterApiVersion) return false
        this.filterApiVersion = ''
        return true
      case 'scope':
        if (!this.filterScope) return false
        this.filterScope = null
        return true
      case 'status':
        if (!this.filterStatus) return false
        this.filterStatus = null
        return true
      case 'facility':
        if (!this.filterFacilityIds?.length) return false
        this.filterFacilityIds = []
        return true
      default:
        return false
    }
  }

  // ── Table events ──────────────────────────────────────────────────────

  getDataPaged(event: TableLazyLoadEvent): void {
    if (this._skipFirstLazyLoad) {
      this._skipFirstLazyLoad = false
      return
    }

    this.webhookFilterDto.set({
      config: {
        populate_data: false,
        page: (event.first || 0) / Number(event.rows) + 1,
        rows: Number(event.rows),
        sort_field: event.sortField
          ? [{ field: String(event.sortField), order: event.sortOrder === 1 ? 1 : -1 }]
          : [],
      },
      filter: this.manualFilters,
    })
    this.saveState()
  }

  /** Called by nuvex-filter-multiselect-panel (apply) for the facility column filter. */
  onWebhookFacilityApply(ids: string[]): void {
    this.filterFacilityIds = ids ?? []
    this.applyWebhookFilters()
  }

  /** Called by nuvex-filter-multiselect-panel (clear) for the facility column filter. */
  onWebhookFacilityClear(): void {
    this.filterFacilityIds = []
    this.applyWebhookFilters()
  }

  /**
   * Called by nuvex-filter-text-input (applyWithMode) for text column filters.
   * Updates the corresponding local filter property and re-applies all filters.
   */
  onWebhookTextApply(
    prop: 'filterEndpointUrl' | 'filterDescription' | 'filterApiVersion',
    event: { value: string; matchMode: string } | null
  ): void {
    this[prop] = event?.value?.trim() ?? ''
    this.applyWebhookFilters()
  }

  applyWebhookFilters(): void {
    const filter: WebhookFilter = {}
    // MatchModel fields
    if (this.filterEndpointUrl.trim())
      filter['endpoint_url'] = { value: this.filterEndpointUrl.trim(), match_mode: 'contains' }
    if (this.filterDescription.trim())
      filter['description']  = { value: this.filterDescription.trim(), match_mode: 'contains' }
    if (this.filterApiVersion.trim())
      filter['api_version']  = { value: this.filterApiVersion.trim(),  match_mode: 'contains' }
    if (this.filterFacilityIds?.length)
      filter['facility_id']  = { value: this.filterFacilityIds, match_mode: 'in' }
    // scope/status: plain string (p-select single value)
    if (this.filterScope)  filter['scope']  = this.filterScope  as any
    if (this.filterStatus) filter['status'] = { value: this.filterStatus, match_mode: 'equals' }

    this.manualFilters = filter
    this.webhookFilterDto.update((d) => ({
      ...d,
      config: { ...d.config, page: 1 },
      filter,
    }))
    this.saveState()
  }

  get webhookFilterChips(): { field: string; label: string; displayValue: string }[] {
    const chips: { field: string; label: string; displayValue: string }[] = []
    const f = this.manualFilters
    const t = (key: string) => this.translate.instant(key)
    if (f['endpoint_url'])
      chips.push({ field: 'endpoint_url', label: t('labels.endpoint_url'), displayValue: f['endpoint_url'].value })
    if (f['description'])
      chips.push({ field: 'description',  label: t('labels.description'),  displayValue: f['description'].value })
    if (f['api_version'])
      chips.push({ field: 'api_version',  label: t('labels.api_version'),  displayValue: f['api_version'].value })
    if (f['scope']) {
      const val = String(f['scope'])
      chips.push({ field: 'scope',  label: t('labels.scope'),  displayValue: this.scopeOptions().find(o => o.value === val)?.label ?? val })
    }
    if (f['status']) {
      const val = String((f['status'] as any)?.value ?? f['status'])
      chips.push({ field: 'status', label: t('labels.status'), displayValue: this.statusOptions().find(o => o.value === val)?.label ?? val })
    }
    if (f['facility_id']) {
      const ids: string[] = Array.isArray(f['facility_id'].value) ? f['facility_id'].value : [f['facility_id'].value]
      const names = ids.map((id: string) => {
        if (id === this.NULL_FACILITY_ID) return t('labels.no_facility_option')
        const found = this.facilities().find((fa) => fa.id === id)
        return found ? (found.name ?? found.code ?? id) : id
      }).join(', ')
      chips.push({ field: 'facility_id', label: t('labels.facility'), displayValue: names })
    }
    return chips
  }

  removeWebhookFilterChip(field: string): void {
    switch (field) {
      case 'endpoint_url': this.filterEndpointUrl = ''; break
      case 'description':  this.filterDescription = ''; break
      case 'api_version':  this.filterApiVersion  = ''; break
      case 'scope':        this.filterScope  = null; break
      case 'status':       this.filterStatus = null; break
      case 'facility_id':  this.filterFacilityIds = []; break
    }
    const f = { ...this.manualFilters }
    delete f[field]
    this.manualFilters = f
    this.webhookFilterDto.update((d) => ({
      ...d,
      config: { ...d.config, page: 1 },
      filter: f,
    }))
    this.saveState()
  }

  onSortOrder(event: any): void {
    if (event.field) {
      this.webhookFilterDto.update((d) => ({
        ...d,
        config: {
          ...d.config,
          sort_field: [{ field: event.field, order: event.order === 1 ? 1 : -1 }],
        },
      }))
      this.saveState()
    }
  }

  clearFilters(table: Table): void {
    table.clear()
    this.filterEndpointUrl  = ''
    this.filterDescription  = ''
    this.filterApiVersion   = ''
    this.filterScope        = null
    this.filterStatus       = null
    this.filterFacilityIds  = []
    this.manualFilters = {}
    this.tableState.clear(this.STATE_KEY)
    this.webhookFilterDto.set({
      config: { populate_data: true, page: 1, rows: 15, sort_field: [] },
      filter: {} as WebhookFilter,
    })
  }

  private saveState(): void {
    const cfg = this.webhookFilterDto().config
    const sf  = cfg.sort_field?.[0]
    this.tableState.save(this.STATE_KEY, {
      filters: this.manualFilters as Record<string, unknown>,
      page:    cfg.page,
      sort:    sf ? { field: sf.field, order: sf.order === 1 ? 'asc' : 'desc' } : undefined,
    })
  }

  /** Public alias callable from a parent component (no table ref needed). */
  clearAllFilters(): void {
    if (this.table) this.clearFilters(this.table)
  }

  // ── Data loading ──────────────────────────────────────────────────────

  initData(): void {
    this.loading.set(true)
    this.webhookResp.update((r) => ({ ...r, data: [] }))
    const dto = this.webhookFilterDto()
    this.webhookService
      .postListFilterWebhooks({
        ...dto,
        // Operator-level webhooks (facility_id NULL) stay in the list only
        // while the topbar includes "No facility".
        filter: scopeApiFilter(this.toApiFilter(dto.filter ?? {}), this.facilityScope.apiValue()),
      })
      .subscribe({
      next: (data) => {
        // Preserve facilities & events from the initial populate_data:true
        // response when subsequent requests (sort/paginate) omit them.
        const prev = this.webhookResp()
        this.webhookResp.set({
          ...data,
          facilities: data.facilities?.length ? data.facilities : prev.facilities,
          events: data.events ?? prev.events,
        })
        this.loading.set(false)
        this.cdr.markForCheck()
      },
      error: () => {
        this.loading.set(false)
        this.cdr.markForCheck()
      },
    })
  }

  /** The "No facility" sentinel becomes the null the backend reads as IS NULL. */
  private toApiFilter(filter: WebhookFilter): WebhookFilter {
    const local = filter['facility_id']
    if (!Array.isArray(local?.value)) return filter
    return {
      ...filter,
      facility_id: {
        ...local,
        value: local.value.map((v: string) => (v === this.NULL_FACILITY_ID ? null : v)),
      },
    }
  }

  // ── Row actions ───────────────────────────────────────────────────────

  onRowMenuClick(event: Event, webhook: Webhook, menu: Menu): void {
    this.selectedWebhook = webhook
    this.menuItems = [
      {
        label: this.translate.instant('buttons.edit'),
        icon: 'pi pi-pencil',
        command: () => this.openForm(webhook),
      },
      {
        label: this.translate.instant('buttons.view_logs'),
        icon: 'pi pi-history',
        command: () => this.showLogsDialog(webhook),
      },
      {
        label: webhook.status === 'ACTIVE'
          ? this.translate.instant('buttons.deactivate')
          : this.translate.instant('buttons.activate'),
        icon: webhook.status === 'ACTIVE' ? 'pi pi-pause' : 'pi pi-play',
        command: () => this.toggleStatus(webhook),
      },
      {
        separator: true,
      },
      {
        label: this.translate.instant('buttons.delete'),
        icon: 'pi pi-trash',
        styleClass: 'text-red-500',
        command: () => this.confirmDelete(webhook),
      },
    ]
    menu.toggle(event)
  }

  // ── Dialogs ───────────────────────────────────────────────────────────

  openScopeChooser(): void {
    this.dialogRef = this.dialogService.open(WebhookScopeChooserComponent, {
      header: this.translate.instant('preferences.webhook.new_webhook'),
      width: '480px',
      closable: true,
      contentStyle: { overflow: 'visible' },
      baseZIndex: 10000,
    })
    this.dialogRef?.onClose.subscribe((scope: WebhookScope | undefined) => {
      if (scope) {
        setTimeout(() => this.openForm(undefined, scope), 0)
      }
    })
  }

  openForm(webhook?: Webhook, scope?: WebhookScope): void {
    const resolvedScope: WebhookScope = scope ?? (webhook?.facility_id ? 'facility' : 'operator')

    this.translate
      .get(
        webhook
          ? 'preferences.webhook.title_edit_dialog'
          : 'preferences.webhook.title_create_dialog'
      )
      .subscribe((title) => {
        this.dialogRef = this.dialogService.open(WebhookFormDialogComponent, {
          header: title,
          width: '42rem',
          baseZIndex: 10000,
          data: {
            webhook,
            scope: resolvedScope,
            facilities: this.facilities(),
            events: this.availableEvents(),
          },
        })
        this.dialogRef?.onClose.subscribe((result) => {
          if (result === 'go_to_oauth') {
            this.requestOAuthTab.emit()
          } else if (result) {
            this.initData()
          }
        })
      })
  }

  showLogsDialog(webhook: Webhook): void {
    this.translate.get('preferences.webhook.logs_title').subscribe((title) => {
      this.dialogRef = this.dialogService.open(WebhookLogsDialogComponent, {
        header: title,
        width: '50rem',
        height: '100vh',
        closable: true,
        data: { webhookId: webhook.id },
      })
    })
  }

  // ── Actions ───────────────────────────────────────────────────────────

  toggleStatus(webhook: Webhook): void {
    const action = webhook.status === 'ACTIVE' ? 'deactivate' : 'activate'
    const serviceCall =
      webhook.status === 'ACTIVE'
        ? this.webhookService.patchDeactivateWebhook(webhook.id)
        : this.webhookService.patchActivateWebhook(webhook.id)

    this.translate
      .get([
        `preferences.webhook.confirm_${action}`,
        `preferences.webhook.${action}_message`,
      ])
      .subscribe((t) => {
        this.confirmationService.confirm({
          message: t[`preferences.webhook.${action}_message`],
          header: t[`preferences.webhook.confirm_${action}`],
          icon: 'pi pi-info-circle',
          accept: () => {
            this.loading.set(true)
            this.webhookResp.update((r) => ({ ...r, data: [] }))
            serviceCall.subscribe(() => this.initData())
          },
        })
      })
  }

  confirmDelete(webhook: Webhook): void {
    this.translate
      .get([
        'preferences.webhook.confirm_delete',
        'preferences.webhook.delete_message',
      ])
      .subscribe((t) => {
        this.confirmationService.confirm({
          message: t['preferences.webhook.delete_message'],
          header: t['preferences.webhook.confirm_delete'],
          icon: 'pi pi-exclamation-triangle',
          accept: () => {
            this.loading.set(true)
            this.webhookResp.update((r) => ({ ...r, data: [] }))
            this.webhookService
              .deleteWebhook(webhook.id)
              .subscribe(() => this.initData())
          },
        })
      })
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  getFacilityName(facilityId: string | undefined): string {
    if (!facilityId) return '—'
    const found = this.facilities().find((f) => f.id === facilityId)
    return found?.name || found?.code || facilityId
  }

  getStatusLabel(status: string): string {
    return this.statusOptions().find(o => o.value === status)?.label ?? status
  }

  getStatusSeverity(status: string): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
    switch (status?.toUpperCase()) {
      case 'ACTIVE': return 'success'
      case 'INACTIVE': return 'danger'
      default: return 'secondary'
    }
  }
}
