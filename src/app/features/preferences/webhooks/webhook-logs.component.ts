import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { SkeletonModule } from 'primeng/skeleton'
import { TagModule } from 'primeng/tag'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'
import { PaginatorModule, PaginatorState } from 'primeng/paginator'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TooltipModule } from 'primeng/tooltip'
import { SelectModule } from 'primeng/select'
import { DatePickerModule } from 'primeng/datepicker'
import { DateTimeSeparatePipe } from '../../../shared/pipes/datetime-separate.pipe'
import { WebhookService } from './webhooks.service'
import {
  WebhookLogFilter,
  WebhookLogFilterDto,
  WebhookLogResp,
} from './webhooks.types'

@Component({
  selector: 'app-webhook-logs-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SkeletonModule,
    TagModule,
    PaginatorModule,
    TranslateModule,
    TooltipModule,
    SelectModule,
    DatePickerModule,
    DateTimeSeparatePipe,
  ],
  styles: [`
    .wl-wrap {
      min-width: 42rem;
      max-width: 56rem;
      font-family: inherit;
    }

    /* ── Toolbar ── */
    .wl-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: .75rem;
      align-items: flex-end;
      padding: .875rem 1rem;
      background: var(--surface-50);
      border: 1px solid var(--surface-200);
      border-radius: .625rem;
    }
    .wl-filter-group {
      display: flex;
      flex-direction: column;
      gap: .3rem;
    }
    .wl-filter-label {
      font-size: .7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: var(--text-color-secondary);
    }
    .wl-filter-row {
      display: flex;
      align-items: center;
      gap: .4rem;
    }

    /* ── Timeline ── */
    .wl-timeline {
      display: flex;
      flex-direction: column;
      gap: 0;
      padding-right: .25rem;
    }


    /* ── Log card ── */
    .wl-card {
      position: relative;
      border: 1px solid var(--surface-200);
      border-radius: .625rem;
      overflow: hidden;
      margin-bottom: .625rem;
      transition: box-shadow .15s ease, border-color .15s ease;
      background: var(--surface-card);
    }
    .wl-card:hover {
      border-color: var(--primary-200);
      box-shadow: 0 2px 12px rgba(0,0,0,.07);
    }
    .wl-card-accent {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 3px;
      border-radius: 3px 0 0 3px;
    }
    .accent-success { background: var(--green-500); }
    .accent-danger  { background: var(--red-500); }
    .accent-info    { background: var(--blue-400); }

    /* ── Card header ── */
    .wl-card-header {
      display: flex;
      align-items: center;
      gap: .75rem;
      padding: .7rem 1rem .7rem 1.25rem;
      cursor: pointer;
      user-select: none;
    }
    .wl-card-header:hover .wl-event-type { color: var(--primary-color); }

    .wl-status-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot-success { background: var(--green-500); box-shadow: 0 0 0 3px var(--green-100); }
    .dot-danger  { background: var(--red-500);   box-shadow: 0 0 0 3px var(--red-100);   }
    .dot-info    { background: var(--blue-400);  box-shadow: 0 0 0 3px var(--blue-100);  }

    .wl-event-type {
      font-size: .85rem;
      font-weight: 600;
      color: var(--text-color);
      transition: color .15s;
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .wl-meta {
      display: flex;
      align-items: center;
      gap: .75rem;
      flex-shrink: 0;
    }
    .wl-http-code {
      font-size: .75rem;
      font-weight: 700;
      padding: .1rem .45rem;
      border-radius: .3rem;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }
    .http-2xx { background: var(--green-100); color: var(--green-700); }
    .http-4xx { background: var(--orange-100); color: var(--orange-700); }
    .http-5xx { background: var(--red-100); color: var(--red-700); }
    .http-other { background: var(--surface-200); color: var(--text-color-secondary); }

    .wl-duration {
      font-size: .72rem;
      color: var(--text-color-secondary);
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }
    .wl-date {
      font-size: .72rem;
      color: var(--text-color-secondary);
    }
    .wl-chevron {
      color: var(--text-color-secondary);
      font-size: .75rem;
      transition: transform .2s ease;
      flex-shrink: 0;
    }
    .wl-chevron.open { transform: rotate(180deg); }

    /* ── Card body ── */
    .wl-card-body {
      border-top: 1px solid var(--surface-200);
      padding: .875rem 1rem .875rem 1.25rem;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: .875rem;
    }
    @media (max-width: 600px) {
      .wl-card-body { grid-template-columns: 1fr; }
    }

    .wl-payload-block { display: flex; flex-direction: column; gap: .35rem; }
    .wl-payload-label {
      font-size: .7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--text-color-secondary);
      display: flex;
      align-items: center;
      gap: .35rem;
    }
    .wl-payload-label i { font-size: .75rem; }

    .wl-code {
      margin: 0;
      padding: .625rem .75rem;
      background: var(--surface-100);
      border: 1px solid var(--surface-200);
      border-radius: .4rem;
      font-size: .72rem;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 14rem;
      overflow-y: auto;
      color: var(--text-color);
    }
    .wl-code::-webkit-scrollbar { width: 4px; }
    .wl-code::-webkit-scrollbar-thumb { background: var(--surface-300); border-radius: 2px; }

    /* ── Empty ── */
    .wl-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: .75rem;
      padding: 3rem 1rem;
      color: var(--text-color-secondary);
    }
    .wl-empty i { font-size: 2.5rem; opacity: .35; }
    .wl-empty span { font-size: .9rem; }

    /* ── Skeletons ── */
    .wl-skeleton-list { display: flex; flex-direction: column; gap: .625rem; }

    /* ── Paginator ── */
    .wl-paginator { margin-top: .5rem; }

    /* ── Columns alignment ── */
    .wl-col-duration {
      width: 5.5rem;
      text-align: center;
      display: inline-flex;
      justify-content: center;
      flex-shrink: 0;
    }
    .wl-col-date {
      width: 9.5rem;
      text-align: center;
      display: inline-flex;
      justify-content: center;
      flex-shrink: 0;
    }
    .wl-col-execution-status {
      width: 7.5rem;
      text-align: center;
      display: inline-flex;
      justify-content: center;
      flex-shrink: 0;
    }
    .wl-col-http-code {
      width: 4.5rem;
      text-align: center;
      display: inline-flex;
      justify-content: center;
      flex-shrink: 0;
    }
    .wl-col-chevron {
      width: 1.25rem;
      display: inline-flex;
      justify-content: center;
      flex-shrink: 0;
    }
  `],
  template: `
    <div class="wl-wrap p-3">
      <div class="flex flex-col gap-4">

        @if (loading()) {
          <!-- Skeleton -->
          <div class="wl-skeleton-list">
            @for (i of [1,2,3,4]; track i) {
              <p-skeleton height="3.25rem" borderRadius=".625rem" />
            }
          </div>

        } @else {

          <!-- Toolbar de filtros -->
          @if ((webhookLogResp().data ?? []).length > 0 || selectedDate || selectedStatus) {
            <div class="wl-toolbar">

              <div class="wl-filter-group">
                <span class="wl-filter-label">{{ 'labels.date' | translate }}</span>
                <div class="wl-filter-row">
                  <p-select
                    [options]="dateFilterModes"
                    [(ngModel)]="selectedDateFilterMode"
                    [placeholder]="'labels.filter' | translate"
                    optionLabel="label"
                    optionValue="value"
                    [style]="{'min-width':'7.5rem'}"
                  />
                  <p-datepicker
                    [(ngModel)]="selectedDate"
                    (onSelect)="applyDateFilter($event)"
                    appendTo="body"
                    [readonlyInput]="true"
                    [placeholder]="'labels.select_date' | translate"
                    dateFormat="yy-mm-dd"
                  />
                  @if (selectedDate) {
                    <p-button
                      icon="pi pi-times"
                      [text]="true"
                      severity="secondary"
                      size="small"
                      (click)="clearDateFilter()"
                      [pTooltip]="'labels.clear_filter' | translate"
                    />
                  }
                </div>
              </div>

              <div class="wl-filter-group">
                <span class="wl-filter-label">{{ 'labels.status' | translate }}</span>
                <div class="wl-filter-row">
                  <p-select
                    [options]="statusOptions"
                    [(ngModel)]="selectedStatus"
                    [placeholder]="'labels.select_state' | translate"
                    optionLabel="label"
                    optionValue="value"
                    [style]="{'min-width':'9rem'}"
                    (onChange)="applyStatusFilter()"
                  />
                  @if (selectedStatus) {
                    <p-button
                      icon="pi pi-times"
                      [text]="true"
                      severity="secondary"
                      size="small"
                      (click)="clearStatusFilter()"
                      [pTooltip]="'labels.clear_filter' | translate"
                    />
                  }
                </div>
              </div>

            </div>
          }

          <!-- Lista de logs -->
          @if ((webhookLogResp().data ?? []).length > 0) {

            <!-- Table Header -->
            <div class="wl-table-header font-bold text-xs uppercase text-surface-500 border-b border-surface-200 pb-2 mb-2 flex items-center gap-[.75rem] px-[1rem] pl-[1.25rem]">
              <span class="w-[8px] flex-shrink-0"></span> <!-- spacer for dot -->
              <span class="flex-1">{{ 'labels.event_type' | translate }}</span>
              <div class="wl-meta flex items-center gap-[.75rem] flex-shrink-0">
                <span class="wl-col-http-code">Code</span>
                <span class="wl-col-duration">{{ 'labels.duration' | translate }}</span>
                <span class="wl-col-date">{{ 'labels.date' | translate }}</span>
                <span class="wl-col-execution-status">{{ 'labels.execution_status' | translate }}</span>
                <span class="wl-col-chevron"></span> <!-- spacer for chevron -->
              </div>
            </div>

            <div class="wl-timeline">
              @for (log of webhookLogResp().data; track log.id ?? $index) {

                <div class="wl-card">
                  <!-- Barra de color lateral -->
                  <div class="wl-card-accent" [ngClass]="getAccentClass(log.execution_status)"></div>

                  <!-- Header clicable -->
                  <div class="wl-card-header" (click)="toggleLog(log.id)">

                    <!-- Dot de estado -->
                    <span class="wl-status-dot" [ngClass]="getDotClass(log.execution_status)"></span>

                    <!-- Tipo de evento -->
                    <span class="wl-event-type">{{ translateEventType(log.event_type) }}</span>

                    <!-- Meta derecha -->
                    <div class="wl-meta">

                      <!-- HTTP Status Code -->
                      <div class="wl-col-http-code">
                        @if (log.http_status_code) {
                          <span class="wl-http-code" [ngClass]="getHttpCodeClass(log.http_status_code)">
                            {{ log.http_status_code }}
                          </span>
                        } @else {
                          <span class="wl-duration">—</span>
                        }
                      </div>

                      <!-- Duración -->
                      <div class="wl-col-duration">
                        @if (log.duration_ms !== null && log.duration_ms !== undefined) {
                          <span class="wl-duration">{{ log.duration_ms }}ms</span>
                        } @else {
                          <span class="wl-duration">—</span>
                        }
                      </div>

                      <!-- Fecha -->
                      <div class="wl-col-date">
                        <span class="wl-date">{{ log.created_at | dateTimeSeparate }}</span>
                      </div>

                      <!-- Badge status -->
                      <div class="wl-col-execution-status">
                        <p-tag
                          [value]="translateExecutionStatus(log.execution_status)"
                          [severity]="getLogStatusSeverity(log.execution_status)"
                        />
                      </div>

                      <!-- Chevron -->
                      <div class="wl-col-chevron">
                        <i
                          class="pi pi-chevron-down wl-chevron"
                          [class.open]="expandedLogs().has(log.id)"
                        ></i>
                      </div>
                    </div>
                  </div>

                  <!-- Cuerpo colapsable -->
                  @if (expandedLogs().has(log.id)) {
                    <div class="wl-card-body">
                      <div class="wl-payload-block">
                        <span class="wl-payload-label">
                          <i class="pi pi-arrow-up-right"></i>Request Payload
                        </span>
                        <pre class="wl-code">{{ log.request_payload | json }}</pre>
                      </div>
                      <div class="wl-payload-block">
                        <span class="wl-payload-label">
                          <i class="pi pi-arrow-down-left"></i>Response Payload
                        </span>
                        <pre class="wl-code">{{ log.response_payload | json }}</pre>
                      </div>
                    </div>
                  }
                </div>

              }
            </div>

            <!-- Paginator -->
            <div class="wl-paginator">
              <p-paginator
                [first]="(webhookLogFilterDto().config.page - 1) * webhookLogFilterDto().config.rows"
                [rows]="webhookLogFilterDto().config.rows"
                [totalRecords]="webhookLogResp().meta_data.total_records"
                [rowsPerPageOptions]="[10, 15, 20, 50]"
                [showCurrentPageReport]="true"
                [currentPageReportTemplate]="'labels.showing_items' | translate"
                (onPageChange)="onPageChange($event)"
              />
            </div>

          } @else {
            <div class="wl-empty">
              <i class="pi pi-inbox"></i>
              <span>{{ 'labels.no_logs_found' | translate }}</span>
            </div>
          }

        }
      </div>
    </div>
  `,
})
export class WebhookLogsDialogComponent implements OnInit {
  protected ref = inject(DynamicDialogRef)
  private readonly config = inject(DynamicDialogConfig)
  private readonly webhookService = inject(WebhookService)
  private readonly translate = inject(TranslateService)
  private readonly cdr = inject(ChangeDetectorRef)

