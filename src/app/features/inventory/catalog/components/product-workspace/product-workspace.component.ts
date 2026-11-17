import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  output,
  signal,
  viewChild,
} from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { distinctUntilChanged } from 'rxjs'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { MultiSelectModule } from 'primeng/multiselect'
import { SelectModule } from 'primeng/select'
import { TooltipModule } from 'primeng/tooltip'

import { CatalogService } from '../../catalog.service'
import { AppErrorResponse } from '@/app/core/interceptors/app-error.schema'
import { CategoryListItem, ProductListItem } from '../../types/catalog.types'
import { CategoryManagerComponent } from '../category-manager/category-manager.component'

/** What the host dialog needs to know to swap its header/footer while the workspace is open */
export interface WorkspaceState {
  /** Step 2 (product editor / categories) is showing instead of the SKU form */
  open: boolean
  /** The category manager is showing inside step 2 */
  categories: boolean
}

/**
 * ProductWorkspaceComponent — "Product group" section of the SKU dialogs.
 *
 * Step 1: pick the product (group) the SKU belongs to — optional, at most one.
 * Step 2: create or edit that product (name, brand, description, categories)
 *         and, from there, manage the company's categories.
 *
 * Product and category writes go straight to the API; the SKU ↔ product link
 * itself is saved by the host dialog together with the SKU (productChange).
 */
