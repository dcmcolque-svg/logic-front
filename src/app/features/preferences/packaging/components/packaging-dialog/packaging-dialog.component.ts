import {
    Component,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    AbstractControl,
    FormControl,
    FormGroup,
    FormsModule,
    ReactiveFormsModule,
    ValidationErrors,
    Validators,
} from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, switchMap } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { TextareaModule } from 'primeng/textarea';
import { AccordionModule } from 'primeng/accordion';
import { TooltipModule } from 'primeng/tooltip';

import { MessageEdgeService } from '../../../../../core/services/message.service';
import { PackagingService } from '../../packaging.service';
import { FacilitiesService } from '../../../facilities/facilities.service';
import { Facility } from '../../../facilities/facilities.types';
import {
    PackagingListItem,
    PackagingIntakeInput,
    SkuUpdateInput,
    ContainerProfile,
} from '../../packaging.types';
import { revealInvalid } from '@/app/shared/utils/form.util'

/**
 * Upper bound for the quantity field, enforced only by the reactive validator.
 * Not bound to p-inputNumber [max]: PrimeNG would silently clamp an out-of-range
 * value on blur instead of showing the validation error.
 */
const MAX_QTY = 9_999_999_999;

/** Shape of HTTP error responses used in subscribe error handlers. */
interface ApiError {
    code?: string;
    message?: string;
    error?: { code?: string; message?: string };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const noWhitespace = (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const v = control.value.toString();
    if (v.trim().length === 0) return { whitespace: true };
    if (v !== v.trim() || /\s{2,}/.test(v)) return { extraSpaces: true };
    return null;
};

@Component({
    selector: 'app-packaging-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        TranslateModule,
        ButtonModule,
        InputTextModule,
        InputNumberModule,
        SelectModule,
        ToastModule,
        TextareaModule,
        AccordionModule,
        TooltipModule,
    ],
    templateUrl: './packaging-dialog.component.html',
    styleUrl: './packaging-dialog.component.scss',
})
export class PackagingDialogComponent implements OnInit {
    private readonly ref = inject(DynamicDialogRef);
    private readonly config = inject(DynamicDialogConfig);
    private readonly translate = inject(TranslateService);
    private readonly packagingService = inject(PackagingService);
    private readonly facilitiesService = inject(FacilitiesService);
    private readonly messageService = inject(MessageEdgeService);

    form!: FormGroup;
    isEditMode = false;
    saving = signal(false);

    facilities = signal<{ label: string; value: string }[]>([]);
    loadingFacilities = signal(false);

    containerProfiles = signal<{ label: string; value: string }[]>([]);
    loadingProfiles = signal(false);

    /** The original item being edited (only in edit mode) */
    private editItem: PackagingListItem | null = null;

    ngOnInit(): void {
        const data = this.config?.data || {};
        this.editItem = data.item ?? null;
        this.isEditMode = !!this.editItem;

        this.form = new FormGroup({
            facility_id:  new FormControl(
                { value: this.editItem?.facility_id ?? '', disabled: this.isEditMode },
                [Validators.required]
            ),
            name:        new FormControl(this.editItem?.sku_name ?? '', [Validators.required, noWhitespace]),
            description: new FormControl(this.editItem?.sku_description ?? ''),
            barcode:     new FormControl(this.editItem?.barcode ?? '', [noWhitespace]),
            qty: new FormControl(
                { value: this.isEditMode ? this.editItem?.quantity ?? 0 : null, disabled: this.isEditMode },
                this.isEditMode ? [] : [Validators.required, Validators.min(1), Validators.max(MAX_QTY)]
            ),
            weight: new FormControl(this.editItem?.weight ?? 0, [Validators.min(0)]),
            length: new FormControl(this.editItem?.length ?? 0, [Validators.min(0)]),
            width:  new FormControl(this.editItem?.width ?? 0, [Validators.min(0)]),
            height: new FormControl(this.editItem?.height ?? 0, [Validators.min(0)]),
            retail_price:    new FormControl(this.editItem?.retail_price ?? 0, [Validators.min(0)]),
            wholesale_price: new FormControl(this.editItem?.wholesale_price ?? 0, [Validators.min(0)]),
            container_profile_id: new FormControl(
                this.editItem?.container_profile_id ?? null,
                [Validators.required]
            ),
        });

        this.loadFacilities();
        this.loadContainerProfiles();
    }

    loadFacilities(): void {
        this.loadingFacilities.set(true);
        this.facilitiesService.getFacilities({
            config: { page: 1, rows: 1000, populate_data: false },
            filter: {},
        }).subscribe({
            next: (resp) => {
                this.facilities.set(
                    (resp.data ?? []).map((f: Facility) => ({
                        label: f.name,
                        value: f.id,
                    }))
                );
                this.loadingFacilities.set(false);
            },
            error: () => this.loadingFacilities.set(false),
        });
    }

