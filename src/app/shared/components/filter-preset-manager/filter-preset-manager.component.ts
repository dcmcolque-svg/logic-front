import {
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
  computed,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'

// PrimeNG
import { ButtonModule } from 'primeng/button'
import { Popover, PopoverModule } from 'primeng/popover'
import { DialogModule } from 'primeng/dialog'
import { InputTextModule } from 'primeng/inputtext'
import { TextareaModule } from 'primeng/textarea'
import { SelectModule } from 'primeng/select'
import { MultiSelectModule } from 'primeng/multiselect'
import { ColorPickerModule } from 'primeng/colorpicker'
import { DatePickerModule } from 'primeng/datepicker'
import { SelectButtonModule } from 'primeng/selectbutton'
import { TooltipModule } from 'primeng/tooltip'
import { ConfirmPopup } from 'primeng/confirmpopup'
import { BadgeModule } from 'primeng/badge'
import { ConfirmationService } from 'primeng/api'

import { FILTER_PRESETS_ENABLED, FilterPresetService } from '@/app/shared/services/filter-preset.service'
import { FilterPreset, FilterCondition } from '@/app/shared/types/filter-preset.types'
import { ShColumnDef, ShSortConfig } from '@/app/shared/types/table.types'

/** Rotating color palette for new presets */
const PRESET_COLOR_PALETTE = [
  '#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#14b8a6',
]
const DEFAULT_PRESET_COLOR = PRESET_COLOR_PALETTE[0]

/** Days ago options for date filter dropdown */
const DAYS_AGO_OPTIONS = [
  { label: 'filter_presets.today', value: 0 },
  { label: 'filter_presets.days_ago_1', value: 1 },
  { label: 'filter_presets.days_ago_3', value: 3 },
  { label: 'filter_presets.days_ago_7', value: 7 },
  { label: 'filter_presets.days_ago_15', value: 15 },
  { label: 'filter_presets.days_ago_30', value: 30 },
  { label: 'filter_presets.days_ago_60', value: 60 },
  { label: 'filter_presets.days_ago_90', value: 90 },
]

/** Max visible preset tabs before overflow */
const MAX_VISIBLE_TABS = 7

/** Match mode options by filter type */
const MATCH_MODES: Record<string, { label: string; value: string }[]> = {
  text: [
    { label: 'components.contains', value: 'contains' },
    { label: 'components.equals', value: 'equals' },
  ],
  numeric: [
    { label: 'components.equals', value: 'equals' },
    { label: 'components.gte', value: 'gte' },
    { label: 'components.lte', value: 'lte' },
  ],
  date: [
    { label: 'components.equals', value: 'equals' },
    { label: 'components.gte', value: 'gte' },
    { label: 'components.lte', value: 'lte' },
  ],
  multiselect: [
    { label: 'components.equals', value: 'in' },
  ],
}
/** Logical operator options for the AND/OR toggle */
const OPERATOR_OPTIONS = [
  { label: 'AND', value: 'and' },
  { label: 'OR', value: 'or' },
]

/** Human-readable match mode symbols for auto-description */
const MATCH_MODE_SYMBOLS: Record<string, string> = {
  contains: '~',
  equals: '=',
  gte: '≥',
  lte: '≤',
  in: '∈',
}

/** Internal mutable condition for dialog state */
interface DialogCondition {
  field: string
  matchMode: string
  value: unknown
  operator: 'and' | 'or'
}

/** A table filter as the pages keep it: `{ value, matchMode }` plus the custom-filter combinator */
export interface TableFilterEntry {
  value?: unknown
  matchMode?: string
  match_mode?: string
  operator?: 'and' | 'or'
  position?: number
}

const DAY_MS = 86_400_000

/**
 * FilterPresetManagerComponent — Reusable saved-filter preset selector
 * with a query-builder dialog for creating/editing filter presets.
 *
 * Usage:
 * ```html
 * <app-filter-preset-manager
 *   pageKey="parcels"
 *   [columns]="cols"
 *   [currentFilters]="activeBackendFilters"
 *   [currentSort]="currentSort()"
 *   [hasActiveFilters]="activeFilters().length > 0"
 *   (presetSelected)="onPresetSelected($event)"
 * />
 * ```
 */
@Component({
  selector: 'app-filter-preset-manager',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonModule,
    PopoverModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    MultiSelectModule,
    ColorPickerModule,
    DatePickerModule,
    SelectButtonModule,
    TooltipModule,
    ConfirmPopup,
    BadgeModule,
  ],
  providers: [ConfirmationService],
  templateUrl: './filter-preset-manager.component.html',
  styleUrl: './filter-preset-manager.component.scss',
})
export class FilterPresetManagerComponent implements OnInit {
  /** Whole bar hidden while saved filters are off. */
  readonly presetsEnabled = inject(FILTER_PRESETS_ENABLED)

