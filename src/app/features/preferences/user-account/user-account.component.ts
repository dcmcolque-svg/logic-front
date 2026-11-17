import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
import { CommonModule, DatePipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { startWith } from 'rxjs'
import { ConfirmationService, MessageService, MenuItem } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog'
import { Menu, MenuModule } from 'primeng/menu'
import { MultiSelectModule } from 'primeng/multiselect'
import { TagModule } from 'primeng/tag'
import { ToastModule } from 'primeng/toast'
import { AvatarModule } from 'primeng/avatar'
import { TooltipModule } from 'primeng/tooltip'
import { ChipModule } from 'primeng/chip'
import { InputTextModule } from 'primeng/inputtext'
import { DatePickerModule } from 'primeng/datepicker'
import { FilterTextInputComponent } from '../../../shared/components/filter-text-input/filter-text-input.component'
import { FilterDateInputComponent } from '../../../shared/components/filter-date-input/filter-date-input.component'
import { FilterMultiselectPanelComponent } from '../../../shared/components/filter-multiselect-panel/filter-multiselect-panel.component'

import { TranslateLanService } from '../../../core/services/translate-lan.service'
import { CapitalizePipe } from '../../../shared/pipes/capitalize.pipe'
import { FilterApplyService } from '../../../shared/components/filter-clear/filter-apply.service'
import { BaseDataTable } from '../../../shared/components/datatable/data-table/base-data-table.component'
import {
  ShColumnDef,
  ShPaginationConfig,
  ShSortConfig,
  ShTableEvent,
  ActiveFilterChip,
} from '../../../shared/types/table.types'
import { buildFilterChipsFromColumns } from '../../../shared/utils/filter-chips.util'
import { formatDateForBackend } from '../../../shared/utils/date.util'

import { UserAccountService } from './user-account.service'
import { UserAccountFormComponent } from './user-account-form.component'
import {
  AuthUser,
  AuthUserFilter,
  AuthUserListRequest,
  AuthUserListResponse,
  Facility,
  InviteUsersDto,
  Role,
} from './user-account.types'
import { DateSeparatePipe } from '@/app/shared/pipes/date-separate.pipe'
import { TimeSeparatePipe } from '@/app/shared/pipes/time-separate.pipe'
import { TableStateService } from '../../../shared/services/table-state.service'

// ── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_REQUEST = (populateData = false): AuthUserListRequest => ({
  config: { populate_data: populateData, page: 1, rows: 15, sort_field: [] },
  filter: {},
})

const DEFAULT_RESP: AuthUserListResponse = {
  data: [],
  meta_data: { page: 0, rows: 0, total_records: 0 },
  facilities: [],
  roles: [],
}

// ── Column definitions ─────────────────────────────────────────────────────────

