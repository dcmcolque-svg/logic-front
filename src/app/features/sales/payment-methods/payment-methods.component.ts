import { TooltipModule } from 'primeng/tooltip'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { InputNumberModule } from 'primeng/inputnumber'
import { InputTextModule } from 'primeng/inputtext'
import { MessageModule } from 'primeng/message'
import { SelectModule } from 'primeng/select'
import { TableModule } from 'primeng/table'
import { ToggleSwitchModule } from 'primeng/toggleswitch'

import { BaseDialog } from '@/app/shared/components'
import { SalesService } from '../sales.service'
import { PAYMENT_KINDS, PaymentKind, PaymentMethod, PaymentMethodInput } from '../sales.types'
import { kindIcon, salesErrorMessages } from '../sales.util'

const EMPTY: PaymentMethodInput = { code: '', name: '', kind: 'CASH', requires_reference: false, sort_order: 0, is_active: true }

/**
 * Payment methods of the operator, as offered by the point of sale.
 * Methods are deactivated, never deleted: past sales keep the name they were
 * charged with.
 */
@Component({
  selector: 'app-payment-methods',
  standalone: true,
  imports: [
    TooltipModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    BaseDialog,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    ToggleSwitchModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <p class="m-0 text-sm text-surface-500">{{ 'sales.methods.subtitle' | translate }}<i class="pi pi-info-circle text-surface-500 cursor-help ml-1 align-middle" [pTooltip]="'sales.methods.hint' | translate" tooltipPosition="bottom"></i></p>
        <p-button class="ml-auto" [label]="'sales.methods.new' | translate" icon="pi pi-plus" (onClick)="edit(null)" />
      </div>

      <p-table [value]="methods()" [loading]="loading()" styleClass="p-datatable-sm" [rowHover]="true" dataKey="id">
        <ng-template #header>
          <tr>
            <th class="w-16">{{ 'sales.methods.order' | translate }}</th>
            <th>{{ 'sales.methods.name' | translate }}</th>
            <th>{{ 'sales.methods.code' | translate }}</th>
            <th>{{ 'sales.methods.kind' | translate }}</th>
            <th>{{ 'sales.methods.reference' | translate }}</th>
            <th>{{ 'labels.status' | translate }}</th>
            <th class="w-16"></th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr [class.opacity-50]="!row.is_active">
            <td class="font-mono text-surface-500">{{ row.sort_order }}</td>
            <td class="font-medium"><i [class]="icon(row.kind)" class="mr-2 text-surface-500"></i>{{ row.name }}</td>
            <td class="font-mono text-sm">{{ row.code }}</td>
            <td>{{ 'sales.kinds.' + row.kind | translate }}
              @if (row.kind === 'CASH') { <small class="block text-surface-500">{{ 'sales.methods.counts_in_drawer' | translate }}</small> }
              @if (row.kind === 'CREDIT') { <small class="block text-surface-500">{{ 'sales.methods.needs_customer' | translate }}</small> }
            </td>
            <td>@if (row.requires_reference) { <i class="pi pi-check text-green-600"></i> } @else { <span class="text-surface-400">—</span> }</td>
            <td>
              <!-- One click to (de)activate; the label says the current state -->
              <label class="inline-flex items-center gap-2 cursor-pointer">
                <p-toggleswitch [ngModel]="row.is_active" (ngModelChange)="toggleActive(row, $event)"
                  [disabled]="toggling() === row.id"
                  [ariaLabel]="(row.is_active ? 'sales.methods.active' : 'sales.methods.inactive') | translate" />
                <span class="text-sm" [class.text-surface-500]="!row.is_active">
                  {{ (row.is_active ? 'sales.methods.active' : 'sales.methods.inactive') | translate }}
                </span>
              </label>
            </td>
            <td>
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small"
                [ariaLabel]="'buttons.edit' | translate" (onClick)="edit(row)" />
            </td>
          </tr>
        </ng-template>
      </p-table>
    </div>

    <base-dialog
      [visible]="dialogVisible()"
      [header]="editingId() ? 'sales.methods.edit' : 'sales.methods.new'"
      size="sm"
      [loading]="saving()"
      [saveDisabled]="!form.name.trim() || !form.code.trim()"
      (save)="save()"
      (hide)="dialogVisible.set(false)"
    >
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label for="pmName" class="text-sm">{{ 'sales.methods.name' | translate }} *</label>
          <input pInputText id="pmName" name="name" [(ngModel)]="form.name" maxlength="60" [autofocus]="true"
            (ngModelChange)="suggestCode()" placeholder="Tigo Money" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label for="pmCode" class="text-sm">{{ 'sales.methods.code' | translate }} *</label>
            <input pInputText id="pmCode" name="code" [(ngModel)]="form.code" maxlength="30" class="uppercase font-mono"
              (ngModelChange)="codeTouched = true" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="pmOrder" class="text-sm">{{ 'sales.methods.order' | translate }}</label>
            <p-inputnumber inputId="pmOrder" name="sort_order" [(ngModel)]="form.sort_order" [min]="0" [useGrouping]="false" inputStyleClass="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label for="pmKind" class="text-sm">{{ 'sales.methods.kind' | translate }} *</label>
          <p-select inputId="pmKind" name="kind" [options]="kinds" [(ngModel)]="form.kind" optionValue="value" optionLabel="label" appendTo="body">
            <ng-template #selectedItem let-opt><i [class]="icon(opt.value)" class="mr-2"></i>{{ opt.label | translate }}</ng-template>
            <ng-template #item let-opt><i [class]="icon(opt.value)" class="mr-2"></i>{{ opt.label | translate }}</ng-template>
          </p-select>
          <small class="text-surface-500">{{ ('sales.methods.kind_hint_' + form.kind) | translate }}</small>
        </div>
        <label class="flex items-center gap-3 cursor-pointer">
          <p-toggleswitch name="requires_reference" [(ngModel)]="form.requires_reference" />
          <span class="text-sm">{{ 'sales.methods.requires_reference' | translate }}</span>
        </label>
        <label class="flex items-center gap-3 cursor-pointer">
          <p-toggleswitch name="is_active" [(ngModel)]="form.is_active" />
          <span class="text-sm">{{ 'sales.methods.active' | translate }}</span>
        </label>
        @for (e of errors(); track e) { <p-message severity="error">{{ e }}</p-message> }
      </div>
    </base-dialog>
  `,
})
export default class PaymentMethodsComponent {
  private readonly svc = inject(SalesService)
  private readonly translate = inject(TranslateService)
  private readonly toast = inject(MessageService)

  readonly methods = signal<PaymentMethod[]>([])
  readonly loading = signal(false)
  readonly dialogVisible = signal(false)
  readonly editingId = signal<string | null>(null)
  readonly saving = signal(false)
  readonly errors = signal<string[]>([])
  readonly kinds = PAYMENT_KINDS.map(k => ({ value: k, label: `sales.kinds.${k}` }))

  form: PaymentMethodInput = { ...EMPTY }
  codeTouched = false

  constructor() {
    this.load()
  }

  load(): void {
    this.loading.set(true)
    this.svc.listPaymentMethods(false).subscribe({
      next: res => {
        this.methods.set(res.data ?? [])
        this.loading.set(false)
      },
      error: () => this.loading.set(false),
    })
  }

  edit(row: PaymentMethod | null): void {
    this.errors.set([])
    this.editingId.set(row?.id ?? null)
    this.codeTouched = !!row
    const nextOrder = Math.max(0, ...this.methods().map(m => m.sort_order)) + 10
    this.form = row
      ? { code: row.code, name: row.name, kind: row.kind, requires_reference: row.requires_reference, sort_order: row.sort_order, is_active: row.is_active }
      : { ...EMPTY, sort_order: nextOrder }
    this.dialogVisible.set(true)
  }

  /** New methods get a code derived from the name until the user edits it. */
  suggestCode(): void {
    if (this.codeTouched || this.editingId()) return
    this.form.code = this.form.name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 30)
  }

  save(): void {
    if (this.saving()) return
    const id = this.editingId()
    const input: PaymentMethodInput = { ...this.form, code: this.form.code.trim().toUpperCase(), name: this.form.name.trim() }
    this.saving.set(true)
    this.errors.set([])
    const req$ = id ? this.svc.updatePaymentMethod(id, input) : this.svc.createPaymentMethod(input)
    req$.subscribe({
      next: () => {
        this.saving.set(false)
        this.dialogVisible.set(false)
        this.toast.add({ severity: 'success', summary: this.translate.instant('sales.methods.saved') })
        this.load()
      },
      error: e => {
        this.saving.set(false)
        this.errors.set(salesErrorMessages(e, this.translate))
      },
    })
  }

  /** Id of the method whose status is being saved (its switch is disabled meanwhile). */
  readonly toggling = signal<string | null>(null)

  /** Activate / deactivate from the table, keeping every other field as is. */
  toggleActive(row: PaymentMethod, active: boolean): void {
    if (this.toggling()) return
    const input: PaymentMethodInput = {
      code: row.code, name: row.name, kind: row.kind, requires_reference: row.requires_reference,
      sort_order: row.sort_order, is_active: active,
    }
    this.toggling.set(row.id)
    // Optimistic: flip the row now, put it back if the save fails
    this.methods.update(list => list.map(m => (m.id === row.id ? { ...m, is_active: active } : m)))
    this.svc.updatePaymentMethod(row.id, input).subscribe({
      next: () => {
        this.toggling.set(null)
        this.toast.add({ severity: 'success', summary: this.translate.instant('sales.methods.saved') })
      },
      error: e => {
        this.toggling.set(null)
        this.methods.update(list => list.map(m => (m.id === row.id ? { ...m, is_active: !active } : m)))
        this.toast.add({ severity: 'error', summary: salesErrorMessages(e, this.translate).join(' ') })
      },
    })
  }

  icon(kind: PaymentKind | string): string {
    return kindIcon(kind)
  }
}
