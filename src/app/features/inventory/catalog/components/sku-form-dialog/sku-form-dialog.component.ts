import {
  Component,
  computed,
  input,
  OnChanges,
  signal,
  SimpleChanges,
  ViewChild,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ButtonModule } from 'primeng/button'
import { FileUpload, FileUploadModule } from 'primeng/fileupload'

import { BaseDialog } from '@/app/shared/components/dialog/dialog/base-dialog.component'
import { BaseFormField } from '@/app/shared/components/form/form-field/base-form-field.component'

import { CatalogItem, ProductListItem } from '../../types/catalog.types'
import { ProductWorkspaceComponent } from '../product-workspace/product-workspace.component'
import { buildSkuDimensions, createSkuForm, SkuDialogBase } from '../sku-shared/sku-dialog-base'
import { SkuFieldsColumnsComponent } from '../sku-shared/sku-fields-columns.component'

/**
 * SkuFormDialogComponent — Edit dialog for catalog SKUs.
 *
 * Follows the LocationFormDialogComponent pattern:
 * - Child component (NOT DynamicDialog) declared in catalog.component.html
 * - Receives [visible], [sku] (null = create, object = edit), [companies]
 * - Emits (saved) and (hide)
 *
 * Edit:   PUT  /v2/cat/catalog/:skuId (single transactional endpoint)
 *
 * The product group (link, create, edit, categories) is handled by the embedded
 * ProductWorkspaceComponent; only the resulting product_id travels with the SKU.
 */
@Component({
  selector: 'app-sku-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ButtonModule,
    FileUploadModule,
    BaseDialog,
    BaseFormField,
    ProductWorkspaceComponent,
    SkuFieldsColumnsComponent,
  ],
  templateUrl: './sku-form-dialog.component.html',
  styleUrl: './sku-form-dialog.component.scss',
})
export class SkuFormDialogComponent extends SkuDialogBase implements OnChanges {
  // === Inputs ===
  /** Null = create mode; populated row = edit mode */
  sku = input<CatalogItem | null>(null)

  // === Product workspace ===
  /** Product the SKU is linked to when the dialog opens (list shape, for the workspace) */
  initialProduct = signal<ProductListItem | null>(null)

  /** Whether we're in edit mode (sku is provided) */
  get isEditMode(): boolean {
    return !!this.sku()
  }

  /** Dialog header: workspace step while open, otherwise "Edit SKU-000026" / new SKU */
  get dialogHeader(): string {
    if (this.workspaceOpen()) {
      return this.translate.instant(this.workspaceHeaderKey())
    }
    const row = this.sku()
    if (row) {
      return `${this.translate.instant('labels.edit')} ${row.sku}`
    }
    return this.translate.instant('labels.new_sku')
  }

  /** Save is allowed once the SKU form is valid and no product edit is in progress */
  canSave(): boolean {
    return this.skuForm.valid && !this.productEditing()
  }

  // === Image state ===
  skuImages = signal<string[]>([])
  pendingFiles = signal<File[]>([])
  pendingPreviews = signal<string[]>([])

  // === Company (read-only in edit mode) ===
  companyControl = new FormControl<string | null>({ value: null, disabled: true })

  /**
   * Override base companyOptions: ensures the editing row's company always
   * appears even when it wasn't in the paginated companies() list.
   */
  override companyOptions = computed(() => {
    const base = this.companies().map(c => ({ label: c.name, value: c.id }))
    const row = this.sku()
    if (row?.company_id && !base.some(o => o.value === row.company_id)) {
      base.unshift({ label: row.company_name, value: row.company_id })
    }
    return base
  })

  // === Form ===
  skuForm = createSkuForm({
    barcode: [Validators.maxLength(50)],
    hs_code: [Validators.maxLength(20)],
  })

  // ── FileUpload ref ──────────────────────────────────────
  @ViewChild('imageUpload') private readonly imageUploadRef!: FileUpload