  webhookId: string | null = null
  loading = signal(false)
  expandedLogs = signal<Set<string>>(new Set())

  selectedDate: Date | null = null
  selectedDateFilterMode = 'gte'
  selectedStatus = ''

  dateFilterModes: { label: string; value: string }[] = []
  statusOptions: { label: string; value: string }[] = []

  webhookLogFilterDto = signal<WebhookLogFilterDto>({
    config: { populate_data: true, page: 1, rows: 15, sort_field: [] },
    filter: {} as WebhookLogFilter,
  })

  webhookLogResp = signal<WebhookLogResp>({
    data: [],
    meta_data: { page: 0, rows: 0, total_records: 0 },
  })

  constructor() {
    this.webhookId = this.config.data?.webhookId

    effect(() => {
      const filter = this.webhookLogFilterDto()
      if (this.webhookId && filter.filter?.['webhook_id']?.value !== null) {
        untracked(() => this.initData())
      }
    })

    this.translate.onLangChange.pipe(takeUntilDestroyed()).subscribe(() => {
      this.loadTranslations()
      this.cdr.markForCheck()
    })
  }

  ngOnInit(): void {
    this.initFilters()
    this.loadTranslations()
  }

  initFilters(): void {
    this.webhookLogFilterDto.set({
      config: {
        page: 1,
        rows: 15,
        populate_data: false,
        sort_field: [{ field: 'created_at', order: -1 }],
      },
      filter: {
        webhook_id: { match_mode: 'equals', value: this.webhookId || '' },
      } as WebhookLogFilter,
    })
  }

