import { Component, input, signal, OnChanges, SimpleChanges } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { catchError, debounceTime, distinctUntilChanged, map, merge, of, switchMap } from 'rxjs'
import { CommonModule } from '@angular/common'
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { TooltipModule } from 'primeng/tooltip'
import { FileUploadModule } from 'primeng/fileupload'

import { BaseDialog } from '@/app/shared/components/dialog/dialog/base-dialog.component'
import { BaseFormField } from '@/app/shared/components/form/form-field/base-form-field.component'
import { ProductListItem } from '../../types/catalog.types'
import { ProductWorkspaceComponent } from '../product-workspace/product-workspace.component'
import { buildSkuDimensions, createSkuForm, SkuDialogBase } from '../sku-shared/sku-dialog-base'
import { SkuFieldsColumnsComponent } from '../sku-shared/sku-fields-columns.component'

/** Custom attribute keys are stored in Title Case to prevent duplicates (Camera/CAMERA/camera). */
function toTitleCase(key: string): string {
  return key.toLowerCase().replaceAll(/(?:^|\s)\S/g, c => c.toUpperCase())
}

@Component({
  selector: 'app-sku-create-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    TooltipModule,
    FileUploadModule,
    BaseDialog,
    BaseFormField,
    ProductWorkspaceComponent,
    SkuFieldsColumnsComponent,
  ],
  templateUrl: './sku-create-dialog.component.html',
  styleUrls: ['./sku-create-dialog.component.scss'],
})
export class SkuCreateDialogComponent extends SkuDialogBase implements OnChanges {
  /** When set, locks the product selection to this product (used from "Add SKUs" action) */
  preselectedProduct = input<ProductListItem | null>(null)

  /** Mirrors companyControl so the product workspace (signal-based) can react to it */
  companyId = signal<string | null>(null)

  /** Pending image files */
  pendingFiles: File[] = []
  /** Object URL previews */
  pendingPreviews: string[] = []

  // === Company dropdown ===
  companyControl = new FormControl<string | null>(null, [Validators.required])

  // === SKU form (single) ===
  skuForm = createSkuForm()

  // === Lifecycle ===

  /** Idle time before the SKU uniqueness lookup fires, so typing doesn't hit the API on every keystroke. */
  private readonly SKU_CHECK_DEBOUNCE_MS = 1000

