import { formatDisplayNumber } from '@/app/shared/utils/display-format'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'
import { AutoCompleteModule, AutoCompleteCompleteEvent, AutoCompleteSelectEvent } from 'primeng/autocomplete'
import { ButtonModule } from 'primeng/button'
import { InputNumberModule } from 'primeng/inputnumber'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { TooltipModule } from 'primeng/tooltip'

import { BaseDialog } from '@/app/shared/components/dialog/dialog/base-dialog.component'
import { BaseFormField } from '@/app/shared/components/form/form-field/base-form-field.component'
import { BaseFormGroup } from '@/app/shared/components/form/form-group/base-form-group.component'
import {
  FieldErrorComponent,
  handleFormError,
  isInvalidCtrl,
  resolveErrorMessage,
  setFieldError,
} from '@/app/shared/components/form/field-error/field-error.component'
import { ScopeFacility } from '@/app/core/types/facility.types'
import { AuthService } from '@/app/core/services/auth.service'
import {
  CostingSettings,
  costVariancePct,
  currencyDecimals,
  currencyOf,
  currencyPrefix,
  formatCost,
  isCostingEnabled,
  isOwnerRole,
} from '@/app/shared/utils/costing.util'
import { ReceivingService } from '../../receivings.service'
import { SupplierService } from '../../../suppliers/suppliers.service'
import {
  CompanyItem,
  ReceivingCreateInput,
  ReceivingLineDetail,
  ReceivingListItem,
  ReceivingResult,
  ReceivingSkuOption,
} from '../../receivings.types'

/** Backend limits — mirror logic-back/src/api/v2/inbound/receiving/receiving.service.go */
const MAX_ITEMS = 1000
const MAX_QTY_PER_LINE = 1_000_000
const MAX_DOC_NUMBER = 100
const MAX_SKU_CODE = 100
/** numeric(16,6) — mirrors costing.MaxUnitCost */
const MAX_UNIT_COST = 9_999_999_999

export const RECEIVING_DOC_TYPES = ['PO', 'ASN', 'RMA', 'TRANSFER'] as const

type ItemGroup = FormGroup<{
  sku_code: FormControl<string>
  name: FormControl<string | null>
  is_new: FormControl<boolean>
  qty_expected: FormControl<number | null>
  /** Expected unit cost (purchase order). OWNER only. */
  unit_cost: FormControl<number | null>
  /** Catalog cost — read-only reference for the ▲/▼ variance. */
  sku_cost: FormControl<number | null>
}>

/** SKU codes are citext in the DB → duplicates are case-insensitive. */
const skuKey = (code: string): string => code.trim().toLowerCase()

/** Rejects the same SKU on two lines (backend rule: items[i].sku_code duplicate). */
function uniqueSkuValidator(control: AbstractControl): ValidationErrors | null {
  const rows = (control as FormArray<ItemGroup>).controls
  const seen = new Set<string>()
  for (const row of rows) {
    const key = skuKey(row.controls.sku_code.value ?? '')
    if (!key) continue
    if (seen.has(key)) return { duplicate: true }
    seen.add(key)
  }
  return null
}

/**
 * ReceivingFormDialogComponent — manual creation of an inbound receiving
 * (header + expected lines). Equivalent to inv-frontend's FormReplenishment,
 * rebuilt on the v2 API: POST /v2/inbound/receiving/create.
 *
 * Improvements over the legacy form:
 * - SKU lookup by code/name/barcode scoped to the selected company, inline.
 * - Unknown SKU codes are accepted (the backend auto-creates them) and tagged.
 * - Duplicate SKUs merge into one line instead of being silently dropped.
 * - Client-side validation mirrors the backend limits; 422 errors[] land on
 *   the exact field (including items[i].*).
 */
@Component({
  selector: 'app-receiving-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    AutoCompleteModule,
    ButtonModule,
    InputNumberModule,
    TableModule,
    TagModule,
    TooltipModule,
    BaseDialog,
    BaseFormField,
    BaseFormGroup,
    FieldErrorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './receiving-form-dialog.component.html',
})
export class ReceivingFormDialogComponent {
  private readonly svc = inject(ReceivingService)
  private readonly translate = inject(TranslateService)
  private readonly messageSvc = inject(MessageService)
  private readonly auth = inject(AuthService)
  private readonly supplierSvc = inject(SupplierService)

