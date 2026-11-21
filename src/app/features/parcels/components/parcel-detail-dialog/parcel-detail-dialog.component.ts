import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { formatInZone } from '@/app/shared/utils/time-zone.util'
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
import { TranslateModule } from '@ngx-translate/core'
import { DrawerModule } from 'primeng/drawer'
import { ButtonModule } from 'primeng/button'
import { ChipModule } from 'primeng/chip'
import { TooltipModule } from 'primeng/tooltip'
import { Accordion, AccordionPanel, AccordionHeader, AccordionContent } from 'primeng/accordion'
import { SkeletonModule } from 'primeng/skeleton'

import { BaseStatusBadge } from '@/app/shared/components/status/status-badge/base-status-badge.component'
import { ParcelService } from '../../parcel.service'
import { Parcel, ParcelItemsResponse } from '../../types/parcel.types'

@Component({
  selector: 'app-parcel-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    DrawerModule,
    ButtonModule,
    ChipModule,
    TooltipModule,
    Accordion,
    AccordionPanel,
    AccordionHeader,
    AccordionContent,
    SkeletonModule,
    BaseStatusBadge,
  ],
  templateUrl: './parcel-detail-dialog.component.html',
  styleUrl: './parcel-detail-dialog.component.scss',
})
export class ParcelDetailDialogComponent {
  readonly FALLBACK_IMAGE =
    'https://cdn3d.iconscout.com/3d/premium/thumb/shipping-package-3d-icon-download-in-png-blend-fbx-gltf-file-formats--cardboard-box-delivery-pack-icons-6220845.png?f=webp'

  visible = input(false)
  parcel = input<Parcel | null>(null)
  /** Resolved facility display name, passed from the parent component. */
  facilityLabel = input<string>('—')
  /**
   * Which column was clicked:
   *  'shipment'    → Addresses + Other shipping info accordions
   *  'order'       → Delivery summary card
   *  'ship_details'→ Package contents (items)
   */
  field = input<'shipment' | 'order' | 'ship_details'>('shipment')

  hide = output<void>()

  private readonly svc = inject(ParcelService)
  private readonly facilityScope = inject(FacilityScopeService)

  /** Enriched packages/items from the v2 items endpoint */
  parcelItems = signal<ParcelItemsResponse | null>(null)
  loadingItems = signal(false)
  itemsError = signal<string | null>(null)

  constructor() {
    effect(() => {
      const p = this.parcel()
      const open = this.visible()
      if (!p?.id || !open) {
        this.parcelItems.set(null)
        return
      }
      this.loadingItems.set(true)
      this.itemsError.set(null)
      this.svc.getParcelItems(p.id).subscribe({
        next: (res) => {
          this.parcelItems.set(res)
          this.loadingItems.set(false)
        },
        error: (err) => {
          this.itemsError.set(err?.error?.message ?? 'Error loading items')
          this.loadingItems.set(false)
        },
      })
    })
  }

  onHide() {
    this.hide.emit()
  }

  /** Truncate a UUID to the first 8 characters for display. */
  shortId(id: string | undefined | null): string {
    return id ? id.substring(0, 8).toUpperCase() : '—'
  }

  /** The parcel's facility zone (default zone for parcels without one). */
  private zone(): string {
    return this.facilityScope.zoneOf(this.parcel()?.operator?.facility_id ?? null)
  }

  /** yyyy-MM-dd of an instant in the parcel's facility zone. */
  formatDate(dateStr: string | undefined | null): string {
    if (!dateStr) return '—'
    return formatInZone(dateStr, 'date', this.zone()) || dateStr
  }

  /** HH:mm of an instant in the parcel's facility zone. */
  formatTime(dateStr: string | undefined | null): string {
    if (!dateStr) return ''
    return formatInZone(dateStr, 'time', this.zone())
  }

  handleMissingImage(event: Event) {
    const el = event.target as HTMLImageElement
    if (el.src !== this.FALLBACK_IMAGE) {
      el.src = this.FALLBACK_IMAGE
    }
  }

  /** Label for parcel_status (LAST_MILE / COLLECTED → readable string) */
  shippedByLabel = computed(() => {
    const status = this.parcel()?.operator?.parcel_status
    if (!status) return null
    if (status === 'LAST_MILE') return 'Delivery'
    if (status === 'COLLECTED') return 'Collect'
    return status
  })

  /** Total unique SKU lines across all packages */
  totalItems = computed(() => {
    const items = this.parcelItems()
    if (!items) return 0
    return items.packages.reduce((sum, pkg) => sum + pkg.items.length, 0)
  })

  /**
   * Returns true when the parcel has enough delivery/order data to show the
   * summary card (mirrors edge-frontend field='order_number' condition).
   * Shows for SHIPPED parcels or whenever a delivery date is recorded.
   */
  hasDeliveryCard(p: Parcel): boolean {
    const status = p.meta_data?.order_status?.toUpperCase() ?? ''
    return (
      status === 'SHIPPED' ||
      status === 'LAST_MILE' ||
      status === 'COLLECTED' ||
      !!p.shipment?.delivery_detail?.date_shipped
    )
  }
}
