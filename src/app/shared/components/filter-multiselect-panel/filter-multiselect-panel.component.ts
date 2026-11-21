import {
  Component,
  input,
  output,
  signal,
  effect,
  OnInit,
  ViewChild,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { MultiSelectModule, MultiSelect } from 'primeng/multiselect'
import { ButtonModule } from 'primeng/button'

/**
 * FilterMultiselectPanelComponent — Generic multiselect filter with Apply/Clear footer.
 *
 * Designed for use inside `<base-data-table>`'s `#filterRow` ng-template slot.
 * The filter is NOT applied immediately on selection; the user must press "Apply".
 *
 * Supports an optional `colorMap` input to display colored dots next to each option.
 *
 * @example
 * ```html
 * <nuvex-filter-multiselect-panel
 *   [options]="statusOptions"
 *   optionLabel="label"
 *   optionValue="value"
 *   [placeholder]="'labels.status' | translate"
 *   [value]="appliedStatusFilter"
 *   [colorMap]="categoryColorMap"
 *   (apply)="onStatusApply($event)"
 *   (clear)="onStatusClear()"
 * />
 * ```
 */
@Component({
  selector: 'nuvex-filter-multiselect-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, MultiSelectModule, ButtonModule],
  templateUrl: './filter-multiselect-panel.component.html',
  styleUrl: './filter-multiselect-panel.component.scss',
})
export class FilterMultiselectPanelComponent implements OnInit {
  // ── Inputs ──────────────────────────────────────────────────────────────────

  /** Array of options to display in the multiselect. */
  options = input.required<any[]>()

  /** Property name on each option to use as display label. Default: 'label'. */
  optionLabel = input<string>('label')

  /** Property name on each option to use as emitted value. Default: 'value'. */
  optionValue = input<string>('value')

  /** Placeholder text shown when nothing is selected. */
  placeholder = input<string>('')

  /** Display mode: 'chip' shows tags, 'comma' shows comma-separated text. */
  display = input<'chip' | 'comma'>('chip')

  /** Show a search input inside the dropdown panel. */
  showFilter = input<boolean>(false)

  /** Maximum number of labels to show inline (0 = always show count). */
  maxSelectedLabels = input<number>(2)

  /**
   * Currently applied (committed) value — controls what shows as "active"
   * after Apply. When this changes externally (e.g. chip removed), the
   * pending selection resets to match.
   */
  value = input<any[]>([])

  /** styleClass forwarded to p-multiSelect. */
  styleClass = input<string>('w-full')

  /**
   * Optional color map: option value → CSS color string.
   * When provided, a colored dot is shown next to each option label.
   * Build this using `StatusColorService.buildColorMap()`.
   *
   * @example { 'uuid-1': 'var(--p-green-500)', 'uuid-2': 'var(--p-blue-500)' }
   */
  colorMap = input<Record<string, string>>({})

  // ── Outputs ─────────────────────────────────────────────────────────────────

  /** Emitted with the selected values when the user clicks Apply. */
  apply = output<any[]>()

  /** Emitted when the user clicks Clear. */
  clear = output<void>()

  // ── Internal state ───────────────────────────────────────────────────────────

  /** Buffered selection — only committed to the parent on Apply. */
  pendingValue = signal<any[]>([])

  constructor() {
    // Keep pending in sync when the parent resets the committed value
    effect(() => {
      this.pendingValue.set(this.value() ?? [])
    })
  }

  /** Reference to the PrimeNG multiselect — used to close the panel programmatically. */
  @ViewChild('ms') private readonly ms!: MultiSelect

  ngOnInit(): void {
    this.pendingValue.set(this.value() ?? [])
  }

  onPendingChange(selected: any[]) {
    this.pendingValue.set(selected ?? [])
  }

  onApply() {
    this.apply.emit(this.pendingValue())
    this.ms?.hide()
  }

  onClear() {
    this.pendingValue.set([])
    this.clear.emit()
    this.ms?.hide()
  }

  /**
   * Check if colorMap has any entries (used in template to conditionally render item template).
   */
  get hasColorMap(): boolean {
    return Object.keys(this.colorMap()).length > 0
  }

  /**
   * Get the CSS color for a given option value.
   */
  getOptionColor(optionValue: any): string {
    return this.colorMap()[String(optionValue)] || ''
  }
}
