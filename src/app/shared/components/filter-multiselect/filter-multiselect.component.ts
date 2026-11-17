import {
  AfterContentInit,
  Component,
  ContentChildren,
  HostListener,
  inject,
  input,
  OnDestroy,
  OnInit,
  QueryList,
  signal,
  TemplateRef,
  ViewChild,
  effect,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { PrimeTemplate } from 'primeng/api'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MultiSelect, MultiSelectModule } from 'primeng/multiselect'
import { ButtonModule } from 'primeng/button'
import { Table, TableLazyLoadEvent, TableModule } from 'primeng/table'
import { Nullable } from 'primeng/ts-helpers'
import { Subscription } from 'rxjs'
import { filterConfigMatchModes } from '../../config/filter-column.config'

@Component({
  selector: 'shipedge-filter-multiselect',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MultiSelectModule,
    ButtonModule,
    TableModule,
  ],
  templateUrl: './filter-multiselect.component.html',
  styleUrl: './filter-multiselect.component.scss',
})
export class FilterMultiselectComponent implements OnInit, AfterContentInit, OnDestroy {
  @ViewChild('multiselect') filterComponent!: MultiSelect
  @ContentChildren(PrimeTemplate) templates: Nullable<QueryList<PrimeTemplate>>

  private readonly table = inject(Table, { optional: true })
  private readonly translateService = inject(TranslateService)
  private lazyLoadSubscription = new Subscription()
  private langChangeSubscription = new Subscription()

  withTemplate = input<boolean>(false)
  valores = input.required<unknown[]>()
  type = input<string>('')
  optionField = input<string>('')
  field = input<string>('')
  columna = input<string>('')
  withimage = input<string>('')
  configfilter = filterConfigMatchModes.matchmodesOnlyIn
  listTemplate!: TemplateRef<unknown> | null

  processedOptions = signal<any[]>([])

  constructor() {
    effect(() => {
      this.updateProcessedOptions()
    })
  }

  ngOnInit(): void {
    if (this.table) {
      this.lazyLoadSubscription = this.table.onLazyLoad.subscribe(
        (event: TableLazyLoadEvent) => this.onTableLazyLoad(event)
      )
    }
    if (this.translateService) {
      this.langChangeSubscription =
        this.translateService.onLangChange.subscribe(() => {
          this.updateProcessedOptions()
        })
    }
  }

  ngOnDestroy(): void {
    this.lazyLoadSubscription.unsubscribe()
    this.langChangeSubscription.unsubscribe()
  }

  updateProcessedOptions(): void {
    const rawOptions = this.valores() || []
    const col = this.columna()
    const optField = this.optionField()

    const translated = rawOptions.map((item: any) => {
      const isObject = typeof item === 'object' && item !== null
      const valueForTranslation = isObject
        ? item[col] || item.status || item.label
        : item

      const raw = String(valueForTranslation ?? '')

      // 1st: try direct translation (handles i18n keys like 'labels.pending')
      let label = this.translateService?.instant(raw)
      if (label === raw) {
        // 2nd: try chip_label.* prefix (legacy pattern)
        const chipKey = 'chip_label.' + raw
        const chipLabel = this.translateService?.instant(chipKey)
        label = chipLabel === chipKey ? raw : chipLabel
      }

      if (!isObject) {
        return {
          [optField || 'value']: item,
          status: item,
          state: item,
          _translatedLabel: label,
        }
      }
      return { ...item, _translatedLabel: label }
    })

    this.processedOptions.set(translated)
  }

  ngAfterContentInit(): void {
    (this.templates as QueryList<PrimeTemplate>)?.forEach((item) => {
      if (item.getType() === 'listItem') this.listTemplate = item.template
    })
  }

  hide(): void {
    this.filterComponent?.hide()
  }

  @HostListener('window:orientationchange')
  onOrientationChange(): void {
    this.hide()
  }

  @HostListener('window:resize')
  onResize(): void {
    this.hide()
  }

  clearFilter(filter: (value: unknown) => void): void {
    if (this.filterComponent) {
      this.filterComponent.filterValue = ''
      this.filterComponent.value = []
      this.filterComponent.updateModel([])
    }
    filter(null)
  }

  private onTableLazyLoad(event: TableLazyLoadEvent): void {
    if (event.filters) this.checkIfFieldCleared(event.filters)
  }

  private checkIfFieldCleared(filters: any): void {
    const fieldName = this.field()
    const filterValue = filters[fieldName]
    if (!filterValue?.value) this.onFilterClear()
  }

  private onFilterClear(): void {
    setTimeout(() => {
      if (this.filterComponent) {
        this.filterComponent.filterValue = ''
        this.filterComponent.value = []
        this.filterComponent.updateModel([])
      }
    }, 100)
  }
}