@Component({
  selector: 'app-product-workspace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslateModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    MultiSelectModule,
    TooltipModule,
    CategoryManagerComponent,
  ],
  templateUrl: './product-workspace.component.html',
  styleUrl: './product-workspace.component.scss',
})
export class ProductWorkspaceComponent implements OnDestroy {
  private readonly catalogService = inject(CatalogService)
  private readonly translate = inject(TranslateService)
  /** Provided by CatalogComponent, whose <p-toast /> renders the notifications */
  private readonly messageService = inject(MessageService)
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)
  private readonly injector = inject(Injector)

  // === Inputs ===
  /** Company the SKU belongs to — products and categories are scoped to it */
  companyId = input<string | null>(null)
  /** Product to start with (edit mode, or "Add SKUs" from a product) */
  initialProduct = input<ProductListItem | null>(null)
  /** Locks the selection to initialProduct (still allows editing it) */
  locked = input(false)

  // === Outputs ===
  productChange = output<ProductListItem | null>()
  workspaceChange = output<WorkspaceState>()
  /** True while the product editor has unsaved input — host disables SKU save */
  editingChange = output<boolean>()

  // === Data ===
  products = signal<ProductListItem[]>([])
  categories = signal<CategoryListItem[]>([])
  loadingProducts = signal(false)

  // === Selection ===
  selectedId = signal<string | null>(null)
  selected = computed(() => this.products().find(p => p.id === this.selectedId()) ?? null)

  // === Workspace (step 2) ===
  workspace = signal(false)
  editor = signal(false)
  manage = signal(false)
  saving = signal(false)
  error = signal('')

  // === Product form (template-driven, like the category form) ===
  name = ''
  brand = ''
  description = ''
  categoryIds: string[] = []
  /** Id of the product being edited; undefined while creating */
  editingId: string | undefined

  private previousProductId: string | null = null
  private lastCompanyId: string | null | undefined = undefined
  private readonly productEditor = viewChild<ElementRef<HTMLElement>>('productEditor')

  constructor() {
    // Company drives everything: reload options and drop a selection from another company.
    // Subscribed through toObservable (not inside an effect): HttpClient requests started
    // from an effect body get torn down with the effect's reactive context.
    toObservable(this.companyId)
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(companyId => {
        const changed = this.lastCompanyId !== undefined && this.lastCompanyId !== companyId
        this.lastCompanyId = companyId
        if (changed) {
          this.cancel()
          this.choose(null)
        }
        this.loadProducts()
        this.loadCategories()
      })
    toObservable(this.initialProduct)
      .pipe(takeUntilDestroyed())
      .subscribe(initial => {
        this.selectedId.set(initial?.id ?? null)
        if (initial) this.mergeProduct(initial)
      })
  }

  ngOnDestroy() {
    this.editingChange.emit(false)
    this.workspaceChange.emit({ open: false, categories: false })
  }

  // === Data loading ===

  loadProducts() {
    const companyId = this.companyId()
    if (!companyId) {
      this.products.set(this.initialProduct() ? [this.initialProduct()!] : [])
      return
    }
    this.loadingProducts.set(true)
    this.catalogService
      .listProducts({
        filter: { company_id: { match_mode: 'equals', value: companyId } },
        config: { page: 1, rows: 1000, sort_field: [{ field: 'name', order: 1 }] },
      })
      .subscribe({
        next: res => {
          this.products.set(res.data || [])
          // Keep the initial product visible even if it fell outside the page
          const initial = this.initialProduct()
          if (initial?.company_id === companyId) this.mergeProduct(initial)
          this.loadingProducts.set(false)
        },
        error: () => {
          this.loadingProducts.set(false)
          this.error.set(this.translate.instant('catalog.product_load_error'))
        },
      })
  }

  loadCategories() {
    const companyId = this.companyId()
    if (!companyId) {
      this.categories.set([])
      return
    }
    this.catalogService
      .listCategories({
        filter: { company_id: { match_mode: 'equals', value: companyId } },
        config: { page: 1, rows: 500 },
      })
      .subscribe({
        next: res => this.categories.set(res.data || []),
        error: () => this.categories.set([]),
      })
  }

  /** Inserts or replaces a product in the local list (keeps it sorted by name) */
  private mergeProduct(product: ProductListItem) {
    this.products.update(rows => {
      const rest = rows.filter(p => p.id !== product.id)
      return [...rest, product].sort((a, b) => a.name.localeCompare(b.name))
    })
  }

  // === Step 1: selection ===

  choose(product: ProductListItem | null) {
    this.selectedId.set(product?.id ?? null)
    this.productChange.emit(product)
  }

  // === Step 2: workspace navigation ===

  openEditor(product?: ProductListItem) {
    this.previousProductId = this.selectedId()
    this.workspace.set(true)
    this.emitWorkspace()
    this.begin(product)
    this.resetScroll()
  }

  /** Leaves step 2. keepSelection=false restores whatever was selected before opening. */
  closeWorkspace(keepSelection: boolean) {
    if (!keepSelection) {
      this.choose(this.products().find(p => p.id === this.previousProductId) ?? null)
    }
    this.cancel()
    this.manage.set(false)
    this.workspace.set(false)
    this.emitWorkspace()
    this.resetScroll()
  }

  back() {
    if (this.manage()) {
      this.manage.set(false)
      this.emitWorkspace()
      this.resetScroll()
    } else {
      this.closeWorkspace(false)
    }
  }

  toggleCategories() {
    this.manage.update(open => !open)
    this.emitWorkspace()
    this.resetScroll()
  }

  onCategoriesChanged() {
    this.loadCategories()
  }

  private emitWorkspace() {
    this.workspaceChange.emit({ open: this.workspace(), categories: this.workspace() && this.manage() })
  }

  // === Step 2: product form ===

  private begin(product?: ProductListItem) {
    this.editingId = product?.id
    this.name = product?.name ?? ''
    this.brand = product?.brand ?? ''
    this.description = product?.description ?? ''
    this.categoryIds = (product?.categories ?? []).map(c => c.id)
    this.editor.set(true)
    this.editingChange.emit(true)
    this.error.set('')
  }

  cancel() {
    this.editor.set(false)
    this.editingChange.emit(false)
    this.error.set('')
  }

  /** Scroll the editor into view once its reveal animation has finished */
  onFormRevealed(event: AnimationEvent) {
    if (event.target !== event.currentTarget || !this.editor()) return
    afterNextRender(
      () => {
        const anchor = this.productEditor()?.nativeElement
        const scroller = anchor?.closest<HTMLElement>('.p-dialog-content')
        if (anchor && scroller) {
          const top = scroller.scrollTop + anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16
          scroller.scrollTo({ top: Math.max(0, top), behavior: this.reducedMotion() ? 'instant' : 'smooth' })
        }
        this.host.nativeElement.querySelector<HTMLInputElement>('#product-name')?.focus({ preventScroll: true })
      },
      { injector: this.injector },
    )
  }

  save() {
    const name = this.name.trim()
    const companyId = this.companyId()
    if (!name || !companyId || this.saving()) return

    const validIds = new Set(this.categories().map(c => c.id))
    const category_ids = this.categoryIds.filter(id => validIds.has(id))
    const brand = this.brand.trim() || null
    const description = this.description.trim() || null

    this.saving.set(true)
    this.error.set('')

    const req = this.editingId
      ? this.catalogService.updateProduct(this.editingId, {
          description: name,
          brand,
          product_description: description,
          category_ids,
        })
      : this.catalogService.createProductOnly({ company_id: companyId, name, brand, description, category_ids })

    req.subscribe({
      next: product => {
        // Re-read in list shape (company_name, sku_count, categories) so the selector shows it right away
        this.catalogService.getProductListItemById(product.id).subscribe({
          next: item => this.afterSaved(item ?? this.toListItem(product.id, name, brand, description)),
          error: () => this.afterSaved(this.toListItem(product.id, name, brand, description)),
        })
      },
      // The error interceptor rethrows the v2 body itself (code / message / meta)
      error: (err: AppErrorResponse) => {
        this.saving.set(false)
        this.error.set(
          err?.code === 'PRODUCT_ALREADY_EXISTS'
            ? this.translate.instant('catalog.product_duplicate')
            : err?.message || this.translate.instant('catalog.product_save_error'),
        )
      },
    })
  }

  private afterSaved(item: ProductListItem) {
    this.saving.set(false)
    this.mergeProduct(item)
    this.choose(item)
    this.closeWorkspace(true)
    this.messageService.add({
      severity: 'success',
      summary: this.translate.instant('messages.success'),
      detail: this.translate.instant('catalog.product_saved'),
      life: 4000,
    })
  }

  /** Fallback list-shape product built from the form when the re-read fails */
  private toListItem(id: string, name: string, brand: string | null, description: string | null): ProductListItem {
    const old = this.products().find(p => p.id === id)
    const categories = this.categories()
      .filter(c => this.categoryIds.includes(c.id))
      .map(c => ({ id: c.id, name: c.name }))
    return {
      id,
      company_id: this.companyId()!,
      company_name: old?.company_name ?? '',
      name,
      brand,
      description,
      category: categories.map(c => c.name).join(', ') || null,
      categories,
      sku_count: old?.sku_count ?? 0,
      created_at: old?.created_at ?? new Date().toISOString(),
    }
  }

  // === Scrolling helpers (the host is a PrimeNG dialog; only its body scrolls) ===

  private resetScroll() {
    afterNextRender(
      () => {
        const scroller = this.host.nativeElement.closest<HTMLElement>('.p-dialog-content')
        if (scroller) {
          const top = this.workspace()
            ? 0
            : scroller.scrollTop + this.host.nativeElement.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16
          scroller.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
        }
        this.host.nativeElement.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
      },
      { injector: this.injector },
    )
  }

  private reducedMotion(): boolean {
    return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
}