const ALLOWED_COLUMNS: ShColumnDef[] = [
  {
    field: 'avatar',
    header: '',
    sortable: false,
    filterable: false,
    template: 'avatar',
    width: '3.5rem',
    mobileVisible: true,
  },
  {
    field: 'full_name',
    header: 'labels.full_name',
    sortable: true,
    filterable: true,
    filterType: 'text',
    template: 'user',
    width: '16rem',
    mobileLabel: true,
  },
  {
    field: 'facilities',
    header: 'labels.facilities',
    sortable: false,
    filterable: true,
    filterType: 'multiselect',
    template: 'facilities',
    width: '12rem',
    mobileVisible: true,
  },
  {
    field: 'email',
    header: 'labels.email',
    sortable: true,
    filterable: true,
    filterType: 'text',
    template: 'email',
    width: '16rem',
  },

  {
    field: 'role_id',
    header: 'labels.role_id',
    sortable: true,
    filterable: true,
    filterType: 'multiselect',
    template: 'role',
    width: '10rem',
    mobileVisible: true,
  },
  {
    field: 'user_status',
    header: 'labels.user_status',
    sortable: true,
    filterable: true,
    filterType: 'multiselect',
    template: 'status',
    width: '10rem',
    mobileVisible: true,
  },
  {
    field: 'created_at',
    header: 'labels.created_at',
    sortable: true,
    filterable: true,
    filterType: 'date',
    template: 'date',
    width: '13rem',
  },
  {
    field: 'last_login_at',
    header: 'labels.last_login_at',
    sortable: true,
    filterable: true,
    filterType: 'date',
    template: 'date',
    width: '12rem',
  },
  {
    field: 'is_active',
    header: 'labels.is_active',
    sortable: true,
    filterable: true,
    filterType: 'multiselect',
    template: 'active',
    width: '10rem',
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-user-account',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    MenuModule,
    MultiSelectModule,
    ConfirmDialogModule,
    TagModule,
    ToastModule,
    CapitalizePipe,
    DatePipe,
    DateSeparatePipe,
    TimeSeparatePipe,
    AvatarModule,
    TooltipModule,
    ChipModule,
    InputTextModule,
    DatePickerModule,
    FilterTextInputComponent,
    FilterDateInputComponent,
    FilterMultiselectPanelComponent,
    BaseDataTable,
  ],
  providers: [DialogService, ConfirmationService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-confirmDialog
      acceptButtonStyleClass="p-button-text"
      rejectButtonStyleClass="p-button-text"
    />
    <p-menu #menuitem [popup]="true" appendTo="body" [model]="menuItems" />

    <!-- ── Page Header ── -->
    <div
      class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4"
    >
      <div>
        <h5 class="text-2xl font-bold m-0 mb-1 text-color">
          {{ 'pages.user_account' | translate }}
        </h5>
        <p class="text-surface-500 text-sm m-0">
          {{ 'preferences.user_account.subtitle' | translate }}
        </p>
      </div>
      <div class="flex gap-2">
        <p-button
          icon="pi pi-user-plus"
          [label]="'preferences.user_account.new_user' | translate"
          (click)="showDialog()"
          size="small"
        />
        <p-button
          [label]="'buttons.clear' | translate"
          icon="pi pi-filter-slash"
          [outlined]="true"
          severity="secondary"
          (click)="clearFilters()"
          size="small"
        />
      </div>
    </div>

    <!-- ── Table ── -->
    <div class="card">
      <base-data-table
        [columns]="selectedCols"
        [data]="usersResp().data"
        [loading]="loading"
        [pagination]="pagination()"
        [sort]="currentSort()"
        [initialFilters]="activeBackendFilters"
        [activeFilterChips]="activeFilters()"
        (stateChange)="onTableStateChange($event)"
        (chipRemoved)="removeFilterChip($event)"
      >

        <!-- Filter row -->
        <ng-template #filterRow let-columns="columns">
          <!-- Leading empty cell for the actions column (matches header row) -->
          <th style="width: 4rem"></th>
          @for (col of columns; track col.field) {
            <th class="filter-th">
              @switch (col.field) {

                @case ('full_name') {
                  <shipedge-filter-text-input
                    [value]="getActiveFilterValue('full_name')"
                    [placeholder]="'labels.full_name' | translate"
                    (applyWithMode)="onColumnFilterChange('full_name', $event)"
                  />
                }

                @case ('email') {
                  <shipedge-filter-text-input
                    [value]="getActiveFilterValue('email')"
                    [placeholder]="'labels.email' | translate"
                    (applyWithMode)="onColumnFilterChange('email', $event)"
                  />
                }


                @case ('facilities') {
                  <shipedge-filter-multiselect-panel
                    [options]="getFacilityOptions()"
                    optionLabel="label"
                    optionValue="value"
                    [placeholder]="'labels.facility' | translate"
                    [showFilter]="getFacilityOptions().length > 5"
                    [value]="facilityFilter()"
                    (apply)="onFacilityFilterChange($event)"
                    (clear)="onFacilityFilterChange([])"
                  />
                }

                @case ('role_id') {
                  <shipedge-filter-multiselect-panel
                    [options]="getRoleOptions()"
                    optionLabel="label"
                    optionValue="value"
                    [placeholder]="'labels.role_id' | translate"
                    [showFilter]="getRoleOptions().length > 5"
                    [value]="roleFilter()"
                    (apply)="onRoleFilterChange($event)"
                    (clear)="onRoleFilterChange([])"
                  />
                }

                @case ('user_status') {
                  <shipedge-filter-multiselect-panel
                    [options]="statusOptions"
                    optionLabel="state"
                    optionValue="id"
                    [placeholder]="'labels.user_status' | translate"
                    [value]="statusFilter()"
                    (apply)="onStatusFilterChange($event)"
                    (clear)="onStatusFilterChange([])"
                  />
                }

                @case ('is_active') {
                  <shipedge-filter-multiselect-panel
                    [options]="activeOptions"
                    optionLabel="label"
                    optionValue="value"
                    [placeholder]="'labels.is_active' | translate"
                    [value]="activeFilter()"
                    (apply)="onActiveFilterChange($event)"
                    (clear)="onActiveFilterChange([])"
                  />
                }

                @case ('created_at') {
                  <shipedge-filter-date-input
                    [value]="getActiveFilterValue('created_at')"
                    [matchMode]="getActiveFilterMatchMode('created_at')"
                    [placeholder]="'labels.created_at' | translate"
                    (applyWithMode)="onColumnFilterChange('created_at', $event)"
                  />
                }

                @case ('last_login_at') {
                  <shipedge-filter-date-input
                    [value]="getActiveFilterValue('last_login_at')"
                    [matchMode]="getActiveFilterMatchMode('last_login_at')"
                    [placeholder]="'labels.last_login_at' | translate"
                    (applyWithMode)="onColumnFilterChange('last_login_at', $event)"
                  />
                }
              }
            </th>
          }
        </ng-template>

        <!-- Custom cell rendering -->
        <ng-template #cell let-row let-col="col">
          @switch (col.template) {
            @case ('avatar') {
              <p-avatar
                [image]="row.user_img || undefined"
                [label]="!row.user_img ? getInitials(row) : ''"
                [icon]="!row.user_img && !getInitials(row) ? 'pi pi-user' : ''"
                shape="circle"
                size="normal"
              />
            }
            @case ('user') {
              <span
                style="font-weight:600;font-size:.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block"
                [pTooltip]="row.full_name || ''"
                tooltipPosition="top"
              >
                {{ row.full_name || '—' }}
              </span>
            }
            @case ('email') {
              <span
                style="font-size:.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block"
                [pTooltip]="row.email || ''"
                tooltipPosition="top"
              >
                {{ row.email || '—' }}
              </span>
            }
            @case ('facilities') {
              @if (row.facility_ids?.length) {
                <div class="flex align-items-center gap-2 flex-nowrap">
                  <div
                    class="flex align-items-center gap-1 px-2 border-round-3xl white-space-nowrap overflow-hidden"
                    style="height:1.5rem;background:color-mix(in srgb,var(--primary-color) 10%,transparent);max-width:8.5rem"
                  >
                    <span
                      class="border-circle flex-shrink-0"
                      style="width:.4rem;height:.4rem;background:var(--primary-color);opacity:.85"
                    ></span>
                    <span
                      class="text-xs font-medium overflow-hidden text-overflow-ellipsis"
                      style="color:var(--primary-color)"
                      >{{ getFacilityName(row.facility_ids[0]) }}</span
                    >
                  </div>
                  @if (row.facility_ids.length > 1) {
                    <span
                      class="flex-shrink-0 text-xs font-semibold px-1 border-round cursor-pointer"
                      style="height:1.5rem;line-height:1.5rem;background:var(--surface-100);color:var(--text-color-secondary)"
                      [pTooltip]="
                        row.facility_ids
                          .slice(1)
                          .map(getFacilityName.bind(this))
                          .join(
                            '
'
                          )
                      "
                      tooltipPosition="top"
                      >+{{ row.facility_ids.length - 1 }}</span
                    >
                  }
                </div>
              } @else {
                <span class="text-surface-300">—</span>
              }
            }
            @case ('status') {
              <div class="flex flex-col gap-1">
                <p-tag
                  [value]="'labels.' + row.user_status | translate | capitalize"
                  [severity]="getStatusSeverity(row.user_status)"
                  [rounded]="true"
                />
                <!-- EDGE-1357: code chip — masked by default, toggle to reveal -->
                @if (row.user_status === 'invited') {
                  @let code = row.invite_code || row.invite_metadata?.code;
                  @if (code) {
                    @let revealed = visibleCodeIds().has(row.id);
                    @let expired = isInviteExpired(row);
                    <div class="flex items-center gap-1 mt-1">
                      <!-- Masked / revealed code -->
                      <span
                        class="font-mono font-bold text-xs tracking-widest px-2 py-0.5 rounded select-none"
                        [style]="expired
                          ? 'background:color-mix(in srgb,var(--surface-400) 20%,transparent);color:var(--surface-500)'
                          : 'background:color-mix(in srgb,var(--amber-400) 15%,transparent);color:var(--amber-600)'"
                        [pTooltip]="expired
                          ? '⚠ ' + ('users.codeExpired' | translate)
                          : ('users.codeExpires' | translate) + ': ' + (row.invite_metadata?.expires_at || row.invite_code_expires_at | date:'yyyy-MM-dd')"
                        tooltipPosition="top"
                      >{{ revealed ? code : '••••••' }}</span>

                      <!-- Toggle visibility -->
                      <p-button
                        [icon]="revealed ? 'pi pi-eye-slash' : 'pi pi-eye'"
                        [text]="true"
                        [rounded]="true"
                        size="small"
                        severity="secondary"
                        [pTooltip]="(revealed ? 'labels.hide_key' : 'labels.show_key') | translate"
                        tooltipPosition="top"
                        (click)="toggleCodeVisibility(row.id)"
                      />

                      @if (expired) {
                        <!-- Warning icon for expired code -->
                        <p-button
                          icon="pi pi-exclamation-triangle"
                          [text]="true"
                          [rounded]="true"
                          size="small"
                          severity="warn"
                          [pTooltip]="'⚠ ' + ('users.codeExpired' | translate)"
                          tooltipPosition="top"
                        />
                      } @else {
                        <!-- Copy -->
                        <p-button
                          icon="pi pi-copy"
                          [text]="true"
                          [rounded]="true"
                          size="small"
                          severity="secondary"
                          [pTooltip]="'users.copyCode' | translate"
                          tooltipPosition="top"
                          (click)="copyInviteCode(code)"
                        />
                      }
                    </div>
                  }
                }
              </div>
            }
            @case ('active') {
              <p-tag
                [value]="
                  (row.is_active ? 'labels.enabled' : 'labels.disabled')
                    | translate
                "
                [severity]="row.is_active ? 'success' : 'danger'"
                [rounded]="true"
                [icon]="row.is_active ? 'pi pi-check' : 'pi pi-times'"
              />
            }
            @case ('role') {
              @if (getRoleName(row.role_id); as roleName) {
                <span
                  class="inline-flex align-items-center gap-1 px-2 py-1 border-round surface-200 text-xs font-medium"
                >
                  <i
                    class="pi pi-shield text-primary"
                    style="font-size:.7rem"
                  ></i
                  >{{ roleName }}
                </span>
              } @else {
                <span class="text-surface-300">—</span>
              }
            }
            @case ('date') {
              @if (row[col.field]) {
                <div class="flex flex-col gap-1">
                  <span class="text-xs font-medium">{{ row[col.field] | dateSeparate }}</span>
                  <span class="text-xs text-primary">{{ row[col.field] | timeSeparate }}</span>
                </div>
              } @else {
                <span class="text-surface-300 text-xs">{{ 'labels.never' | translate }}</span>
              }
            }
          }
        </ng-template>

        <!-- Row actions -->
        <ng-template #actions let-row>
          <p-button
            icon="pi pi-ellipsis-v"
            [text]="true"
            [rounded]="true"
            size="small"
            severity="secondary"
            (click)="onUserOptionsClick($event, row, menuitem)"
          />
        </ng-template>

        <!-- Paginator left: column toggle -->
        <ng-template #paginatorLeft>
          <div class="flex items-center gap-2">
            <p-multiSelect
              #colMs
              [options]="translatedColumnDefs"
              [ngModel]="selectedCols"
              (onChange)="onColSelectChange($event, colMs)"
              optionLabel="translatedHeader"
              [placeholder]="'labels.choose_columns' | translate"
              [selectedItemsLabel]="
                selectedCols.length +
                ' ' +
                ('labels.columns_selected' | translate)
              "
              [maxSelectedLabels]="0"
              size="small"
              appendTo="body"
            >
              <ng-template let-col pTemplate="item">{{
                col.translatedHeader
              }}</ng-template>
            </p-multiSelect>
          </div>
        </ng-template>
      </base-data-table>
    </div>

    <p-toast />
  `,
})
export default class UserAccountComponent implements OnInit {
  private readonly translate = inject(TranslateService)
  private readonly translateLanService = inject(TranslateLanService)
  private readonly svc = inject(UserAccountService)
  private readonly confirmationService = inject(ConfirmationService)
  private readonly messageService = inject(MessageService)
  private readonly dialogService = inject(DialogService)
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly filterservice = inject(FilterApplyService)
  private readonly tableState = inject(TableStateService)
  private readonly STATE_KEY = 'binlogic:users'

  ref: DynamicDialogRef | null | undefined

  // ── State ─────────────────────────────────────────────────────────────

  loading = false
  selectedUser: AuthUser | undefined
  menuItems: MenuItem[] = []
  /** Reference to base-data-table used to reset the sort icon on Clear */
  @ViewChild(BaseDataTable) private readonly baseTable!: BaseDataTable

  // Column definitions (mutable so filterOptions can be updated from API)
  columnDefs: ShColumnDef[] = [...ALLOWED_COLUMNS]
  selectedCols: ShColumnDef[] = [...ALLOWED_COLUMNS]
  translatedColumnDefs: (ShColumnDef & { translatedHeader: string })[] = []

  // EDGE-1357: tracks which user row is generating its code
  generatingCodeForId = signal<string | null>(null)

  // EDGE-1357: set of row IDs whose invite code is currently revealed
  visibleCodeIds = signal<Set<string>>(new Set())

  toggleCodeVisibility(id: string): void {
    this.visibleCodeIds.update((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  /** Returns true when the invite code expiration date is in the past */
  isInviteExpired(row: AuthUser): boolean {
    const expiresAt = row.invite_metadata?.expires_at || row.invite_code_expires_at
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  request = signal<AuthUserListRequest>(DEFAULT_REQUEST(true))
  usersResp = signal<AuthUserListResponse>({ ...DEFAULT_RESP })
  pagination = signal<ShPaginationConfig>({
    page: 1,
    limit: 15,
    total: 0,
    rows_per_page: [15, 30, 50, 100],
  })

  // Catalog signals — populated from response when populate_data:true
  facilities = computed<Facility[]>(() => this.usersResp().facilities ?? [])
  roles = computed<Role[]>(() => this.usersResp().roles ?? [])

  // Cache catalogs across pagination (so they survive populate_data:false calls)
  private _cachedFacilities: Facility[] = []
  private _cachedRoles: Role[] = []
  private _userUpdateInitialized = false

  // ── Filters State ────────────────────────────────────────────────────────
  facilityFilter = signal<string[]>([])
  statusFilter = signal<string[]>([])
  roleFilter = signal<number[]>([])
  activeFilter = signal<boolean[]>([])
  /** Drives [sortField] in base-data-table so the blue icon tracks and clears correctly */
  currentSort = signal<ShSortConfig | undefined>(undefined)

  protected activeBackendFilters: Record<string, any> = {}
  activeFilters = signal<ActiveFilterChip[]>([])

  statusOptions = [
    { id: 'invited', state: 'labels.invited' },
    { id: 'active', state: 'labels.active' },
  ]
  activeOptions = [
    { label: 'labels.enabled', value: true },
    { label: 'labels.disabled', value: false },
  ]

  constructor() {
    effect(() => this.translate.use(this.translateLanService.changeLanguage()))

    // Re-translate column labels and options when language changes
    const langChange = toSignal(
      this.translate.onLangChange.pipe(startWith(null)),
      { initialValue: null }
    )
    effect(() => {
      langChange()
      untracked(() => this.buildTranslatedColumns())
    })
    // Restore persisted state BEFORE the first effect run triggers loadUsers()
    this.restoreSavedState()

    effect(() => {
      this.request()
      untracked(() => this.loadUsers())
    })
    effect(
      () => {
        this.svc.userUpdated()
        if (this._userUpdateInitialized) {
          untracked(() => this.request.update((d) => ({ ...d })))
        }
        this._userUpdateInitialized = true
      },
      { allowSignalWrites: true }
    )
  }

  private restoreSavedState(): void {
    const saved = this.tableState.load(this.STATE_KEY)
    if (!saved?.filters || Object.keys(saved.filters).length === 0) return
    this.activeBackendFilters = saved.filters as Record<string, any>
    // Restore multiselect signals
    if (this.activeBackendFilters['facility_id']?.value) this.facilityFilter.set(this.activeBackendFilters['facility_id'].value)
    if (this.activeBackendFilters['user_status']?.value) this.statusFilter.set(this.activeBackendFilters['user_status'].value)
    if (this.activeBackendFilters['role_id']?.value) this.roleFilter.set(this.activeBackendFilters['role_id'].value)
    if (this.activeBackendFilters['is_active']?.value) this.activeFilter.set(this.activeBackendFilters['is_active'].value)
    const sf = saved.sort
    if (sf) this.currentSort.set(sf)
    this.request.set({
      config: {
        populate_data: true,
        page: saved.page ?? 1,
        rows: 15,
        sort_field: sf ? [{ field: sf.field, order: sf.order === 'asc' ? 1 : -1 }] : [],
      },
      filter: this.activeBackendFilters as AuthUserFilter,
    })
    if (saved.page) this.pagination.update(p => ({ ...p, page: saved.page! }))
  }

  ngOnInit(): void {
    this.translate.get(this.columnDefs.map((c) => c.header)).subscribe(() => {
      this.buildTranslatedColumns()
      // Rebuild chips here — translations are guaranteed loaded at this point
      if (Object.keys(this.activeBackendFilters).length > 0) {
        this.buildFilterChips(this.activeBackendFilters)
      }
    })
    this.translate.onLangChange.subscribe(() => this.buildTranslatedColumns())
  }

  private saveState(): void {
    const cfg = this.request().config
    const sf = cfg.sort_field?.[0]
    this.tableState.save(this.STATE_KEY, {
      filters: this.activeBackendFilters as Record<string, unknown>,
      page: cfg.page,
      sort: sf ? { field: sf.field, order: sf.order === 1 ? 'asc' : 'desc' } : undefined,
    })
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  loadUsers(): void {
    this.loading = true
    this.cdr.markForCheck()
    this.svc.postListFilterUsers(this.request()).subscribe({
      next: (data) => {
        if (data.facilities?.length) this._cachedFacilities = data.facilities
        if (data.roles?.length) this._cachedRoles = data.roles
        data.facilities = data.facilities?.length
          ? data.facilities
          : this._cachedFacilities
        data.roles = data.roles?.length ? data.roles : this._cachedRoles

        this.usersResp.set(data)

        // Rebuild chips now that catalogs are populated — resolves facility/role
        // names correctly when restoring state on page reload or navigation back.
        if (Object.keys(this.activeBackendFilters).length > 0) {
          this.buildFilterChips(this.activeBackendFilters)
        }

        // Sync pagination signal with API response
        this.pagination.update((p) => ({
          ...p,
          page: data.meta_data.page || 1,
          total: data.meta_data.total_records,
          limit: data.meta_data.rows || p.limit,
        }))

        // Refresh dynamic filter options from catalog
        this.columnDefs = this.columnDefs.map((col) => {
          if (col.field === 'facilities')
            return {
              ...col,
              filterOptions: (data.facilities ?? []).map((f) => ({
                label: f.name,
                value: f.id,
              })),
            }
          if (col.field === 'role_id')
            return {
              ...col,
              filterOptions: (data.roles ?? []).map((r) => {
                const key = `roles.${r.role?.toLowerCase()}`
                const translated = this.translate.instant(key)
                return { label: translated === key ? r.display_name : translated, value: r.id }
              }),
            }
          return col
        })
        this.buildTranslatedColumns()

        this.loading = false
        this.cdr.markForCheck()
      },
      error: () => {
        this.loading = false
        this.cdr.markForCheck()
      },
    })
  }

  // -- Table events ----------------------------------------------------------

  onTableStateChange(event: ShTableEvent): void {
    // Skip the initial echo emitted by the paginator on first render
    // (page and limit match the current request, no sort, no filters)
    const currentReq = this.request()
    const isInitialEcho =
      event.pagination.page === currentReq.config.page &&
      event.pagination.limit === currentReq.config.rows &&
      !event.sort &&
      Object.keys(event.filters ?? {}).length === 0
    if (isInitialEcho) return


    // activeBackendFilters is the single source of truth for filters.
    // event.filters comes from PrimeNG's internal column-filter state which can
    // be stale (e.g. after a chip is removed) — never merge it back in.
    if (event.sort) this.currentSort.set(event.sort)
    this.request.set({
      config: {
        populate_data: false,
        page: event.pagination.page,
        rows: event.pagination.limit,
        sort_field: event.sort
          ? [
            {
              field: event.sort.field,
              order: event.sort.order === 'asc' ? 1 : -1,
            },
          ]
          : [],
      },
      filter: this.activeBackendFilters as AuthUserFilter,
    })
    this.saveState()
  }

  onFacilityFilterChange(selectedIds: string[]) {
    this.facilityFilter.set(selectedIds)
    this.updateTableFilter('facility_id', selectedIds)
  }

  onStatusFilterChange(selectedIds: string[]) {
    this.statusFilter.set(selectedIds)
    this.updateTableFilter('user_status', selectedIds)
  }

  onRoleFilterChange(selectedIds: number[]) {
    this.roleFilter.set(selectedIds)
    this.updateTableFilter('role_id', selectedIds)
  }

  onActiveFilterChange(selectedVals: boolean[]) {
    this.activeFilter.set(selectedVals)
    this.updateTableFilter('is_active', selectedVals)
  }

  getActiveFilterValue(field: string): any {
    return this.activeBackendFilters[field]?.value ?? null
  }

  getActiveFilterMatchMode(field: string): string | null {
    return this.activeBackendFilters[field]?.match_mode ?? null
  }

  parseDateFilter(val: string | null): Date | null {
    if (!val) return null
    // Make sure to parse it correctly by replacing hyphens with slashes if needed,
    // or appending T00:00:00 to avoid timezone shift if it's YYYY-MM-DD
    const d = new Date(val + (val.includes('T') ? '' : 'T00:00:00'))
    return Number.isNaN(d.getTime()) ? null : d
  }

  getFacilityOptions(): { label: string; value: string }[] {
    return this._cachedFacilities.map((f) => ({ label: f.name ?? '', value: f.id }))
  }

  getRoleOptions(): { label: string; value: number }[] {
    return this._cachedRoles.map((r) => {
      const key = `roles.${r.role?.toLowerCase()}`
      const translated = this.translate.instant(key)
      return { label: translated === key ? (r.display_name ?? '') : translated, value: r.id }
    })
  }

  onColumnFilterChange(field: string, event: any): void {
    const filters = { ...this.activeBackendFilters }

    // Handle null — filter cleared by the input component
    if (event === null || event === undefined) {
      delete filters[field]
    } else {
      // Unwrap { value, matchMode } from applyWithMode, or use raw value (e.g. Date)
      let value = event?.value === undefined ? event : event.value
      let matchMode: string = event?.matchMode ?? (Array.isArray(value) ? 'in' : 'contains')

      if (value instanceof Date) {
        value = formatDateForBackend(value)
      }

      if (value !== null && value !== undefined && value !== '') {
        filters[field] = { value, match_mode: matchMode }
      } else {
        delete filters[field]
      }
    }

    this.activeBackendFilters = filters
    this.buildFilterChips(filters)
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.saveState()
    this.request.update((d) => ({
      ...d,
      config: { ...d.config, populate_data: false, page: 1 },
      filter: filters as AuthUserFilter,
    }))
  }

  private updateTableFilter(field: string, values: any[]) {
    const filters = { ...this.activeBackendFilters }
    if (values && values.length > 0) {
      filters[field] = { value: values, match_mode: 'in' }
    } else {
      delete filters[field]
    }
    this.activeBackendFilters = filters
    this.buildFilterChips(filters)
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.saveState()
    // Update request so the effect calls loadUsers() with the correct filters
    this.request.update((d) => ({
      ...d,
      config: { ...d.config, populate_data: false, page: 1 },
      filter: filters as AuthUserFilter,
    }))
  }

  removeFilterChip(field: string): void {
    const filters = { ...this.activeBackendFilters }
    delete filters[field]

    if (field === 'facility_id') this.facilityFilter.set([])
    if (field === 'user_status') this.statusFilter.set([])
    if (field === 'role_id') this.roleFilter.set([])
    if (field === 'is_active') this.activeFilter.set([])

    this.activeBackendFilters = filters
    this.buildFilterChips(filters)
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.saveState()
    // Update request so the effect calls loadUsers() with the correct filters
    this.request.update((d) => ({
      ...d,
      config: { ...d.config, populate_data: false, page: 1 },
      filter: filters as AuthUserFilter,
    }))
  }

  clearFilters(): void {
    this.tableState.clear(this.STATE_KEY)
    this.activeBackendFilters = {}
    this.facilityFilter.set([])
    this.statusFilter.set([])
    this.roleFilter.set([])
    this.activeFilter.set([])
    this.activeFilters.set([])
    this.currentSort.set(undefined)
    this.baseTable?.clearSort()
    this.request.set(DEFAULT_REQUEST(false))
  }

  private buildFilterChips(filters: any): void {
    try {
      const resolvers: Record<string, (v: any) => string> = {
        facility_id: (id: string) => this.getFacilityName(id),
        role_id: (id: number) => this.getRoleName(id),
        user_status: (status: string) =>
          this.translate.instant('labels.' + status),
        is_active: (val: boolean) =>
          this.translate.instant(val ? 'labels.enabled' : 'labels.disabled'),
      }
      this.activeFilters.set(
        buildFilterChipsFromColumns(
          filters,
          this.columnDefs,
          this.translate,
          resolvers
        )
      )
    } catch (err) {
      console.error('Error building filter chips:', err)
      this.activeFilters.set([])
    }
  }

  // ── Column toggle ─────────────────────────────────────────────────────────

  private buildTranslatedColumns(): void {
    this.statusOptions = [
      { id: 'active', state: this.translate.instant('labels.active') },
      { id: 'invited', state: this.translate.instant('labels.invited') },
    ]
    this.activeOptions = [
      { label: this.translate.instant('labels.enabled'), value: true },
      { label: this.translate.instant('labels.disabled'), value: false },
    ]

    // Re-translate role filterOptions using cached roles
    this.columnDefs = this.columnDefs.map((col) => {
      if (col.field === 'role_id' && this._cachedRoles.length) {
        return {
          ...col,
          filterOptions: this._cachedRoles.map((r) => {
            const key = `roles.${r.role?.toLowerCase()}`
            const translated = this.translate.instant(key)
            return { label: translated === key ? r.display_name : translated, value: r.id }
          }),
        }
      }
      return col
    })

    this.translatedColumnDefs = this.columnDefs.map((col) => ({
      ...col,
      translatedHeader:
        col.field === 'avatar'
          ? this.translate.instant('labels.avatar')
          : this.translate.instant(col.header),
    })) as (ShColumnDef & { translatedHeader: string })[]
    this.selectedCols = this.translatedColumnDefs.filter((def) =>
      this.selectedCols.some((s) => s.field === def.field)
    )
    this.cdr.markForCheck()
  }

  onColSelectChange(
    event: { value: ShColumnDef[] },
    ms: { hide: () => void }
  ): void {
    const prevFields = new Set(this.selectedCols.map(c => c.field))
    this.selectedCols = this.translatedColumnDefs.filter((def) =>
      event.value.some((c) => c.field === def.field)
    )
    const newFields = new Set(this.selectedCols.map(c => c.field))
    const removedFields = [...prevFields].filter(f => !newFields.has(f))
    if (removedFields.length > 0) this.clearFiltersForHiddenColumns(removedFields)
    if (
      event.value.length === 0 ||
      event.value.length === this.translatedColumnDefs.length
    ) {
      ms.hide()
    }
    this.cdr.markForCheck()
  }

  /** Clears filter state for columns that were just hidden by the user. */
  private clearFiltersForHiddenColumns(removedFields: string[]): void {
    let changed = false
    const filters = { ...this.activeBackendFilters }
    for (const field of removedFields) {
      // 'facilities' column stores its filter under 'facility_id' key
      const filterKey = field === 'facilities' ? 'facility_id' : field
      if (filterKey in filters) { delete filters[filterKey]; changed = true }
      if (field === 'facilities') this.facilityFilter.set([])
      if (field === 'user_status') this.statusFilter.set([])
      if (field === 'role_id') this.roleFilter.set([])
      if (field === 'is_active') this.activeFilter.set([])
    }
    if (!changed) return
    this.activeBackendFilters = filters
    this.buildFilterChips(filters)
    this.pagination.update((p) => ({ ...p, page: 1 }))
    this.saveState()
    this.request.update((d) => ({
      ...d,
      config: { ...d.config, populate_data: false, page: 1 },
      filter: filters as AuthUserFilter,
    }))
  }

  // ── Dialog ────────────────────────────────────────────────────────────────

  showDialog(user?: AuthUser): void {
    this.selectedUser = user
    const titleKey = user
      ? 'preferences.user_account.title_edit_dialog'
      : 'preferences.user_account.title_create_dialog'

    this.translate.get(titleKey).subscribe((header) => {
      this.ref = this.dialogService.open(UserAccountFormComponent, {
        header,
        width: '40rem',
        contentStyle: { overflow: 'auto' },
        baseZIndex: 10000,
        data: {
          user: this.selectedUser,
          roles: this.roles(),
          facilities: this.facilities(),
        },
      })
      this.ref?.onClose.subscribe((result?: AuthUser | InviteUsersDto) => {
        this.selectedUser = undefined
        if (result) this.loadUsers()
      })
    })
  }

  // EDGE-1357: Opens the same form in generate-code mode (no SendGrid)
  showDialogGenerateCode(): void {
    this.translate.get('users.generateCode').subscribe((header) => {
      this.ref = this.dialogService.open(UserAccountFormComponent, {
        header,
        width: '40rem',
        contentStyle: { overflow: 'auto' },
        baseZIndex: 10000,
        data: {
          user: undefined,
          roles: this.roles(),
          facilities: this.facilities(),
          mode: 'generate-code', // TODO(ARCH-BRIEF): form handles this flag
        },
      })
      this.ref?.onClose.subscribe((result?: AuthUser | InviteUsersDto) => {
        if (result) this.loadUsers()
      })
    })
  }

  // ── Row actions ───────────────────────────────────────────────────────────

  onUserOptionsClick(event: Event, user: AuthUser, menu: Menu): void {
    this.selectedUser = user
    const items: MenuItem[] = [
      {
        label: this.translate.instant('buttons.edit'),
        icon: 'pi pi-pencil',
        command: () => this.showDialog(user),
      },
    ]

    if (user.user_status === 'invited') {
      const inviteItems: MenuItem[] = []

      // "Resend Invitation" only for legacy email-invite flow (no access code)
      if (user.invite_metadata?.code) {
        // Always allow renewing the access code for invited users
        inviteItems.push({
          // EDGE-1357: renew (or generate) access code — no SendGrid
          label: this.translate.instant('users.renewCode'),
          icon: 'pi pi-refresh',
          command: () => this.generateCodeForRow(user),
        })

      } else {
        inviteItems.push({
          label: this.translate.instant('buttons.resend_invitation'),
          icon: 'pi pi-send',
          command: () => this.resendInvitation(user),
        })
      }



      items.unshift(...inviteItems)
    } else {
      items.unshift({
        label: user.is_active
          ? this.translate.instant('buttons.deactivate')
          : this.translate.instant('buttons.activate'),
        icon: user.is_active ? 'pi pi-ban' : 'pi pi-check',
        command: () => this.confirmToggleStatus(user),
      })
    }

    this.menuItems = items
    menu.toggle(event)
  }

  resendInvitation(user: AuthUser): void {
    if (user.email) {
      this.svc.resendInvitation(user.email).subscribe({
        next: () => {
          this.loadUsers()
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('labels.success'),
            detail: this.translate.instant(
              'preferences.user_account.invitation_resent',
              { email: user.email }
            ),
            life: 4000,
          })
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant(
              'preferences.user_account.invitation_error_summary'
            ),
            detail: this.translate.instant(
              'preferences.user_account.invitation_resent_error'
            ),
            life: 4000,
          })
        },
      })
    }
  }

  confirmToggleStatus(user: AuthUser): void {
    const activate = !user.is_active
    const msgKey = activate
      ? 'preferences.user_account.msg_confirm_active'
      : 'preferences.user_account.msg_confirm_inactive'
    const headerKey = activate
      ? 'preferences.user_account.confirm_active'
      : 'preferences.user_account.confirm_inactive'

    this.translate.get([msgKey, headerKey]).subscribe((t) => {
      this.confirmationService.confirm({
        message: t[msgKey],
        header: t[headerKey],
        icon: 'pi pi-exclamation-triangle',
        accept: () => {
          if (user.id) {
            const action = activate
              ? this.svc.activateUser(user.id)
              : this.svc.deactivateUser(user.id)
            action.subscribe(() => this.loadUsers())
          }
          this.selectedUser = undefined
        },
      })
    })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getInitials(user: AuthUser): string {
    const name = user.full_name || user.username || user.email || ''
    return name.charAt(0).toUpperCase()
  }

  getRoleName(roleId?: number): string {
    if (!roleId) return ''
    const role = this.roles().find((r) => r.id === roleId)
    if (!role) return String(roleId)
    const key = `roles.${role.role?.toLowerCase()}`
    const translated = this.translate.instant(key)
    return translated === key ? (role.display_name ?? String(roleId)) : translated
  }

  getFacilityName(facilityId?: string): string {
    if (!facilityId) return ''
    const list = this.facilities().length ? this.facilities() : this._cachedFacilities
    return list.find((f) => f.id === facilityId)?.name ?? facilityId
  }

  getStatusSeverity(
    status: string
  ): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'success'
      case 'invited':
        return 'warn'
      case 'inactive':
        return 'danger'
      default:
        return 'secondary'
    }
  }

  // ── EDGE-1357: Invitation Code ─────────────────────────────────────────────

  /** Copies the invitation code to clipboard and shows a success toast */
  copyInviteCode(code: string): void {
    navigator.clipboard.writeText(code).then(() => {
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('users.codeCopied'),
        life: 2500,
      })
    })
  }

  /** Generates an invitation code for a specific user row (inline action) */
  generateCodeForRow(user: AuthUser): void {
    if (!user.id) return
    this.generatingCodeForId.set(user.id)
    this.svc.generateInviteCode(user.id).subscribe({
      next: (res) => {
        // Update the user row in the current response signal
        this.usersResp.update((resp) => ({
          ...resp,
          data: resp.data.map((u) =>
            u.id === user.id
              ? {
                  ...u,
                  invite_code: res.invite_code,
                  invite_code_expires_at: res.invite_code_expires_at,
                  invite_metadata: {
                    ...u.invite_metadata,
                    code: res.invite_code,
                    expires_at: res.invite_code_expires_at,
                  },
                }
              : u
          ),
        }))
        this.generatingCodeForId.set(null)
        this.copyInviteCode(res.invite_code)
        this.cdr.markForCheck()
      },
      error: () => {
        this.generatingCodeForId.set(null)
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('users.generateCodeError'),
          life: 3000,
        })
        this.cdr.markForCheck()
      },
    })
  }
}
