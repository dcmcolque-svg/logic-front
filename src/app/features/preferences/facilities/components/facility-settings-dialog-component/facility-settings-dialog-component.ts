import {
    FormControl,
    FormGroup,
    FormsModule,
    ReactiveFormsModule,
} from '@angular/forms';
import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ProgressBarModule } from 'primeng/progressbar';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { TranslateLanService } from '../../../../../core/services/translate-lan.service';
import { FacilitiesService } from '../../facilities.service';
import { Facility, ActivityPODSettings, DefaultLocationSetting } from '../../facilities.types';
import { LocationService } from '../../../locations/location.service';
import { Location as WmsLocation } from '../../../locations/types/location.types';
import { AuthService } from '../../../../../core/services/auth.service';
import {
    COSTING_CURRENCIES,
    COSTING_METHODS,
    COSTING_METHODS_AVAILABLE,
    CostingMethod,
    CostingCurrency,
    formatCost,
    isCostingEnabled,
    CostingSettings,
    DEFAULT_CURRENCY,
    currencyPrefix,
    isOwnerRole,
} from '../../../../../shared/utils/costing.util';

export interface LocationOption {
    id: string;
    location_code: string;
    operational_category_code?: string;
}

@Component({
    selector: 'app-facility-settings-dialog-component',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        TranslateModule,
        ButtonModule,
        ToggleSwitchModule,
        ProgressBarModule,
        ToastModule,
        TooltipModule,
        SelectModule,
        TagModule,
    ],
    providers: [MessageService],
    templateUrl: './facility-settings-dialog-component.html',
})
export class FacilitySettingsDialogComponent implements OnInit {

    private readonly ref            = inject(DynamicDialogRef);
    private readonly config         = inject(DynamicDialogConfig);
    private readonly svc            = inject(FacilitiesService);
    private readonly locationSvc    = inject(LocationService);
    private readonly translate      = inject(TranslateService);
    private readonly translateLan   = inject(TranslateLanService);
    private readonly messageService = inject(MessageService);
    private readonly auth           = inject(AuthService);

    facility: Facility | undefined;
    form!: FormGroup;
    isLoading = signal(false);

    // ── Costing (OWNER only) ────────────────────────────────────────────
    readonly isOwner = isOwnerRole(this.auth.getAuthUserInfo()?.role);
    readonly costingMethodOptions = COSTING_METHODS.map(m => ({
        value: m,
        label: `preferences.facilities.costing_method_${m.toLowerCase()}`,
        disabled: !COSTING_METHODS_AVAILABLE.includes(m),
    }));
    /** settings.costing as stored — method/currency only change through initialize. */
    storedCosting = signal<CostingSettings>({ method: 'NONE', currency: DEFAULT_CURRENCY });
    /** Two-step confirmation of the initialize button. */
    confirmingCosting = signal(false);
    applyingCosting = signal(false);
    /** Facility with the costing just applied, handed back on close. */
    private costingAppliedFacility: Facility | null = null;
    readonly currencyOptions = COSTING_CURRENCIES.map(c => ({ value: c, label: `${c} (${currencyPrefix(c)})` }));

