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
import { TableStateService } from '../../../shared/services/table-state.service';
import { FilterPresetService } from '@/app/shared/services/filter-preset.service';
import { FilterPreset, buildFiltersFromConditions } from '@/app/shared/types/filter-preset.types';
import {
    Facility,
    FacilityDTO,
    FacilityFilter,
    FacilityListResponse,
    OptionSelect,
} from './facilities.types';
import { isAppErrorResponse } from '../../../core/interceptors/app-error.schema';
import { FacilityDialogComponent } from './components/facility-dialog-component/facility-dialog-component';
import { FacilitySettingsDialogComponent } from './components/facility-settings-dialog-component/facility-settings-dialog-component';



const DEFAULT_DTO: FacilityDTO = {
    config: { populate_data: true, page: 1, rows: 15, sort_field: [] },
    filter: {} as FacilityFilter,
};

/** PUT error codes meaning the listed Xenvio locations are out of date */
const XENVIO_STALE_LOCATIONS = ['PROVIDER_NOT_FOUND', 'XENVIO_PROVIDER_CHANGED', 'XENVIO_LOCATION_NOT_FOUND'];

@Component({
    selector: 'app-facilities',
    standalone: true,
    imports: [
        CommonModule, FormsModule,
        TranslateModule, ButtonModule, TagModule, ChipModule,
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
    private readonly translate = inject(TranslateService);
    private readonly translateLanService = inject(TranslateLanService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly dialogService  = inject(DialogService);
    private readonly messageService = inject(MessageService);
    private readonly tableState = inject(TableStateService);
    private readonly filterPresetService = inject(FilterPresetService);
    private readonly STATE_KEY = 'binlogic:facilities';
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

    // Xenvio connection: options (loaded once on init) and facility_id → location id
    xenvioLocations  = signal<OptionSelect[]>([]);
    xenvioByFacility = signal<Record<string, string>>({});
    /** Locations the facilities are connected to, with the name saved with the connection */
    xenvioConnected  = signal<OptionSelect[]>([]);
    xenvioLoading    = signal(false);
    /**
     * Options of every facility's select: the Xenvio locations plus the ones
     * already connected that Xenvio did not return (it failed to answer, or
     * the location was removed there). Those extra options are disabled: the
     * connected facility still shows its location and can clear it, but no
     * other facility can pick a location Xenvio may no longer have. Without a
     * provider the backend returns no connections, so nothing is left selected.
     */
    xenvioOptions = computed(() => {
        const options: OptionSelect[] = [...this.xenvioLocations()];
        const ids = new Set(options.map(l => l.id));
        for (const loc of this.xenvioConnected()) {
            if (!ids.has(loc.id)) {
                options.push({ ...loc, disabled: true });
                ids.add(loc.id);
            }
        }
        return options;
    });

    // ── Filter chips ────────────────────────────────────────────────────────
    activeFilters = signal<ActiveFilterChip[]>([]);
    protected activeRawFilters: Record<string, any> = {};

    private readonly fieldLabelMap: Record<string, string> = {
        name:           'preferences.facilities.name',
        'address.city': 'preferences.facilities.address',
    };

    // ── Column definitions ──────────────────────────────────────────────────
    columnDefs: ShColumnDef[] = [
        { field: 'name',    header: 'preferences.facilities.name',    width: '14rem', sortable: true,  filterable: true,  filterType: 'text', template: 'account', mobileLabel: true },
        { field: 'address', header: 'preferences.facilities.address', width: '16rem', sortable: false, filterable: false, filterType: 'text', template: 'address', mobileVisible: true },
        { field: 'xenvio_connection', header: 'preferences.facilities.xenvio_connection', width: '14rem', sortable: false, filterable: false, template: 'xenvio' },
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
        // NOTE: PrimeNG [stateKey] and TableStateService use THE SAME key 'binlogic:facilities'
        // PrimeNG saves its format; TableStateService overwrites with its own format → CONFLICT
        const sharedKey = this.STATE_KEY // 'binlogic:facilities'
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
        this.loadXenvioConnections();
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
            width: '950px',
            closeOnEscape: false,
            contentStyle: { overflow: 'auto' },
            baseZIndex: 10000,
            data: { facility },
        });
        ref?.onClose?.subscribe((result: Facility | undefined) => {
            if (result) this.loadFacilities();
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

    // ── Xenvio Connection (Fulfillment Location) ────────────────────────────

    /**
     * Loads the fulfillment locations of the Xenvio account configured in
     * Providers, and the location each facility is connected to.
     */
    loadXenvioConnections(): void {
        this.xenvioLoading.set(true);
        this.svc.getXenvioFulfillmentLocations().subscribe({
            next: (resp) => {
                this.xenvioLocations.set((resp.data ?? []).map(loc => ({
                    id: String(loc.id),
                    name: loc.name,
                    company: loc.company ?? '',
                })));
                this.xenvioLoading.set(false);
            },
            error: (err) => {
                this.xenvioLocations.set([]);
                this.xenvioLoading.set(false);
                // No Xenvio provider (never configured or deleted): the column
                // just stays empty. Any other failure is reported.
                if (!(isAppErrorResponse(err) && err.code === 'PROVIDER_NOT_FOUND')) this.showXenvioError(err);
            },
        });
        this.loadXenvioFacilities();
    }

    private loadXenvioFacilities(): void {
        this.svc.getXenvioFacilities().subscribe({
            next: (resp) => {
                const map: Record<string, string> = {};
                const connected: OptionSelect[] = [];
                for (const f of resp.data ?? []) {
                    map[f.facility_id] = f.fulfillment_location_id;
                    connected.push({ id: f.fulfillment_location_id, name: f.name, company: f.company ?? '' });
                }
                this.xenvioByFacility.set(map);
                this.xenvioConnected.set(connected);
            },
        });
    }

    /** Called when the user picks (location id) or clears (null) the dropdown */
    updateFulfillmentLocation(facility: Facility, locationId: string | null): void {
        // Only a location Xenvio listed can be connected (the extra options are disabled).
        const location = locationId
            ? this.xenvioLocations().find(l => l.id === locationId) ?? null
            : null;
        if (locationId && !location) return;

        // Optimistic UI update
        this.xenvioByFacility.update(map => {
            const next = { ...map };
            if (location) next[facility.id] = location.id;
            else delete next[facility.id];
            return next;
        });

        this.svc.setXenvioFacility(facility.id, location).subscribe({
            next: () => {
                const key = location
                    ? 'messages.xenvio_connected'
                    : 'messages.xenvio_disconnected';
                this.messageService.add({
                    severity: 'success',
                    summary: this.translate.instant('messages.success'),
                    detail:  this.translate.instant(key),
                });
            },
            error: (err) => {
                this.showXenvioError(err);
                // Revert the optimistic update. When the listed locations are
                // stale (provider deleted or saved with another account, or the
                // location removed in Xenvio), reload them too.
                if (isAppErrorResponse(err) && XENVIO_STALE_LOCATIONS.includes(err.code)) this.loadXenvioConnections();
                else this.loadXenvioFacilities();
            },
        });
    }

    /**
     * The translated `preferences.facilities.xenvio_errors.<code>` message;
     * anything else (another code, network failure, proxy error page) gets
     * the generic one. The API message is never shown: it is in English and
     * XENVIO_EXTERNAL_FAILED carries the raw upstream error.
     */
    private showXenvioError(err: unknown): void {
        const key = isAppErrorResponse(err) ? `preferences.facilities.xenvio_errors.${err.code}` : '';
        const translated = key ? this.translate.instant(key) : key;
        this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('messages.error'),
            detail: translated && translated !== key
                ? translated
                : this.translate.instant('messages.error_generic'),
        });
    }
}
