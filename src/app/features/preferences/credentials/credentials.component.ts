import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
  ViewChild,
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { CommonModule } from '@angular/common'
import { DisplayDatePipe } from '@/app/shared/pipes/display-date.pipe'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { startWith } from 'rxjs'
import { ConfirmationService, MessageService, MenuItem } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { ToastModule } from 'primeng/toast'
import { TooltipModule } from 'primeng/tooltip'
import { TabsModule } from 'primeng/tabs'
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { MenuModule, Menu } from 'primeng/menu'
import { SkeletonModule } from 'primeng/skeleton'

import { TranslateLanService } from '../../../core/services/translate-lan.service'
import { DateTimeSeparatePipe } from '../../../shared/pipes/datetime-separate.pipe'
import { CapitalizePipe } from '../../../shared/pipes/capitalize.pipe'
import { ChipModule } from 'primeng/chip'
import { MultiSelectModule } from 'primeng/multiselect'
import { InputTextModule } from 'primeng/inputtext'
import { SelectModule } from 'primeng/select'
import { ShActionItem } from '../../../shared/types/api.types'
import { CredentialsService } from './credentials.service'

import {
  Facility,
  KeyDTO,
  KeyFilter,
  KeyListResponse,
  OAuth2CredentialFilter,
  OAuth2CredentialResponse,
  OAuth2ListRequest,
  OAuth2ListResponse,
  OperatorKey,
} from './credentials.types'
import { CredentialTypeChooserComponent, CredentialKind } from './credential-type-chooser.component'
import { FacilityKeyFormComponent } from './tabs/facility-key/facility-key-form.component'
import { OperatorKeyFormComponent } from './tabs/operator-key/operator-key-form.component'
import { OAuth2FormComponent } from './tabs/oauth2/oauth2-form.component'
import { translateOAuth2TestError, translateOAuth2TestSuccess } from './tabs/oauth2/oauth2-test-error.util'
import WebhooksComponent from '../webhooks/webhooks.component'
import { ProvidersTabComponent } from './tabs/providers/providers-tab.component'
import { BaseDataTable } from '../../../shared/components/datatable/data-table/base-data-table.component'
import { ShColumnDef, ShPaginationConfig, ShSortConfig, ShTableEvent, ActiveFilterChip } from '../../../shared/types/table.types'
import { TableStateService } from '../../../shared/services/table-state.service'
import { FilterTextInputComponent } from '../../../shared/components/filter-text-input/filter-text-input.component'
import { FilterMultiselectPanelComponent } from '../../../shared/components/filter-multiselect-panel/filter-multiselect-panel.component'
import { FilterDateInputComponent } from '../../../shared/components/filter-date-input/filter-date-input.component'
import { formatDateForBackend } from '../../../shared/utils/date.util'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { scopeApiFilter, dropFacilityFilters } from '@/app/shared/utils/facility-scope.util'

// ── State interfaces ─────────────────────────────────────────────────────────

interface KeyState {
  data: OperatorKey[]
  meta_data: { page: number; rows: number; total_records: number }
  facilities: Facility[]
  loaded: boolean
  loading: boolean
  error: unknown
}

const DEFAULT_KEY_STATE: KeyState = {
  data: [],
  meta_data: { page: 1, rows: 15, total_records: 0 },
  facilities: [],
  loaded: false,
  loading: true,
  error: null,
}

const DEFAULT_KEY_DTO: KeyDTO = {
  config: { populate_data: true, page: 1, rows: 15, sort_field: [] },
  filter: {} as KeyFilter,
}