  /** Per-instance counter so label/control ids stay unique when several managers render */
  private static nextInstanceId = 0

  // Exposed to template for direct access in @for
  presetService = inject(FilterPresetService)
  private readonly translate = inject(TranslateService)
  private readonly confirmService = inject(ConfirmationService)

  /** Unique id prefix used to associate dialog labels with their controls */
  readonly idPrefix = `filter-preset-${FilterPresetManagerComponent.nextInstanceId++}`

  // ── Inputs ──────────────────────────────────────────────────────────────────

  /** Unique page identifier (e.g. 'parcels', 'inventory') */
  pageKey = input.required<string>()

  /** Column definitions — used to build the field dropdown in the dialog */
  columns = input<ShColumnDef[]>([])

  /** Current active filter state from the parent */
  currentFilters = input<Record<string, TableFilterEntry | null | undefined>>({})

  /** Current sort state from the parent */
  currentSort = input<ShSortConfig | undefined>(undefined)

  /** Whether the parent has active filters (enables "Save" action) */
  hasActiveFilters = input(false)

  // ── Outputs ─────────────────────────────────────────────────────────────────

  /**
   * Emitted when the user selects a preset, or clicks "Apply" in the dialog
   * (then as an unsaved preset, see onApplyPreset) — parent restores filters
   */
  presetSelected = output<FilterPreset>()

  // ── Internal state ──────────────────────────────────────────────────────────

  showSaveDialog = signal(false)
  presetName = signal('')
  presetDescription = signal('')
  presetColor = signal(DEFAULT_PRESET_COLOR)
  nameError = signal('')
  /** Error shown in the dialog footer when saving fails for a reason other than the name */
  saveError = signal('')
  /** True while the create/update request is in flight */
  saving = signal(false)

  /** When editing an existing preset, this holds its ID; null = create new */
  editingPresetId: string | null = null

  /** Condition rows in the dialog */
  dialogConditions = signal<DialogCondition[]>([])

  /** Whether the user has manually edited the description */
  userEditedDescription = signal(false)

  /** Whether overflow presets are shown */
  showAllPresets = signal(false)

  /** Badge count: number of presets */
  presetCount = computed(() => this.presetService.presets().length)

  /** The last applied preset (for the "Edit" action and visual indicator) */
  lastAppliedPreset = computed(() => {
    const id = this.presetService.lastAppliedPresetId()
    if (!id) return null
    return this.presetService.presets().find(p => p.id === id) ?? null
  })

  /** Options for the AND/OR toggle in the dialog */
  operatorOptions = OPERATOR_OPTIONS

  /** Days ago dropdown options (translated) */
  daysAgoOptions = computed(() =>
    DAYS_AGO_OPTIONS.map(o => ({ ...o, translatedLabel: this.translate.instant(o.label) }))
  )

  /** First 7 presets for visible tabs */
  visiblePresets = computed(() =>
    this.presetService.presets().slice(0, MAX_VISIBLE_TABS)
  )

  /** Overflow presets beyond the first 7 */
  overflowPresets = computed(() =>
    this.presetService.presets().slice(MAX_VISIBLE_TABS)
  )

