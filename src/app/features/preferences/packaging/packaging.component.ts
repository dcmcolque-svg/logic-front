import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    effect,
    inject,
    OnInit,
    signal,
    Type,
    untracked,
    ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MessageService, MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { Menu, MenuModule } from 'primeng/menu';
import { ChipModule } from 'primeng/chip';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';

import { TranslateLanService } from '../../../core/services/translate-lan.service';
import { CapitalizePipe } from '../../../shared/pipes/capitalize.pipe';
import { BaseDataTable } from '../../../shared/components/datatable/data-table/base-data-table.component';
import { ColumnToggleComponent } from '../../shared/column-toggle/column-toggle.component';
import { FilterTextInputComponent } from '../../../shared/components/filter-text-input/filter-text-input.component';
import { FilterMultiselectPanelComponent } from '../../../shared/components/filter-multiselect-panel/filter-multiselect-panel.component';
import { ShColumnDef, ShPaginationConfig, ShTableEvent, ActiveFilterChip } from '../../../shared/types/table.types';
import { persistedConfigOverrides, pickColumns, removedColumnFields, translateColumnDefs } from '../../shared/list-columns.util';
import { buildFilterChipsFromColumns } from '../../../shared/utils/filter-chips.util';
import { FacilityScopeService } from '../../../core/services/facility-scope.service';
import { dropFacilityFilters, scopeApiFilter } from '../../../shared/utils/facility-scope.util';
import { PackagingService } from './packaging.service';
import { FacilitiesService } from '../facilities/facilities.service';
import { Facility } from '../facilities/facilities.types';
import { TableStateService } from '../../../shared/services/table-state.service';
import {
    PackagingListItem,
    PackagingListResponse,
    PackagingDTO,
    InventoryListFilter,
    DEFAULT_PACKAGING_DTO,
    ContainerProfile,
} from './packaging.types';
import { PackagingDialogComponent } from './components/packaging-dialog/packaging-dialog.component';
import { RecountDialogComponent } from './components/recount-dialog/recount-dialog.component';

