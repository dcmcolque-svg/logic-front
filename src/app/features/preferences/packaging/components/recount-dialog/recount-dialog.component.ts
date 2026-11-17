import {
    Component,
    computed,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';

import { PackagingService } from '../../packaging.service';
import { PackagingListItem, RecountInput } from '../../packaging.types';

@Component({
    selector: 'app-recount-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TranslateModule,
        ButtonModule,
        InputNumberModule,
        ToggleSwitchModule,
        ToastModule,
    ],
    providers: [MessageService],
    templateUrl: './recount-dialog.component.html',
    styleUrl: './recount-dialog.component.scss',
})
export class RecountDialogComponent implements OnInit {
    private readonly ref = inject(DynamicDialogRef);
    private readonly config = inject(DynamicDialogConfig);
    private readonly translate = inject(TranslateService);
    private readonly packagingService = inject(PackagingService);
    private readonly messageService = inject(MessageService);

    /** The packaging item being recounted */
    item!: PackagingListItem;

    /** true = increase, false = reduce */
    isIncrease = signal(true);

    /** The absolute quantity the user wants to add/reduce */
    quantity = signal<number>(0);

    /** Saving state */
    saving = signal(false);

    // ── Computed values for the summary cards ────────────────────────────────

    currentQuantity = computed(() => this.item?.quantity ?? 0);

    /** When reducing, cap input to the current stock so final never goes < 0 */
    maxQuantity = computed(() =>
        this.isIncrease() ? undefined : this.currentQuantity()
    );

    quantityToChange = computed(() => this.quantity());

    finalQuantity = computed(() => {
        const current = this.currentQuantity();
        const change = this.quantity();
        return this.isIncrease()
            ? current + change
            : current - change;
    });

    /** True when the operation would leave negative stock */
    isNegativeResult = computed(() => this.finalQuantity() < 0);

    /** Label for the action: "Increase" or "Reduce" */
    actionLabel = computed(() =>
        this.isIncrease()
            ? this.translate.instant('packaging.recount.increase')
            : this.translate.instant('packaging.recount.reduce')
    );

    ngOnInit(): void {
        const data = this.config?.data || {};
        this.item = data.item;
    }

    onQuantityChange(value: number | null): void {
        // In reduce mode, clamp so the final quantity never goes below 0
        const max = this.maxQuantity() ?? Number.POSITIVE_INFINITY;
        this.quantity.set(Math.min(value ?? 0, max));
    }

    onSwitchChange(): void {
        // Signal already updated by ngModel binding
    }

    onConfirm(): void {
        const qty = this.quantity();
        if (!qty || qty <= 0 || this.saving() || this.isNegativeResult()) return;

        this.saving.set(true);

        const input: RecountInput = {
            kardex_id: this.item.kardex_id,
            qty: this.isIncrease() ? qty : qty * -1,
        };

        this.packagingService.recountPackaging(input).subscribe({
            next: () => {
                this.messageService.add({
                    severity: 'success',
                    summary: this.translate.instant('messages.success'),
                    detail: this.translate.instant('packaging.recount.success'),
                });
                this.saving.set(false);
                this.ref.close(true);
            },
            error: (err) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message ?? this.translate.instant('packaging.recount.error'),
                });
                this.saving.set(false);
            },
        });
    }

    onCancel(): void {
        this.ref.close();
    }
}
