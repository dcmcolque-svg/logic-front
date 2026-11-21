import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { BaseConfirmDialog } from '@/app/shared/components'
import { InputTextModule } from 'primeng/inputtext'

import { CatalogService } from '../../catalog.service'
import { AppErrorResponse } from '@/app/core/interceptors/app-error.schema'
import { CategoryListItem } from '../../types/catalog.types'

/**
 * CategoryManagerComponent — inline CRUD for the company's product categories.
 *
 * Rendered inside the product workspace ("Manage" next to the categories field).
 * Categories are global per company and shared across products, so a category
 * that is still assigned to products cannot be deleted (backend: CATEGORY_IN_USE).
 *
 * Emits (changed) after every successful write so the parent reloads its options.
 */
@Component({
  selector: 'app-category-manager',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslateModule, ButtonModule, BaseConfirmDialog, InputTextModule],
  templateUrl: './category-manager.component.html',
  styleUrl: './category-manager.component.scss',
})
export class CategoryManagerComponent {
  private readonly catalogService = inject(CatalogService)
  private readonly translate = inject(TranslateService)
  /** Provided by CatalogComponent, whose <p-toast /> renders the notifications */
  private readonly messageService = inject(MessageService)
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)
  private readonly injector = inject(Injector)

  // === Inputs / Outputs ===
  companyId = input.required<string>()
  changed = output<void>()

  // === State ===
  categories = signal<CategoryListItem[]>([])
  loading = signal(false)
  query = signal('')
  error = signal('')
  /** Row awaiting delete confirmation (or the "in use" notice) */
  confirm = signal<CategoryListItem | null>(null)
  formOpen = signal(false)
  saving = signal(false)

  name = ''
  description = ''
  /** Id of the category being edited; undefined while creating */
  editingId: string | undefined

  rows = computed(() => {
    const q = this.query().toLowerCase().trim()
    const all = this.categories()
    return q ? all.filter(c => c.name.toLowerCase().includes(q)) : all
  })

  constructor() {
    // Not an effect: HttpClient requests started from an effect body get torn down with it
    toObservable(this.companyId)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.load())
  }

  // === Data ===

  load() {
    const companyId = this.companyId()
    if (!companyId) {
      this.categories.set([])
      return
    }
    this.loading.set(true)
    this.catalogService
      .listCategories({
        filter: { company_id: { match_mode: 'equals', value: companyId } },
        config: { page: 1, rows: 500 },
      })
      .subscribe({
        next: res => {
          this.categories.set(res.data || [])
          this.loading.set(false)
        },
        error: () => {
          this.loading.set(false)
          this.error.set(this.translate.instant('catalog.category.load_error'))
        },
      })
  }

  // === Form ===

  create() {
    this.clear()
    this.error.set('')
    this.formOpen.set(true)
  }

  edit(row: CategoryListItem) {
    this.formOpen.set(true)
    this.editingId = row.id
    this.name = row.name
    this.description = row.description ?? ''
    this.error.set('')
    this.focusForm()
  }

  clear() {
    this.formOpen.set(false)
    this.editingId = undefined
    this.name = ''
    this.description = ''
  }

  /** Focus the name field once the reveal animation has settled */
  focusForm(event?: AnimationEvent) {
    if (event && event.target !== event.currentTarget) return
    afterNextRender(
      () => {
        const field = this.host.nativeElement.querySelector<HTMLInputElement>('#category-name')
        field?.focus({ preventScroll: true })
        field?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
      },
      { injector: this.injector },
    )
  }

  save() {
    const name = this.name.trim()
    if (!name || this.saving()) return
    const description = this.description.trim() || null
    this.saving.set(true)
    this.error.set('')

    const req = this.editingId
      ? this.catalogService.updateCategory(this.editingId, { name, description })
      : this.catalogService.createCategory({ company_id: this.companyId(), name, description })

    req.subscribe({
      next: () => {
        this.saving.set(false)
        this.clear()
        this.notifySuccess('catalog.category.saved')
        this.load()
        this.changed.emit()
      },
      error: (err: AppErrorResponse) => {
        this.saving.set(false)
        this.error.set(this.errorMessage(err, 'catalog.category.save_error'))
      },
    })
  }

  // === Delete ===

  askDelete(row: CategoryListItem) {
    this.error.set('')
    this.confirm.set(row)
  }

  remove(row: CategoryListItem) {
    if (this.saving()) return
    this.saving.set(true)
    this.catalogService.deleteCategory(row.id).subscribe({
      next: () => {
        this.saving.set(false)
        if (this.editingId === row.id) this.clear()
        this.confirm.set(null)
        this.notifySuccess('catalog.category.deleted')
        this.load()
        this.changed.emit()
      },
      error: (err: AppErrorResponse) => {
        this.saving.set(false)
        this.confirm.set(null)
        this.error.set(this.errorMessage(err, 'catalog.category.delete_error'))
        // The count may be stale — refresh so the "in use" notice is accurate next time
        this.load()
      },
    })
  }

  /** Floating success toast; auto-dismisses after `life` ms */
  private notifySuccess(detailKey: string) {
    this.messageService.add({
      severity: 'success',
      summary: this.translate.instant('messages.success'),
      detail: this.translate.instant(detailKey),
      life: 4000,
    })
  }

  /**
   * Maps typed backend errors (core.AppError codes) to user-facing text.
   * The error interceptor rethrows the v2 body itself, so `err` is the AppErrorResponse.
   */
  private errorMessage(err: AppErrorResponse, fallbackKey: string): string {
    if (err?.code === 'CATEGORY_ALREADY_EXISTS') return this.translate.instant('catalog.category.duplicate')
    if (err?.code === 'CATEGORY_IN_USE') {
      return this.translate.instant('catalog.category.in_use', { count: err.meta?.['product_count'] ?? '' })
    }
    return err?.message || this.translate.instant(fallbackKey)
  }
}
