import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    effect,
    inject,
    OnInit,
    signal,
    untracked,
    ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FacilityScopeService } from '@/app/core/services/facility-scope.service';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MessageService, MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { Menu, MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';
import { Select } from 'primeng/select';

import { TranslateLanService } from '../../../core/services/translate-lan.service';
import { CapitalizePipe } from '../../../shared/pipes/capitalize.pipe';
import { BaseDataTable } from '../../../shared/components/datatable/data-table/base-data-table.component';
import { ColumnToggleComponent } from '../../shared/column-toggle/column-toggle.component';
import { FilterPresetManagerComponent } from '@/app/shared/components/filter-preset-manager/filter-preset-manager.component';
import { ShColumnDef, ShPaginationConfig, ShTableEvent, ActiveFilterChip } from '../../../shared/types/table.types';
import { persistedConfigOverrides, pickColumns, removedColumnFields, translateColumnDefs } from '../../shared/list-columns.util';
import { buildFilterChipsFromColumns } from '../../../shared/utils/filter-chips.util';
import { FacilitiesService } from './facilities.service';
import { zoneLabel } from '@/app/shared/utils/time-zone.util';
import { TableStateService } from '../../../shared/services/table-state.service';
import { FilterPresetService } from '@/app/shared/services/filter-preset.service';
import { FilterPreset, buildFiltersFromConditions } from '@/app/shared/types/filter-preset.types';
import {
    Facility,
    FacilityDTO,
    FacilityFilter,
    FacilityListResponse,
} from './facilities.types';
import { FacilityDialogComponent } from './components/facility-dialog-component/facility-dialog-component';
import { FacilitySettingsDialogComponent } from './components/facility-settings-dialog-component/facility-settings-dialog-component';



const DEFAULT_DTO: FacilityDTO = {
    config: { populate_data: true, page: 1, rows: 15, sort_field: [] },
    filter: {} as FacilityFilter,
};

@Component({
    selector: 'app-facilities',
    standalone: true,
    imports: [
        CommonModule, FormsModule,
        TranslateModule, ButtonModule, TagModule,
        ToastModule, TooltipModule,
        MenuModule,
        CapitalizePipe,
        BaseDataTable,
        FilterPresetManagerComponent,
        InputTextModule, ColumnToggleComponent, Select,
    ],
    providers: [DialogService, MessageService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './facilities.component.html',
    styleUrl: './facilities.component.scss',
})
export default class FacilitiesComponent implements OnInit {

    private readonly svc = inject(FacilitiesService);
    private readonly facilityScope = inject(FacilityScopeService);
    private readonly translate = inject(TranslateService);
    private readonly translateLanService = inject(TranslateLanService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly dialogService  = inject(DialogService);
    private readonly messageService = inject(MessageService);
    private readonly tableState = inject(TableStateService);
    private readonly filterPresetService = inject(FilterPresetService);
    private readonly STATE_KEY = 'logic:facilities';
    readonly PRESET_PAGE_KEY = 'facilities';
    activePresetColor = signal<string | null>(null);
    activePresetName = signal<string | null>(null);
    /** Resets the sort icon on Clear */
    @ViewChild(BaseDataTable) private readonly baseTable!: BaseDataTable;

    ref: DynamicDialogRef | null = null;

    // ── State (separate signals, like RotationsComponent) ──────────────────
    facilities  = signal<Facility[]>([]);
    loading     = signal(true);
    error       = signal<unknown>(null);
    facilityDto = signal<FacilityDTO>({ ...DEFAULT_DTO, config: { ...DEFAULT_DTO.config } });

    menuItems: MenuItem[] = [];
    selectedFacility: Facility | undefined;

    pagination = signal<ShPaginationConfig>({
        page: 1,
        limit: 15,
        total: 0,
        rows_per_page: [15, 30, 50],
    });

    // ── Filter chips ────────────────────────────────────────────────────────
    activeFilters = signal<ActiveFilterChip[]>([]);
    protected activeRawFilters: Record<string, any> = {};

    private readonly fieldLabelMap: Record<string, string> = {
        name:           'preferences.facilities.name',
        'address.city': 'preferences.facilities.address',
    };

    // ── Column definitions ──────────────────────────────────────────────────
    /** City part of an IANA zone (America/La_Paz → La Paz). */
    readonly zoneLabel = zoneLabel;

    columnDefs: ShColumnDef[] = [
        { field: 'name',    header: 'preferences.facilities.name',    width: '14rem', sortable: true,  filterable: true,  filterType: 'text', template: 'account', mobileLabel: true },
        { field: 'address', header: 'preferences.facilities.address', width: '16rem', sortable: false, filterable: false, filterType: 'text', template: 'address', mobileVisible: true },
        // The zone every time of this facility is shown in (sales, receivings, orders…)
        { field: 'time_zone', header: 'preferences.facilities.time_zone', width: '11rem', sortable: false, filterable: false, template: 'time_zone',
          exportValue: (row: any) => row.time_zone ?? '' },
        { field: 'is_active', header: 'labels.status', width: '8rem', sortable: false, filterable: false, template: 'active',
          exportValue: (row: any) => this.translate.instant(row.is_active === false ? 'labels.inactive' : 'labels.active') },
    ];

    selectedCols: ShColumnDef[] = this.columnDefs;

    /** Column defs with pre-translated label — used by the multiSelect so search works in any language */
    translatedColumnDefs: (ShColumnDef & { translatedHeader: string })[] = [];

    private buildTranslatedColumns(): void {
        this.translatedColumnDefs = translateColumnDefs(this.columnDefs, this.translate);
        // Keep selectedCols in sync with the newly translated objects
        this.selectedCols = pickColumns(this.translatedColumnDefs, this.selectedCols);
        this.cdr.markForCheck();
    }

    /** Keeps selectedCols in the same order as columnDefs regardless of multiSelect toggle order */
    onColumnSelectionChange(cols: (ShColumnDef & { translatedHeader?: string })[]): void {
        const previous = this.selectedCols
        this.selectedCols = pickColumns(this.translatedColumnDefs, cols)
        const removedFields = removedColumnFields(previous, this.selectedCols)
        if (removedFields.length > 0) this.clearFiltersForHiddenColumns(removedFields)
    }

    /** Called from the template via (onChange) — closes the dropdown when all columns are deselected or all are selected */
    /** Clears filter state for columns that were just hidden by the user. */
    private clearFiltersForHiddenColumns(removedFields: string[]): void {
        let changed = false
        for (const field of removedFields) {
            if (field in this.activeRawFilters) { delete this.activeRawFilters[field]; changed = true }
        }
        if (!changed) return
        this.buildFilterChips(this.activeRawFilters)
        this.baseTable?.clearFiltersForFields(removedFields)
        const filter: FacilityFilter = {}
        for (const [f, val] of Object.entries(this.activeRawFilters)) {
            const v = val?.value
            if (v !== null && v !== undefined && v !== '') {
                (filter as any)[f] = { value: v, match_mode: val.matchMode ?? 'contains' }
            }
        }
        this.facilityDto.update(dto => ({ ...dto, config: { ...dto.config, page: 1 }, filter }))
        this.saveState()
    }

    constructor() {
        effect(() => {
            this.translate.use(this.translateLanService.changeLanguage());
        });

        // ----- DEBUG: show what's in storage at startup -----
        // NOTE: PrimeNG [stateKey] and TableStateService use THE SAME key 'logic:facilities'
        // PrimeNG saves its format; TableStateService overwrites with its own format → CONFLICT
        const sharedKey = this.STATE_KEY // 'logic:facilities'
        const rawInStorage = localStorage.getItem(sharedKey)
        console.log('%c[Facilities] constructor START', 'color:#6366f1;font-weight:bold')
        console.log('  Shared localStorage key:', sharedKey)
        console.log('  Raw value in localStorage:', rawInStorage ? JSON.parse(rawInStorage) : '(empty)')
        // ----------------------------------------------------

        // Restore persisted state BEFORE the first effect() run triggers loadFacilities()
        const saved = this.tableState.load(this.STATE_KEY);
        if (saved?.filters && Object.keys(saved.filters).length > 0) {
            console.log('%c[Facilities] restoring from TableStateService:', 'color:#f59e0b', saved)
            this.activeRawFilters = saved.filters as Record<string, any>;
            const filter: FacilityFilter = {};
            for (const [field, val] of Object.entries(this.activeRawFilters)) {
                const v = val?.value;
                if (v !== null && v !== undefined && v !== '') {
                    (filter as any)[field] = { value: v, match_mode: val.matchMode ?? 'contains' };
                }
            }
            this.facilityDto.update(d => ({
                ...d,
                filter,
                config: {
                    ...d.config,
                    ...persistedConfigOverrides(saved),
                },
            }));
            if (saved.page) this.pagination.update(p => ({ ...p, page: saved.page! }));
        } else {
            console.log('%c[Facilities] no saved state in TableStateService', 'color:#94a3b8')
        }

        // Reactively reload whenever facilityDto changes (filter / sort / page / clear)
        effect(() => {
            this.facilityDto(); // track signal
            untracked(() => this.loadFacilities());
        });

        // Restore active preset color when navigating back to this page
        effect(() => {
            const presets = this.filterPresetService.presets();
            const lastId = this.filterPresetService.lastAppliedPresetId();
            if (presets.length > 0 && lastId) {
                const active = presets.find(p => p.id === lastId);
                if (active) {
                    this.activePresetColor.set(active.color ?? null);
                    this.activePresetName.set(active.name);
                }
            }
        });
    }

    ngOnInit(): void {
        // Build translated column labels once translations are loaded on startup
        this.translate.get(this.columnDefs.map(c => c.header)).subscribe(() => {
            this.buildTranslatedColumns();
        });
        // Rebuild whenever the language changes (onLangChange fires AFTER translations are loaded)
        this.translate.onLangChange.subscribe(() => {
            setTimeout(() => this.buildTranslatedColumns());
        });
        // After state is restored, also build filter chips for visual display
        if (Object.keys(this.activeRawFilters).length > 0) {
            this.buildFilterChips(this.activeRawFilters);
        }
        this.filterPresetService.loadPresets(this.PRESET_PAGE_KEY);
    }

    private saveState(): void {
        const cfg = this.facilityDto().config;
        const sf  = cfg.sort_field?.[0];
        const sortOrder: 'asc' | 'desc' = sf?.order === 1 ? 'asc' : 'desc'
        const stateToSave = {
            filters: this.activeRawFilters as Record<string, unknown>,
            page:    cfg.page,
            sort:    sf ? { field: sf.field, order: sortOrder } : undefined,
        }
        console.log('%c[Facilities] saveState -> TableStateService:', 'color:#10b981', stateToSave)
        this.tableState.save(this.STATE_KEY, stateToSave);
        console.log('  verify localStorage:', localStorage.getItem(this.STATE_KEY))
    }

    // ── Table state change ──────────────────────────────────────────────────

    onTableStateChange(event: ShTableEvent): void {
        console.log('%c[Facilities] onTableStateChange', 'color:#6366f1', event)
        // Merge incoming filters on top of existing ones so that sort-only
        // events (which carry empty filters from BaseDataTable's columnFilters)
        // don't wipe out filters set via the custom filterRow template.
        const incoming = event.filters ?? {};
        const merged = { ...this.activeRawFilters, ...incoming };
        // Remove any keys that were explicitly cleared (value is empty/null)
        for (const [key, val] of Object.entries(merged)) {
            if (val?.value === null || val?.value === undefined || val?.value === '') {
                delete merged[key];
            }
        }
        this.activeRawFilters = merged;
        this.buildFilterChips(merged);

        const filter: FacilityFilter = {};
        for (const [field, val] of Object.entries(merged)) {
            if (val?.value !== null && val?.value !== undefined && val?.value !== '') {
                (filter as any)[field] = { value: val.value, match_mode: val.matchMode ?? 'contains' };
            }
        }
        this.facilityDto.set({
            config: {
                populate_data: true,
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
        console.log('%c[Facilities] clearFilters', 'color:#ef4444')
        this.tableState.clear(this.STATE_KEY);
        this.activeRawFilters = {};
        this.activeFilters.set([]);
        this.activePresetColor.set(null);
        this.activePresetName.set(null);
        this.filterPresetService.clearLastApplied();
        this.baseTable?.resetColumnFilters();
        this.facilityDto.set({ ...DEFAULT_DTO, config: { ...DEFAULT_DTO.config } });
    }

    onPresetSelected(preset: FilterPreset): void {
        this.activePresetColor.set(preset.color ?? null);
        this.activePresetName.set(preset.name);
        this.activeRawFilters = buildFiltersFromConditions(preset.conditions ?? []);
        this.buildFilterChips(this.activeRawFilters);
        const filter: FacilityFilter = {};
        for (const [f, val] of Object.entries(this.activeRawFilters)) {
            const v = val?.value;
            if (v !== null && v !== undefined && v !== '') {
                (filter as any)[f] = { value: v, match_mode: val.matchMode ?? 'contains' };
            }
        }
        this.facilityDto.update(dto => ({ ...dto, config: { ...dto.config, page: 1 }, filter }));
    }

    removeFilterChip(field: string): void {
        delete this.activeRawFilters[field];
        this.buildFilterChips(this.activeRawFilters);

        const filter: FacilityFilter = {};
        for (const [f, val] of Object.entries(this.activeRawFilters)) {
            if (val?.value !== null && val?.value !== undefined && val?.value !== '') {
                (filter as any)[f] = { value: val.value, match_mode: val.matchMode ?? 'contains' };
            }
        }
        this.facilityDto.update(dto => ({
            ...dto,
            config: { ...dto.config, page: 1 },
            filter,
        }));
    }

    /** Returns the current filter value for a field (used by the custom filterRow template) */
    getActiveFilterValue(field: string): any {
        return this.activeRawFilters[field]?.value ?? null;
    }

    /** Called from the custom filterRow template — updates filter and triggers reload */
    onColumnFilterChange(field: string, value: any): void {
        const filters = { ...this.activeRawFilters };
        if (value !== null && value !== undefined && value !== '') {
            filters[field] = { value, matchMode: 'contains' };
        } else {
            delete filters[field];
        }
        this.activeRawFilters = filters;
        this.buildFilterChips(filters);

        const filter: FacilityFilter = {};
        for (const [f, val] of Object.entries(filters)) {
            if (val?.value !== null && val?.value !== undefined && val?.value !== '') {
                (filter as any)[f] = { value: val.value, match_mode: val.matchMode ?? 'contains' };
            }
        }
        this.facilityDto.update(dto => ({
            ...dto,
            config: { ...dto.config, page: 1 },
            filter,
        }));
        this.saveState();
    }

    private buildFilterChips(filters: Record<string, any>): void {
        this.activeFilters.set(
            buildFilterChipsFromColumns(filters, this.columnDefs, this.translate)
        );
    }

    // ── CRUD ────────────────────────────────────────────────────────────────

    loadFacilities(): void {
        this.loading.set(true);
        this.svc.getFacilities(this.facilityDto()).subscribe({
            next: (resp: FacilityListResponse) => {
                this.facilities.set(resp.data ?? []);
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
                this.error.set(err);
                this.loading.set(false);
            },
        });
    }

    private openFacilityDialog(facility?: Facility): void {
        const ref = this.dialogService.open(FacilityDialogComponent, {
            header: facility
                ? this.translate.instant('preferences.facilities.edit_facility')
                : this.translate.instant('preferences.facilities.new_facility'),
            width: '1000px',
            breakpoints: { '1100px': '92vw', '640px': '100vw' },
            modal: true,
            closable: true,
            closeOnEscape: false,
            contentStyle: { overflow: 'auto' },
            baseZIndex: 10000,
            data: { facility },
        });
        ref?.onClose?.subscribe((result: Facility | undefined) => {
            if (!result) return;
            this.loadFacilities();
            // The scope holds every facility's zone: refresh it so the new
            // zone (or facility) applies to dates without a reload.
            this.facilityScope.load(true);
        });
    }

    openCreateForm(): void {
        this.openFacilityDialog();
    }

    openEditForm(facility: Facility): void {
        this.openFacilityDialog(facility);
    }

    openSettingsDialog(facility: Facility): void {
        const ref = this.dialogService.open(FacilitySettingsDialogComponent, {
            header: this.translate.instant('preferences.facilities.settings_facility'),
            width: '480px',
            closeOnEscape: false,
            contentStyle: { overflow: 'auto' },
            baseZIndex: 10000,
            data: { facility },
        });
        ref?.onClose?.subscribe((result: Facility | undefined) => {
            if (result) this.loadFacilities();
        });
    }

    onFacilityOptionsClick(event: Event, facility: Facility, menu: Menu): void {
        this.selectedFacility = facility;
        this.menuItems = [
            {
                label: this.translate.instant('buttons.edit'),
                icon: 'pi pi-pencil',
                command: () => this.openEditForm(facility),
            },
            {
                label: this.translate.instant('buttons.settings'),
                icon: 'pi pi-cog',
                command: () => this.openSettingsDialog(facility),
            },
        ];
        menu.toggle(event);
    }
}
