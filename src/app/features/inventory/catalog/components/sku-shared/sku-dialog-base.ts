import { computed, Directive, inject, input, output, signal } from '@angular/core'
import { FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms'
import { TranslateService } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'

import { CatalogService } from '../../catalog.service'
import { Company, ProductListItem } from '../../types/catalog.types'
import { WorkspaceState } from '../product-workspace/product-workspace.component'
import { SkuCustomAttributes } from './sku-custom-attributes'

/** Builds the SKU form shared by the create and edit dialogs. */
export function createSkuForm(extra: { barcode?: ValidatorFn[]; hs_code?: ValidatorFn[] } = {}) {
  return new FormGroup({
    sku_code: new FormControl('', [Validators.required, Validators.maxLength(100)]),
    barcode: new FormControl('', extra.barcode ?? []),
    hs_code: new FormControl('', extra.hs_code ?? []),
    name: new FormControl('', [Validators.required]),
    description: new FormControl(''),
    weight: new FormControl<number | null>(null),
    length: new FormControl<number | null>(null),
    width: new FormControl<number | null>(null),
    height: new FormControl<number | null>(null),
    retail_price: new FormControl<number | null>(null),
    wholesale_price: new FormControl<number | null>(null),
    cost: new FormControl<number | null>(null, [Validators.min(0)]),
    explicit_volume: new FormControl<number | null>(null),
    unit_factor: new FormControl<number | null>(null, [Validators.min(1)]),
    serial_control_mode: new FormControl('NONE'),
  })
}

export type SkuForm = ReturnType<typeof createSkuForm>

/** Dimensions payload: L/W/H (0 when blank) plus the custom attributes map, if any. */
export function buildSkuDimensions(
  v: ReturnType<SkuForm['getRawValue']>,
  hasDims: boolean,
  customMap: Record<string, string> | undefined
) {
  if (!hasDims && !customMap) return undefined
  return {
    l: v.length ?? 0,
    w: v.width ?? 0,
    h: v.height ?? 0,
    ...(customMap ? { custom: customMap } : {}),
  }
}

/**
 * State and behaviour shared by the SKU create and edit dialogs: inputs/outputs,
 * the embedded product workspace, custom attributes, toasts and image uploads.
 */
@Directive()
export abstract class SkuDialogBase {
  protected readonly catalogService = inject(CatalogService)
  protected readonly messageService = inject(MessageService)
  protected readonly translate = inject(TranslateService)

  // === Inputs ===
  visible = input(false)
  companies = input<Company[]>([])

  // === Outputs ===
  saved = output<void>()
  hide = output<void>()

  // === State ===
  saving = signal(false)

  // === Company dropdown options (shared by create & edit) ===
  companyOptions = computed(() =>
    this.companies().map(c => ({ label: c.name, value: c.id }))
  )
  /** Product chosen in the workspace — the SKU links to it on save */
  selectedProduct = signal<ProductListItem | null>(null)

  // === Product workspace (replaces the SKU form while open) ===
  workspaceOpen = signal(false)
  workspaceCategories = signal(false)
  /** True while the product editor has unsaved input — blocks the SKU save */
  productEditing = signal(false)

  // === Custom attributes ===
  readonly customAttrs = new SkuCustomAttributes(this.catalogService)

  onProductChange(product: ProductListItem | null) {
    this.selectedProduct.set(product)
  }

  onWorkspaceChange(state: WorkspaceState) {
    this.workspaceOpen.set(state.open)
    this.workspaceCategories.set(state.categories)
  }

  onProductEditing(editing: boolean) {
    this.productEditing.set(editing)
  }

  /** Translation key of the dialog header while the workspace is open */
  protected workspaceHeaderKey(): string {
    return this.workspaceCategories() ? 'catalog.header_categories' : 'catalog.header_product'
  }

  /** Closes the workspace step and forgets any in-progress product edit */
  protected resetWorkspace() {
    this.workspaceOpen.set(false)
    this.workspaceCategories.set(false)
    this.productEditing.set(false)
  }

  protected notify(severity: 'success' | 'warn' | 'error', summaryKey: string, detail: string) {
    this.messageService.add({
      severity,
      summary: this.translate.instant(summaryKey),
      detail,
    })
  }

  /** Ends the save successfully: success toast + saved event. */
  protected finishSaved(detailKey: string) {
    this.saving.set(false)
    this.notify('success', 'messages.success', this.translate.instant(detailKey))
    this.saved.emit()
  }

  /**
   * Uploads image files one by one for the given SKU. When the last request
   * settles the dialog finishes: a success toast if it succeeded, a partial-upload
   * warning otherwise.
   */
  protected uploadImages(
    skuId: string,
    companyId: string,
    files: File[],
    successDetailKey: string,
    onAllUploaded?: () => void
  ) {
    let uploaded = 0
    const settle = (ok: boolean) => {
      uploaded++
      if (uploaded !== files.length) return
      if (ok) {
        onAllUploaded?.()
        this.finishSaved(successDetailKey)
        return
      }
      this.saving.set(false)
      this.notify('warn', 'messages.warning', this.translate.instant('messages.image_upload_partial'))
      this.saved.emit()
    }
    for (const file of files) {
      this.catalogService.uploadSkuImage(skuId, companyId, file).subscribe({
        next: () => settle(true),
        error: () => settle(false),
      })
    }
  }
}
