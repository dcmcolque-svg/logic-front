/**
 * Unit tests for FacilitySettingsDialogComponent.
 *
 * Mounts the real component via TestBed, verifying:
 * - Component creation / template compilation
 * - is_location_required form structure & defaults
 * - Initialisation from existing facility settings
 * - Independence of GPS toggle from master switch
 * - save() payload construction with master ON/OFF
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { of } from 'rxjs';

import { FacilitySettingsDialogComponent } from './facility-settings-dialog-component';
import { FacilitiesService } from '../../facilities.service';
import { LocationService } from '../../../locations/location.service';
import { AuthService } from '../../../../../core/services/auth.service';
import {
    ActivityPODSettings,
    Facility,
    FacilitySettings,
} from '../../facilities.types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function podDefaults(overrides: Partial<ActivityPODSettings> = {}): ActivityPODSettings {
    return {
        is_verification_required: true,
        is_id_photo_required: true,
        is_signature_required: true,
        enable_id_validation: false,
        is_location_required: false,
        ...overrides,
    };
}

function buildFacility(settingsOverride: Partial<FacilitySettings> = {}): Facility {
    return {
        id: 'fac-1',
        code: 'WH-01',
        name: 'Test Warehouse',
        operator_id: 'op-1',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        address: {
            city: 'Miami',
            street: '123 Main',
            zip_code: '33101',
            state_province: 'FL',
            country_code: 'US',
            coordinates: { lat: 25.7617, lng: -80.1918 },
        },
        settings: {
            auto_blocked_expired: false,
            auto_processing: false,
            include_batch_picking: false,
            ...settingsOverride,
        },
        sso_users: [],
    };
}

// ── Test setup ──────────────────────────────────────────────────────────────

describe('FacilitySettingsDialogComponent', () => {
    let component: FacilitySettingsDialogComponent;
    let fixture: ComponentFixture<FacilitySettingsDialogComponent>;
    let mockRef: jasmine.SpyObj<DynamicDialogRef>;
    let mockFacilitiesService: jasmine.SpyObj<FacilitiesService>;
    let mockLocationService: jasmine.SpyObj<LocationService>;

    function setup(facility?: Facility, role = '') {
        mockRef = jasmine.createSpyObj('DynamicDialogRef', ['close']);
        const mockAuth = { getAuthUserInfo: () => ({ role }) };
        mockFacilitiesService = jasmine.createSpyObj('FacilitiesService', ['updateFacility', 'initializeCosting']);
        mockFacilitiesService.initializeCosting.and.returnValue(of({
            costing: { method: 'AVERAGE', currency: 'BOB', cost_required_on_receiving: false },
            initialized: true,
            skus: 3,
            total_value: 1500,
        }));
        mockFacilitiesService.updateFacility.and.returnValue(of(facility ?? buildFacility()));

        mockLocationService = jasmine.createSpyObj('LocationService', ['listLocations']);
        mockLocationService.listLocations.and.returnValue(of({ data: [], meta_data: { page: 1, rows: 50, total_records: 0 } }));

        TestBed.configureTestingModule({
            imports: [
                FacilitySettingsDialogComponent,
                HttpClientTestingModule,
                TranslateModule.forRoot(),
            ],
            providers: [
                MessageService,
                { provide: DynamicDialogRef, useValue: mockRef },
                {
                    provide: DynamicDialogConfig,
                    useValue: { data: { facility: facility ?? buildFacility() } },
                },
                { provide: FacilitiesService, useValue: mockFacilitiesService },
                { provide: LocationService, useValue: mockLocationService },
                { provide: AuthService, useValue: mockAuth },
            ],
        });

        fixture = TestBed.createComponent(FacilitySettingsDialogComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }

    afterEach(() => TestBed.resetTestingModule());

    // ─── Component creation ─────────────────────────────────────────────

    describe('component creation', () => {
        it('should create the component and compile the template', () => {
            setup();
            expect(component).toBeTruthy();
        });

        it('should initialise the form on creation', () => {
            setup();
            expect(component.form).toBeTruthy();
            expect(component.form.get('delivery_pod_setting')).toBeTruthy();
            expect(component.form.get('collect_pod_setting')).toBeTruthy();
        });
    });

    // ─── Form structure ─────────────────────────────────────────────────

    describe('form structure', () => {
        it('should have is_location_required control in delivery_pod_setting', () => {
            setup();
            expect(component.form.get('delivery_pod_setting.is_location_required')).toBeTruthy();
        });

        it('should have is_location_required control in collect_pod_setting', () => {
            setup();
            expect(component.form.get('collect_pod_setting.is_location_required')).toBeTruthy();
        });
    });

    // ─── Defaults (no POD settings from backend) ────────────────────────

    describe('defaults (no POD settings)', () => {
        it('should default delivery is_location_required to false', () => {
            setup(buildFacility());
            expect(component.form.get('delivery_pod_setting.is_location_required')?.value).toBeFalse();
        });

        it('should default collect is_location_required to false', () => {
            setup(buildFacility());
            expect(component.form.get('collect_pod_setting.is_location_required')?.value).toBeFalse();
        });
    });

    // ─── Initialisation from existing settings ──────────────────────────

    describe('initialisation from existing settings', () => {
        it('should read delivery is_location_required=true', () => {
            setup(buildFacility({
                delivery_pod_setting: podDefaults({ is_location_required: true }),
            }));
            expect(component.form.get('delivery_pod_setting.is_location_required')?.value).toBeTrue();
        });

        it('should read delivery is_location_required=false', () => {
            setup(buildFacility({
                delivery_pod_setting: podDefaults({ is_location_required: false }),
            }));
            expect(component.form.get('delivery_pod_setting.is_location_required')?.value).toBeFalse();
        });

        it('should read collect is_location_required=false', () => {
            setup(buildFacility({
                collect_pod_setting: podDefaults({ is_location_required: false }),
            }));
            expect(component.form.get('collect_pod_setting.is_location_required')?.value).toBeFalse();
        });

        it('should read both as true when explicitly set', () => {
            setup(buildFacility({
                delivery_pod_setting: podDefaults({ is_location_required: true }),
                collect_pod_setting: podDefaults({ is_location_required: true }),
            }));
            expect(component.form.get('delivery_pod_setting.is_location_required')?.value).toBeTrue();
            expect(component.form.get('collect_pod_setting.is_location_required')?.value).toBeTrue();
        });
    });

    // ─── Independence from master switch ─────────────────────────────────

    describe('independence from master switch', () => {
        it('should preserve GPS=true when delivery master switch is OFF', () => {
            setup(buildFacility({
                delivery_pod_setting: podDefaults({
                    is_verification_required: false,
                    is_location_required: true,
                }),
            }));
            expect(component.form.get('delivery_pod_setting.is_verification_required')?.value).toBeFalse();
            expect(component.form.get('delivery_pod_setting.is_location_required')?.value).toBeTrue();
        });

        it('should preserve GPS=false when delivery master switch is ON', () => {
            setup(buildFacility({
                delivery_pod_setting: podDefaults({
                    is_verification_required: true,
                    is_location_required: false,
                }),
            }));
            expect(component.form.get('delivery_pod_setting.is_verification_required')?.value).toBeTrue();
            expect(component.form.get('delivery_pod_setting.is_location_required')?.value).toBeFalse();
        });

        it('should allow toggling GPS independently of master switch', () => {
            setup(buildFacility({
                delivery_pod_setting: podDefaults({ is_location_required: true }),
            }));

            // Turn OFF master switch
            component.form.get('delivery_pod_setting.is_verification_required')?.setValue(false);
            // GPS is still independently controllable
            component.form.get('delivery_pod_setting.is_location_required')?.setValue(false);

            expect(component.form.get('delivery_pod_setting.is_location_required')?.value).toBeFalse();
        });
    });

    // ─── Save payload construction ───────────────────────────────────────

    describe('save payload construction', () => {
        it('should pass through GPS when master switch is ON', () => {
            setup(buildFacility({
                delivery_pod_setting: podDefaults({ is_location_required: false }),
            }));

            component.save();

            const payload = mockFacilitiesService.updateFacility.calls.mostRecent().args[1];
            expect(payload.settings?.delivery_pod_setting?.is_verification_required).toBeTrue();
            expect(payload.settings?.delivery_pod_setting?.is_location_required).toBeFalse();
        });

        it('should preserve GPS=true in payload when master switch is OFF', () => {
            setup(buildFacility({
                delivery_pod_setting: podDefaults({
                    is_verification_required: false,
                    is_location_required: true,
                }),
            }));

            component.save();

            const payload = mockFacilitiesService.updateFacility.calls.mostRecent().args[1];
            expect(payload.settings?.delivery_pod_setting?.is_verification_required).toBeFalse();
            // Other POD fields are forced false
            expect(payload.settings?.delivery_pod_setting?.is_id_photo_required).toBeFalse();
            expect(payload.settings?.delivery_pod_setting?.is_signature_required).toBeFalse();
            expect(payload.settings?.delivery_pod_setting?.enable_id_validation).toBeFalse();
            // But GPS is preserved
            expect(payload.settings?.delivery_pod_setting?.is_location_required).toBeTrue();
        });

        it('should preserve GPS=false in payload when collect master switch is OFF', () => {
            setup(buildFacility({
                collect_pod_setting: podDefaults({
                    is_verification_required: false,
                    is_location_required: false,
                }),
            }));

            component.save();

            const payload = mockFacilitiesService.updateFacility.calls.mostRecent().args[1];
            expect(payload.settings?.collect_pod_setting?.is_verification_required).toBeFalse();
            expect(payload.settings?.collect_pod_setting?.is_location_required).toBeFalse();
        });

        it('should force photo/signature/id to false when master OFF, but keep GPS', () => {
            setup(buildFacility({
                delivery_pod_setting: podDefaults({
                    is_verification_required: false,
                    is_id_photo_required: true,
                    is_signature_required: true,
                    enable_id_validation: true,
                    is_location_required: true,
                }),
            }));

            component.save();

            const payload = mockFacilitiesService.updateFacility.calls.mostRecent().args[1];
            expect(payload.settings?.delivery_pod_setting?.is_id_photo_required).toBeFalse();
            expect(payload.settings?.delivery_pod_setting?.is_signature_required).toBeFalse();
            expect(payload.settings?.delivery_pod_setting?.enable_id_validation).toBeFalse();
            expect(payload.settings?.delivery_pod_setting?.is_location_required).toBeTrue();
        });
    });

    // ─── Costing (OWNER only) ───────────────────────────────────────────

    describe('costing', () => {
        it('defaults to NONE / BOB when the facility has no costing', () => {
            setup(undefined, 'OWNER');
            expect(component.form.get('costing.method')?.value).toBe('NONE');
            expect(component.form.get('costing.currency')?.value).toBe('BOB');
        });

        it('Update keeps the stored method/currency and only edits the required-cost flag', () => {
            setup(buildFacility({ costing: { method: 'AVERAGE', currency: 'CLP' } }), 'OWNER');
            component.form.get('costing.method')?.setValue('NONE');
            component.form.get('costing.cost_required_on_receiving')?.setValue(true);

            component.save();

            const payload = mockFacilitiesService.updateFacility.calls.mostRecent().args[1];
            expect(payload.settings?.costing).toEqual({
                method: 'AVERAGE',
                currency: 'CLP',
                cost_required_on_receiving: true,
            });
        });

        it('initializes costing in two steps (button, then confirm)', () => {
            setup(buildFacility(), 'OWNER');
            component.form.get('costing.method')?.setValue('AVERAGE');
            expect(component.costingChanged()).toBeTrue();
            expect(component.costingChangeKind()).toBe('start');

            component.applyCosting();
            expect(mockFacilitiesService.initializeCosting).not.toHaveBeenCalled();
            expect(component.confirmingCosting()).toBeTrue();

            component.applyCosting();
            expect(mockFacilitiesService.initializeCosting).toHaveBeenCalledWith('fac-1', {
                method: 'AVERAGE',
                currency: 'BOB',
                cost_required_on_receiving: false,
            });
            expect(component.storedCosting().method).toBe('AVERAGE');
            expect(component.costingChanged()).toBeFalse();
        });

        it('changes the currency without costing in one step', () => {
            setup(buildFacility(), 'OWNER');
            component.form.get('costing.currency')?.setValue('CLP');
            expect(component.costingChanged()).toBeTrue();
            expect(component.costingChangeKind()).toBe('currency');
            expect(component.costingChangeMessageKey()).toBe('preferences.facilities.costing_change_currency');

            component.applyCosting();
            expect(mockFacilitiesService.initializeCosting).toHaveBeenCalledWith('fac-1', jasmine.objectContaining({
                method: 'NONE',
                currency: 'CLP',
            }));
        });

        it('blocks switching between two active valuations', () => {
            setup(buildFacility({ costing: { method: 'AVERAGE', currency: 'BOB' } }), 'OWNER');
            component.form.get('costing.currency')?.setValue('USD');
            expect(component.costingChangeKind()).toBe('blocked');

            component.applyCosting();
            component.applyCosting();
            expect(mockFacilitiesService.initializeCosting).not.toHaveBeenCalled();
        });

        it('offers every method', () => {
            setup(undefined, 'OWNER');
            const enabled = component.costingMethodOptions.filter(o => !o.disabled).map(o => o.value);
            expect(enabled).toEqual(['NONE', 'AVERAGE', 'SPECIFIC', 'FIFO', 'STANDARD']);
        });

        it('explains each method when turning it on', () => {
            setup(undefined, 'OWNER');
            component.form.get('costing.method')?.setValue('FIFO');
            expect(component.costingChangeMessageKey()).toBe('preferences.facilities.costing_change_start_fifo');
            component.form.get('costing.method')?.setValue('AVERAGE');
            expect(component.costingChangeMessageKey()).toBe('preferences.facilities.costing_change_start');
        });

        it('disables costing and omits it from the payload for non-owners', () => {
            setup(buildFacility({ costing: { method: 'FIFO', currency: 'USD' } }), 'RECEIVER');
            expect(component.form.get('costing')?.disabled).toBeTrue();

            component.save();

            const payload = mockFacilitiesService.updateFacility.calls.mostRecent().args[1];
            expect(payload.settings && 'costing' in payload.settings).toBeFalse();
        });
    });
});