    loadContainerProfiles(): void {
        this.loadingProfiles.set(true);
        this.packagingService.listContainerProfiles().subscribe({
            next: (resp) => {
                this.containerProfiles.set(
                    (resp.data ?? []).map((p: ContainerProfile) => ({
                        label: this.translate.instant(`packaging.package_types.${p.code}`) || p.name,
                        value: p.id,
                    }))
                );
                this.loadingProfiles.set(false);
            },
            error: () => this.loadingProfiles.set(false),
        });
    }

    onSave(): void {
        if (revealInvalid(this.form)) return;
        if (this.saving()) return;
        this.saving.set(true);

        if (this.isEditMode) {
            this.handleUpdate();
        } else {
            this.handleCreate();
        }
    }

    private handleCreate(): void {
        const v = this.form.getRawValue();
        const nameValue = v.name.trim();
        const input: PackagingIntakeInput = {
            sku_code:    nameValue,
            name:        nameValue,
            description: v.description?.trim() || undefined,
            barcode:     v.barcode?.trim() || undefined,
            weight:      v.weight ?? 0,
            dimensions:  (v.length || v.width || v.height)
                ? { l: v.length ?? 0, w: v.width ?? 0, h: v.height ?? 0 }
                : undefined,
            facility_id: v.facility_id,
            qty:         v.qty,
            retail_price:    v.retail_price ?? 0,
            wholesale_price: v.wholesale_price ?? 0,
            container_profile_id: v.container_profile_id || undefined,
        };

        this.packagingService.createPackaging(input).pipe(
            switchMap((resp) => {
                if (v.container_profile_id && resp.sku?.id) {
                    return this.packagingService.updatePackaging(resp.sku.id, {
                        container_profile_id: v.container_profile_id,
                        retail_price: v.retail_price ?? undefined,
                        wholesale_price: v.wholesale_price ?? undefined,
                    });
                }
                return of(resp);
            })
        ).subscribe({
            next: () => {
                this.messageService.showSuccess(this.translate.instant('packaging.messages.created_success'));
                this.saving.set(false);
                this.ref.close(true);
            },
            error: (err: unknown) => {
                this.saving.set(false);
                const e = err as ApiError;
                const code = e?.code ?? e?.error?.code;
                const translationKey = `packaging.messages.${code}`;
                const translated = this.translate.instant(translationKey, { name: nameValue });
                const detail = (code && translated !== translationKey)
                    ? translated
                    : (e?.message ?? e?.error?.message ?? this.translate.instant('packaging.messages.created_error'));
                this.messageService.showError(detail);
            },
        });
    }

    private handleUpdate(): void {
        const v = this.form.getRawValue();
        const input: SkuUpdateInput = {
            name:        v.name?.trim() || undefined,
            description: v.description?.trim() || undefined,
            barcode:     v.barcode?.trim() || undefined,
            weight:      v.weight ?? undefined,
            dimensions:  (v.length || v.width || v.height)
                ? { l: v.length ?? 0, w: v.width ?? 0, h: v.height ?? 0 }
                : undefined,
            retail_price:    v.retail_price ?? undefined,
            wholesale_price: v.wholesale_price ?? undefined,
            container_profile_id: v.container_profile_id || undefined,
        };

        this.packagingService.updatePackaging(this.editItem!.sku_id, input).subscribe({
            next: () => {
                this.messageService.showSuccess(this.translate.instant('packaging.messages.updated_success'));
                this.saving.set(false);
                this.ref.close(true);
            },
            error: (err: unknown) => {
                this.saving.set(false);
                const e = err as ApiError;
                const code = e?.code ?? e?.error?.code;
                const translationKey = `packaging.messages.${code}`;
                const translated = this.translate.instant(translationKey, { name: v.name?.trim() });
                const detail = (code && translated !== translationKey)
                    ? translated
                    : (e?.message ?? e?.error?.message ?? this.translate.instant('packaging.messages.updated_error'));
                this.messageService.showError(detail);
            },
        });
    }

    onCancel(): void {
        this.ref.close();
    }

    isInvalid(fieldName: string): boolean {
        const field = this.form.get(fieldName);
        return !!(field && field.invalid && (field.touched || field.dirty));
    }

    getFieldError(fieldName: string): string {
        const field = this.form.get(fieldName);
        if (field?.errors) {
            if (field.errors['required']) return this.translate.instant('forms_validation.required');
            if (field.errors['min'])      return this.translate.instant('forms_validation.min_value');
            if (field.errors['max'])      return this.translate.instant('forms_validation.max_value');
            if (field.errors['whitespace'] || field.errors['extraSpaces'])
                return this.translate.instant('forms_validation.character_invalid');
        }
        return '';
    }
}
