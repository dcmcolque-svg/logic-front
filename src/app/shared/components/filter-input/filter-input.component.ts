import {
  Component,
  effect,
  inject,
  input,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { InputTextModule } from 'primeng/inputtext'
import { InputNumberModule } from 'primeng/inputnumber'
import { DatePickerModule } from 'primeng/datepicker'
import { Table, TableLazyLoadEvent, TableModule } from 'primeng/table'
import { TranslateLanService } from '../../../core/services/translate-lan.service'
import { filterConfigMatchModes } from '../../config/filter-column.config'
import { Subscription } from 'rxjs'

@Component({
  selector: 'shipedge-filter-input',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    InputTextModule,
    InputNumberModule,
    DatePickerModule,
    TableModule,
  ],
  templateUrl: './filter-input.component.html',
  styleUrl: './filter-input.component.scss',
})
export class FilterInputComponent implements OnInit, OnDestroy {
  @ViewChild('numericInput') numericInput: ElementRef | undefined

  private readonly table = inject(Table, { optional: true })
  private readonly translateLanService = inject(TranslateLanService)
  private readonly translate = inject(TranslateService)
  private lazyLoadSubscription = new Subscription()
  private readonly MAX_DIGITS = 9

  field = input<string>('')
  type = input<string>('')
  typereal = 'numeric'
  configfilter = filterConfigMatchModes.matchmodes
  /** Buffer for text filter — committed only on Enter */
  pendingTextValue: string = ''

  constructor() {
    effect(() => {
      const lan = this.translateLanService.changeLanguage()
      this.translate.use(lan)
    })
  }

  ngOnInit(): void {
    switch (this.type()) {
      case 'numeric':
        this.configfilter = filterConfigMatchModes.matchmodes
        this.typereal = 'numeric'
        break
      case 'date':
        this.configfilter = filterConfigMatchModes.matchmodes
        this.typereal = 'date'
        break
      case 'ids':
        this.configfilter = filterConfigMatchModes.matchmodesOnlyEquals
        this.typereal = 'numeric'
        break
      case 'text':
      default:
        this.configfilter = filterConfigMatchModes.matchmodesOnlyContains
        this.typereal = 'text'
        break
    }

    this.translate.onFallbackLangChange.subscribe(() =>
      setTimeout(() => this.cambiar())
    )
    this.translate.onLangChange.subscribe(() =>
      setTimeout(() => this.cambiar())
    )

    if (this.table) {
      this.lazyLoadSubscription = this.table.onLazyLoad.subscribe(
        (event: TableLazyLoadEvent) => this.onTableLazyLoad(event)
      )
    }
  }

  ngOnDestroy(): void {
    this.lazyLoadSubscription.unsubscribe()
  }

  onTableLazyLoad(event: TableLazyLoadEvent): void {
    this.checkIfFieldCleared(event.filters)
  }

  checkIfFieldCleared(filters: any): void {
    const fieldName = this.field()
    const filterValue = filters?.[fieldName]
    if (
      filterValue?.value === null ||
      filterValue?.value === undefined ||
      filterValue?.value === ''
    ) {
      this.onFilterClear()
    }
  }

  onFilterClear(): void {
    setTimeout(() => {
      if (this.typereal === 'numeric' && this.numericInput?.nativeElement) {
        this.numericInput.nativeElement.value = ''
      }
    }, 100)
  }

  onDateSelect(date: Date, filterCallback: any): void {
    filterCallback(date ?? null)
  }

  private _lastDateInput: any = undefined
  private _lastDateOutput: Date | null = null

  parseToDate(value: any): Date | null {
    if (value === this._lastDateInput) return this._lastDateOutput
    this._lastDateInput = value
    if (!value) this._lastDateOutput = null
    else if (value instanceof Date) this._lastDateOutput = value
    else if (typeof value === 'string') this._lastDateOutput = new Date(value)
    else this._lastDateOutput = null
    return this._lastDateOutput
  }

  /** Called on ngModelChange — only clears the filter if the field is emptied */
  onNumericInputChange(value: any, filterCallback: any): void {
    if (value === null || value === '') {
      filterCallback(null)
    }
    // Do NOT apply filter here — wait for Enter key
  }

  /** Called on Enter key — parses and applies the numeric filter */
  onNumericInputChange2(event: any, filterCallback: any): void {
    const value = event.target.value
    if (value === '-' || value === '.' || value === '') {
      filterCallback(null)
      return
    }
    const numericValue = Number(value)
    if (!Number.isNaN(numericValue)) filterCallback(numericValue)
  }

  /** Called on ngModelChange for text inputs — buffers the value without applying */
  onTextInputChange(value: string): void {
    this.pendingTextValue = value ?? ''
  }

  /** Called on Enter key for text inputs — applies the buffered value */
  applyTextFilter(filterCallback: any): void {
    filterCallback(this.pendingTextValue || null)
  }

  onKeyDown(event: KeyboardEvent): void {
    const allowedKeys = [
      'Backspace',
      'Delete',
      'ArrowLeft',
      'ArrowRight',
      'Tab',
      'Enter',
      '.',
      '-',
    ]
    const isNumber = /\d/.test(event.key)
    const isAllowedKey = allowedKeys.includes(event.key)
    if (!isNumber && !isAllowedKey) {
      event.preventDefault()
      return
    }
    if (event.key === '-' && this.numericInput?.nativeElement) {
      const pos = this.numericInput.nativeElement.selectionStart
      if (this.numericInput.nativeElement.value.includes('-') || pos !== 0)
        event.preventDefault()
    }
    if (isNumber && this.numericInput?.nativeElement) {
      const currentValue = this.numericInput.nativeElement.value.replaceAll(
        /\D/g,
        ''
      )
      const pos = this.numericInput.nativeElement.selectionStart
      const selLen = this.numericInput.nativeElement.selectionEnd - pos
      if (selLen === 0 && currentValue.length >= this.MAX_DIGITS)
        event.preventDefault()
    }
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault()
  }

  private cambiar(): void {
    this.configfilter.forEach((el) => {
      el.label = this.translate.instant(el.original)
    })
  }
}
