import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'
import { forkJoin, Observable, of } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { DrawerModule } from 'primeng/drawer'
import { ButtonModule } from 'primeng/button'
import { TagModule } from 'primeng/tag'
import { SkeletonModule } from 'primeng/skeleton'
import { TableModule } from 'primeng/table'
import { DividerModule } from 'primeng/divider'
import { TooltipModule } from 'primeng/tooltip'

import { BaseStatusBadge } from '@/app/shared/components/status/status-badge/base-status-badge.component'
import { OrderService } from '../../order.service'
import {
  Order,
  OrderLineDetail,
  PackDetailOrder,
  PackDetailPackage,
  PackDetailResult,
  OrderLabelsResponse,
  ShipmentLabel,
} from '../../types/order.types'
import { formatOrderDate, orderRecipientName } from '../../shared/order-format.util'

const EMPTY_PACK_DETAIL: PackDetailResult = { orders: [] }

@Component({
  selector: 'app-order-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    DrawerModule,
    ButtonModule,
    TagModule,
    SkeletonModule,
    TableModule,
    DividerModule,
    TooltipModule,
    BaseStatusBadge,
  ],
  templateUrl: './order-detail-dialog.component.html',
  styleUrl: './order-detail-dialog.component.scss',
})
export class OrderDetailDialogComponent {
  private readonly orderService = inject(OrderService)
  private readonly messageService = inject(MessageService)
  private readonly translate = inject(TranslateService)

  visible = input(false)
  order = input<Order | null>(null)
  /**
   * Full detail mode (All Orders): also shows created/shipped dates, loads the
   * pack detail to list packages instead of lines when the order has any, and
   * only shows the ship-to card when some field has non-blank content.
   * When false (Backorders / Processing) the drawer shows the order lines only.
   */
  fullDetail = input(false)

  hide = output<void>()

  lines = signal<OrderLineDetail[]>([])
  packDetail = signal<PackDetailOrder | null>(null)
  loadingData = signal(false)

  /** Shipping labels per shipment (GET /label) */
  labels = signal<ShipmentLabel[]>([])
  /** shipment_id being generated, or null */
  generatingLabel = signal<string | null>(null)

  /** Labels can be generated (or regenerated) once the order is packed, also after it is shipped */
  canGenerateLabel = computed(() =>
    ['PACK-READY', 'PARTIAL-SHIPPED', 'SHIPPED'].includes(this.order()?.status ?? ''),
  )

  /** Shipments that have boxes — the only ones a label can be generated for */
  labelShipments = computed(() => this.labels().filter(s => s.packages?.length > 0))

  /** True when pack/detail returned shipments with packages */
  hasPackages = computed(() => {
    const detail = this.packDetail()
    if (!detail?.shipments) return false
    return detail.shipments.some(s => s.packages && s.packages.length > 0)
  })

  /** Flat list of all packages across all shipments, with parent shipment info */
  allPackages = computed(() => {
    const detail = this.packDetail()
    if (!detail?.shipments) return []
    const result: Array<PackDetailPackage & { _shipment_number: string; _shipment_status: string }> = []
    for (const shipment of detail.shipments) {
      for (const pkg of shipment.packages || []) {
        result.push({
          ...pkg,
          _shipment_number: shipment.shipment_number,
          _shipment_status: shipment.shipment_status,
        })
      }
    }
    return result
  })

  /** Build a map of sku_id → OrderLineDetail for resolving SKU names in packages */
  private readonly skuMap = computed(() => {
    const map = new Map<string, OrderLineDetail>()
    for (const line of this.lines()) {
      map.set(line.sku_id, line)
    }
    return map
  })

  constructor() {
    effect(() => {
      const o = this.order()
      const v = this.visible()
      if (v && o) {
        this.loadData(o.id)
      } else {
        this.lines.set([])
        this.packDetail.set(null)
        this.labels.set([])
      }
    })
  }