  // ── Product workspace ────────────────────────────────────

  onHide() {
    // p-dialog has already closed itself when this fires, also mid-workspace (header X / Escape).
    // Always propagate: swallowing it left the parent's [visible] stuck at true and the
    // row's "Edit" could no longer reopen the dialog.
    this.resetWorkspace()
    this.hide.emit()
  }

  /** Loads the linked product in list shape so the workspace can preselect it */
  private loadInitialProduct(productId: string | null) {
    this.initialProduct.set(null)
    this.selectedProduct.set(null)
    if (!productId) return
    this.catalogService.getProductListItemById(productId).subscribe({
      next: product => {
        this.initialProduct.set(product)
        this.selectedProduct.set(product)
      },
      error: () => {
        this.initialProduct.set(null)
        this.selectedProduct.set(null)
      },
    })
  }

  // ── Lifecycle ────────────────────────────────────────────

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['visible'] && !changes['sku']) return
    if (!this.visible()) return
    const row = this.sku()
    if (row) {
      this.openForEdit(row)
    } else {
      this.openForCreate()
    }
  }

  /** EDIT MODE: populate SKU-specific fields from the table row */
  private openForEdit(row: CatalogItem) {
    this.customAttrs.loadKeys()
    this.patchFormFromRow(row)
    // sku_code is immutable in edit mode
    this.skuForm.get('sku_code')?.disable()
    // Company is read-only in edit mode
    this.companyControl.setValue(row.company_id)
    this.companyControl.disable()

    // Product group — the workspace starts on the currently linked product
    this.resetWorkspace()
    this.loadInitialProduct(row.product_id)

    // Load custom attributes from dimensions.custom
    this.customAttrs.setFromMap(row.dimensions?.custom ?? {})

    // Reset image state
    this.pendingFiles.set([])
    this.pendingPreviews.set([])
    this.skuImages.set([])
    this.loadSkuImages(row.sku_id)
  }

  /** CREATE MODE: reset form */
  private openForCreate() {
    this.skuForm.reset({ unit_factor: 1 })
    this.skuForm.get('sku_code')?.enable()
    this.skuImages.set([])
    this.pendingFiles.set([])
    this.pendingPreviews.set([])
    this.customAttrs.items.set([])
    this.loadInitialProduct(null)
  }

  private patchFormFromRow(row: CatalogItem) {
    this.skuForm.patchValue({
      sku_code:            row.sku,
      barcode:             row.barcode ?? '',
      hs_code:             row.hs_code ?? '',
      name:                row.name ?? '',
      description:         row.sku_description ?? '',
      weight:              row.weight > 0 ? row.weight : null,
      length:              row.dimensions?.l ?? null,
      width:               row.dimensions?.w ?? null,
      height:              row.dimensions?.h ?? null,
      retail_price:        row.retail_price > 0 ? row.retail_price : null,
      wholesale_price:     row.wholesale_price > 0 ? row.wholesale_price : null,
      cost:                row.cost ?? null,
      explicit_volume:     row.explicit_volume > 0 ? row.explicit_volume : null,
      unit_factor:         row.unit_factor > 0 ? row.unit_factor : 1,
      serial_control_mode: row.serial_control_mode || 'NONE',
    })
  }

  /** Fetch full SKU to get existing images array */
  private loadSkuImages(skuId: string) {
    this.catalogService.getSkuById(skuId).subscribe({
      next: (sku) => {
        this.skuImages.set(sku.images || [])
      },
      error: () => {
        this.skuImages.set([])
      },
    })
  }

  // ── Image handling ──────────────────────────────────────

  onImageSelected(event: { files: File[] }): void {
    for (const file of event.files) {
      if (!file) continue
      this.pendingFiles.update(files => [...files, file])
      const reader = new FileReader()
      reader.onload = () => {
        this.pendingPreviews.update(p => [...p, reader.result as string])
      }
      reader.readAsDataURL(file)
    }
    // Clear the file input so the same file can be selected again
    if (this.imageUploadRef) {
      this.imageUploadRef.clear()
    }
  }

  removePendingImage(index: number): void {
    this.pendingFiles.update(f => f.filter((_, i) => i !== index))
    this.pendingPreviews.update(p => p.filter((_, i) => i !== index))
  }

  removeExistingImage(index: number): void {
    const url = this.skuImages()[index]
    const editingRow = this.sku()
    if (!editingRow || !url) return

    this.catalogService.deleteSkuImage(editingRow.sku_id, url).subscribe({
      next: () => {
        this.skuImages.update(imgs => imgs.filter((_, i) => i !== index))
        this.notify('success', 'messages.success', this.translate.instant('messages.image_deleted'))
      },
      error: () => {
        this.notify('error', 'messages.error', this.translate.instant('messages.image_delete_error'))
      },
    })
  }

  setImageAsPrimary(index: number): void {
    const url = this.skuImages()[index]
    const editingRow = this.sku()
    if (!editingRow || !url || index === 0) return

    this.catalogService.setSkuImagePrimary(editingRow.sku_id, url).subscribe({
      next: () => {
        // Move to first position in local array
        this.skuImages.update(imgs => {
          const reordered = [url, ...imgs.filter((_, i) => i !== index)]
          return reordered
        })
      },
      error: () => {
        this.notify('error', 'messages.error', this.translate.instant('messages.error'))
      },
    })
  }

  // ── Actions ──────────────────────────────────────────────

  onSave(): void {
    if (!this.canSave()) return

    const v = this.skuForm.getRawValue()
    const editingRow = this.sku()

    const hasDimensions = v.length != null || v.width != null || v.height != null
    const dimensions = buildSkuDimensions(v, hasDimensions, this.customAttrs.toMap())

    this.saving.set(true)

    if (editingRow) {
      // === UPDATE (single transactional endpoint) ===
      this.catalogService
        .updateCatalogItem(editingRow.sku_id, {
          ...this.productLinkChange(editingRow),
          barcode: v.barcode?.trim() || null,
          weight: v.weight ?? undefined,
          dimensions: dimensions ?? null,
          hs_code: v.hs_code?.trim() || null,
          retail_price: v.retail_price ?? undefined,
          wholesale_price: v.wholesale_price ?? undefined,
          // null clears it (unknown cost); 0 is a valid cost
          cost: v.cost ?? null,
          explicit_volume: v.explicit_volume ?? undefined,
          unit_factor: v.unit_factor ?? undefined,
          name: v.name?.trim() || null,
          description: v.description?.trim() || null,
          serial_control_mode: v.serial_control_mode || 'NONE',
        })
        .subscribe({
          next: () => this.afterSkuUpdated(editingRow),
          error: (err: { error?: { message?: string } }) => {
            this.saving.set(false)
            this.notify(
              'error',
              'messages.error',
              err?.error?.message ?? this.translate.instant('messages.sku_error_message')
            )
          },
        })
    }
  }

  /**
   * Product link: only send a change when the workspace selection differs
   * from what the SKU had. Product fields themselves are saved by the workspace.
   */
  private productLinkChange(editingRow: CatalogItem): { product_id?: string; unlink_product?: boolean } {
    const newProductId = this.selectedProduct()?.id ?? null
    if (newProductId === (editingRow.product_id ?? null)) return {}
    return newProductId ? { product_id: newProductId } : { unlink_product: true }
  }

  /** Upload pending images if any, otherwise finish right away */
  private afterSkuUpdated(editingRow: CatalogItem) {
    const files = this.pendingFiles()
    if (files.length === 0) {
      this.finishSaved('messages.sku_updated')
      return
    }
    this.uploadImages(editingRow.sku_id, editingRow.company_id, files, 'messages.sku_updated', () => {
      this.pendingFiles.set([])
      this.pendingPreviews.set([])
    })
  }
}
