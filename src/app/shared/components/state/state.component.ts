import {
  Component,
  effect,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core'
import { UpperCasePipe } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TagModule } from 'primeng/tag'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TranslateLanService } from '../../../core/services/translate-lan.service'
import { resolveIcon } from '../../config/icon.registry'

// Map of state → chip color class. Icons come from the shared icon registry.
const STATE_CHIP_MAP: Record<string, string> = {
  DISCREPANCY: 'chip-violeta',
  'IN-TRANSIT': 'chip-plomo',
  'IN-WAREHOUSE': 'chip-celeste',
  PROCESSING: 'chip-amarillo',
  COMPLETE: 'chip-verde',
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
}

@Component({
  selector: 'shipedge-chip-state',
  standalone: true,
  imports: [FormsModule, TagModule, TranslateModule, UpperCasePipe],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './state.component.html',
  styleUrl: '../../styles/_chip-colors.scss',
})
export class StateComponent {
  private readonly translateLanService = inject(TranslateLanService)
  private readonly translate = inject(TranslateService)

  state = input.required<string>()
  texto = input.required<string>()

  constructor() {
    effect(() => {
      const lan = this.translateLanService.changeLanguage()
      this.translate.use(lan)
    })
  }

  getConfig(): { chip: string; icon: string } | null {
    const key = this.state()?.toUpperCase()
    const chip = STATE_CHIP_MAP[key]
    return chip ? { chip, icon: resolveIcon(key) } : null
  }
}
