import {
  Component,
  effect,
  inject,
  input,
  output,
  ContentChild,
  TemplateRef,
  SimpleChanges,
  OnInit,
  OnChanges,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ChipModule } from 'primeng/chip'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TranslateLanService } from '../../../core/services/translate-lan.service'
import { FiltersShip } from './filters.interface'

@Component({
  selector: 'nuvex-filter-clear',
  standalone: true,
  imports: [CommonModule, ChipModule, FormsModule, TranslateModule],
  templateUrl: './filter-clear.component.html',
  styleUrl: './filter-clear.component.scss',
})
export class FilterClearComponent implements OnInit, OnChanges {
  private readonly translateLanService = inject(TranslateLanService)
  private readonly translate = inject(TranslateService)

  enformato = input.required<FiltersShip[]>()
  removeEvent = output<string>()

  @ContentChild('chipTemplate', { static: false })
  chipTemplate?: TemplateRef<any>

  constructor() {
    effect(() => {
      const lan = this.translateLanService.changeLanguage()
      this.translate.use(lan)
    })
  }

  ngOnInit(): void {
    this.translate.onFallbackLangChange.subscribe(() =>
      setTimeout(() => this.cambiar())
    )
    this.translate.onLangChange.subscribe(() =>
      setTimeout(() => this.cambiar())
    )
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.cambiar()
  }

  remove(_event: MouseEvent, key: string): void {
    this.removeEvent.emit(key)
  }

  truncateText(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
  }

  formatValor(valor: string): string {
    if (/^\d{4}-\d{2}-\d{2}T/.test(valor)) return valor.substring(0, 10)
    return valor
  }

  getChipName(item: FiltersShip): string {
    if (item.name && typeof item.name === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T/.test(item.name))
        return item.name.substring(0, 10)
      return this.translateChipString(item.name)
    }
    return item.valor
  }

  translateChipString(chipString: string): string {
    if (!chipString) return ''
    return chipString
      .split(', ')
      .map((word) => {
        const key = 'chip_label.' + word.toUpperCase()
        const translated = this.translate.instant(key)
        return translated === key ? word : translated
      })
      .join(', ')
  }

  private cambiar(): void {
    if (this.enformato()) {
      for (const item of this.enformato()) {
        item.show = this.translate.instant('labels.' + item.key)
      }
    }
  }
}