  // ── Inputs / outputs ──────────────────────────────────────────────────────
  visible = input(false)
  facilities = input<ScopeFacility[]>([])
  companies = input<CompanyItem[]>([])
  /** Receiving to edit — null opens the dialog in create mode. Only IN-TRANSIT is editable. */
  receiving = input<ReceivingListItem | null>(null)

  hide = output<void>()
  /** Emitted after a successful create or update. */
  saved = output<ReceivingResult>()
  /** Emitted after "Save and create another": the dialog stays open for the next one. */
  savedAndNew = output<ReceivingResult>()

  // ── State ─────────────────────────────────────────────────────────────────
  editing = computed(() => !!this.receiving())
  saving = signal(false)
  loadingLines = signal(false)
  /** True while the form is filled programmatically — suppresses the company-change wipe. */
  private patching = false
  skuSuggestions = signal<ReceivingSkuOption[]>([])
  /** Active suppliers of the selected company (+ the receiving's own one when editing, even if inactive). */
  supplierOptions = signal<Array<{ id: string; name: string }>>([])
  private supplierRequest = 0
  /** Bound to the autocomplete; reset after each pick. */
  readonly skuSearch = new FormControl<ReceivingSkuOption | string | null>(null)

  // ── Costing (OWNER only, facility with costing ≠ NONE) ─────────────────────
  readonly isOwner = isOwnerRole(this.auth.getAuthUserInfo()?.role)
  /** settings.costing of the selected facility; null until loaded. */
  costing = signal<CostingSettings | null>(null)
  showCost = computed(() => this.isOwner && isCostingEnabled(this.costing()))
  currency = computed(() => currencyOf(this.costing()))
  costPrefix = computed(() => currencyPrefix(this.currency()))
  costDecimals = computed(() => currencyDecimals(this.currency()))
  private costingRequest = 0

  readonly isInvalidCtrl = isInvalidCtrl
  readonly maxQty = MAX_QTY_PER_LINE
  readonly docTypeOptions = RECEIVING_DOC_TYPES.map(v => ({ label: v, value: v }))

