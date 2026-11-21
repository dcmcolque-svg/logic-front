import {
  Component,
  computed,
  input,
  output,
  signal,
  effect,
  inject,
  ViewChild,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { DatePickerModule } from 'primeng/datepicker'
import { MenuModule } from 'primeng/menu'
import { MenuItem } from 'primeng/api'
import { filterConfigMatchModes } from '@/app/shared/config/filter-column.config'
import { DATEPICKER_FORMAT } from '@/app/shared/utils/display-format'

/**
 * FilterDateInputComponent — Generic date filter with match mode menu.
 *
 * Uses `filterConfigMatchModes.matchmodes` (equals, gte, lte) by default,
 * showing the funnel icon menu just like the numeric filter.
 *
 * @example
 * ```html
 * <nuvex-filter-date-input
 *   [value]="getActiveFilterValue('created_at')"
 *   [placeholder]="'labels.created_at' | translate"
 *   (applyWithMode)="onColumnFilterChange('created_at', $event)"
 * />
 * ```
 */
@Component({
  selector: 'nuvex-filter-date-input',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DatePickerModule,
    MenuModule,
  ],
  templateUrl: './filter-date-input.component.html',
  styleUrl: './filter-date-input.component.scss',
})
export class FilterDateInputComponent {
  @ViewChild('matchModeMenu') matchModeMenu: any

  private readonly translate = inject(TranslateService)

  // ── Inputs ──────────────────────────────────────────────────────────────────

  /** Currently committed value. Resets the datepicker when changed externally. */
  value = input<Date | string | null>(null)

  /**
   * Currently active match mode from the parent's filter state.
   * Restores the selected mode when the component is recreated.
   */
  matchMode = input<string | null>(null)

  /** Placeholder text. */
  placeholder = input<string>('')

  /** Date format string for p-datepicker. Default: 'yy-mm-dd'. */
  dateFormat = input<string>(DATEPICKER_FORMAT)

  /** Whether to show the clear button. Default: true. */
  showClear = input<boolean>(true)

  /** styleClass forwarded to p-datepicker. */
  styleClass = input<string>('w-full')

  /** inputStyleClass forwarded to p-datepicker. */
  inputStyleClass = input<string>('w-full')

  // ── Match mode config (date → equals, gte, lte) ─────────────────────────

  private readonly config = filterConfigMatchModes.matchmodes

  /** Whether to show the match mode menu (always true for date — 3 options). */
  showMenu = this.config.length > 1

  // ── Outputs ─────────────────────────────────────────────────────────────────

  /** Emits raw Date value (backward compat). */
  apply = output<Date | null>()

  /** Emits { value, matchMode } — preferred output for feature consumers. */
  applyWithMode = output<{ value: Date | null; matchMode: string } | null>()

  // ── Internal state ───────────────────────────────────────────────────────────

  /** Internal model bound to the datepicker. */
  internalValue = signal<Date | null>(null)

  /** Currently selected match mode. */
  selectedMatchMode = signal<string>(this.config[0]?.value ?? 'equals')

  /** Menu items — computed so the check mark is always in sync with selectedMatchMode. */
  matchModeMenuItems = computed(() => {
    const current = this.selectedMatchMode()
    const items: MenuItem[] = this.config.map((mode) => ({
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
    // Sync internal model when committed value changes externally
    effect(() => {
      const v = this.value()
      if (v instanceof Date) {
        this.internalValue.set(v)
      } else if (typeof v === 'string' && v) {
        // Append T00:00:00 if it's a date-only string to avoid UTC shift
        const dateStr = v.includes('T') ? v : `${v}T00:00:00`
        this.internalValue.set(new Date(dateStr))
      } else {
        this.internalValue.set(null)
      }
    })

    // Sync match mode: parent-provided matchMode wins, otherwise default
    effect(() => {
      const parentMode = this.matchMode()
      const def = this.config[0]?.value ?? 'equals'
      this.selectedMatchMode.set(parentMode || def)
    })
  }

  // ── Match mode menu ─────────────────────────────────────────────────────────

  selectMatchMode(mode: string): void {
    this.selectedMatchMode.set(mode)
    const val = this.internalValue()
    if (val) {
      this.apply.emit(val)
      this.applyWithMode.emit({ value: val, matchMode: mode })
    }
  }

  clearFilter(): void {
    this.internalValue.set(null)
    this.selectedMatchMode.set(this.config[0]?.value ?? 'equals')
    this.apply.emit(null)
    this.applyWithMode.emit(null)
  }

  toggleMenu(event: Event): void {
    this.matchModeMenu?.toggle(event)
  }

  // ── Date handlers ───────────────────────────────────────────────────────────

  onDateSelect(date: Date) {
    this.apply.emit(date ?? null)
    this.applyWithMode.emit(
      date ? { value: date, matchMode: this.selectedMatchMode() } : null
    )
  }

  onClear() {
    this.internalValue.set(null)
    this.apply.emit(null)
    this.applyWithMode.emit(null)
  }

  onModelChange(value: Date | null) {
    if (!value) {
      this.internalValue.set(null)
      this.apply.emit(null)
      this.applyWithMode.emit(null)
    }
  }
}