    // ── Default Location ────────────────────────────────────────────────
    selectedLocation = signal<LocationOption | null>(null);
    locationOptions  = signal<LocationOption[]>([]);
    loadingLocations = signal(false);
    private filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        effect(() => this.translate.use(this.translateLan.changeLanguage()));
        this.facility = this.config.data?.facility as Facility | undefined;
    }

    ngOnInit(): void {
        this.initForm();
        this.loadLocations();
    }

    initForm(): void {
        const s = this.facility?.settings;
        const dp = s?.delivery_pod_setting;
        const cp = s?.collect_pod_setting;
        const dl = s?.default_location;
        const co = s?.costing;
        this.storedCosting.set({
            method: co?.method ?? 'NONE',
            currency: co?.currency ?? DEFAULT_CURRENCY,
            cost_required_on_receiving: co?.cost_required_on_receiving ?? false,
        });

        this.form = new FormGroup({
            costing: new FormGroup({
                method:   new FormControl(co?.method   ?? 'NONE'),
                currency: new FormControl(co?.currency ?? DEFAULT_CURRENCY),
                cost_required_on_receiving: new FormControl(co?.cost_required_on_receiving ?? false),
            }),

            auto_blocked_expired:  new FormControl(s?.auto_blocked_expired  ?? false),
            auto_processing:       new FormControl(s?.auto_processing       ?? false),
            include_batch_picking: new FormControl(s?.include_batch_picking ?? false),

            default_location_enabled: new FormControl(dl?.enabled ?? false),

            delivery_pod_setting: new FormGroup({
                is_verification_required: new FormControl(dp?.is_verification_required ?? true),
                is_id_photo_required:  new FormControl(dp?.is_id_photo_required  ?? true),
                is_signature_required: new FormControl(dp?.is_signature_required ?? true),
                enable_id_validation:  new FormControl(dp?.enable_id_validation  ?? false),
                is_location_required: new FormControl(dp?.is_location_required ?? false),
            }),

            collect_pod_setting: new FormGroup({
                is_verification_required: new FormControl(cp?.is_verification_required ?? true),
                is_id_photo_required:  new FormControl(cp?.is_id_photo_required  ?? true),
                is_signature_required: new FormControl(cp?.is_signature_required ?? true),
                enable_id_validation:  new FormControl(cp?.enable_id_validation  ?? false),
                is_location_required: new FormControl(cp?.is_location_required ?? false),
            }),
        });

        // Only OWNER changes costing; the backend also rejects it (403) for other roles.
        if (!this.isOwner) this.form.get('costing')?.disable();

        // Pre-populate selected location immediately with data we already have
        // (operational_category_code will be enriched when loadLocations completes)
        if (dl?.id) {
            this.selectedLocation.set({
                id: dl.id,
                location_code: dl.location_code ?? '',
            });
        }
    }

    save(): void {
        if (!this.facility?.id) return;

        const v = this.form.value;
        const dp = v.delivery_pod_setting;
        const deliveryPod: ActivityPODSettings = dp.is_verification_required
            ? dp as ActivityPODSettings
            : {
                is_verification_required: false,
                is_id_photo_required: false,
                is_signature_required: false,
                enable_id_validation: false,
                is_location_required: dp.is_location_required,
            };

        const cp = v.collect_pod_setting;
        const collectPod: ActivityPODSettings = cp.is_verification_required
            ? cp as ActivityPODSettings
            : {
                is_verification_required: false,
                is_id_photo_required: false,
                is_signature_required: false,
                enable_id_validation: false,
                is_location_required: cp.is_location_required,
            };

        // Build default_location from toggle + selected location
        const sel = this.selectedLocation();
        const defaultLocation: DefaultLocationSetting = {
            enabled: v.default_location_enabled,
            ...(sel ? { id: sel.id } : {}),
        };

        const payload: Partial<Facility> = {
            settings: {
                auto_blocked_expired:       v.auto_blocked_expired,
                auto_processing:            v.auto_processing,
                include_batch_picking:      v.include_batch_picking,
                delivery_pod_setting:       deliveryPod,
                collect_pod_setting:        collectPod,
                default_location:           defaultLocation,
                // Omitted for non-owners: the backend then keeps the stored value.
                // Method and currency travel as stored (they change through
                // initializeCosting); only the required-cost flag is edited here.
                ...(this.isOwner
                    ? {
                          costing: {
                              ...this.storedCosting(),
                              cost_required_on_receiving: !!v.costing?.cost_required_on_receiving,
                          },
                      }
                    : {}),
            },
        };

        this.isLoading.set(true);
        this.svc.updateFacility(this.facility.id, payload).subscribe({
            next: (result: Facility) => {
                this.messageService.add({
                    severity: 'success',
                    summary: this.translate.instant('common.success'),
                    detail: this.translate.instant('messages.update_success'),
                });
                this.ref.close(result);
            },
            error: (err: HttpErrorResponse) => {
                this.isLoading.set(false);
                const detail = err?.error?.code === 'FACILITY_COSTING_FORBIDDEN'
                    ? this.translate.instant('preferences.facilities.costing_owner_only')
                    : err?.error?.message
                    ? this.translate.instant('preferences.facilities.' + err.error.message)
                    : this.translate.instant('messages.save_error');
                this.messageService.add({ severity: 'error', summary: 'Error', detail });
            },
        });
    }

    cancel(): void { this.ref.close(this.costingAppliedFacility ?? undefined); }

    // ── Costing initialize (OWNER) ──────────────────────────────────────

    private formCosting(): CostingSettings {
        const c = this.form.get('costing')?.getRawValue() ?? {};
        return {
            method: (c.method ?? 'NONE') as CostingMethod,
            currency: (c.currency ?? DEFAULT_CURRENCY) as CostingCurrency,
            cost_required_on_receiving: !!c.cost_required_on_receiving,
        };
    }

    /** Method or currency in the form differ from what is stored. */
    costingChanged(): boolean {
        const f = this.formCosting();
        const s = this.storedCosting();
        return f.method !== s.method || f.currency !== s.currency;
    }

    /**
     * What applying the form's method/currency would do:
     * 'start' (from NONE: value current stock), 'stop' (to NONE),
     * 'blocked' (another active valuation — turn it off first),
     * 'currency' (no costing before or after: only the currency changes).
     */
    costingChangeKind(): 'start' | 'stop' | 'blocked' | 'currency' {
        const f = this.formCosting();
        const s = this.storedCosting();
        if (!isCostingEnabled(f)) return isCostingEnabled(s) ? 'stop' : 'currency';
        if (isCostingEnabled(s) && COSTING_METHODS_AVAILABLE.includes(s.method)) return 'blocked';
        return 'start';
    }

    /** i18n key explaining what applying the change will do. */
    costingChangeMessageKey(): string {
        const kind = this.costingChangeKind();
        // Turning a method on: each one explains what it does (AVERAGE uses the generic text).
        const method = this.formCosting().method;
        const suffix = kind === 'start' && method !== 'AVERAGE' ? `_${method.toLowerCase()}` : '';
        return `preferences.facilities.costing_change_${kind}${suffix}`;
    }

    resetCostingForm(): void {
        const s = this.storedCosting();
        this.form.get('costing')?.patchValue({ method: s.method, currency: s.currency });
        this.confirmingCosting.set(false);
    }

    applyCosting(): void {
        if (!this.facility?.id || !this.isOwner || this.costingChangeKind() === 'blocked') return;
        // A currency-only change values nothing, so it needs no confirmation.
        if (!this.confirmingCosting() && this.costingChangeKind() !== 'currency') {
            this.confirmingCosting.set(true);
            return;
        }
        const target = this.formCosting();
        this.applyingCosting.set(true);
        this.svc.initializeCosting(this.facility.id, target).subscribe({
            next: res => {
                this.applyingCosting.set(false);
                this.confirmingCosting.set(false);
                this.storedCosting.set(res.costing);
                if (this.facility) {
                    this.facility = { ...this.facility, settings: { ...this.facility.settings, costing: res.costing } };
                    this.costingAppliedFacility = this.facility;
                }
                const currency = res.costing.currency ?? DEFAULT_CURRENCY;
                this.messageService.add({
                    severity: 'success',
                    summary: this.translate.instant('common.success'),
                    detail: res.initialized
                        ? this.translate.instant('preferences.facilities.costing_initialized', {
                              skus: res.skus,
                              value: formatCost(res.total_value, currency),
                          })
                        : this.translate.instant('preferences.facilities.costing_updated'),
                });
            },
            error: (err: HttpErrorResponse) => {
                this.applyingCosting.set(false);
                const code = err?.error?.code;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: code ? this.translate.instant('errors.' + code) : this.translate.instant('messages.save_error'),
                });
            },
        });
    }

    // ── Location dropdown (p-select with filter) ────────────────────────

    /** Initial load of locations for the dropdown */
    loadLocations(filterQuery?: string): void {
        this.loadingLocations.set(true);
        this.locationSvc.listLocations({
            filter: {
                ...(filterQuery
                    ? { location_code: { value: filterQuery, match_mode: 'contains' } }
                    : {}),
                ...(this.facility?.id
                    ? { facility_id: { value: this.facility.id, match_mode: 'equals' } }
                    : {}),
            },
            config: { page: 1, rows: 50 },
        }).subscribe({
            next: (resp) => {
                const options: LocationOption[] = (resp.data ?? []).map((loc: WmsLocation) => ({
                    id: loc.id,
                    location_code: loc.location_code,
                    operational_category_code: loc.operational_category_code,
                }));

                // If we have a selected location, enrich it with full data from results
                // (e.g. operational_category_code that wasn't available from settings)
                const sel = this.selectedLocation();
                if (sel) {
                    const match = options.find(o => o.id === sel.id);
                    if (match) {
                        this.selectedLocation.set(match);
                    } else {
                        // Selected location not in current page — prepend it
                        options.unshift(sel);
                    }
                }
                this.locationOptions.set(options);
                this.loadingLocations.set(false);
            },
            error: () => {
                this.locationOptions.set([]);
                this.loadingLocations.set(false);
            },
        });
    }

    /** Called by p-select's (onFilter) event — debounced server-side search */
    onFilterLocations(event: { filter: string }): void {
        if (this.filterDebounceTimer) clearTimeout(this.filterDebounceTimer);
        this.filterDebounceTimer = setTimeout(() => {
            this.loadLocations(event.filter);
        }, 350);
    }

    /** Called when the user selects or clears a location in the dropdown */
    onLocationSelected(loc: LocationOption | null): void {
        this.selectedLocation.set(loc);
    }

    getCategorySeverity(code?: string): 'success' | 'danger' | 'info' | 'secondary' {
        switch (code?.toUpperCase()) {
            case 'REGULAR': return 'success';
            case 'HURT':    return 'danger';
            case 'STAGED':  return 'info';
            default:        return 'secondary';
        }
    }
}