  form = new FormGroup({
    facility_id: new FormControl<string | null>(null, Validators.required),
    company_id: new FormControl<string | null>(null, Validators.required),
    supplier_id: new FormControl<string | null>(null),
    doc_type: new FormControl<string>('PO', { nonNullable: true }),
    doc_number: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(MAX_DOC_NUMBER)],
    }),
    external_ref: new FormControl<string | null>(null),
    expected_arrival: new FormControl<Date | null>(null),
    notes: new FormControl<string | null>(null),
    items: new FormArray<ItemGroup>([], [Validators.required, Validators.maxLength(MAX_ITEMS), uniqueSkuValidator]),
  })

  get items(): FormArray<ItemGroup> {
    return this.form.controls.items
  }

  private readonly companyId = toSignal(this.form.controls.company_id.valueChanges, { initialValue: null })
  private readonly itemsValue = toSignal(this.items.valueChanges, { initialValue: [] })

  /** Snapshot of the line controls — re-read whenever the array emits. */
  rows = computed(() => {
    this.itemsValue()
    return [...this.items.controls]
  })

  totalQty = computed(() =>
    (this.itemsValue() ?? []).reduce((s, r) => s + (Number(r?.qty_expected) || 0), 0)
  )

  /** Σ qty_expected × unit_cost over the lines that have a cost. */
  totalCost = computed(() =>
    (this.itemsValue() ?? []).reduce(
      (s, r) => s + (r?.unit_cost != null ? (Number(r.qty_expected) || 0) * Number(r.unit_cost) : 0),
      0
    )
  )

  constructor() {
    // Reset every time the dialog opens. Only `visible` and `receiving` are
    // tracked: facilities/companies arrive asynchronously and must not wipe
    // what the user already typed.
    effect(() => {
      const open = this.visible()
      const rec = this.receiving()
      if (!open) return
      untracked(() => (rec ? this.loadForEdit(rec) : this.reset()))
    })

    // Companies usually load after the dialog opens: pre-select when there is
    // exactly one and the user has not picked anything yet.
    effect(() => {
      const companies = this.companies()
      if (!this.visible() || this.receiving()) return
      untracked(() => {
        const ctrl = this.form.controls.company_id
        if (!ctrl.value && companies.length === 1) ctrl.setValue(companies[0].id)
      })
    })

    // Costing is per facility: reload it whenever the facility changes.
    this.form.controls.facility_id.valueChanges.subscribe(facilityId => this.loadCosting(facilityId))

    // SKUs belong to a company: changing it invalidates the lines already picked.
    this.form.controls.company_id.valueChanges.subscribe(companyId => {
      this.syncSkuSearchEnabled(companyId)
      if (this.patching) return
      if (this.items.length > 0) this.items.clear()
      this.skuSuggestions.set([])
      // Suppliers belong to a company too.
      this.form.controls.supplier_id.setValue(null)
      this.loadSuppliers(companyId)
    })
  }

  /**
   * Loads the active suppliers of the company. `keep` is the receiving's current
   * supplier: it stays selectable even when it was deactivated afterwards.
   */
  private loadSuppliers(companyId: string | null, keep?: { id: string; name: string } | null): void {
    const request = ++this.supplierRequest
    this.supplierOptions.set(keep ? [keep] : [])
    if (!companyId) return
    this.supplierSvc.listActiveByCompany(companyId).subscribe({
      next: list => {
        if (request !== this.supplierRequest) return
        const options = list.map(s => ({ id: s.id, name: s.code ? `${s.name} (${s.code})` : s.name }))
        if (keep && !options.some(o => o.id === keep.id)) {
          options.unshift({ id: keep.id, name: `${keep.name} — ${this.translate.instant('suppliers.inactive')}` })
        }
        this.supplierOptions.set(options)
      },
      error: () => request === this.supplierRequest && this.supplierOptions.set(keep ? [keep] : []),
    })
  }

  /** Loads settings.costing of the facility. Only owners see costs, so others skip the call. */
  private loadCosting(facilityId: string | null): void {
    const request = ++this.costingRequest
    this.costing.set(null)
    if (!this.isOwner || !facilityId) return
    this.svc.getFacilityCosting(facilityId).subscribe({
      // Ignore a late answer for a facility the user already switched away from.
      next: s => request === this.costingRequest && this.costing.set(s),
      error: () => request === this.costingRequest && this.costing.set(null),
    })
  }

  /** ▲/▼ % of the line's unit cost against the catalog cost; null when not comparable. */
  variancePct(row: ItemGroup): number | null {
    return costVariancePct(row.controls.unit_cost.value, row.controls.sku_cost.value)
  }

  formatCost(value: number | null | undefined): string {
    return formatCost(value, this.currency())
  }

  /** Catalog cost as an input hint: no forced decimals ("Bs 10", "Bs 10.5"), like what the user types. */
  costPlaceholder(value: number | null | undefined): string {
    if (value === null || value === undefined || isNaN(value)) return ''
    const n = formatDisplayNumber(value, 0, 6)
    return `${this.costPrefix()} ${n}`
  }

  private syncSkuSearchEnabled(companyId: string | null): void {
    if (companyId) this.skuSearch.enable({ emitEvent: false })
    else this.skuSearch.disable({ emitEvent: false })
  }

  private reset(): void {
    const facilities = this.facilities()
    const companies = this.companies()
    this.items.clear({ emitEvent: false })
    this.form.reset({
      facility_id: facilities.length === 1 ? facilities[0].id : null,
      company_id: companies.length === 1 ? companies[0].id : null,
      supplier_id: null,
      doc_type: 'PO',
      doc_number: '',
      external_ref: null,
      expected_arrival: null,
      notes: null,
    })
    this.skuSearch.reset()
    this.syncSkuSearchEnabled(this.form.controls.company_id.value)
    // form.reset emitted company_id → the subscription already loaded its suppliers.
    this.saving.set(false)
    this.loadingLines.set(false)
  }

  /**
   * Clears the document-specific fields after "Save and create another".
   * Branch, company, supplier and doc type stay — a batch of receivings
   * usually shares them — so only the number, refs, notes and lines reset.
   */
  private resetForNext(): void {
    this.items.clear()
    this.form.patchValue({ doc_number: '', external_ref: null, expected_arrival: null, notes: null })
    this.form.controls.doc_number.markAsUntouched()
    this.items.markAsUntouched()
    this.skuSearch.reset()
  }

  /** Fills the header from the list row and fetches its expected lines. */
  private loadForEdit(rec: ReceivingListItem): void {
    this.patching = true
    this.items.clear({ emitEvent: false })
    this.form.reset({
      facility_id: rec.facility_id,
      company_id: rec.company_id,
      supplier_id: rec.supplier_id ?? null,
      doc_type: rec.doc_type || 'PO',
      doc_number: rec.doc_number,
      external_ref: rec.external_ref ?? null,
      expected_arrival: fromIsoDate(rec.expected_arrival),
      notes: rec.notes ?? null,
    })
    this.patching = false
    this.skuSearch.reset()
    this.syncSkuSearchEnabled(rec.company_id)
    this.loadSuppliers(
      rec.company_id,
      rec.supplier_id ? { id: rec.supplier_id, name: rec.supplier_name ?? rec.supplier_id } : null
    )
    this.saving.set(false)

    this.loadingLines.set(true)
    this.svc
      .listReceivingLines({
        filter: { receiving_id: { match_mode: 'equals', value: rec.id } },
        config: { page: 1, rows: MAX_ITEMS, populate_data: true, sort_field: [{ field: 'line_number', order: 1 }] },
      })
      .subscribe({
        next: resp => {
          // The user may have closed or switched receivings meanwhile.
          if (this.receiving()?.id !== rec.id) return
          for (const line of resp.data ?? []) this.pushLine(line)
          this.items.updateValueAndValidity()
          this.loadingLines.set(false)
        },
        error: () => {
          this.loadingLines.set(false)
          this.messageSvc.add({
            severity: 'error',
            summary: this.translate.instant('inbound.lines_load_error'),
            life: 4000,
          })
        },
      })
  }

  private pushLine(line: ReceivingLineDetail): void {
    this.items.push(
      this.buildItem(
        line.sku_code,
        line.description ?? line.product_description ?? null,
        false,
        line.qty_expected,
        line.unit_cost ?? null,
        line.sku_cost ?? null
      ),
      { emitEvent: false }
    )
  }

  private buildItem(
    skuCode: string,
    name: string | null,
    isNew: boolean,
    qty: number,
    unitCost: number | null = null,
    skuCost: number | null = null
  ): ItemGroup {
    return new FormGroup({
      sku_code: new FormControl(skuCode, { nonNullable: true, validators: [Validators.required] }),
      name: new FormControl<string | null>(name),
      is_new: new FormControl(isNew, { nonNullable: true }),
      qty_expected: new FormControl<number | null>(qty, [
        Validators.required,
        Validators.min(1),
        Validators.max(MAX_QTY_PER_LINE),
      ]),
      unit_cost: new FormControl<number | null>(unitCost, [Validators.min(0), Validators.max(MAX_UNIT_COST)]),
      sku_cost: new FormControl<number | null>(skuCost),
    })
  }

  // ── SKU lookup ────────────────────────────────────────────────────────────

  searchSkus(event: AutoCompleteCompleteEvent): void {
    const companyId = this.companyId()
    const query = (event.query ?? '').trim()
    if (!companyId || query.length < 1) {
      this.skuSuggestions.set([])
      return
    }
    this.svc.searchSkus(companyId, query).subscribe({
      next: list => this.skuSuggestions.set(list),
      error: () => this.skuSuggestions.set([]),
    })
  }

  onSkuSelected(event: AutoCompleteSelectEvent): void {
    const sku = event.value as ReceivingSkuOption
    this.addItem(sku.sku_code, sku.name ?? sku.product_name ?? null, false, sku.cost ?? null)
  }

  /** Enter on the search box with a code not in the catalog → add as new SKU. */
  addTypedSku(): void {
    const current = this.skuSearch.value
    const raw = typeof current === 'string' ? current : current?.sku_code
    const code = (raw ?? '').trim()
    if (!code) return
    if (code.length > MAX_SKU_CODE) {
      this.messageSvc.add({
        severity: 'warn',
        summary: this.translate.instant('forms_validation.max_value'),
        life: 3000,
      })
      return
    }
    const known = this.skuSuggestions().find(s => skuKey(s.sku_code) === skuKey(code))
    this.addItem(known?.sku_code ?? code, known?.name ?? known?.product_name ?? null, !known, known?.cost ?? null)
  }

  /** catalogCost pre-fills the unit cost (the user can change it) and is kept for the variance. */
  private addItem(skuCode: string, name: string | null, isNew: boolean, catalogCost: number | null = null): void {
    // Same SKU twice → add one unit to the existing line instead of a duplicate row.
    const existing = this.items.controls.find(r => skuKey(r.controls.sku_code.value) === skuKey(skuCode))
    if (existing) {
      const qty = existing.controls.qty_expected
      qty.setValue(Math.min((qty.value ?? 0) + 1, MAX_QTY_PER_LINE))
    } else {
      this.items.push(this.buildItem(skuCode, name, isNew, 1, catalogCost, catalogCost))
    }
    this.items.markAsTouched()
    // Clear the box once the autocomplete has finished writing its own value.
    setTimeout(() => this.skuSearch.reset())
  }

  removeItem(index: number): void {
    this.items.removeAt(index)
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  /** `andNew` (create mode only) keeps the dialog open and clears it for the next receiving. */
  onSave(andNew = false): void {
    if (this.loadingLines()) return
    if (this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }
    const v = this.form.getRawValue()
    const payload: ReceivingCreateInput = {
      facility_id: v.facility_id!,
      company_id: v.company_id!,
      supplier_id: v.supplier_id || null,
      doc_type: v.doc_type,
      doc_number: v.doc_number.trim(),
      external_ref: v.external_ref?.trim() || null,
      expected_arrival: v.expected_arrival ? toIsoDate(v.expected_arrival) : null,
      notes: v.notes?.trim() || null,
      // unit_cost travels for every OWNER, even with the column hidden (facility
      // without costing): the update replaces the lines, and leaving it out would
      // clear a cost entered earlier. Other roles never send it (the backend
      // ignores it for them anyway and keeps the stored value).
      items: v.items.map(r => ({
        sku_code: r.sku_code.trim(),
        qty_expected: Number(r.qty_expected),
        ...(this.isOwner ? { unit_cost: r.unit_cost ?? null } : {}),
      })),
    }

    const editing = this.receiving()
    const request$ = editing
      ? this.svc.updateReceiving(editing.id, payload)
      : this.svc.createReceiving(payload)

    this.saving.set(true)
    request$.subscribe({
      next: res => {
        this.saving.set(false)
        this.messageSvc.add({
          severity: 'success',
          summary: this.translate.instant(editing ? 'inbound.update_success' : 'inbound.create_success'),
          detail: res.doc_number,
          life: 3000,
        })
        if (andNew && !editing) {
          this.resetForNext()
          this.savedAndNew.emit(res)
          return
        }
        this.saved.emit(res)
      },
      error: err => {
        this.saving.set(false)
        this.applyServerError(err)
      },
    })
  }

  private applyServerError(err: unknown): void {
    const e = err as { error?: ServerErrorBody } & ServerErrorBody
    const body: ServerErrorBody = e?.error ?? e
    const code = body?.code ?? ''
    if (code === 'RECEIVING_ALREADY_EXISTS') {
      setFieldError(this.form.controls.doc_number, resolveErrorMessage(err, this.translate))
      return
    }
    if (code === 'RECEIVING_COMPANY_NOT_FOUND') {
      setFieldError(this.form.controls.company_id, resolveErrorMessage(err, this.translate))
      return
    }
    if (code.startsWith('RECEIVING_SUPPLIER_')) {
      setFieldError(this.form.controls.supplier_id, resolveErrorMessage(err, this.translate))
      return
    }
    if (code === 'RECEIVING_FACILITY_NOT_FOUND') {
      setFieldError(this.form.controls.facility_id, resolveErrorMessage(err, this.translate))
      return
    }
    if (Array.isArray(body?.errors) && body.errors.length) {
      // Backend paths use items[0].sku_code; Angular's form.get wants items.0.sku_code.
      handleFormError(err, { get: (f: string) => this.form.get(f.replace(/\[(\d+)\]/g, '.$1')) }, this.translate)
      return
    }
    // Non-422 v2 errors are already toasted by the error interceptor.
    if (body?.http_status && body.http_status !== 422) return
    const detail = resolveErrorMessage(err, this.translate)
    this.messageSvc.add({
      severity: 'error',
      summary: this.translate.instant(this.editing() ? 'inbound.update_error' : 'inbound.create_error'),
      detail: detail && !detail.startsWith('errors.') ? detail : undefined,
      life: 4000,
    })
  }
}

interface ServerErrorBody {
  code?: string
  http_status?: number
  errors?: Array<{ field: string; rule: string }>
}

/**
 * expected_arrival comes back as a UTC timestamp of a calendar date (the list
 * renders it with the 'UTC' timezone). Rebuild that same date locally so the
 * date picker does not show the previous day west of Greenwich.
 */
function fromIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return null
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Local calendar date as yyyy-MM-dd (avoids the UTC shift of toISOString). */
function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
