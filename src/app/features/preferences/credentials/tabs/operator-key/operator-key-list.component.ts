import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core'
import { CommonModule, UpperCasePipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ConfirmationService, MenuItem } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { Table, TableLazyLoadEvent, TableModule } from 'primeng/table'
import { InputTextModule } from 'primeng/inputtext'
import { ToastModule } from 'primeng/toast'
import { TooltipModule } from 'primeng/tooltip'
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog'
import { ConfirmDialogModule } from 'primeng/confirmdialog'
import { MenuModule, Menu } from 'primeng/menu'
import { SkeletonModule } from 'primeng/skeleton'
import { TagModule } from 'primeng/tag'
import { MultiSelectModule } from 'primeng/multiselect'

import { TranslateLanService } from '../../../../../core/services/translate-lan.service'
import { DateTimeSeparatePipe } from '../../../../../shared/pipes/datetime-separate.pipe'
import { CapitalizePipe } from '../../../../../shared/pipes/capitalize.pipe'
import { FilterClearComponent } from '../../../../../shared/components/filter-clear/filter-clear.component'
import { FilterInputComponent } from '../../../../../shared/components/filter-input/filter-input.component'
import { FilterApplyService } from '../../../../../shared/components/filter-clear/filter-apply.service'
import { FiltersShip } from '../../../../../shared/components/filter-clear/filters.interface'
import { CredentialsService } from '../../credentials.service'
import {
  Facility,
  Column,
  KeyDTO,
  KeyFilter,
  KeyListResponse,
  FacilityKey,
} from '../../credentials.types'
import { OperatorKeyFormComponent } from './operator-key-form.component'

interface KeyState {
  data: FacilityKey[]
  meta_data: { page: number; rows: number; total_records: number }
  facilities: Facility[]
  loaded: boolean
  loading: boolean
  error: any
}