@Component({
  selector: 'app-credentials',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    TableModule,
    TagModule,
    ToastModule,
    TooltipModule,
    ConfirmDialogModule,
    MenuModule,
    DateTimeSeparatePipe,
    CapitalizePipe,
    DisplayDatePipe,
    TabsModule,
    MultiSelectModule,
    SkeletonModule,
    InputTextModule,
    SelectModule,
    WebhooksComponent,
    ProvidersTabComponent,
    BaseDataTable,
    ChipModule,
    FilterTextInputComponent,
    FilterMultiselectPanelComponent,
    FilterDateInputComponent,
  ],
  providers: [DialogService, ConfirmationService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
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
    `,
  ],
  template: `
    <p-confirmDialog
      acceptButtonStyleClass="p-button-text"
      rejectButtonStyleClass="p-button-text"
    />
    <p-menu #oauthMenu [model]="oauthMenuItems" [popup]="true" />

    <!-- ──────── Header ──────── -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div>
        <p class="text-surface-500 text-sm m-0">
          {{ 'labels.integrations_description' | translate }}
        </p>
      </div>
      <!-- Tab-specific action buttons -->
      <div class="flex gap-2">
        @switch (activeTab()) {
          @case ('keys') {
            <p-button
              icon="pi pi-plus"
              [label]="'buttons.new_credential' | translate"
              size="small"
              (click)="openTypeChooser()"
            />
            <p-button
              icon="pi pi-refresh"
              [label]="'buttons.refresh' | translate"
              severity="secondary" [outlined]="true" [text]="true"
              size="small"
              (click)="loadKeys()"
            />
            <p-button
              severity="secondary" [outlined]="true" [text]="true"
              icon="pi pi-filter-slash"
              [label]="'buttons.clear' | translate"
              size="small"
              (click)="clearKeyFilters()"
            />
          }
          @case ('oauth') {
            <p-button
              icon="pi pi-plus"
              label="New OAuth2"
              size="small"
              (click)="openOAuth2Form()"
            />
            <p-button
              icon="pi pi-refresh"
              [label]="'buttons.refresh' | translate"
              severity="secondary" [outlined]="true" [text]="true"
              size="small"
              [loading]="oauthLoading()"
              (click)="loadOAuth()"
            />
            <p-button
              severity="secondary" [outlined]="true" [text]="true"
              icon="pi pi-filter-slash"
              [label]="'buttons.clear' | translate"
              size="small"
              (click)="clearOAuthFilters()"
            />
          }
          @case ('webhooks') {
            <p-button
              icon="pi pi-plus"
              [label]="'preferences.webhook.new_webhook' | translate"
              size="small"
              (click)="webhooksComp?.openScopeChooser()"
            />
            <p-button
              severity="secondary" [outlined]="true" [text]="true"
              icon="pi pi-filter-slash"
              [label]="'buttons.clear' | translate"
              size="small"
              (click)="webhooksComp?.clearAllFilters()"
            />
          }
          @case ('providers') {
            <p-button
              icon="pi pi-refresh"
              [label]="'buttons.refresh' | translate"
              severity="secondary" [outlined]="true" [text]="true"
              size="small"
              [loading]="providersComp?.globalLoading() ?? false"
              (click)="providersComp?.loadAll()"
            />
          }
        }
      </div>
    </div>

    <!-- ──────── Tabs ──────── -->
    <div class="card">
      <p-tabs [value]="activeTab()" (valueChange)="onTabChange($event)">
        <p-tablist>
          <p-tab value="keys">
            <i class="pi pi-key mr-2"></i>
            {{ 'labels.api_keys' | translate }}
          </p-tab>
          <p-tab value="oauth">
            <i class="pi pi-lock mr-2"></i>
            OAuth2
          </p-tab>
          <p-tab value="webhooks">
            <i class="pi pi-link mr-2"></i>
            Webhooks
          </p-tab>
          <p-tab value="providers">
            <i class="pi pi-box mr-2"></i>
            {{ 'labels.providers_tab' | translate }}
          </p-tab>
        </p-tablist>

        <p-tabpanels>
          <!-- ═══════════ TAB: API Keys ═══════════ -->
          <p-tabpanel value="keys">

            <!-- Active filter chips -->
            @if (activeKeyFilters().length > 0) {
              <div class="flex flex-wrap items-center justify-end gap-2 mb-3">
                <i class="pi pi-filter mr-2"></i>
                @for (chip of activeKeyFilters(); track chip.field) {
                  <p-chip
                    [label]="chip.label + ': ' + chip.displayValue"
                    [removable]="true"
                    (onRemove)="removeKeyFilterChip(chip.field)"
                    class="custom-chip font-bold bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-0 hover:bg-surface-300 dark:hover:bg-surface-600 transition-colors cursor-pointer text-sm"
                  />
                }
              </div>
            }

            <base-data-table
              [columns]="keySelectedCols"
              [data]="keyState().data"
              [loading]="keyState().loading"
              [pagination]="keyPagination()"
              [sort]="keySort()"
              [initialFilters]="keyActiveRawFilters"
              [nullableFacility]="true"
              (stateChange)="onKeyTableStateChange($event)"
            >

              <!-- Filter row -->
              <ng-template #filterRow let-columns="columns">
                <!-- Leading empty cell for the actions column (matches header row) -->
                <th style="width: 4rem"></th>
                @for (col of columns; track col.field) {
                  <th class="filter-th">
                    @switch (col.field) {

                      @case ('name') {
                        <nuvex-filter-text-input
                          [value]="getKeyActiveFilterValue('name')"
                          [placeholder]="'labels.name' | translate"
                          (applyWithMode)="onKeyTextApply('name', $event)"
                        />
                      }

                      @case ('facility_id') {
                        <nuvex-filter-multiselect-panel
                          [options]="getKeyFacilityOptions()"
                          optionLabel="label"
                          optionValue="value"
                          [placeholder]="'labels.facility' | translate"
                          [showFilter]="getKeyFacilityOptions().length > 5"
                          [value]="getKeyActiveFilterValue('facility_id') ?? []"
                          (apply)="onKeyFilterApply('facility_id', $event)"
                          (clear)="onKeyFilterClear('facility_id')"
                        />
                      }

                      @case ('status') {
                        <nuvex-filter-multiselect-panel
                          [options]="keyStatusOptions()"
                          optionLabel="label"
                          optionValue="value"
                          [placeholder]="'labels.status' | translate"
                          [value]="getKeyActiveFilterValue('status') ?? []"
                          (apply)="onKeyFilterApply('status', $event)"
                          (clear)="onKeyFilterClear('status')"
                        />
                      }

                    }
                  </th>
                }
              </ng-template>

              <!-- Custom cell rendering -->
              <ng-template #cell let-row let-col="col">
                @switch (col.template) {
                  @case ('scope') {
                    @if (isAccountKey(row)) {
                      <span class="scope-badge scope-facility">
                        <i class="pi pi-building" style="font-size:0.7rem"></i> Facility
                      </span>
                    } @else {
                      <span class="scope-badge scope-operator">
                        <i class="pi pi-key" style="font-size:0.7rem"></i> Operator
                      </span>
                    }
                  }
                  @case ('key') {
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-sm tracking-wider bg-surface-50 dark:bg-surface-800 px-2 py-1 rounded border border-surface-200 dark:border-surface-700">{{ row.showKey ? row.api_key : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' }}</span>
                      <p-button icon="pi pi-eye" (click)="toggleKeyVisibility(row)"
                        [text]="true" size="small"
                        [severity]="row.showKey ? 'danger' : 'info'"
                        [pTooltip]="(row.showKey ? 'labels.hide_key' : 'labels.show_key') | translate" />
                      <p-button icon="pi pi-copy" (click)="copyKey(row)"
                        [text]="true" size="small" severity="success"
                        [pTooltip]="'labels.copy_key' | translate" />
                    </div>
                  }
                  @case ('facility') {
                    <span class="text-sm">{{ getFacilityName(row.facility_id) }}</span>
                  }
                  @case ('status') {
                    <p-tag
                      [value]="('labels.' + getKeyStatus(row)) | translate"
                      [severity]="getStatusSeverity(getKeyStatus(row))"
                    />
                  }
                  @case ('date') {
                    <span class="text-surface-400 text-sm">
                      <i class="pi pi-calendar mr-1 text-xs"></i>
                      {{ row.created_at | dateTimeSeparate }}
                    </span>
                  }
                  @default { <span class="text-sm">{{ row[col.field] ?? '\u2014' }}</span> }
                }
              </ng-template>

              <!-- Row actions -->
              <ng-template #actions let-row>
                <p-button icon="pi pi-ellipsis-v" [text]="true" [rounded]="true"
                  size="small" severity="secondary"
                  (click)="toggleKeyMenu($event, row)" />
              </ng-template>

              <!-- Paginator left: column toggle -->
              <ng-template #paginatorLeft>
                <div class="flex items-center gap-2">
                  <p-multiSelect
                    #keyMs
                    [options]="keyTranslatedColumnDefs"
                    [ngModel]="keySelectedCols"
                    (onChange)="onKeyColSelectChange($event, keyMs)"
                    optionLabel="translatedHeader"
                    [placeholder]="'labels.choose_columns' | translate"
                    [selectedItemsLabel]="keySelectedCols.length + ' ' + ('labels.columns_selected' | translate)"
                    [maxSelectedLabels]="0"
                    size="small"
                    appendTo="body"
                  >
                    <ng-template let-col pTemplate="item">{{ col.translatedHeader }}</ng-template>
                  </p-multiSelect>
                </div>
              </ng-template>
            </base-data-table>

            <!-- Row action menu -->
            <p-menu #keyMenu [model]="keyMenuItems" [popup]="true" appendTo="body" />
          </p-tabpanel>

          <!-- ═══════════ TAB: OAuth2 ═══════════ -->
          <p-tabpanel value="oauth">

            <!-- Active filter chips -->
            @if (activeOAuthFilters().length > 0) {
              <div class="flex flex-wrap items-center justify-end gap-2 mb-3">
                <i class="pi pi-filter mr-2"></i>
                @for (chip of activeOAuthFilters(); track chip.field) {
                  <p-chip
                    [label]="chip.label + ': ' + chip.displayValue"
                    [removable]="true"
                    (onRemove)="removeOAuthFilterChip(chip.field)"
                    class="custom-chip font-bold bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-0 hover:bg-surface-300 dark:hover:bg-surface-600 transition-colors cursor-pointer text-sm"
                  />
                }
              </div>
            }

            <base-data-table
              [columns]="oauthSelectedCols"
              [data]="oauthAllItems()"
              [loading]="oauthLoading()"
              [pagination]="oauthPagination()"
              [sort]="oauthSort()"
              [initialFilters]="oauthActiveRawFilters()"
              (stateChange)="onOAuthTableStateChange($event)"
            >

              <!-- Filter row -->
              <ng-template #filterRow let-columns="columns">
                <!-- Leading empty cell for the actions column -->
                <th style="width: 4rem"></th>
                @for (col of columns; track col.field) {
                  <th class="filter-th">
                    @switch (col.field) {
                      @case ('provider_name') {
                        <nuvex-filter-text-input
                          [value]="getOAuthActiveFilterValue('provider_name')"
                          [placeholder]="'labels.provider' | translate"
                          (applyWithMode)="onOAuthTextApply('provider_name', $event)"
                        />
                      }
                      @case ('client_id') {
                        <nuvex-filter-text-input
                          [value]="getOAuthActiveFilterValue('client_id')"
                          [placeholder]="'labels.client_id' | translate"
                          (applyWithMode)="onOAuthTextApply('client_id', $event)"
                        />
                      }
                      @case ('environment') {
                        <nuvex-filter-multiselect-panel
                          [options]="oauthEnvOptions()"
                          optionLabel="label"
                          optionValue="value"
                          [placeholder]="'labels.environment' | translate"
                          [showFilter]="true"
                          [value]="getOAuthActiveFilterValue('environment') ?? []"
                          (apply)="onOAuthFilterApply('environment', $event)"
                          (clear)="onOAuthFilterClear('environment')"
                        />
                      }
                      @case ('token') {
                        <nuvex-filter-multiselect-panel
                          [options]="oauthTokenStatusOptions()"
                          optionLabel="label"
                          optionValue="value"
                          [placeholder]="'labels.token_status' | translate"
                          [showFilter]="true"
                          [value]="getOAuthActiveFilterValue('token') ?? []"
                          (apply)="onOAuthFilterApply('token', $event)"
                          (clear)="onOAuthFilterClear('token')"
                        />
                      }
                      @case ('updated_at') {
                        <nuvex-filter-date-input
                          [value]="getOAuthActiveFilterValue('updated_at')"
                          [matchMode]="getOAuthActiveFilterMatchMode('updated_at')"
                          [placeholder]="'labels.updated_at' | translate"
                          (applyWithMode)="onOAuthTextApply('updated_at', $event)"
                        />
                      }
                    }
                  </th>
                }
              </ng-template>

              <!-- Custom cell rendering -->
              <ng-template #cell let-row let-col="col">
                @switch (col.template) {
                  @case ('provider') {
                    <div class="flex items-center gap-2">
                      <i class="pi pi-lock text-yellow-500" style="font-size:0.85rem"></i>
                      <span class="font-medium">{{ row.provider_name | capitalize }}</span>
                    </div>
                  }
                  @case ('client_id') {
                    <span class="font-mono text-sm">{{ row.client_id }}</span>
                  }
                  @case ('environment') {
                    <p-tag
                      [value]="row.environment | uppercase"
                      [severity]="row.environment === 'production' ? 'success' : row.environment === 'qa' ? 'warn' : 'secondary'"
                      [style]="{ 'font-size': '0.7rem' }"
                    />
                  }
                  @case ('token_status') {
                    @if (row.token) {
                      @if (isTokenValid(row.token.exp)) {
                        <p-tag severity="success" icon="pi pi-check-circle"
                          [value]="'labels.token_valid' | translate"
                          [pTooltip]="('labels.token_expired' | translate) + ': ' + getExpDate(row.token.exp)" />
                      } @else {
                        <p-tag severity="danger" icon="pi pi-times-circle"
                          [value]="'labels.token_expired' | translate"
                          [pTooltip]="('labels.token_expired' | translate) + ': ' + getExpDate(row.token.exp)" />
                      }
                    } @else {
                      <p-tag severity="secondary" icon="pi pi-minus-circle"
                        [value]="'labels.token_no_token' | translate" />
                    }
                  }
                  @case ('date') {
                    <span class="text-surface-400 text-sm">
                      <i class="pi pi-calendar mr-1 text-xs"></i>
                      {{ row.updated_at ? (row.updated_at | displayDate: 'dateTime') : '—' }}
                    </span>
                  }
                  @case ('test') {
                    <p-button
                      icon="pi pi-bolt"
                      severity="secondary"
                      [text]="true"
                      [rounded]="true"
                      size="small"
                      [pTooltip]="'buttons.test_connection' | translate"
                      [loading]="testingProvider() === row.provider_name"
                      (click)="testOAuth(row)"
                    />
                  }
                  @default { <span class="text-sm">{{ row[col.field] ?? '—' }}</span> }
                }
              </ng-template>

              <!-- Row actions -->
              <ng-template #actions let-row>
                <p-button icon="pi pi-ellipsis-v" [text]="true" [rounded]="true"
                  size="small" severity="secondary"
                  (click)="toggleOAuthMenu($event, row)" />
              </ng-template>

              <!-- Paginator left: column toggle -->
              <ng-template #paginatorLeft>
                <div class="flex items-center gap-2">
                  <p-multiSelect
                    #oauthMs
                    [options]="oauthTranslatedColumnDefs"
                    [ngModel]="oauthSelectedCols"
                    (onChange)="onOAuthColSelectChange($event, oauthMs)"
                    optionLabel="translatedHeader"
                    [placeholder]="'labels.choose_columns' | translate"
                    [selectedItemsLabel]="oauthSelectedCols.length + ' ' + ('labels.columns_selected' | translate)"
                    [maxSelectedLabels]="0"
                    size="small"
                    appendTo="body"
                  >
                    <ng-template let-col pTemplate="item">{{ col.translatedHeader }}</ng-template>
                  </p-multiSelect>
                </div>
              </ng-template>
            </base-data-table>

          </p-tabpanel>
          <!-- ═══════════ TAB: Webhooks ═══════════ -->
          <p-tabpanel value="webhooks">
            @if (visitedTabs().has('webhooks')) {
              <app-webhooks [embedded]="true" (requestOAuthTab)="onTabChange('oauth')" />
            }
          </p-tabpanel>

          <!-- ═══════════ TAB: Providers ═══════════ -->
          <p-tabpanel value="providers">
            @if (visitedTabs().has('providers')) {
              <app-providers-tab />
            }
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>
    </div>

    <p-toast />
  `,
})
export default class CredentialsComponent implements OnInit {
  /** Global facility scope from the topbar selector. */
  private readonly facilityScope = inject(FacilityScopeService)
  @ViewChild('oauthMenu') oauthMenu!: Menu
  @ViewChild('keyMenu') keyMenu!: Menu
  @ViewChild(WebhooksComponent) webhooksComp?: WebhooksComponent
  @ViewChild(ProvidersTabComponent) providersComp?: ProvidersTabComponent

  private readonly svc = inject(CredentialsService)

  private readonly translate = inject(TranslateService)
  private readonly translateLanService = inject(TranslateLanService)
  private readonly dialogService = inject(DialogService)
  private readonly confirmationService = inject(ConfirmationService)
  private readonly messageService = inject(MessageService)
  private readonly tableState = inject(TableStateService)



  ref: DynamicDialogRef | null = null

  // ── Tab state — lazy loading ────────────────────────────────────
  /** Currently active tab (signal so template reacts) */
  activeTab = signal('keys')
  /**
   * Set of tab values that have been visited at least once.
   * Used to guard @if blocks so tab content is mounted on first visit
   * and kept alive on subsequent tab switches (no data re-fetch).
   */
  visitedTabs = signal<Set<string>>(new Set(['keys']))


  onTabChange(tab: string | number | undefined): void {
    if (tab == null) return
    const value = String(tab)
    this.activeTab.set(value)

    // Mark tab as visited (immutable set update to trigger signal)
    if (!this.visitedTabs().has(value)) {
      this.visitedTabs.update((s) => new Set([...s, value]))
    }

    // Lazy-load data on first visit
    if (value === 'oauth' && this.oauthAllItems().length === 0 && !this.oauthLoading()) {
      this.loadOAuth()
    }
  }

  // ── API Keys state ─────────────────────────────────────────────────────
  keyState = signal<KeyState>({ ...DEFAULT_KEY_STATE })
  keyDto = signal<KeyDTO>({
    ...DEFAULT_KEY_DTO,
    config: { ...DEFAULT_KEY_DTO.config },
  })
  facilities = computed(() => this.keyState().facilities)

  /** All available columns for the API Keys table */
  keyColumnDefs: ShColumnDef[] = [
    { field: 'scope',       header: 'labels.scope',      width: '7rem',  template: 'scope' },
    { field: 'facility_id', header: 'labels.facility',   width: '10rem', template: 'facility', sortable: true, filterable: true, filterType: 'multiselect' },
    { field: 'name',        header: 'labels.name',       width: '12rem', sortable: true,  filterable: true, filterType: 'text' },
    { field: 'api_key',     header: 'labels.key',        width: '14rem', template: 'key' },
    { field: 'status',      header: 'labels.status',     width: '8rem',  template: 'status', sortable: true, filterable: true, filterType: 'multiselect' },
    { field: 'created_at',  header: 'labels.created_at', width: '10rem', template: 'date',   sortable: true },
  ]
  /** Currently visible columns */
  keySelectedCols: ShColumnDef[] = this.keyColumnDefs
  /** Pre-translated column defs for multiSelect */
  keyTranslatedColumnDefs: (ShColumnDef & { translatedHeader: string })[] = []
  /** Filter state parallel to keyDto.filter — needed for persistence and [initialFilters] */
  protected keyActiveRawFilters: Record<string, any> = {}
  /** Pagination state for base-data-table */
  keyPagination = signal<ShPaginationConfig>({ page: 1, limit: 15, total: 0, rows_per_page: [15, 30, 50] })

  /** Active filter chips for the API Keys tab */
  activeKeyFilters = signal<ActiveFilterChip[]>([])
  /** Drives [sortField] in base-data-table so the blue sort icon tracks and clears correctly */
  keySort = signal<ShSortConfig | undefined>(undefined)

  private readonly langChange = toSignal(
    this.translate.onLangChange.pipe(startWith(null)),
    { initialValue: null }
  )

  /** Status options for the filter dropdown */
  keyStatusOptions = computed(() => {
    this.langChange()
    return [
      { label: this.translate.instant('labels.active'),  value: 'ACTIVE'  },
      { label: this.translate.instant('labels.revoked'), value: 'REVOKED' },
    ]
  })

  getKeyFacilityOptions(): { label: string; value: string }[] {
    return (this.keyState().facilities ?? []).map((f) => ({ label: f.name ?? '', value: f.id }))
  }

  getKeyActiveFilterValue(field: string): any {
    return this.keyActiveRawFilters[field]?.value ?? null
  }

  buildKeyFilterChips(filters: Record<string, any>): void {
    const chips: ActiveFilterChip[] = []
    for (const field of Object.keys(filters ?? {})) {
      const f = filters[field]
      if (f?.value === undefined || f.value === null || f.value === '' ||
          (Array.isArray(f.value) && f.value.length === 0)) continue

      const labelKey = field === 'facility_id' ? 'labels.facility' : 'labels.' + field
      const label = this.translate.instant(labelKey)
      const raw = f.value
      let displayValue = ''

      if (Array.isArray(raw)) {
        if (field === 'facility_id') {
          displayValue = raw
            .map((id: string) => this.getKeyFacilityOptions().find(o => o.value === id)?.label ?? id)
            .join(', ')
        } else if (field === 'status') {
          displayValue = raw
            .map((s: string) => this.keyStatusOptions().find(o => o.value === s)?.label ?? s)
            .join(', ')
        } else {
          displayValue = raw.join(', ')
        }
      } else {
        displayValue = String(raw)
      }
      chips.push({ field, label, displayValue })
    }
    this.activeKeyFilters.set(chips)
  }

  removeKeyFilterChip(field: string): void {
    const filters = { ...this.keyActiveRawFilters }
    delete filters[field]
    this.keyActiveRawFilters = filters
    this.buildKeyFilterChips(filters)
    this.keyPagination.update(p => ({ ...p, page: 1 }))
    this.saveKeyState()
    this.keyDto.update(d => ({
      ...d,
      config: { ...d.config, populate_data: false, page: 1 },
      filter: {
        ...(filters['facility_id']?.value ? { facility_id: { value: filters['facility_id'].value, match_mode: 'in'       } } : {}),
        ...(filters['name']?.value        ? { name:        { value: filters['name'].value,        match_mode: 'contains' } } : {}),
        ...(filters['status']?.value      ? { status:      { value: filters['status'].value,      match_mode: 'in'       } } : {}),
      } as KeyFilter,
    }))
  }

  // ── OAuth2 ─────────────────────────────────────────────────────────────
  /** Items from backend (token_status filtering is now server-side) */
  oauthAllItems = signal<OAuth2CredentialResponse[]>([])
  oauthLoading = signal(false)

  /** DTO signal that drives backend requests (filter + sort + pagination) */
  private readonly oauthDto = signal<OAuth2ListRequest>({
    config: { page: 1, rows: 15, sort_field: [] },
    filter: {},
  })

  /** All available columns for the OAuth2 table */
  oauthColumnDefs: ShColumnDef[] = [
    { field: 'provider_name', header: 'labels.provider',     width: '10rem', template: 'provider',     sortable: true, filterable: true, filterType: 'text' },
    { field: 'client_id',     header: 'labels.client_id',    width: '10rem', template: 'client_id',    sortable: true, filterable: true, filterType: 'text' },
    { field: 'environment',   header: 'labels.environment',  width: '8rem',  template: 'environment',  sortable: true, filterable: true, filterType: 'multiselect' },
    { field: 'token',         header: 'labels.token_status', width: '8rem',  template: 'token_status', filterable: true, filterType: 'multiselect' },
    { field: 'updated_at',    header: 'labels.updated_at',   width: '13rem', template: 'date',         sortable: true, filterable: true, filterType: 'date' },
    { field: 'test',          header: 'labels.test',         width: '5rem',  template: 'test'          },
  ]
  /** Currently visible columns */
  oauthSelectedCols: ShColumnDef[] = this.oauthColumnDefs
  /** Pre-translated column defs for multiSelect */
  oauthTranslatedColumnDefs: (ShColumnDef & { translatedHeader: string })[] = []
  /** Pagination state for base-data-table */
  oauthPagination = signal<ShPaginationConfig>({ page: 1, limit: 15, total: 0, rows_per_page: [15, 30, 50, 100] })
  /** Sort state for base-data-table */
  oauthSort = signal<ShSortConfig | undefined>(undefined)
  testingProvider = signal<string | null>(null)
  oauthMenuItems: MenuItem[] = []
  keyMenuItems: MenuItem[] = []

  /** Filter state parallel to oauthDto.filter — needed for [initialFilters] and chips */
  protected oauthActiveRawFilters = signal<Record<string, any>>({})
  /** Active filter chips for the OAuth2 tab */
  activeOAuthFilters = signal<ActiveFilterChip[]>([])

  /** Environment filter options (translated) */
  oauthEnvOptions = computed(() => {
    this.langChange()
    return [
      { label: 'Production', value: 'production' },
      { label: 'QA',         value: 'qa' },
      { label: 'Sandbox',    value: 'sandbox' },
    ]
  })

  /** Token status filter options (translated) */
  oauthTokenStatusOptions = computed(() => {
    this.langChange()
    return [
      { label: this.translate.instant('labels.token_valid'),    value: 'valid' },
      { label: this.translate.instant('labels.token_expired'),  value: 'expired' },
      { label: this.translate.instant('labels.token_no_token'), value: 'no_token' },
    ]
  })

  constructor() {
    effect(() => this.translate.use(this.translateLanService.changeLanguage()))

    // Restore persisted API Keys state BEFORE the first keyDto effect run triggers loadKeys()
    const saved = this.tableState.load('logic:credentials-keys')
    if (saved?.filters && Object.keys(saved.filters).length > 0) {
      this.keyActiveRawFilters = saved.filters as Record<string, any>
      const f = this.keyActiveRawFilters
      this.keyDto.update(d => ({
        ...d,
        filter: {
          ...(f['facility_id']?.value ? { facility_id: { value: f['facility_id'].value, match_mode: 'in'       } } : {}),
          ...(f['name']?.value        ? { name:        { value: f['name'].value,        match_mode: 'contains' } } : {}),
          ...(f['status']?.value      ? { status:      { value: f['status'].value,      match_mode: 'in'       } } : {}),
          ...(f['created_at']?.value  ? { created_at:  { value: f['created_at'].value,  match_mode: 'contains' } } : {}),
        } as KeyFilter,
        config: {
          ...d.config,
          ...(saved.page ? { page: saved.page } : {}),
          ...(saved.sort ? { sort_field: [{ field: saved.sort.field, order: saved.sort.order === 'asc' ? 1 : -1 }] } : {}),
        },
      }))
      if (saved.page) this.keyPagination.update(p => ({ ...p, page: saved.page! }))
      if (saved.sort) this.keySort.set(saved.sort)
      this.buildKeyFilterChips(this.keyActiveRawFilters)
    }

    // Reload keys whenever keyDto changes (also runs on init — keys tab is default)
    effect(() => {
      this.keyDto();                         // track signal → re-runs when keyDto changes
      untracked(() => this.loadKeys());      // load without registering extra deps
    })

    // Reload OAuth whenever oauthDto changes (only after first visit to oauth tab)
    effect(() => {
      this.oauthDto();                       // track signal
      untracked(() => {
        if (this.visitedTabs().has('oauth')) {
          this.loadOAuth()
        }
      })
    })
  }

  ngOnInit(): void {
    this.translate.get(this.keyColumnDefs.map((c: ShColumnDef) => c.header)).subscribe(() => {
      this.buildKeyTranslatedColumns()
    })
    this.translate.onLangChange.subscribe(() => {
      this.buildKeyTranslatedColumns()
      this.buildOAuthTranslatedColumns()
    })
    this.translate.get(this.oauthColumnDefs.map((c: ShColumnDef) => c.header)).subscribe(() => {
      this.buildOAuthTranslatedColumns()
    })

  }



  private saveKeyState(): void {
    const cfg = this.keyDto().config
    const sf  = cfg.sort_field?.[0]
    this.tableState.save('logic:credentials-keys', {
      filters: this.keyActiveRawFilters as Record<string, unknown>,
      page:    cfg.page,
      sort:    sf ? { field: sf.field, order: sf.order === 1 ? 'asc' : 'desc' } : undefined,
    })
  }

  // ── OAuth2 Column toggle helpers ──────────────────────────────────────────

  private buildOAuthTranslatedColumns(): void {
    this.oauthTranslatedColumnDefs = this.oauthColumnDefs.map(col => ({
      ...col,
      translatedHeader: this.translate.instant(col.header),
    })) as (ShColumnDef & { translatedHeader: string })[]
    this.oauthSelectedCols = this.oauthTranslatedColumnDefs.filter(def =>
      this.oauthSelectedCols.some(s => s.field === def.field)
    )
  }

  onOAuthColSelectChange(event: { value: ShColumnDef[] }, ms: { hide: () => void }): void {
    this.oauthSelectedCols = this.oauthTranslatedColumnDefs.filter(def =>
      event.value.some(c => c.field === def.field)
    )
    if (event.value.length === 0 || event.value.length === this.oauthTranslatedColumnDefs.length) {
      ms.hide()
    }
  }

  onOAuthTableStateChange(event: ShTableEvent): void {
    this.oauthPagination.set(event.pagination)
    if (event.sort) this.oauthSort.set(event.sort)

    // oauthActiveRawFilters is the single source of truth for filters.
    // event.filters comes from base-data-table's internal columnFilters which
    // can be stale when custom filter components are used — never merge it back in.
    const rawFilters = this.oauthActiveRawFilters()

    // Build backend filter — map 'token' field to 'token_status' for the backend
    const filter: OAuth2CredentialFilter = {}
    for (const [field, val] of Object.entries(rawFilters)) {
      if (val?.value !== null && val?.value !== undefined && val?.value !== '' &&
          !(Array.isArray(val?.value) && val.value.length === 0)) {
        const backendField = field === 'token' ? 'token_status' : field
        ;(filter as any)[backendField] = { value: val.value, match_mode: val.matchMode ?? 'contains' }
      }
    }

    this.oauthDto.set({
      config: {
        page: event.pagination.page,
        rows: event.pagination.limit,
        sort_field: event.sort
          ? [{ field: event.sort.field, order: event.sort.order === 'asc' ? 1 : -1 }]
          : [],
      },
      filter,
    })
  }

  getOAuthActiveFilterValue(field: string): any {
    return this.oauthActiveRawFilters()[field]?.value ?? null
  }

  getOAuthActiveFilterMatchMode(field: string): string | null {
    return this.oauthActiveRawFilters()[field]?.matchMode ?? null
  }

  onOAuthTextApply(field: string, event: { value: any; matchMode: string } | null): void {
    if (event === null || event === undefined) {
      this.onOAuthFilterClear(field)
    } else {
      let value = event.value
      if (value instanceof Date) {
        value = formatDateForBackend(value)
      }
      const updated = {
        ...this.oauthActiveRawFilters(),
        [field]: { value, matchMode: event.matchMode ?? 'contains' },
      }
      this.oauthActiveRawFilters.set(updated)
      this.buildOAuthFilterChips(updated)
      this.onOAuthTableStateChange({
        pagination: { ...this.oauthPagination(), page: 1 },
        sort: this.oauthSort(),
      })
    }
  }

  onOAuthFilterApply(field: string, values: any[]): void {
    const matchMode = 'in'
    const updated = {
      ...this.oauthActiveRawFilters(),
      [field]: values?.length ? { value: values, matchMode } : undefined,
    }
    this.oauthActiveRawFilters.set(updated)
    this.buildOAuthFilterChips(updated)
    this.onOAuthTableStateChange({
      pagination: { ...this.oauthPagination(), page: 1 },
      sort: this.oauthSort(),
    })
  }

  onOAuthFilterClear(field: string): void {
    const { [field]: _removed, ...rest } = this.oauthActiveRawFilters()
    this.oauthActiveRawFilters.set(rest)
    this.buildOAuthFilterChips(rest)
    this.onOAuthTableStateChange({
      pagination: { ...this.oauthPagination(), page: 1 },
      sort: this.oauthSort(),
    })
  }

  removeOAuthFilterChip(field: string): void {
    this.onOAuthFilterClear(field)
  }

  private buildOAuthFilterChips(filters: Record<string, any>): void {
    const chips: ActiveFilterChip[] = []
    for (const field of Object.keys(filters ?? {})) {
      const raw = filters[field]?.value
      if (this.isEmptyOAuthFilterValue(raw)) continue

      const col = this.oauthColumnDefs.find(c => c.field === field)
      const label = col ? this.translate.instant(col.header) : field
      chips.push({ field, label, displayValue: this.formatOAuthChipValue(field, raw) })
    }
    this.activeOAuthFilters.set(chips)
  }

  private isEmptyOAuthFilterValue(value: unknown): boolean {
    return value === null || value === undefined || value === '' ||
      (Array.isArray(value) && value.length === 0)
  }

  private formatOAuthChipValue(field: string, raw: unknown): string {
    if (Array.isArray(raw)) {
      if (field === 'environment') {
        return raw.map((v: string) => this.oauthEnvOptions().find(o => o.value === v)?.label ?? v).join(', ')
      }
      if (field === 'token') {
        return raw.map((v: string) => this.oauthTokenStatusOptions().find(o => o.value === v)?.label ?? v).join(', ')
      }
      return raw.join(', ')
    }
    // Format dates to show only yyyy-MM-dd
    if (field === 'updated_at' && typeof raw === 'string' && raw.length > 10) {
      return raw.substring(0, 10)
    }
    return String(raw)
  }

  private getTokenStatus(item: OAuth2CredentialResponse): string {
    if (!item.token) return 'no_token'
    return this.isTokenValid(item.token.exp) ? 'valid' : 'expired'
  }

  // ── API Keys Column toggle helpers ────────────────────────────────────────

  private buildKeyTranslatedColumns(): void {
    this.keyTranslatedColumnDefs = this.keyColumnDefs.map(col => ({
      ...col,
      translatedHeader: this.translate.instant(col.header),
    })) as (ShColumnDef & { translatedHeader: string })[]
    this.keySelectedCols = this.keyTranslatedColumnDefs.filter(def =>
      this.keySelectedCols.some(s => s.field === def.field)
    )
    this.updateKeyColumnWidths()
  }

  onKeyColSelectChange(event: { value: ShColumnDef[] }, ms: { hide: () => void }): void {
    const prevFields = new Set(this.keySelectedCols.map(c => c.field))
    this.keySelectedCols = this.keyTranslatedColumnDefs.filter(def =>
      event.value.some(c => c.field === def.field)
    )
    const newFields = new Set(this.keySelectedCols.map(c => c.field))
    const removedFields = [...prevFields].filter(f => !newFields.has(f))
    if (removedFields.length > 0) this.clearKeyFiltersForHiddenColumns(removedFields)
    this.updateKeyColumnWidths()
    if (event.value.length === 0 || event.value.length === this.keyTranslatedColumnDefs.length) {
      ms.hide()
    }
  }

  /** Clears API Keys filter state for columns that were just hidden by the user. */
  private clearKeyFiltersForHiddenColumns(removedFields: string[]): void {
    let changed = false
    const filters = { ...this.keyActiveRawFilters }
    for (const field of removedFields) {
      if (field in filters) { delete filters[field]; changed = true }
    }
    if (!changed) return
    this.keyActiveRawFilters = filters
    this.buildKeyFilterChips(filters)
    this.keyDto.update(d => ({
      ...d,
      config: { ...d.config, populate_data: false, page: 1 },
      filter: {
        ...(filters['facility_id']?.value ? { facility_id: { value: filters['facility_id'].value, match_mode: 'in'       } } : {}),
        ...(filters['name']?.value        ? { name:        { value: filters['name'].value,        match_mode: 'contains' } } : {}),
        ...(filters['status']?.value      ? { status:      { value: filters['status'].value,      match_mode: 'in'       } } : {}),
        ...(filters['created_at']?.value  ? { created_at:  { value: filters['created_at'].value,  match_mode: 'contains' } } : {}),
      } as KeyFilter,
    }))
    this.saveKeyState()
  }

  onKeyTableStateChange(event: ShTableEvent): void {
    // The global facility selector moved: drop our own copy of the facility
    // filter too, or it survives here and re-enters the request once the scope
    // is released — with no column filter left to reveal it.
    if (event.facilityScopeChanged) {
      this.keyActiveRawFilters = dropFacilityFilters(this.keyActiveRawFilters)
    }

    // Update pagination immediately so the paginator reflects the new page
    this.keyPagination.set(event.pagination)
    // Track sort signal so the blue column indicator appears and clears correctly
    if (event.sort) this.keySort.set(event.sort)

    const f = event.filters ?? {}
    this.keyActiveRawFilters = f
    this.buildKeyFilterChips(f)
    this.keyDto.update(d => ({
      ...d,
      config: {
        populate_data: true,
        page: event.pagination.page,
        rows: event.pagination.limit,
        sort_field: event.sort
          ? [{ field: event.sort.field, order: event.sort.order === 'asc' ? 1 : -1 }]
          : d.config.sort_field,
      },
      filter: {
        ...(f['facility_id']?.value ? { facility_id: { value: f['facility_id'].value, match_mode: 'in'       } } : {}),
        ...(f['name']?.value        ? { name:        { value: f['name'].value,        match_mode: 'contains' } } : {}),
        ...(f['status']?.value      ? { status:      { value: f['status'].value,      match_mode: 'in'       } } : {}),
        ...(f['created_at']?.value  ? { created_at:  { value: f['created_at'].value,  match_mode: 'contains' } } : {}),
      } as KeyFilter,
    }))
    this.saveKeyState()
  }

  onKeyTextApply(field: string, event: { value: any; matchMode: string } | null): void {
    if (event === null || event === undefined) {
      this.onKeyFilterClear(field)
    } else {
      this.onKeyTableStateChange({
        pagination: { ...this.keyPagination(), page: 1 },
        sort: undefined,
        filters: {
          ...this.keyActiveRawFilters,
          [field]: { value: event.value, matchMode: event.matchMode ?? 'contains' },
        },
      })
    }
  }

  onKeyFilterApply(field: string, values: any[]): void {
    this.onKeyTableStateChange({
      pagination: { ...this.keyPagination(), page: 1 },
      sort: undefined,
      filters: {
        ...this.keyActiveRawFilters,
        [field]: values?.length ? { value: values, matchMode: 'in' } : undefined,
      },
    })
  }

  onKeyFilterClear(field: string): void {
    const { [field]: _removed, ...rest } = this.keyActiveRawFilters
    this.onKeyTableStateChange({
      pagination: { ...this.keyPagination(), page: 1 },
      sort: undefined,
      filters: rest,
    })
  }

  toggleKeyMenu(event: Event, key: OperatorKey): void {
    this.keyMenuItems = this.getKeyActions(key).map((a) => ({
      label: a.label,
      icon: a.icon,
      command: a.command,
      separator: (a as any).separator,
      styleClass: (a as any).severity === 'danger' ? 'text-red-500' : undefined,
    }))
    this.keyMenu.toggle(event)
  }

  clearKeyFilters(): void {
    this.tableState.clear('logic:credentials-keys')
    this.keyActiveRawFilters = {}
    this.keySort.set(undefined)
    this.keyDto.set({
      config: { populate_data: true, page: 1, rows: 15, sort_field: [] },
      filter: {} as KeyFilter,
    })
  }

  clearOAuthFilters(): void {
    this.oauthActiveRawFilters.set({})
    this.activeOAuthFilters.set([])
    this.oauthSort.set(undefined)
    this.oauthDto.set({
      config: { page: 1, rows: 15, sort_field: [] },
      filter: {},
    })
  }

  // ── Type Chooser ──────────────────────────────────────────────────────

  openTypeChooser(): void {
    this.ref = this.dialogService.open(CredentialTypeChooserComponent, {
      header: this.translate.instant('labels.new_credential'),
      width: '640px',
      closable: true,
      contentStyle: { overflow: 'visible' },
      baseZIndex: 10000,
    })
    this.ref?.onClose.subscribe((kind: CredentialKind | null) => {
      if (!kind) return
      switch (kind) {
        case 'operator-key':
          this.openOperatorKeyForm()
          break
        case 'facility-key':
          this.openFacilityKeyForm()
          break
        case 'oauth2':
          this.openOAuth2Form()
          break
      }
    })
  }

  private openFacilityKeyForm(key?: OperatorKey): void {
    this.ref = this.dialogService.open(FacilityKeyFormComponent, {
      header: key ? this.translate.instant('buttons.edit') : 'Facility Key',
      width: '380px',
      closable: true,
      closeOnEscape: false,
      contentStyle: { overflow: 'auto' },
      baseZIndex: 10000,
      data: { key, facilities: this.facilities() },
    })
    this.ref?.onClose.subscribe((r: unknown) => {
      if (r) this.loadKeys()
    })
  }

  private openOperatorKeyForm(key?: OperatorKey): void {
    this.ref = this.dialogService.open(OperatorKeyFormComponent, {
      header: key ? this.translate.instant('buttons.edit') : 'Operator Key',
      width: '380px',
      closable: true,
      closeOnEscape: false,
      contentStyle: { overflow: 'auto' },
      baseZIndex: 10000,
      data: { key },
    })
    this.ref?.onClose.subscribe((r: unknown) => {
      if (r) this.loadKeys()
    })
  }

  openOAuth2Form(
    credential: OAuth2CredentialResponse | null = null
  ): void {
    this.ref = this.dialogService.open(OAuth2FormComponent, {
      header: credential
        ? `${this.translate.instant('buttons.edit')} — ${credential.provider_name}`
        : this.translate.instant('labels.new_credential'),
      width: '520px',
      closable: true,
      closeOnEscape: false,
      contentStyle: { overflow: 'auto' },
      baseZIndex: 10000,
      data: { credential },
    })
    this.ref?.onClose.subscribe((r: unknown) => {
      if (r) this.loadOAuth()
    })
  }

  // ── API Keys ──────────────────────────────────────────────────────────

  loadKeys(): void {
    this.keyState.update((s) => ({ ...s, loading: true, data: [] }))
    this.svc
      .listKeys({
        ...this.keyDto(),
        // Operator-level keys (facility_id NULL) stay in the list only while
        // the topbar includes "No facility".
        filter: scopeApiFilter(this.keyDto().filter ?? {}, this.facilityScope.apiValue()),
      })
      .subscribe({
        next: (resp: KeyListResponse<OperatorKey>) => {
          this.keyState.set({
            facilities: resp.facilities ?? this.keyState().facilities,
            data: resp.data ?? [],
            meta_data: resp.meta_data,
            loaded: true,
            loading: false,
            error: null,
          })
          this.keyPagination.update(p => ({
            ...p,
            page: resp.meta_data.page || 1,
            total: resp.meta_data.total_records,
            limit: resp.meta_data.rows || p.limit,
          }))
          this.updateKeyColumnWidths()
          // Re-build chips now that facilities are loaded so IDs are resolved to names.
          // This fixes the timing issue where chips were built in constructor before
          // the API response populated keyState().facilities.
          this.buildKeyFilterChips(this.keyActiveRawFilters)
        },
        error: (err: unknown) => {
          this.keyState.set({ ...DEFAULT_KEY_STATE, error: err, loading: false })
        },
      })
  }

  toggleKeyVisibility(row: OperatorKey): void {
    row.showKey = !row.showKey
    this.updateKeyColumnWidths()
  }

  updateKeyColumnWidths(): void {
    const visibleKeys = this.keyState().data.filter((row) => row.showKey)
    let widthStr = '14rem'
    if (visibleKeys.length > 0) {
      const maxLength = Math.max(...visibleKeys.map((row) => row.api_key?.length || 0))
      // 0.55rem per character + 6.5rem for padding and the action buttons (eye, copy)
      const calculatedWidth = (maxLength * 0.55) + 6.5
      widthStr = `${calculatedWidth}rem`
    }

    this.keySelectedCols = this.keySelectedCols.map((col) => {
      if (col.field === 'api_key') {
        return { ...col, width: widthStr }
      }
      return col
    })
  }

  getKeyActions(key: OperatorKey): ShActionItem[] {
    return [
      {
        label: this.translate.instant('buttons.edit'),
        icon: 'pi pi-pencil',
        command: () =>
          this.isAccountKey(key)
            ? this.openFacilityKeyForm(key)
            : this.openOperatorKeyForm(key),
      },
      {
        label: this.translate.instant(
          this.getKeyStatus(key) === 'active' ? 'buttons.revoke' : 'buttons.activate'
        ),
        icon: this.getKeyStatus(key) === 'active' ? 'pi pi-ban' : 'pi pi-check',
        command: () => this.confirmToggleKeyStatus(key),
      },
      { separator: true, label: '' },
      {
        label: this.translate.instant('buttons.delete'),
        icon: 'pi pi-trash',
        severity: 'danger',
        separator: true,
        command: () => this.confirmDeleteKey(key),
      },
    ]
  }

  /** Asks for confirmation, then revokes or activates the key depending on its current status. */
  private confirmToggleKeyStatus(key: OperatorKey): void {
    const action = this.getKeyStatus(key) === 'active' ? 'revoke' : 'activate'
    this.confirmationService.confirm({
      message: this.translate.instant(
        `messages.confirmation_${action}_msg`
      ),
      header: this.translate.instant(`messages.confirmation_${action}`),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        if (!key.id) return
        this.keyState.update((s) => ({ ...s, loading: true, data: [] }))
        const obs =
          action === 'revoke'
            ? this.svc.revokeKey(key.id)
            : this.svc.activateKey(key.id)
        obs.subscribe({
          next: () => this.loadKeys(),
          error: () =>
            this.keyState.update((s) => ({ ...s, loading: false })),
        })
      },
    })
  }

  /** Asks for confirmation, then deletes the key. */
  private confirmDeleteKey(key: OperatorKey): void {
    this.confirmationService.confirm({
      message: this.translate.instant('messages.confirmation_delete_msg'),
      header: this.translate.instant('messages.confirmation_delete'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        if (!key.id) return
        this.keyState.update((s) => ({ ...s, loading: true, data: [] }))
        this.svc.deleteKey(key.id).subscribe({
          next: () => this.loadKeys(),
          error: () =>
            this.keyState.update((s) => ({ ...s, loading: false })),
        })
      },
    })
  }

  isAccountKey(key: OperatorKey): boolean {
    return !!key.facility_id && String(key.facility_id) !== '0'
  }

  getFacilityName(facilityId: string | undefined): string {
    if (!facilityId || facilityId === '0') return '—'
    const facility = this.facilities().find(
      (a) => String(a.id) === String(facilityId)
    )
    return facility?.name || facility?.code || facilityId
  }

  copyKey(key: OperatorKey): void {
    navigator.clipboard.writeText(String(key?.api_key ?? ''))
  }

  getKeyStatus(key: OperatorKey): string {
    if (key.status) return key.status.toLowerCase()
    if (key.expires_at && new Date(key.expires_at) < new Date())
      return 'expired'
    return 'active'
  }

  getStatusSeverity(status: string): 'success' | 'danger' | 'warn' | 'info' {
    switch (status.toLowerCase()) {
      case 'active':
        return 'success'
      case 'expired':
        return 'danger'
      case 'revoked':
        return 'warn'
      default:
        return 'info'
    }
  }

  // ── OAuth2 ────────────────────────────────────────────────────────────

  loadOAuth(): void {
    this.oauthLoading.set(true)
    this.oauthAllItems.set([])
    this.svc.listOAuth2Paginated(this.oauthDto()).subscribe({
      next: (res: OAuth2ListResponse) => {
        this.oauthAllItems.set(res.data)
        this.oauthPagination.update(p => ({
          ...p,
          page: res.meta_data.page || p.page,
          total: res.meta_data.total_records,
          limit: res.meta_data.rows || p.limit,
        }))
        this.oauthLoading.set(false)
      },
      error: () => {
        this.oauthAllItems.set([])
        this.oauthLoading.set(false)
      },
    })
  }

  testOAuth(item: OAuth2CredentialResponse): void {
    this.testingProvider.set(item.provider_name)
    this.svc.testOAuth2Token(item.provider_name).subscribe({
      next: (res: { message: string; preview: string }) => {
        this.testingProvider.set(null)
        this.messageService.add({
          severity: 'success',
          summary: `[${item.provider_name}] ${this.translate.instant('credential_types.oauth2.test_connection_ok')}`,
          detail: `${translateOAuth2TestSuccess(res.message, this.translate)} (${res.preview})`,
          life: 5000,
        })
        this.loadOAuth()
      },
      error: (err: { message?: string }) => {
        this.testingProvider.set(null)
        this.messageService.add({
          severity: 'error',
          summary: `[${item.provider_name}] ${this.translate.instant('credential_types.oauth2.test_connection_failed')}`,
          detail: translateOAuth2TestError(err?.message ?? '', this.translate),
          life: 8000,
        })
      },
    })
  }

  isTokenValid(exp: number): boolean {
    return Date.now() < exp * 1000 - 5 * 60 * 1000
  }
  getExpDate(exp: number): string {
    return new Date(exp * 1000).toISOString().split('T')[0]
  }

  toggleOAuthMenu(event: Event, item: OAuth2CredentialResponse): void {
    this.oauthMenuItems = [
      {
        label: this.translate.instant('buttons.edit'),
        icon: 'pi pi-pencil',
        command: () => this.openOAuth2Form(item),
      },
      {
        label: this.translate.instant('buttons.test_connection'),
        icon: 'pi pi-bolt',
        command: () => this.testOAuth(item),
      },
      { separator: true },
      {
        label: this.translate.instant('buttons.delete'),
        icon: 'pi pi-trash',
        command: () => {
          this.confirmationService.confirm({
            message: this.translate.instant('messages.confirmation_delete_msg'),
            header: this.translate.instant('messages.confirmation_delete'),
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
              this.oauthLoading.set(true)
              this.oauthAllItems.set([])
              this.svc
                .deleteOAuth2(item.provider_name)
                .subscribe({ next: () => this.loadOAuth() })
            },
          })
        },
      },
    ]
    this.oauthMenu.toggle(event)
  }
}