import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, model, output, signal, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { MessageModule } from 'primeng/message'
import { SelectModule } from 'primeng/select'
import { TextareaModule } from 'primeng/textarea'
import { ToggleSwitchModule } from 'primeng/toggleswitch'

import { BaseDialog } from '@/app/shared/components'
import { SalesService } from '../sales.service'
import { CompanyOption, Customer, CustomerInput } from '../sales.types'
import { salesErrorMessages } from '../sales.util'

interface CustomerForm {
  company_id: string | null
  doc: string
  name: string
  business_name: string
  phone: string
  email: string
  address: string
  notes: string
  is_active: boolean
}

/** The customer that already holds a NIT / CI typed in the form. */
export interface ExistingCustomerRef {
  id: string
  name: string
  doc: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Create / edit a customer. Used by the POS (quick create, `compact`) and by
 * the Customers page (full form with status). A NIT / CI already used by
 * another customer of the company offers to pick that customer instead.
 */
@Component({
  selector: 'app-customer-form-dialog',
  standalone: true,
  imports: [FormsModule, TranslateModule, ButtonModule, BaseDialog, InputTextModule, MessageModule, SelectModule, TextareaModule, ToggleSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <base-dialog
      [visible]="visible()"
      [header]="customer() ? 'sales.customers.edit' : 'sales.customers.new'"
      size="sm"
      [loading]="saving()"
      [saveDisabled]="!canSave()"
      (save)="save()"
      (hide)="visible.set(false)"
      (shown)="reset()"
    >
      <!-- Enter in a one-line field saves (base-dialog) -->
      <div class="flex flex-col gap-3">
        @if (showCompany()) {
          <div class="flex flex-col gap-1">
            <label for="cuCompany" class="text-sm">{{ 'labels.company' | translate }} *</label>
            <p-select inputId="cuCompany" name="company_id" [options]="companies()" [(ngModel)]="form.company_id"
              optionLabel="name" optionValue="id" [disabled]="!!customer()" appendTo="body" styleClass="w-full"
              [placeholder]="'labels.company' | translate" />
            @if (customer()) { <small class="text-surface-500">{{ 'sales.customers.company_fixed' | translate }}</small> }
          </div>
        }
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label for="cuDoc" class="text-sm">{{ 'sales.customers.doc' | translate }}</label>
            <input #docInput pInputText id="cuDoc" name="doc" [(ngModel)]="form.doc" maxlength="30" class="uppercase"
              (ngModelChange)="existing.set(null)" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="cuPhone" class="text-sm">{{ 'sales.customers.phone' | translate }}</label>
            <input pInputText id="cuPhone" name="phone" [(ngModel)]="form.phone" maxlength="40" inputmode="tel" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label for="cuName" class="text-sm">{{ 'sales.customers.name' | translate }} *</label>
          <input #nameInput pInputText id="cuName" name="name" [(ngModel)]="form.name" maxlength="120" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="cuBusiness" class="text-sm">{{ 'sales.customers.business_name' | translate }}</label>
          <input pInputText id="cuBusiness" name="business_name" [(ngModel)]="form.business_name" maxlength="200"
            [placeholder]="form.name" />
          <small class="text-surface-500">{{ 'sales.customers.business_name_hint' | translate }}</small>
        </div>
        <div class="flex flex-col gap-1">
          <label for="cuEmail" class="text-sm">{{ 'sales.customers.email' | translate }}</label>
          <input pInputText id="cuEmail" name="email" type="email" [(ngModel)]="form.email" maxlength="120" />
        </div>
        @if (!compact()) {
          <div class="flex flex-col gap-1">
            <label for="cuAddress" class="text-sm">{{ 'sales.customers.address' | translate }}</label>
            <input pInputText id="cuAddress" name="address" [(ngModel)]="form.address" maxlength="250" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="cuNotes" class="text-sm">{{ 'sales.customers.notes' | translate }}</label>
            <textarea pTextarea id="cuNotes" name="notes" rows="2" [(ngModel)]="form.notes" maxlength="1000"></textarea>
          </div>
          @if (customer()) {
            <div class="flex items-center gap-3">
              <p-toggleswitch inputId="cuActive" name="is_active" [(ngModel)]="form.is_active" />
              <label for="cuActive" class="text-sm cursor-pointer">{{ 'sales.customers.active' | translate }}</label>
            </div>
          }
        }
        @if (existing(); as ex) {
          <p-message severity="warn">
            <div class="flex flex-wrap items-center gap-2">
              <span>{{ 'sales.customers.doc_taken' | translate: { doc: ex.doc, name: ex.name } }}</span>
              @if (ex.id && ex.id !== customer()?.id) {
                <p-button [label]="'sales.customers.use_existing' | translate" size="small" [outlined]="true"
                  (onClick)="pickExisting(ex)" />
              }
            </div>
          </p-message>
        }
        @for (e of errors(); track e) { <p-message severity="error">{{ e }}</p-message> }
      </div>
    </base-dialog>
  `,
})
export class CustomerFormDialogComponent {
  private readonly svc = inject(SalesService)
  private readonly translate = inject(TranslateService)

  readonly visible = model(false)
  /** Customer to edit; null creates a new one. */
  readonly customer = input<Customer | null>(null)
  /** Prefill of a new customer (e.g. what was typed in the POS search). */
  readonly prefill = input<Partial<CustomerInput>>({})
  readonly companies = input<CompanyOption[]>([])
  /** Company the new customer must belong to (the cart's), hiding the picker. */
  readonly lockedCompanyId = input<string | null>(null)
  /** POS quick create: no address, notes or status. */
  readonly compact = input(false)

  readonly saved = output<Customer>()
  readonly useExisting = output<ExistingCustomerRef>()

  private readonly docInput = viewChild<ElementRef<HTMLInputElement>>('docInput')
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput')

  readonly saving = signal(false)
  readonly errors = signal<string[]>([])
  readonly existing = signal<ExistingCustomerRef | null>(null)
  /** Bumped on reset so canSave re-reads the (non-signal) form. */
  private readonly tick = signal(0)

  form: CustomerForm = this.empty()

  readonly showCompany = computed(() => !!this.customer() || (!this.lockedCompanyId() && this.companies().length > 1))

  canSave(): boolean {
    this.tick()
    const needsCompany = this.showCompany() && !this.customer()
    return !this.saving() && !!this.form.name.trim() && (!needsCompany || !!this.form.company_id)
  }

  private empty(): CustomerForm {
    return { company_id: null, doc: '', name: '', business_name: '', phone: '', email: '', address: '', notes: '', is_active: true }
  }

  reset(): void {
    this.errors.set([])
    this.existing.set(null)
    const c = this.customer()
    const companies = this.companies()
    if (c) {
      this.form = {
        company_id: c.company_id,
        doc: c.doc ?? '',
        name: c.name,
        business_name: c.business_name ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        address: c.address ?? '',
        notes: c.notes ?? '',
        is_active: c.is_active,
      }
    } else {
      const p = this.prefill()
      this.form = {
        ...this.empty(),
        company_id: this.lockedCompanyId() ?? p.company_id ?? (companies.length === 1 ? companies[0].id : null),
        doc: p.doc ?? '',
        name: p.name ?? '',
        phone: p.phone ?? '',
      }
    }
    this.tick.update(n => n + 1)
    // NIT/CI first (it is what the cashier asks); the name when it came typed.
    const target = this.form.doc ? this.nameInput() : this.docInput()
    setTimeout(() => target?.nativeElement.focus(), 0)
  }

  save(): void {
    if (!this.canSave()) return
    const email = this.form.email.trim()
    if (email && !EMAIL_RE.test(email)) {
      this.errors.set([this.translate.instant('sales.customers.invalid_email')])
      return
    }
    const opt = (v: string): string | null => v.trim() || null
    const input: CustomerInput = {
      company_id: this.lockedCompanyId() ?? this.form.company_id ?? '',
      name: this.form.name.trim(),
      business_name: opt(this.form.business_name),
      doc: opt(this.form.doc)?.toUpperCase() ?? null,
      email: email || null,
      phone: opt(this.form.phone),
      address: opt(this.form.address),
      notes: opt(this.form.notes),
    }
    const c = this.customer()
    if (c) input.is_active = this.form.is_active
    this.saving.set(true)
    this.errors.set([])
    this.existing.set(null)
    const req$ = c ? this.svc.updateCustomer(c.id, input) : this.svc.createCustomer(input)
    req$.subscribe({
      next: saved => {
        this.saving.set(false)
        this.visible.set(false)
        this.saved.emit(saved)
      },
      error: e => {
        this.saving.set(false)
        const body = (e?.error ?? e) as { code?: string; meta?: Record<string, string> }
        if (body?.code === 'SALES_CUSTOMER_DUPLICATE_DOC') {
          this.existing.set({ id: body.meta?.['customer_id'] ?? '', name: body.meta?.['customer_name'] ?? '', doc: body.meta?.['doc'] ?? input.doc ?? '' })
          return
        }
        this.errors.set(salesErrorMessages(e, this.translate))
      },
    })
  }

  pickExisting(ex: ExistingCustomerRef): void {
    this.visible.set(false)
    this.useExisting.emit(ex)
  }
}