  constructor() {
    super()
    // SKU codes are unique per company, and the backend bulk-upsert silently
    // skips duplicates (ON CONFLICT DO NOTHING), so the uniqueness check has to
    // happen here: re-run it while the user types and whenever the company changes.
    merge(this.skuForm.controls.sku_code.valueChanges, this.companyControl.valueChanges)
      .pipe(
        debounceTime(this.SKU_CHECK_DEBOUNCE_MS),
        // One request per distinct company+code pair. Lowercased because sku_code
        // is citext: "ABC" and "abc" collide, so re-querying them adds nothing.
        map(() => {
          const skuCode = (this.skuForm.controls.sku_code.value || '').trim()
          return `${this.resolveCompanyId() ?? ''}|${skuCode.toLowerCase()}`
        }),
        distinctUntilChanged(),
        switchMap(() => {
          const skuCode = (this.skuForm.controls.sku_code.value || '').trim()
          const companyId = this.resolveCompanyId()
          if (!skuCode || !companyId) return of(false)
          // switchMap drops in-flight lookups, so a stale response can't win
          return this.catalogService
            .skuCodeExists(skuCode, companyId)
            .pipe(catchError(() => of(false)))
        }),
        takeUntilDestroyed(),
      )
      .subscribe(exists => (exists ? this.setDuplicateSkuError() : this.clearDuplicateSkuError()))

    this.companyControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(id => this.companyId.set(id))
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible'] && this.visible()) {
      this.resetForm()
      this.customAttrs.loadKeys()
      // If a product is preselected, lock the company and product
      const pre = this.preselectedProduct()
      if (pre) {
        this.companyControl.setValue(pre.company_id)
        this.companyControl.disable()
        this.selectedProduct.set(pre)
      }
    }
  }

  /** Dialog header follows the workspace step */
  dialogHeader(): string {
    if (!this.workspaceOpen()) return 'labels.new_sku'
    return this.workspaceHeaderKey()
  }

  // === Image handling ===

  onImagesSelected(event: { files?: File[] }) {
    const files: File[] = event.files || []
    for (const file of files) {
      this.pendingFiles.push(file)
      this.pendingPreviews.push(URL.createObjectURL(file))
    }
  }

  removePendingFile(index: number) {
    URL.revokeObjectURL(this.pendingPreviews[index])
    this.pendingFiles.splice(index, 1)
    this.pendingPreviews.splice(index, 1)
  }

  // === SKU uniqueness (per company) ===

  /** Company the SKU will belong to — the dropdown, or the selected product's company. */
  private resolveCompanyId(): string | null {
    return (
      this.companyControl.value ||
      this.selectedProduct()?.company_id ||
      this.preselectedProduct()?.company_id ||
      null
    )
  }

  /** Flags sku_code as taken — makes the form invalid, disabling the save button. */
  private setDuplicateSkuError() {
    const ctrl = this.skuForm.controls.sku_code
    ctrl.setErrors({ ...ctrl.errors, customMessage: 'validation.sku_duplicate' })
    ctrl.markAsDirty()
  }

  private clearDuplicateSkuError() {
    const ctrl = this.skuForm.controls.sku_code
    if (!ctrl.errors?.['customMessage']) return
    const rest = { ...ctrl.errors }
    delete rest['customMessage']
    ctrl.setErrors(Object.keys(rest).length > 0 ? rest : null)
  }

  /** Shown when the SKU turns out to be taken — on check or on a skipped insert. */
  private notifyDuplicateSku() {
    this.saving.set(false)
    this.setDuplicateSkuError()
    this.notify('error', 'messages.error', this.translate.instant('validation.sku_duplicate'))
  }

  // === Validation ===

  isValid(): boolean {
    // A half-edited product must be saved or cancelled before the SKU is
    if (this.productEditing()) return false
    if (!this.companyControl.valid && !this.companyControl.disabled) return false
    // Product selection is optional
    return this.skuForm.valid
  }

  // === Form reset ===

  resetForm() {
    this.companyControl.enable()
    this.companyControl.reset()
    this.selectedProduct.set(null)
    this.resetWorkspace()
    this.skuForm.reset({ serial_control_mode: 'NONE', unit_factor: 1 })
    this.clearDuplicateSkuError()
    this.customAttrs.items.set([])
    // Revoke object URLs and clear pending files
    this.pendingPreviews.forEach(url => URL.revokeObjectURL(url))
    this.pendingFiles = []
    this.pendingPreviews = []
  }

  // === Dialog actions ===

  onHide() {
    // p-dialog has already closed itself when this fires, also mid-workspace (header X / Escape).
    // Always propagate: swallowing it left the parent's [visible] stuck at true and the
    // row's "Edit" could no longer reopen the dialog.
    this.hide.emit()
    this.resetForm()
  }

  onSave() {
    if (!this.isValid()) return
    this.saving.set(true)

    const skuCode = (this.skuForm.controls.sku_code.value || '').trim()
    const companyId = this.resolveCompanyId()

    // Final check before writing: the debounced one may not have run yet, and the
    // code could have been taken by someone else in the meantime.
    if (!companyId) {
      this.dispatchSave()
      return
    }
    this.catalogService.skuCodeExists(skuCode, companyId).subscribe({
      next: exists => (exists ? this.notifyDuplicateSku() : this.dispatchSave()),
      // Lookup failed — go ahead; the response guard still catches a skipped insert
      error: () => this.dispatchSave(),
    })
  }

  private dispatchSave() {
    this.saveSku()
  }

  private buildDimensions() {
    const s = this.skuForm.getRawValue()
    const hasDims = Boolean(s.length || s.width || s.height)
    return buildSkuDimensions(s, hasDims, this.customAttrs.toMap(toTitleCase))
  }

  /**
   * Creates the SKU through the SKU bulk-upsert, linked to the product chosen in
   * the workspace (or standalone when none). Products are created/edited by the
   * workspace itself, so there is nothing else to write here.
   */
  private saveSku() {
    const s = this.skuForm.getRawValue()
    const product = this.selectedProduct()
    const companyId = product?.company_id ?? this.companyControl.value!
    const skuCode = s.sku_code || ''

    const items = [{
      company_id: companyId,
      product_id: product?.id ?? null,
      sku_code: skuCode,
      barcode: s.barcode?.trim() || null,
      weight: s.weight ?? 0,
      dimensions: this.buildDimensions(),
      name: s.name?.trim() || null,
      description: s.description?.trim() || null,
      serial_control_mode: s.serial_control_mode || 'NONE',
      retail_price: s.retail_price ?? 0,
      wholesale_price: s.wholesale_price ?? 0,
      cost: s.cost ?? null,
      explicit_volume: s.explicit_volume ?? 0,
      unit_factor: s.unit_factor ?? 0,
      hs_code: s.hs_code?.trim() || null,
    }]

    this.catalogService.createSkusForProduct(items).subscribe({
      next: (res) => {
        // ON CONFLICT DO NOTHING: nothing inserted means the SKU already existed
        if (res?.inserted === 0) {
          this.notifyDuplicateSku()
          return
        }
        this.afterSkuCreated(skuCode, companyId)
      },
      error: () => {
        this.saving.set(false)
        this.notify('error', 'messages.error', this.translate.instant('messages.save_error'))
      },
    })
  }

  /**
   * After a successful SKU creation, look up the SKU by sku_code + company_id
   * to get its ID, then upload any pending images.
   */
  private afterSkuCreated(skuCode: string, companyId: string) {
    if (this.pendingFiles.length === 0) {
      // No images to upload — done
      this.finishSaved('labels.skus_added')
      return
    }

    // Look up the newly created SKU to get its ID
    this.catalogService.listCatalog({
      filter: {
        sku: { match_mode: 'equals', value: skuCode },
        company_id: { match_mode: 'equals', value: companyId },
      },
      config: { page: 1, rows: 1 },
    }).subscribe({
      next: (res) => {
        const found = res.data?.[0]
        if (!found) {
          // SKU not found — emit success anyway (creation worked, images can be added later)
          this.finishSaved('labels.skus_added')
          return
        }
        this.uploadImages(found.sku_id, companyId, [...this.pendingFiles], 'labels.skus_added')
      },
      error: () => this.finishSaved('labels.skus_added'),
    })
  }
}