  /** Whether there are hidden presets */
  hasOverflow = computed(() => this.presetService.presets().length > MAX_VISIBLE_TABS)

  /**
   * Auto-generated description from current dialog conditions.
   * Format: "Status = Ship Prepared AND Created At ≥ 7d OR Order ~ bnhjm"
   */
  autoDescription = computed(() => {
    const conds = this.dialogConditions()
    if (conds.length === 0) return ''
    const parts: string[] = []
    for (let i = 0; i < conds.length; i++) {
      const c = conds[i]
      const text = this.describeCondition(c)
      if (!text) continue
      if (i > 0) {
        parts.push(c.operator === 'or' ? ' OR ' : ' AND ')
      }
      parts.push(text)
    }
    return parts.join('')
  })

  /** Filterable columns for the field dropdown */
  filterableColumns = computed(() =>
    this.columns().filter(c => c.filterable)
  )

  /**
   * Returns available fields for a given condition row index.
   * Excludes fields already used by OTHER rows (allows the current row's own field).
   * This enforces the no-duplicate-fields rule.
   */
  availableFieldsFor(rowIndex: number): ShColumnDef[] {
    const usedByOthers = new Set(
      this.dialogConditions()
        .filter((_, i) => i !== rowIndex)
        .map(c => c.field)
        .filter(Boolean)
    )
    return this.filterableColumns().filter(col => !usedByOthers.has(col.field))
  }

  /**
   * Partitions dialog conditions into visual groups.
   * OR starts a new group; AND continues the current group.
   *
   * Example: [A(and), B(and), C(or), D(and), E(or)] →
   *   Group 0: [{idx:0, A}, {idx:1, B}]
   *   Group 1: [{idx:2, C}, {idx:3, D}]
   *   Group 2: [{idx:4, E}]
   */
  conditionGroups = computed(() => {
    const conditions = this.dialogConditions()
    const groups: { items: { idx: number; condition: DialogCondition }[] }[] = []
    let currentGroup: { items: { idx: number; condition: DialogCondition }[] } = { items: [] }

    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i]
      // OR starts a new group (except for the first condition which always starts group 0)
      if (i > 0 && cond.operator === 'or') {
        groups.push(currentGroup)
        currentGroup = { items: [] }
      }
      currentGroup.items.push({ idx: i, condition: cond })
    }
    // Push the last group
    if (currentGroup.items.length > 0) {
      groups.push(currentGroup)
    }

