import {
  Component,
  computed,
  input,
  output,
  signal,
  effect,
  inject,
  ElementRef,
  ViewChild,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { InputTextModule } from 'primeng/inputtext'
import { ButtonModule } from 'primeng/button'
import { MenuModule } from 'primeng/menu'
import { MenuItem } from 'primeng/api'
import { filterConfigMatchModes } from '@/app/shared/config/filter-column.config'

/**
 * FilterTextInputComponent — Generic text/numeric filter input with automatic
 * match mode configuration, replicating the PrimeNG p-columnFilter UX.
 *
 * Match mode behavior is driven entirely by `filterType`:
 *
 * | filterType | Match modes            | Menu visible | Input type |
 * |------------|------------------------|--------------|------------|
 * | `numeric`  | equals, gte, lte       | ✓            | number     |
 * | `text`     | contains               | ✗            | text       |
 * | `ids`      | equals                 | ✗            | number     |
 *
 * The parent owns the filter state (value + matchMode). When the component
 * is destroyed and recreated (e.g. after a data reload), both are restored
 * from the parent inputs.
 *
 * @example
 * ```html
 * <shipedge-filter-text-input
 *   [value]="getActiveFilterValue(col.field)"
 *   [matchMode]="getActiveFilterMatchMode(col.field)"
 *   [placeholder]="col.header | translate"
 *   [filterType]="col.filterType"
 *   (applyWithMode)="onColumnFilterChange(col.field, $event)"
 * />
 * ```
 */
@Component({
  selector: 'shipedge-filter-text-input',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    InputTextModule,
    ButtonModule,
    MenuModule,
  ],
  templateUrl: './filter-text-input.component.html',
  styleUrl: './filter-text-input.component.scss',
})
export class FilterTextInputComponent {
  @ViewChild('inputRef') inputRef!: ElementRef<HTMLInputElement>
  @ViewChild('matchModeMenu') matchModeMenu: any

  private readonly translate = inject(TranslateService)

  // ── Inputs ──────────────────────────────────────────────────────────────────

  /** Currently committed value. Resets the display when changed externally. */
  value = input<any>(null)

  /**
   * Currently active match mode from the parent's filter state.
   * When the component is recreated (e.g. after loading), the parent passes
   * this so the selected mode is restored instead of resetting to default.
   */
  matchMode = input<string | null>(null)

  /** Placeholder text. Falls back to 'labels.press_enter' translation. */
  placeholder = input<string>('')

  /**
   * Column-config filter type. Drives match mode options, menu visibility,
   * keyboard restrictions, and value coercion automatically.
   * Accepts: 'text' | 'numeric' | 'ids'
   */
  filterType = input<string>('text')

  /**
   * @deprecated Use `filterType` instead. Kept for backward compatibility.
   * HTML input type: 'text' or 'number'.
   */
  inputType = input<'text' | 'number'>('text')

  /** Additional CSS classes forwarded to the input element. */
  styleClass = input<string>('p-inputtext p-inputtext-sm w-full')

  // ── Derived state ─────────────────────────────────────────────────────────

  /** Whether input should behave as numeric (restrict keys, coerce to Number). */
  isNumeric = computed(
    () =>
      this.filterType() === 'numeric' ||
      this.filterType() === 'ids' ||
      this.inputType() === 'number'
  )

  /** Match mode options resolved from filterType. */
  matchModeConfig = computed(() => {
    switch (this.filterType()) {
      case 'numeric':
        return filterConfigMatchModes.matchmodes
      case 'ids':
        return filterConfigMatchModes.matchmodesOnlyEquals
      case 'text':
      default:
        return filterConfigMatchModes.matchmodesOnlyContains
    }
  })

  /** Whether the match mode menu should be displayed (only when > 1 option). */
  showMenu = computed(() => this.matchModeConfig().length > 1)

  /** Default match mode (first in the config list). */
  defaultMatchMode = computed(() => this.matchModeConfig()[0]?.value ?? 'contains')

  /** HTML input type attribute. */
  htmlInputType = computed(() => (this.isNumeric() ? 'number' : 'text'))

  // ── Outputs ─────────────────────────────────────────────────────────────────

  /** Emits raw value (backward compat with base-data-table p-columnFilter). */
  apply = output<any>()

  /** Emits { value, matchMode } — preferred output for feature consumers. */
  applyWithMode = output<{ value: any; matchMode: string } | null>()

  // ── Internal state ───────────────────────────────────────────────────────────

  /** Buffered (uncommitted) display value. */
  pendingValue = signal<string>('')

  /** Currently selected match mode. */
  selectedMatchMode = signal<string>('contains')

  /** Menu items — computed from selectedMatchMode so the check mark is always in sync. */
  matchModeMenuItems = computed(() => {
    const config = this.matchModeConfig()
    const current = this.selectedMatchMode()

    const items: MenuItem[] = config.map((mode) => ({
      label: this.translate.instant(mode.original),
      icon: mode.value === current ? 'pi pi-check' : '',
      command: () => this.selectMatchMode(mode.value),
    }))

    items.push(
      { separator: true },
      {
        label: this.translate.instant('components.no_filter'),
        icon: 'pi pi-filter-slash',
        command: () => this.clearFilter(),
      }
    )

    return items
  })

  constructor() {
    // Sync display value from parent
    effect(() => {
      const committed = this.value()
      this.pendingValue.set(
        committed !== null && committed !== undefined ? String(committed) : ''
      )
    })

    // Sync match mode: parent-provided matchMode wins, otherwise use filterType default
    effect(() => {
      const parentMode = this.matchMode()
      const def = this.defaultMatchMode()
      this.selectedMatchMode.set(parentMode || def)
    })
  }

  // ── Match mode menu ─────────────────────────────────────────────────────────

  /** Select a match mode and re-apply the current value if any. */
  selectMatchMode(mode: string): void {
    this.selectedMatchMode.set(mode)
    const val = this.pendingValue().trim()
    if (val !== '') {
      this.emitFilter(val)
    }
  }

  /** Clear the filter entirely. */
  clearFilter(): void {
    this.pendingValue.set('')
    this.selectedMatchMode.set(this.defaultMatchMode())
    this.apply.emit(null)
    this.applyWithMode.emit(null)
  }

  /** Toggle the match mode menu popup. */
  toggleMenu(event: Event): void {
    this.matchModeMenu?.toggle(event)
  }

  // ── Input handlers ──────────────────────────────────────────────────────────

  onInputChange(value: string) {
    this.pendingValue.set(value ?? '')
  }

  onEnter() {
    const val = this.pendingValue().trim()
    if (val === '') {
      this.apply.emit(null)
      this.applyWithMode.emit(null)
      return
    }
    this.emitFilter(val)
  }

  /** Emit the filter value with type coercion and match mode. */
  private emitFilter(val: string): void {
    const coerced = this.isNumeric() ? Number(val) : val
    if (this.isNumeric() && Number.isNaN(coerced)) return

    this.apply.emit(coerced)
    this.applyWithMode.emit({
      value: coerced,
      matchMode: this.selectedMatchMode(),
    })
  }

  onKeyDown(event: KeyboardEvent) {
    if (!this.isNumeric()) return
    const allowed = [
      'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight',
      'Tab', 'Enter', '.', '-',
    ]
    if (!allowed.includes(event.key) && !/\d/.test(event.key)) {
      event.preventDefault()
    }
  }

  onWheel(event: WheelEvent) {
    if (this.isNumeric()) event.preventDefault()
  }
}