@Component({
    selector: 'app-packaging',
    standalone: true,
    imports: [
        CommonModule, FormsModule,
        TranslateModule, ButtonModule, TagModule, ChipModule,
        ToastModule, TooltipModule,
        MenuModule,
        CapitalizePipe,
        BaseDataTable,
        InputTextModule, ColumnToggleComponent,
        FilterTextInputComponent,
        FilterMultiselectPanelComponent,
    ],
    providers: [DialogService, MessageService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './packaging.component.html',
    styleUrl: './packaging.component.scss',
})
export default class PackagingComponent implements OnInit {

    private readonly svc = inject(PackagingService);
    private readonly facilitiesService = inject(FacilitiesService);
    private readonly translate = inject(TranslateService);
    private readonly translateLanService = inject(TranslateLanService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly dialogService = inject(DialogService);
    private readonly messageService = inject(MessageService);
    private readonly tableState = inject(TableStateService);
    private readonly facilityScope = inject(FacilityScopeService);
    private readonly STATE_KEY = 'binlogic:packaging';

    @ViewChild(BaseDataTable) private readonly baseTable!: BaseDataTable;

    ref: DynamicDialogRef | null = null;

    // ── State ────────────────────────────────────────────────────────────────
    items       = signal<PackagingListItem[]>([]);
    loading     = signal(true);
    error       = signal<unknown>(null);
    packagingDto = signal<PackagingDTO>({ ...DEFAULT_PACKAGING_DTO, config: { ...DEFAULT_PACKAGING_DTO.config } });

    menuItems: MenuItem[] = [];
    selectedItem: PackagingListItem | undefined;

    pagination = signal<ShPaginationConfig>({
        page: 1,
        limit: 15,
        total: 0,
        rows_per_page: [15, 30, 50],
    });

    // ── Filter chips ─────────────────────────────────────────────────────────
    activeFilters = signal<ActiveFilterChip[]>([]);
    protected activeRawFilters: Record<string, any> = {};

    // ── Facility dropdown filter ─────────────────────────────────────────────
    facilityFilter = signal<string[]>([]);
    private _cachedFacilities: Facility[] = [];

    // ── Container profile (Package Type) ─────────────────────────────────────
    containerProfileFilter = signal<string[]>([]);
    private _cachedContainerProfiles: ContainerProfile[] = [];

    // ── Column definitions ───────────────────────────────────────────────────
    columnDefs: ShColumnDef[] = [
        { field: 'facility', header: 'packaging.columns.facility', width: '12rem', sortable: true,  filterable: true,  filterType: 'multiselect', mobileVisible: true },
        { field: 'barcode',  header: 'packaging.columns.barcode',  width: '12rem', sortable: true,  filterable: true,  filterType: 'text' },
        { field: 'package_type', header: 'packaging.columns.package_type', width: '12rem', sortable: true, filterable: true, filterType: 'multiselect', template: 'package_type' },
        { field: 'sku_name', header: 'packaging.columns.name',     width: '14rem', sortable: true,  filterable: true,  filterType: 'text',    mobileVisible: true },
        { field: 'sku_description', header: 'packaging.columns.description', width: '14rem', sortable: true, filterable: true, filterType: 'text' },
        { field: 'quantity', header: 'packaging.columns.quantity', width: '10rem', sortable: true,  filterable: true,  filterType: 'numeric', template: 'quantity' },
        { field: 'weight',   header: 'packaging.columns.weight',   width: '10rem', sortable: true,  filterable: true,  filterType: 'numeric', template: 'weight' },
        { field: 'location', header: 'packaging.columns.location', width: '12rem', sortable: true,  filterable: true,  filterType: 'text' },
    ];

    selectedCols: ShColumnDef[] = this.columnDefs;

    translatedColumnDefs: (ShColumnDef & { translatedHeader: string })[] = [];

    private buildTranslatedColumns(): void {
        this.translatedColumnDefs = translateColumnDefs(this.columnDefs, this.translate);
        this.selectedCols = pickColumns(this.translatedColumnDefs, this.selectedCols);
        this.cdr.markForCheck();
    }

    onColumnSelectionChange(cols: (ShColumnDef & { translatedHeader?: string })[]): void {
        const previous = this.selectedCols;
        this.selectedCols = pickColumns(this.translatedColumnDefs, cols);
        const removedFields = removedColumnFields(previous, this.selectedCols);
        if (removedFields.length > 0) this.clearFiltersForHiddenColumns(removedFields);
    }

    /** Maps column field names to the filter keys used in activeRawFilters / API. */
    private readonly fieldToFilterKey: Record<string, string> = {
        facility: 'facility_id',
        package_type: 'container_profile_id',
    };

    private clearFiltersForHiddenColumns(removedFields: string[]): void {
        let changed = false;
        for (const field of removedFields) {
            const filterKey = this.fieldToFilterKey[field] ?? field;
            if (filterKey in this.activeRawFilters) {
                delete this.activeRawFilters[filterKey];
                changed = true;
            }
            // Reset the corresponding multiselect dropdown signal
            if (filterKey === 'facility_id') this.facilityFilter.set([]);
            else if (filterKey === 'container_profile_id') this.containerProfileFilter.set([]);
        }
        if (!changed) return;
        const mappedFields = removedFields.map(f => this.fieldToFilterKey[f] ?? f);
        this.buildFilterChips(this.activeRawFilters);
        this.baseTable?.clearFiltersForFields(mappedFields);
        const filter = this.buildApiFilter(this.activeRawFilters);
        this.packagingDto.update(dto => ({ ...dto, config: { ...dto.config, page: 1 }, filter }));
        this.saveState();
    }

    constructor() {
        effect(() => {
            this.translate.use(this.translateLanService.changeLanguage());
        });

        // Restore persisted state
        const saved = this.tableState.load(this.STATE_KEY);
        if (saved?.filters && Object.keys(saved.filters).length > 0) {
            this.activeRawFilters = saved.filters as Record<string, any>;
            const filter = this.buildApiFilter(this.activeRawFilters);
            this.packagingDto.update(d => ({
                ...d,
                filter,
                config: {
                    ...d.config,
                    ...persistedConfigOverrides(saved),
                },
            }));
            if (saved.page) this.pagination.update(p => ({ ...p, page: saved.page! }));
        }

        // Reactively reload whenever DTO changes
        effect(() => {
            this.packagingDto();
            untracked(() => this.loadData());
        });
    }

    ngOnInit(): void {
        this.translate.get(this.columnDefs.map(c => c.header)).subscribe(() => {
            this.buildTranslatedColumns();
        });
        this.translate.onLangChange.subscribe(() => {
            setTimeout(() => this.buildTranslatedColumns());
        });
        if (Object.keys(this.activeRawFilters).length > 0) {
            this.buildFilterChips(this.activeRawFilters);
        }
        // Restore facility multiselect signal from persisted filters
        if (this.activeRawFilters['facility_id']?.value) {
            this.facilityFilter.set(this.activeRawFilters['facility_id'].value);
        }
        // Restore container profile multiselect signal from persisted filters
        if (this.activeRawFilters['container_profile_id']?.value) {
            this.containerProfileFilter.set(this.activeRawFilters['container_profile_id'].value);
        }
        this.loadFacilities();
        this.loadContainerProfiles();
    }

    private saveState(): void {
        const cfg = this.packagingDto().config;
        const sf = cfg.sort_field?.[0];
        const sortOrder: 'asc' | 'desc' = sf?.order === 1 ? 'asc' : 'desc';
        this.tableState.save(this.STATE_KEY, {
            filters: this.activeRawFilters as Record<string, unknown>,
            page: cfg.page,
            sort: sf ? { field: sf.field, order: sortOrder } : undefined,
        });
    }

    /** Build the API filter from raw filter values, always including is_packaging */
    private buildApiFilter(raw: Record<string, any>): InventoryListFilter {
        const filter: InventoryListFilter = {
            is_packaging: { value: true, match_mode: 'equals' },
        };
        for (const [field, val] of Object.entries(raw)) {
            const v = val?.value;
            if (v !== null && v !== undefined && v !== '') {
                (filter as any)[field] = { value: v, match_mode: val.match_mode ?? val.matchMode ?? 'contains' };
            }
        }
        return filter;
    }

    // ── Table state change ──────────────────────────────────────────────────

    onTableStateChange(event: ShTableEvent): void {
        // The global facility selector moved: drop our own copy of the facility
        // filter too, or it re-enters the request once the scope is released.
        // The event's filters as well: the table only clears its `facility`
        // column, but a filter restored from localStorage sits under the API
        // key `facility_id`, and merging it back would AND the old facility
        // with the new scope — an empty list and a stale chip.
        let incoming = event.filters ?? {};
        if (event.facilityScopeChanged) {
            this.activeRawFilters = dropFacilityFilters(this.activeRawFilters);
            incoming = dropFacilityFilters(incoming);
            this.facilityFilter.set([]);
        }
        const merged = { ...this.activeRawFilters, ...incoming };
        for (const [key, val] of Object.entries(merged)) {
            if (val?.value === null || val?.value === undefined || val?.value === '') {
                delete merged[key];
            }
        }
        this.activeRawFilters = merged;
        this.buildFilterChips(merged);

        const filter = this.buildApiFilter(merged);
        this.packagingDto.set({
            config: {
                page: event.pagination.page,
                rows: event.pagination.limit,
                sort_field: event.sort
                    ? [{ field: event.sort.field, order: event.sort.order === 'asc' ? 1 : -1 }]
                    : [],
            },
            filter,
        });
        this.saveState();
    }

    clearFilters(): void {
        this.tableState.clear(this.STATE_KEY);
        this.activeRawFilters = {};
        this.activeFilters.set([]);
        this.facilityFilter.set([]);
        this.containerProfileFilter.set([]);
        this.baseTable?.resetColumnFilters();
        this.packagingDto.set({ ...DEFAULT_PACKAGING_DTO, config: { ...DEFAULT_PACKAGING_DTO.config } });
    }

    removeFilterChip(field: string): void {
        delete this.activeRawFilters[field];

        // Reset the corresponding multiselect dropdown signal
        if (field === 'facility_id') {
            this.facilityFilter.set([]);
        } else if (field === 'container_profile_id') {
            this.containerProfileFilter.set([]);
        }

        this.applyRawFilters(this.activeRawFilters);
        this.baseTable?.clearFiltersForFields([field]);
        this.saveState();
    }

    /** Stores the raw filters, rebuilds the chips and reloads from page 1. */
    private applyRawFilters(filters: Record<string, any>): void {
        this.activeRawFilters = filters;
        this.buildFilterChips(filters);

        const filter = this.buildApiFilter(filters);
        this.packagingDto.update(dto => ({
            ...dto,
            config: { ...dto.config, page: 1 },
            filter,
        }));
    }

    getActiveFilterValue(field: string): any {
        return this.activeRawFilters[field]?.value ?? null;
    }

    getActiveFilterMatchMode(field: string): string | null {
        return this.activeRawFilters[field]?.match_mode ?? null;
    }

    /** Handles text/numeric filter changes from FilterTextInputComponent (applyWithMode) */
    onColumnFilterChange(field: string, event: any): void {
        const filters = { ...this.activeRawFilters };

        if (event === null || event === undefined) {
            delete filters[field];
        } else {
            const value = event?.value === undefined ? event : event.value;
            const matchMode: string = event?.matchMode ?? (Array.isArray(value) ? 'in' : 'contains');

            if (value !== null && value !== undefined && value !== '') {
                filters[field] = { value, match_mode: matchMode };
            } else {
                delete filters[field];
            }
        }

        this.applyRawFilters(filters);
        this.saveState();
    }

    /** Handles facility multiselect filter Apply */
    onFacilityFilterChange(selectedIds: string[]): void {
        this.facilityFilter.set(selectedIds);
        this.updateTableFilter('facility_id', selectedIds);
    }

    /** Generic multiselect filter update (like users pattern) */
    private updateTableFilter(field: string, values: any[]): void {
        const filters = { ...this.activeRawFilters };
        if (values && values.length > 0) {
            filters[field] = { value: values, match_mode: 'in' };
        } else {
            delete filters[field];
        }
        this.applyRawFilters(filters);
        this.saveState();
    }

    /** Load facilities for the dropdown filter */
    loadFacilities(): void {
        this.facilitiesService.getFacilities({
            config: { page: 1, rows: 1000, populate_data: false },
            filter: {},
        }).subscribe({
            next: (resp) => {
                this._cachedFacilities = resp.data ?? [];
                this.cdr.markForCheck();
            },
        });
    }

    /** Returns facility options for the multiselect dropdown, bounded by the global scope */
    getFacilityOptions(): { label: string; value: string }[] {
        const facilities = this.facilityScope.loaded() ? this.facilityScope.inScope() : this._cachedFacilities;
        return facilities.map(f => ({ label: f.name, value: f.id }));
    }

    /** Load container profiles for the Package Type column */
    loadContainerProfiles(): void {
        this.svc.listContainerProfiles().subscribe({
            next: (resp) => {
                this._cachedContainerProfiles = resp.data ?? [];
                // Rebuild chips so persisted filters show translated names instead of IDs
                if (Object.keys(this.activeRawFilters).length > 0) {
                    this.buildFilterChips(this.activeRawFilters);
                }
                // Force table re-render so cells resolve profile names
                this.items.update(items => [...items]);
                this.cdr.markForCheck();
            },
        });
    }

    /** Returns container profile options for the multiselect dropdown (translated) */
    getContainerProfileOptions(): { label: string; value: string }[] {
        return this._cachedContainerProfiles.map(p => ({
            label: this.translate.instant(`packaging.package_types.${p.code}`) || p.name,
            value: p.id,
        }));
    }

    /** Resolve container_profile_id to its translated name */
    getContainerProfileName(id: string | undefined): string {
        if (!id) return '—';
        const profile = this._cachedContainerProfiles.find(p => p.id === id);
        if (!profile) return '—';
        return this.translate.instant(`packaging.package_types.${profile.code}`) || profile.name;
    }

    /** Handles container profile multiselect filter Apply */
    onContainerProfileFilterChange(selectedIds: string[]): void {
        this.containerProfileFilter.set(selectedIds);
        this.updateTableFilter('container_profile_id', selectedIds);
    }

    private buildFilterChips(filters: Record<string, any>): void {
        this.activeFilters.set(
            buildFilterChipsFromColumns(filters, this.columnDefs, this.translate, {
                facility_id: (id: string) => {
                    const f = this._cachedFacilities.find(fac => fac.id === id);
                    return f?.name ?? id;
                },
                container_profile_id: (id: string) => {
                    const p = this._cachedContainerProfiles.find(cp => cp.id === id);
                    if (!p) return id;
                    return this.translate.instant(`packaging.package_types.${p.code}`) || p.name;
                },
            })
        );
    }

    // ── CRUD ─────────────────────────────────────────────────────────────────

    loadData(): void {
        this.loading.set(true);
        const dto = this.packagingDto();
        this.svc.listPackaging({
            ...dto,
            filter: scopeApiFilter(dto.filter, this.facilityScope.apiValue()),
        }).subscribe({
            next: (resp: PackagingListResponse) => {
                this.items.set(resp.data ?? []);
                this.pagination.set({
                    page:          resp.page,
                    limit:         resp.rows,
                    total:         resp.total_records,
                    rows_per_page: [15, 30, 50],
                });
                this.loading.set(false);
                this.error.set(null);
            },
            error: (err: unknown) => {
                this.items.set([]);
                this.error.set(err);
                this.loading.set(false);
            },
        });
    }

    private openPackagingDialog(item?: PackagingListItem): void {
        this.openItemDialog(PackagingDialogComponent, {
            header: item
                ? this.translate.instant('packaging.edit_packaging')
                : this.translate.instant('packaging.new_packaging'),
            width: '750px',
            closeOnEscape: false,
        }, item);
    }

    openCreateForm(): void {
        this.openPackagingDialog();
    }

    openEditForm(item: PackagingListItem): void {
        this.openPackagingDialog(item);
    }

    onItemOptionsClick(event: Event, item: PackagingListItem, menu: Menu): void {
        this.selectedItem = item;
        this.menuItems = [
            {
                label: this.translate.instant('buttons.edit'),
                icon: 'pi pi-pencil',
                command: () => this.openEditForm(item),
            },
            {
                label: this.translate.instant('packaging.recount.title'),
                icon: 'pi pi-replay',
                command: () => this.openRecountDialog(item),
            },
        ];
        menu.toggle(event);
    }

    private openRecountDialog(item: PackagingListItem): void {
        this.openItemDialog(RecountDialogComponent, {
            header: this.translate.instant('packaging.recount.title'),
            width: '500px',
            closeOnEscape: true,
        }, item);
    }

    /** Opens an item dialog and reloads the list when it closes with a result. */
    private openItemDialog(
        component: Type<unknown>,
        options: { header: string; width: string; closeOnEscape: boolean },
        item?: PackagingListItem,
    ): void {
        const ref = this.dialogService.open(component, {
            ...options,
            contentStyle: { overflow: 'auto' },
            baseZIndex: 10000,
            data: { item },
        });
        ref?.onClose?.subscribe((result: any) => {
            if (result) this.loadData();
        });
    }
}