    return groups
  })

  /** Whether there are multiple groups (i.e., at least one OR is used) */
  hasMultipleGroups = computed(() => this.conditionGroups().length > 1)

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.presetService.loadPresets(this.pageKey())
  }

  // ── Match mode helpers ────────────────────────────────────────────────────

  /**
   * Returns match mode options for a given field, based on its column filterType.
   */
  getMatchModesForField(field: string): { label: string; value: string; translatedLabel?: string }[] {
    const col = this.columns().find(c => c.field === field)
    const type = col?.filterType || 'text'
    const modes = MATCH_MODES[type] || MATCH_MODES['text']
    return modes.map(m => ({
      ...m,
      translatedLabel: this.translate.instant(m.label),
    }))
  }

  /**
   * Returns the column definition for a given field.
   */
  getColumnDef(field: string): ShColumnDef | undefined {
    return this.columns().find(c => c.field === field)
  }

  /**
   * Returns the filter type for a field ('text', 'numeric', 'date', 'multiselect').
   */
  getFieldType(field: string): string {
    return this.getColumnDef(field)?.filterType || 'text'
  }

  // ── Dialog actions ────────────────────────────────────────────────────────

  onSelectPreset(preset: FilterPreset): void {
    this.presetService.setLastApplied(preset.id)
    this.presetSelected.emit(this.withResolvedDates(preset))
  }

  openSaveDialog(): void {
    this.editingPresetId = null
    this.presetName.set('')
    this.presetDescription.set('')
    // Rotate color based on how many presets exist
    this.presetColor.set(PRESET_COLOR_PALETTE[this.presetCount() % PRESET_COLOR_PALETTE.length])
    this.nameError.set('')
    this.saveError.set('')
    this.userEditedDescription.set(false)

    // Seed conditions from current active filters
    const conditions = this.buildConditionsFromFilters(this.currentFilters())
    // Always show at least one empty row
    if (conditions.length === 0) {
      conditions.push({ field: '', matchMode: '', value: null, operator: 'and' })
    }
    this.dialogConditions.set(conditions)

    this.showSaveDialog.set(true)
  }

  /**
   * Opens the dialog pre-filled with the last applied preset's data for editing.
   * Uses currentFilters() (live table state) as the source of truth for conditions,
   * so inline filter changes are always reflected.
   */
  openEditDialog(): void {
    const preset = this.lastAppliedPreset()
    if (!preset) return

    this.editingPresetId = preset.id
    this.presetName.set(preset.name)
    this.presetDescription.set(preset.description ?? '')
    this.presetColor.set(preset.color ?? DEFAULT_PRESET_COLOR)
    this.nameError.set('')
    this.saveError.set('')
    this.userEditedDescription.set(Boolean(preset.description))

    // Use live table filters as source of truth so inline edits are reflected
    const liveFilters = this.currentFilters()
    const hasLiveFilters = liveFilters && Object.keys(liveFilters).some(k => {
      const v = liveFilters[k]
      return v?.value !== null && v?.value !== undefined && v?.value !== ''
    })

    const conditions: DialogCondition[] = hasLiveFilters
      ? this.buildConditionsFromFilters(liveFilters, preset)
      : this.presetConditionsToDialog(preset)

    if (conditions.length === 0) {
      conditions.push({ field: '', matchMode: '', value: null, operator: 'and' })
    }
    this.dialogConditions.set(conditions)

    this.showSaveDialog.set(true)
  }

  addCondition(): void {
    this.dialogConditions.update(c => [...c, { field: '', matchMode: '', value: null, operator: 'and' }])
  }

  removeCondition(index: number): void {
    this.dialogConditions.update(c => c.filter((_, i) => i !== index))
  }

  onFieldChange(index: number, field: string): void {
    this.dialogConditions.update(conditions => {
      const updated = [...conditions]
      const modes = this.getMatchModesForField(field)
      updated[index] = {
        field,
        matchMode: modes.length > 0 ? modes[0].value : '',
        value: null,
        operator: conditions[index].operator ?? 'and',
      }
      return updated
    })
  }

  onMatchModeChange(index: number, matchMode: string): void {
    this.dialogConditions.update(conditions => {
      const updated = [...conditions]
      updated[index] = { ...updated[index], matchMode }
      return updated
    })
  }

  onOperatorChange(index: number, operator: 'and' | 'or'): void {
    this.dialogConditions.update(conditions => {
      const updated = [...conditions]
      updated[index] = { ...updated[index], operator }
      return updated
    })
  }

  onValueChange(index: number, value: unknown): void {
    this.dialogConditions.update(conditions => {
      const updated = [...conditions]
      updated[index] = { ...updated[index], value }
      return updated
    })
  }

  /** Called when user types in the description textarea */
  onDescriptionInput(value: string): void {
    this.presetDescription.set(value)
    this.userEditedDescription.set(true)
  }

  onSavePreset(): void {
    if (this.saving()) return
    const name = this.presetName().trim()
    if (!name) {
      this.nameError.set(this.translate.instant('filter_presets.name_required'))
      return
    }
    if (name.length > 50) {
      this.nameError.set(this.translate.instant('filter_presets.name_too_long'))
      return
    }

    const conditions = this.getValidConditions()
    // Use user-edited description, or fall back to auto-generated
    const desc = this.userEditedDescription()
      ? this.presetDescription().trim()
      : this.autoDescription()
    const opts = {
      description: desc || undefined,
      color: this.presetColor(),
      conditions,
    }

    const editedId = this.editingPresetId
    const sort = this.currentSort()
    const request$ = editedId
      ? this.presetService.updatePreset(editedId, name, sort, opts)
      : this.presetService.savePreset(this.pageKey(), name, sort, opts)

    // The dialog stays open until the backend confirms, so a rejected save
    // (e.g. a duplicate name) can be corrected instead of silently lost.
    this.saving.set(true)
    this.nameError.set('')
    this.saveError.set('')
    request$.subscribe({
      next: (saved) => {
        this.saving.set(false)
        if (editedId) {
          // Re-apply the edited preset so the table reflects the change at once.
          this.presetService.setLastApplied(editedId)
          this.presetSelected.emit(this.withResolvedDates(saved))
        }
        this.editingPresetId = null
        this.showSaveDialog.set(false)
      },
      error: (err) => {
        this.saving.set(false)
        console.error('[FilterPresetManager] save failed:', err)
        if (err?.status === 409) {
          this.nameError.set(this.translate.instant('filter_presets.name_duplicate'))
        } else {
          this.saveError.set(this.translate.instant('filter_presets.save_failed'))
        }
      },
    })
  }

  /**
   * "Apply" puts the dialog's conditions on the table without saving them. It
   * goes out through presetSelected — every page already handles it — as an
   * unsaved preset. A new filter has no id and forgets the last applied
   * preset, so "Edit" won't offer to overwrite a saved one with these
   * conditions; while editing, it keeps the edited preset's id.
   */
  onApplyPreset(): void {
    const editedId = this.editingPresetId
    const sort = this.currentSort()
    if (!editedId) this.presetService.clearLastApplied()
    this.presetSelected.emit({
      id: editedId ?? '',
      name: this.presetName().trim() || this.translate.instant('filter_presets.unsaved'),
      color: this.presetColor(),
      page_key: this.pageKey(),
      conditions: this.resolveRelativeDates(this.getValidConditions()),
      sort_field: sort?.field ?? null,
      sort_order: sort?.order ?? null,
      position: 0,
      is_default: false,
      created_at: '',
      updated_at: '',
    })
    this.editingPresetId = null
    this.showSaveDialog.set(false)
  }

  onDeletePreset(event: Event, preset: FilterPreset): void {
    this.confirmService.confirm({
      target: event.target as EventTarget,
      message: this.translate.instant('filter_presets.delete_confirm'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('buttons.delete'),
      rejectLabel: this.translate.instant('buttons.cancel'),
      acceptButtonStyleClass: 'p-button-danger p-button-sm',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined p-button-sm',
      accept: () => {
        this.presetService.deletePreset(preset.id)
      },
    })
  }

  onCancelSave(): void {
    this.showSaveDialog.set(false)
  }

  /**
   * Keyboard equivalent of clicking a preset tab / list item. Ignores keys that
   * bubble up from inner controls (e.g. the delete button) so they keep their own behavior.
   */
  onPresetKeydown(event: Event, preset: FilterPreset, panel?: Popover): void {
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    this.onSelectPreset(preset)
    panel?.hide()
  }

  onNameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.onSavePreset()
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** Human-readable "Field sym value" fragment for the auto-description; '' when incomplete */
  private describeCondition(c: DialogCondition): string {
    if (!c.field) return ''
    const valStr = this.formatConditionValue(c)
    if (!valStr) return ''
    const col = this.getColumnDef(c.field)
    const fieldLabel = col?.header ? this.translate.instant(col.header) : c.field
    const sym = MATCH_MODE_SYMBOLS[c.matchMode] || c.matchMode
    return `${fieldLabel} ${sym} ${valStr}`
  }

  /** Formats a condition value for display in the auto-description */
  private formatConditionValue(c: DialogCondition): string {
    if (this.getFieldType(c.field) === 'date' && typeof c.value === 'number') {
      return c.value === 0 ? this.translate.instant('filter_presets.today') : `${c.value}d`
    }
    if (Array.isArray(c.value)) {
      return c.value.join(', ')
    }
    return c.value == null ? '' : String(c.value)
  }

  /** Maps a saved preset's conditions into dialog rows (operator defaults to AND) */
  private presetConditionsToDialog(preset: FilterPreset): DialogCondition[] {
    if (!preset.conditions?.length) return []
    return preset.conditions.map(c => ({
      ...c,
      value: this.getFieldType(c.field) === 'date' ? this.toDaysAgo(c.value) : c.value,
      operator: c.operator ?? 'and',
    }))
  }

  /**
   * Convert the table's live filters into condition rows for the dialog.
   *
   * The only date the dialog can show is a "days ago" option, and the table
   * holds dates already resolved (an ISO string from a preset, a Date typed in
   * the column). A date filter that still comes from the edited preset (it
   * keeps its position) reuses the preset's saved number: converting the
   * resolved date back would pin "last 7 days" to a fixed day on save.
   */
  private buildConditionsFromFilters(
    filters: Record<string, TableFilterEntry | null | undefined>,
    preset?: FilterPreset,
  ): DialogCondition[] {
    const savedDays = new Map<string, number>()
    for (const c of preset?.conditions ?? []) {
      if (this.getFieldType(c.field) === 'date' && typeof c.value === 'number') savedDays.set(c.field, c.value)
    }

    const conditions: { cond: DialogCondition; position: number }[] = []
    for (const [field, val] of Object.entries(filters)) {
      if (val && val.value !== null && val.value !== undefined && val.value !== '') {
        let value: unknown = val.value
        if (this.getFieldType(field) === 'date') {
          const saved = savedDays.get(field)
          value = saved !== undefined && val.position ? saved : this.toDaysAgo(value)
        }

        conditions.push({
          cond: {
            field,
            matchMode: val.matchMode ?? val.match_mode ?? 'contains',
            value,
            operator: val.operator ?? 'and',
          },
          position: val.position ?? Number.MAX_SAFE_INTEGER,
        })
      }
    }
    // Sort by position so the dialog matches the chip order
    conditions.sort((a, b) => a.position - b.position)
    return conditions.map(c => c.cond)
  }

  /**
   * The "days ago" option closest to a date — the only kind of date the dialog
   * can show. Counted in calendar days, so a filter resolved to today's
   * midnight is still "today" in the afternoon. Numbers pass through; values
   * that are not dates are left as they are.
   */
  private toDaysAgo(value: unknown): unknown {
    if (typeof value === 'number') return value
    const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
    if (!date || Number.isNaN(date.getTime())) return value
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const day = new Date(date)
    day.setHours(0, 0, 0, 0)
    const diffDays = Math.round((today.getTime() - day.getTime()) / DAY_MS)
    return DAYS_AGO_OPTIONS.reduce(
      (prev, curr) => (Math.abs(curr.value - diffDays) < Math.abs(prev.value - diffDays) ? curr : prev),
      DAYS_AGO_OPTIONS[0],
    ).value
  }

  /** Copy of the preset with its relative dates resolved, ready to apply to a table */
  private withResolvedDates(preset: FilterPreset): FilterPreset {
    return { ...preset, conditions: this.resolveRelativeDates(preset.conditions ?? []) }
  }

  /**
   * Date conditions are saved as "days ago" numbers so a preset like
   * "created in the last 7 days" stays relative. The API expects a date, so
   * resolve them to local midnight N days ago — the same ISO value the
   * table's own date filter sends.
   */
  private resolveRelativeDates(conditions: FilterCondition[]): FilterCondition[] {
    return conditions.map((cond) => {
      if (this.getFieldType(cond.field) !== 'date' || typeof cond.value !== 'number') return cond
      const d = new Date()
      d.setDate(d.getDate() - cond.value)
      d.setHours(0, 0, 0, 0)
      return { ...cond, value: d.toISOString() }
    })
  }

  /** Filter out incomplete condition rows */
  private getValidConditions(): FilterCondition[] {
    return this.dialogConditions()
      .filter(c => c.field && c.matchMode && c.value !== null && c.value !== undefined && c.value !== '')
      .map((c, i) => ({ field: c.field, matchMode: c.matchMode, value: c.value, operator: c.operator ?? 'and', position: i + 1 }))
  }
}
