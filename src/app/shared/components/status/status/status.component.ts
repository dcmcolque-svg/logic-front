import {
  Component,
  effect,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core'
import { UpperCasePipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ChipModule } from 'primeng/chip'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TranslateLanService } from '../../../../core/services/translate-lan.service'
import { CapitalizePipe } from '../../../pipes/capitalize.pipe'
import { resolveIcon } from '../../../config/icon.registry'

// Map of status → chip color class. Icons come from the shared icon registry.
const STATUS_CHIP_MAP: Record<string, string> = {
  DISCREPANCY: 'chip-violeta',
  'IN-TRANSIT': 'chip-plomo',
  'IN-WAREHOUSE': 'chip-celeste',
  PROCESSING: 'chip-amarillo',
  COMPLETE: 'chip-verde',
  COMPLETED: 'chip-verde',
  CANCELED: 'chip-rojo',
  ARCHIVED: 'chip-negro',
  DRAFT: 'chip-negro',
  PLANNED: 'chip-plomo',
  LATE: 'chip-celeste',
  RESCHEDULED: 'chip-violeta',
  FINISHED: 'chip-verde',
  URGENT: 'chip-verde',
  'BACK-WORK-ORDER': 'chip-negro',
  ASSIGNED: 'chip-celeste',
  INCOMPLETE: 'chip-violeta',
  'API-ERROR': 'chip-negro',
  'BACK-ORDER': 'chip-negro',
  PENDING: 'chip-plomo',
  SHIPPING: 'chip-verde',
  ACTIVE: 'chip-verde',
  INACTIVE: 'chip-rojo',
  EVALUATING: 'chip-amarillo',
  ERROR: 'chip-rojo',
  BACKORDER: 'chip-violeta',
  'PARTIAL-SHIPPED': 'chip-verde-claro',
  SHIPPED: 'chip-verde',
  FAILED: 'chip-rojo',
  'SHIP PREPARED': 'chip-plomo',
  'SHIP-PREPARED': 'chip-plomo',
}

@Component({
  selector: 'nuvex-chip-status',
  standalone: true,
  imports: [
    ChipModule,
    FormsModule,
    TranslateModule,
    UpperCasePipe,
    CapitalizePipe,
  ],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './status.component.html',
  styleUrl: '../../../styles/_chip-colors.scss',
})
export class StatusComponent {
  private readonly translateLanService = inject(TranslateLanService)
  private readonly translate = inject(TranslateService)

  status = input.required<string>()

  constructor() {
    effect(() => {
      const lan = this.translateLanService.changeLanguage()
      this.translate.use(lan)
    })
  }

  getConfig(): { chip: string; icon: string } | null {
    const key = this.status()?.toUpperCase()
    const chip = STATUS_CHIP_MAP[key]
    return chip ? { chip, icon: resolveIcon(key) } : null
  }
}