@Component({
  selector: 'app-operator-key-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    TableModule,
    InputTextModule,
    ToastModule,
    TooltipModule,
    ConfirmDialogModule,
    DateTimeSeparatePipe,
    CapitalizePipe,
    MultiSelectModule,
    MenuModule,
    SkeletonModule,
    TagModule,
    UpperCasePipe,
    FilterClearComponent,
    FilterInputComponent,
  ],
  providers: [DialogService, ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-confirmDialog
      acceptButtonStyleClass="p-button-text"
      rejectButtonStyleClass="p-button-text"
    ></p-confirmDialog>
    <p-menu #menu [model]="menuItems" [popup]="true"></p-menu>

    <div class="card shadow-none">
      <div class="flex justify-between mb-4">
        <div class="flex items-center">
          <h5 class="text-2xl pb-2 font-semibold">
            {{
              'credential_types.facility_keys.description'
                | translate
                | uppercase
            }}
          </h5>
        </div>
        <div class="flex items-center gap-2">
          <p-button
            (click)="openAddDialog()"
            [label]="'buttons.add' | translate"
            icon="pi pi-plus"
          ></p-button>
          <p-button
            [label]="'buttons.clear' | translate"
            severity="secondary"
            [outlined]="true"
            icon="pi pi-filter-slash"
            (click)="clear(dt1)"
          ></p-button>
        </div>
      </div>

      <p-table
        #dt1
        [value]="stateValues().data"
        dataKey="id"
        [paginator]="true"
        [rows]="stateValues().meta_data.rows"
        [loading]="loading"
        [rowHover]="true"
        [rowsPerPageOptions]="[15, 30, 50, 100]"
        styleClass="p-datatable-sm"
        [lazy]="true"
        [columns]="columnsSelect"
        [showCurrentPageReport]="true"
        [reorderableColumns]="true"
        (onLazyLoad)="getDataPaged($event)"
        [totalRecords]="stateValues().meta_data.total_records"
        [sortMode]="'multiple'"
        [customSort]="true"
        [scrollable]="true"
        scrollHeight="60vh"
      >
        <ng-template pTemplate="caption">
          @if (enformato.length > 0) {
            <div class="flex justify-end">
              <nuvex-filter-clear
                (removeEvent)="removeFilter($event)"
                [enformato]="enformato"
              ></nuvex-filter-clear>
            </div>
          }
        </ng-template>

        <ng-template pTemplate="header" let-columns>
          <tr>
            @if (columnsSelect.length > 0) {
              <th rowspan="2" style="width: 4rem"></th>
            }
            @for (col of columns; track col.field) {
              @switch (col.field) {
                @case ('id') {
                  <th style="min-width: 16rem">
                    <div class="flex justify-between items-center">
                      {{ 'labels.key' | translate | capitalize }}
                    </div>
                  </th>
                }
                @case ('name') {
                  <th style="min-width: 12rem" [pSortableColumn]="col.field">
                    <div class="flex justify-between items-center">
                      {{ 'labels.name' | translate | capitalize
                      }}<p-sortIcon [field]="col.field"></p-sortIcon>
                    </div>
                  </th>
                }
                @case ('operator_id') {
                  <th style="min-width: 14rem" [pSortableColumn]="col.field">
                    <div class="flex justify-between items-center">
                      {{ 'labels.facility' | translate | capitalize
                      }}<p-sortIcon [field]="col.field"></p-sortIcon>
                    </div>
                  </th>
                }
                @case ('status') {
                  <th style="min-width: 10rem" [pSortableColumn]="col.field">
                    <div class="flex justify-between items-center">
                      {{ 'labels.status' | translate | capitalize
                      }}<p-sortIcon [field]="col.field"></p-sortIcon>
                    </div>
                  </th>
                }
                @case ('created_at') {
                  <th style="min-width: 12rem" [pSortableColumn]="col.field">
                    <div class="flex justify-between items-center">
                      {{ 'labels.created_at' | translate | capitalize
                      }}<p-sortIcon [field]="col.field"></p-sortIcon>
                    </div>
                  </th>
                }
                @default {
                  <th style="min-width: 12rem" [pSortableColumn]="col.field">
                    <div class="flex justify-between items-center">
                      {{ 'labels.' + col.field | translate | capitalize
                      }}<p-sortIcon [field]="col.field"></p-sortIcon>
                    </div>
                  </th>
                }
              }
            } @empty {
              <th style="min-width: 10rem">
                {{ 'messages.no_columns_selected' | translate }}
              </th>
            }
          </tr>
          <tr>
            @for (col of columns; track col.field) {
              @switch (col.field) {
                @case ('id') {
                  <th></th>
                }
                @case ('name') {
                  <th><nuvex-filter-input field="name" /></th>
                }
                @case ('operator_id') {
                  <th><nuvex-filter-input field="operator_id" /></th>
                }
                @case ('status') {
                  <th><nuvex-filter-input field="status" /></th>
                }
                @case ('created_at') {
                  <th>
                    <nuvex-filter-input field="created_at" type="date" />
                  </th>
                }
                @default {
                  <th><nuvex-filter-input [field]="col.field" /></th>
                }
              }
            }
          </tr>
        </ng-template>

        <ng-template pTemplate="body" let-key let-columns="columns">
          @if (!loading) {
            <tr>
              @if (columnsSelect.length > 0) {
                <td>
                  <div class="flex justify-center items-center">
                    <button
                      pButton
                      class="p-button-text"
                      type="button"
                      icon="pi pi-ellipsis-v"
                      (click)="toggleMenu($event, key)"
                    ></button>
                  </div>
                </td>
              }
              @for (col of columns; track col.field) {
                <td>
                  @switch (col.field) {
                    @case ('id') {
                      <div class="flex items-center gap-2">
                        <span>{{
                          key.showKey ? key.api_key : '••••••••••••••••'
                        }}</span>
                        <p-button
                          icon="pi pi-eye"
                          (click)="toggleKeyVisibility(key)"
                          [text]="true"
                          [severity]="key.showKey ? 'danger' : 'info'"
                          [pTooltip]="
                            (key.showKey
                              ? 'labels.hide_key'
                              : 'labels.show_key'
                            ) | translate
                          "
                        ></p-button>
                        <p-button
                          icon="pi pi-copy"
                          (click)="copyKey(key)"
                          [text]="true"
                          severity="success"
                          [pTooltip]="'labels.copy_key' | translate"
                        ></p-button>
                      </div>
                    }
                    @case ('status') {
                      <p-tag
                        [value]="
                          'labels.' + getKeyStatus(key).toLowerCase()
                            | translate
                        "
                        [severity]="getStatusSeverity(getKeyStatus(key))"
                      ></p-tag>
                    }
                    @case ('operator_id') {
                      <div>{{ key.operator_id }}</div>
                    }
                    @case ('created_at') {
                      <div
                        class="text-surface-400 text-sm"
                        style="white-space: pre-wrap;"
                      >
                        <i class="pi pi-calendar text-gray-600 mr-1"></i
                        >{{ key.created_at | dateTimeSeparate }}
                      </div>
                    }
                    @default {
                      {{ key[col.field] }}
                    }
                  }
                </td>
              }
            </tr>
          }
        </ng-template>

        <ng-template pTemplate="paginatorleft">
          <div class="flex items-center gap-2">
            {{ 'labels.selected_columns' | translate }}:
            <p-multiSelect
              [options]="colsOptionsSelect"
              [(ngModel)]="columnsSelect"
              (onChange)="onColumnToggle($event)"
              optionLabel="header"
              [filter]="true"
              filterBy="header"
              [selectedItemsLabel]="'labels.columns_selected' | translate"
              [style]="{ 'min-width': '200px' }"
              [placeholder]="'labels.choose_columns' | translate"
            ></p-multiSelect>
          </div>
        </ng-template>

        <ng-template pTemplate="emptymessage">
          <tr>
            <td [attr.colspan]="columnsSelect.length + 1">
              {{ 'labels.no_api_keys_found' | translate }}
            </td>
          </tr>
        </ng-template>

        <ng-template pTemplate="loadingbody">
          @for (_ of skeletonRows; track $index) {
            <tr>
              @for (__ of skeletonCols; track $index) {
                <td><p-skeleton height="2rem" width="100%"></p-skeleton></td>
              }
            </tr>
          }
        </ng-template>
      </p-table>
    </div>
    <p-toast></p-toast>
  `,
})
export class OperatorKeyListComponent implements OnInit {
  @ViewChild('dt1') table!: Table
  @ViewChild('menu') menu!: Menu

  private readonly svc = inject(CredentialsService)
  private readonly translate = inject(TranslateService)
  private readonly translateLanService = inject(TranslateLanService)
  private readonly dialogService = inject(DialogService)
  private readonly confirmationService = inject(ConfirmationService)
  private readonly filterService = inject(FilterApplyService)

  ref: DynamicDialogRef | null = null
  rowsDisplayed = 15
  loading = false
  stateIni = false
  enformato: FiltersShip[] = []

  stateValues = signal<KeyState>({
    data: [],
    meta_data: { page: 1, rows: 15, total_records: 0 },
    facilities: [],
    loaded: false,
    loading: true,
    error: null,
  })

  dto = signal<KeyDTO>({
    config: { populate_data: true, page: 1, rows: 15, sort_field: [] },
    filter: {} as KeyFilter,
  })

  facilities = computed(() => this.stateValues().facilities)

  private readonly allowedColumns = [
    'name',
    'operator_id',
    'id',
    'status',
    'created_at',
  ]
  columnsSelect: Column[] = this.allowedColumns.map((col) => ({
    field: col,
    header: col,
  }))
  colsOptionsSelect: Column[] = []
  menuItems: MenuItem[] = []
  skeletonRows = new Array(10)
  skeletonCols = new Array(6)

  constructor() {
    effect(() => this.translate.use(this.translateLanService.changeLanguage()))
    effect(() => this.initData())
  }

  ngOnInit(): void {
    this.initColsOptionsSelect()
    this.translate.onLangChange.subscribe(() => this.initColsOptionsSelect())
  }

  initColsOptionsSelect(): void {
    this.colsOptionsSelect = this.allowedColumns.map((col) => ({
      field: col,
      header:
        col === 'operator_id'
          ? this.translate.instant('labels.facility')
          : this.translate.instant('labels.' + col),
    }))
  }

  initData(): void {
    this.loading = true
    this.stateValues.update((s) => ({ ...s, data: [] }))
    this.svc.listKeys(this.dto()).subscribe({
      next: (resp: KeyListResponse<FacilityKey>) => {
        this.stateValues.set({
          facilities: resp.facilities ?? this.stateValues().facilities,
          data: resp.data ?? [],
          meta_data: resp.meta_data,
          loaded: true,
          loading: false,
          error: null,
        })
        this.loading = false
      },
      error: (err) => {
        this.stateValues.set({
          facilities: [],
          data: [],
          meta_data: { page: 1, rows: 15, total_records: 0 },
          loaded: false,
          loading: true,
          error: err,
        })
        this.loading = false
      },
    })
  }

  clear(table: Table): void {
    table.clear()
    this.enformato = []
    this.dto.set({
      config: {
        populate_data: true,
        page: 1,
        rows: this.rowsDisplayed || 15,
        sort_field: [],
      },
      filter: {} as KeyFilter,
    })
  }

  getDataPaged(event: TableLazyLoadEvent): void {
    const rowsPerPage = Number(event.rows)
    this.rowsDisplayed = rowsPerPage || 15
    if (event.filters && this.stateIni) {
      this.stateValues.update((t) => ({ ...t, loaded: false, loading: true }))
      const appliedFilters = this.filterService.applyFilterNew(
        event.filters,
        this.dto().filter
      )
      this.dto.set({
        config: {
          populate_data: false,
          page: (event.first || 0) / Number(event.rows) + 1,
          sort_field: event.multiSortMeta?.filter((t) => t.field) ?? [],
          rows: Number(event.rows),
        },
        filter: appliedFilters,
      })
      this.enformato = this.filterService.preparaFiltersChip(event.filters)
    }
    this.stateIni = true
  }

  removeFilter(field: string): void {
    ;(this.table.filters[field] as any).value = null
    this.enformato = this.filterService.preparaFiltersChip(this.table.filters)
    this.dto.update((t) => {
      const f = { ...t.filter } as any
      for (const key in f) {
        if (key === field)
          f[key] = {
            value: '',
            match_mode: (this.table.filters[field] as any).matchMode,
          }
      }
      return { ...t, filter: f }
    })
  }

  onColumnToggle(event: any): void {
    this.columnsSelect = [...event.value]
  }
  toggleKeyVisibility(key: FacilityKey): void {
    key.showKey = !key.showKey
  }
  copyKey(key: FacilityKey): void {
    navigator.clipboard.writeText(String(key?.api_key ?? ''))
  }

  openAddDialog(): void {
    this.ref = this.dialogService.open(OperatorKeyFormComponent, {
      header: this.translate.instant('credential_types.facility_keys.title'),
      closeOnEscape: false,
      width: '380px',
      contentStyle: { overflow: 'auto' },
      baseZIndex: 10000,
      data: {},
    })
    this.ref?.onClose.subscribe((result) => {
      if (result) this.initData()
    })
  }

  openEditDialog(key: FacilityKey): void {
    this.ref = this.dialogService.open(OperatorKeyFormComponent, {
      header: this.translate.instant('credential_types.facility_keys.title'),
      closeOnEscape: false,
      width: '380px',
      contentStyle: { overflow: 'auto' },
      baseZIndex: 10000,
      data: { key },
    })
    this.ref?.onClose.subscribe((result) => {
      if (result) this.initData()
    })
  }

  removeKey(key: FacilityKey): void {
    this.confirmationService.confirm({
      message: this.translate.instant('messages.confirmation_delete_msg'),
      header: this.translate.instant('messages.confirmation_delete'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        if (key.id) {
          this.loading = true
          this.svc.deleteKey(key.id).subscribe({
            next: () => this.initData(),
            error: () => (this.loading = false),
          })
        }
      },
    })
  }

  revokeKey(key: FacilityKey): void {
    this.confirmationService.confirm({
      message: this.translate.instant('messages.confirmation_revoke_msg'),
      header: this.translate.instant('messages.confirmation_revoke'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        if (key.id) {
          this.loading = true
          this.svc.revokeKey(key.id).subscribe({
            next: () => this.initData(),
            error: () => (this.loading = false),
          })
        }
      },
    })
  }

  activateKey(key: FacilityKey): void {
    this.confirmationService.confirm({
      message: this.translate.instant('messages.confirmation_activate_msg'),
      header: this.translate.instant('messages.confirmation_activate'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        if (key.id) {
          this.loading = true
          this.svc.activateKey(key.id).subscribe({
            next: () => this.initData(),
            error: () => (this.loading = false),
          })
        }
      },
    })
  }

  toggleMenu(event: Event, key: FacilityKey): void {
    this.menuItems = [
      {
        label: this.translate.instant('buttons.edit'),
        icon: 'pi pi-pencil',
        command: () => this.openEditDialog(key),
      },
      {
        label: this.translate.instant(
          key.status?.toLowerCase() === 'active'
            ? 'buttons.revoke'
            : 'buttons.activate'
        ),
        icon:
          key.status?.toLowerCase() === 'active' ? 'pi pi-ban' : 'pi pi-check',
        command: () =>
          key.status?.toLowerCase() === 'active'
            ? this.revokeKey(key)
            : this.activateKey(key),
      },
      {
        label: this.translate.instant('buttons.delete'),
        icon: 'pi pi-trash',
        command: () => this.removeKey(key),
      },
    ]
    this.menu.toggle(event)
  }

  getKeyStatus(key: FacilityKey): string {
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
}