  loadTranslations(): void {
    this.dateFilterModes = [
      { label: this.translate.instant('components.gte'),    value: 'gte'    },
      { label: this.translate.instant('components.lte'),    value: 'lte'    },
    ]

    this.statusOptions = [
      { label: this.translate.instant('webhook_logs.status_success'), value: 'SUCCESS' },
      { label: this.translate.instant('webhook_logs.status_failed'),  value: 'FAILED'  },
    ]
  }

  initData(): void {
    this.loading.set(true)
    this.webhookService.postListWebhookLogs(this.webhookLogFilterDto()).subscribe({
      next: (data: any) => {
        this.webhookLogResp.set(data)
        this.loading.set(false)
        this.cdr.markForCheck()
      },
      error: () => {
        this.loading.set(false)
        this.cdr.markForCheck()
      },
    })
  }

  toggleLog(id: string): void {
    this.expandedLogs.update((set) => {
      const next = new Set(set)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  onPageChange(event: PaginatorState): void {
    this.webhookLogFilterDto.update((f) => ({
      ...f,
      config: {
        ...f.config,
        page: (event.page ?? 0) + 1,
        rows: event.rows ?? 15,
      },
    }))
  }

  applyDateFilter(event: Date): void {
    this.selectedDate = event
    if (event) {
      this.updateFilter('created_at', {
        match_mode: this.selectedDateFilterMode,
        value: this.formatDate(event),
      })
    }
  }

  clearDateFilter(): void {
    this.selectedDate = null
    this.updateFilter('created_at', { match_mode: 'equals', value: '' })
  }

  applyStatusFilter(): void {
    this.updateFilter('execution_status', { match_mode: 'equals', value: this.selectedStatus })
  }

  clearStatusFilter(): void {
    this.selectedStatus = ''
    this.updateFilter('execution_status', { match_mode: 'equals', value: '' })
  }

  translateEventType(event: string): string {
    if (!event) return '—'
    const key = `webhook_logs.event_${event.replaceAll('.', '_')}`
    const translated = this.translate.instant(key)
    return translated === key ? event : translated
  }

  translateExecutionStatus(status: string): string {
    if (!status) return '—'
    const key = `webhook_logs.status_${status.toLowerCase()}`
    const translated = this.translate.instant(key)
    return translated === key ? status : translated
  }

  getLogStatusSeverity(status: string): 'success' | 'danger' | 'info' {
    const s = status?.toLowerCase()
    if (s === 'success') return 'success'
    if (s === 'failed' || s === 'error') return 'danger'
    return 'info'
  }

  getAccentClass(status: string): string {
    const s = status?.toLowerCase()
    if (s === 'success') return 'accent-success'
    if (s === 'failed' || s === 'error') return 'accent-danger'
    return 'accent-info'
  }

  getDotClass(status: string): string {
    const s = status?.toLowerCase()
    if (s === 'success') return 'dot-success'
    if (s === 'failed' || s === 'error') return 'dot-danger'
    return 'dot-info'
  }

  getHttpCodeClass(code: number): string {
    if (!code) return 'http-other'
    if (code >= 200 && code < 300) return 'http-2xx'
    if (code >= 400 && code < 500) return 'http-4xx'
    if (code >= 500) return 'http-5xx'
    return 'http-other'
  }




  private formatDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0')
    const y  = date.getFullYear()
    const mo = pad(date.getMonth() + 1)
    const d  = pad(date.getDate())
    const h  = pad(date.getHours())
    const mi = pad(date.getMinutes())
    const s  = pad(date.getSeconds())
    const tzOffset = -date.getTimezoneOffset()
    const sign = tzOffset >= 0 ? '+' : '-'
    const oh = pad(Math.floor(Math.abs(tzOffset) / 60))
    const om = pad(Math.abs(tzOffset) % 60)
    return `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${oh}:${om}`
  }

  private updateFilter(field: string, filterValue: { match_mode: string; value: string }): void {
    this.webhookLogFilterDto.update((f) => ({
      ...f,
      config: { ...f.config, page: 1 },
      filter: { ...f.filter, [field]: filterValue },
    }))
  }
}
