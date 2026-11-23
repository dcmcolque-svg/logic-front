import { Component, inject, input, output, OnChanges, SimpleChanges, signal } from '@angular/core'
import { CommonModule, DecimalPipe } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'

import { BaseActionMenu } from '@/app/shared/components/actions/action-menu/base-action-menu.component'
import { ShActionItem } from '@/app/shared/types/api.types'
import { CatalogService } from '../../catalog.service'
import { CatalogItem } from '../../types/catalog.types'

/**
 * SkuListInlineComponent — Renders the inline list of SKUs for an expanded product row.
 *
 * Responsibilities:
 * - Fetches SKUs from the catalog endpoint filtered by product_id
 * - Renders a desktop table layout (md+) and mobile card layout (< md)
 * - Emits `editSku` when a SKU's edit action is clicked
 *
 * Usage:
 * <app-sku-list-inline [productId]="product.id" (editSku)="openEditSkuDialog($event)" />
 */
@Component({
  selector: 'app-sku-list-inline',
  standalone: true,
  imports: [CommonModule, DecimalPipe, TranslateModule, BaseActionMenu],
  templateUrl: './sku-list-inline.component.html',
  styleUrl: './sku-list-inline.component.scss',
})
export class SkuListInlineComponent implements OnChanges {
  private readonly catalogService = inject(CatalogService)
  /** digitsInfo for prices, by the facilities' currency. */
  readonly moneyDigits = this.catalogService.moneyDigits

  /** Product ID whose SKUs to load */
  productId = input.required<string>()

  /** Emitted when a SKU's edit action is clicked */
  editSku = output<CatalogItem>()

  loading = signal(false)
  skus = signal<CatalogItem[]>([])

  constructor() {
    this.catalogService.loadMoneyDigits()
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['productId'] && this.productId()) {
      this.loadSkus()
    }
  }

  loadSkus() {
    this.loading.set(true)
    this.catalogService.listCatalog({
      filter: { product_id: { match_mode: 'equals', value: this.productId() } },
      config: { page: 1, rows: 100 },
    }).subscribe({
      next: resp => {
        this.skus.set(resp.data || [])
        this.loading.set(false)
      },
      error: () => {
        this.loading.set(false)
      },
    })
  }

  getActions(sku: CatalogItem): ShActionItem[] {
    return [
      { label: 'labels.edit', icon: 'pi pi-pencil', command: () => this.editSku.emit(sku) },
    ]
  }
}