  private loadData(orderId: string) {
    this.loadingData.set(true)
    forkJoin({
      lines: this.orderService.getOrderLines(orderId).pipe(catchError(() => of([]))),
      pack: this.packDetailFor(orderId),
      labels: this.labelsFor(orderId),
    }).subscribe({
      next: ({ lines, pack, labels }) => {
        this.lines.set((lines as OrderLineDetail[]) || [])
        this.packDetail.set(pack?.orders?.[0] ?? null)
        this.labels.set(labels?.shipments ?? [])
        this.loadingData.set(false)
      },
      error: () => {
        this.lines.set([])
        this.packDetail.set(null)
        this.labels.set([])
        this.loadingData.set(false)
      },
    })
  }

  /** Pack detail is only fetched in full detail mode. */
  private packDetailFor(orderId: string): Observable<PackDetailResult> {
    if (this.fullDetail()) {
      return this.orderService.getPackDetail(orderId).pipe(catchError(() => of(EMPTY_PACK_DETAIL)))
    }
    return of(EMPTY_PACK_DETAIL)
  }

  /** Labels are shown next to the packages, so they are only fetched in full detail mode. */
  private labelsFor(orderId: string): Observable<OrderLabelsResponse | null> {
    if (this.fullDetail()) {
      return this.orderService.getLabels(orderId).pipe(catchError(() => of(null)))
    }
    return of(null)
  }

  /** Generates (or regenerates) the Xenvio label of one shipment */
  generateLabel(shipment: ShipmentLabel, regenerate = false) {
    const orderId = this.order()?.id
    if (!orderId || this.generatingLabel()) return
    this.generatingLabel.set(shipment.shipment_id)
    this.orderService.generateLabels(orderId, shipment.shipment_id, regenerate).subscribe({
      next: (resp) => {
        this.labels.set(resp.shipments ?? [])
        this.generatingLabel.set(null)
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('messages.success'),
          detail: this.translate.instant('labels.label_generated'),
        })
        // Refresh tracking numbers shown on the packages
        this.packDetailFor(orderId).subscribe(pack => {
          this.packDetail.set(pack?.orders?.[0] ?? null)
        })
      },
      error: (err) => {
        this.generatingLabel.set(null)
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message || this.translate.instant('messages.error_generic'),
        })
      },
    })
  }

  /** Opens the label PDF (presigned URL) in a new tab */
  openLabel(shipment: ShipmentLabel) {
    if (shipment.label_url) window.open(shipment.label_url, '_blank', 'noopener')
  }

  /** Resolve sku_id to sku_code from order lines */
  skuCode(skuId: string): string {
    return this.skuMap().get(skuId)?.sku_code ?? skuId.slice(0, 8)
  }

  /** Resolve sku_id to product_name from order lines */
  productName(skuId: string): string {
    return this.skuMap().get(skuId)?.product_name ?? ''
  }

  /** Resolve sku_id to first image from order lines */
  skuImage(skuId: string): string | null {
    return this.skuMap().get(skuId)?.images?.[0] ?? null
  }

  close() {
    this.hide.emit()
  }

  /** Hides a broken image and shows the placeholder sibling */
  onImgError(event: Event): void {
    const img = event.target as HTMLElement
    img.style.display = 'none'
    const sibling = img.nextElementSibling as HTMLElement | null
    if (sibling) sibling.style.display = 'flex'
  }

  formatDate(dateStr: string | undefined | null): string {
    return formatOrderDate(dateStr)
  }

  fullName(order: Order | null): string {
    return orderRecipientName(order)
  }

  hasShipToAddress(order: Order | null): boolean {
    if (!order?.ship_to_address) return false
    const a = order.ship_to_address
    if (this.fullDetail()) {
      // Ignore fields that are empty or whitespace-only
      return [a.first_name, a.last_name, a.address_1, a.city, a.country, a.phone, a.email]
        .some(v => v != null && v.trim().length > 0)
    }
    return !!(a.first_name || a.last_name || a.address_1 || a.city || a.country)
  }
}
