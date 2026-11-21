import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { MultiSelect, MultiSelectModule } from 'primeng/multiselect'
import { ButtonModule } from 'primeng/button'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { NO_FACILITY_ID, ScopeFacility } from '@/app/core/types/facility.types'
import { TranslateLanService } from '@/app/core/services/translate-lan.service'
import { zoneLabel } from '@/app/shared/utils/time-zone.util'

/** IANA zone of the browser. */
function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Global facility scope selector, rendered in the topbar.
 *
 * Multi-check by design: the user narrows the whole app to one or more
 * facilities at once. An empty selection means "all facilities", which is the
 * default and keeps every table behaving exactly as it did before this feature.
 *
 * Selection is buffered and committed on Apply, matching the Clear/Apply
 * footer every table column filter already uses
 * (`nuvex-filter-multiselect-panel`). Committing per checkbox would refetch
 * every open table on each click, which is why the immediate-apply variant was
 * dropped.
 *
 * With a single reachable facility the control stays visible but disabled,
 * showing that facility: there is nothing to choose, yet the user should still
 * see which facility the app is scoped to.
 *
 * The first option, "- No Facility", scopes the app to the records that have
 * no facility (operator-level webhooks and API keys, pre-check-in parcels).
 * Modules whose records always carry one simply come back empty for it.
 */
@Component({
  selector: 'app-facility-scope-selector',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MultiSelectModule,
    ButtonModule,
    TranslateModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (scope.all().length > 0) {
      <p-multiselect
        #ms
        class="facility-scope"
        styleClass="facility-scope-select"
        [options]="options()"
        [ngModel]="displayedIds()"
        [disabled]="scope.hasSingleFacility()"
        (ngModelChange)="onPendingChange($event)"
        (onPanelHide)="onPanelHide()"
        optionLabel="name"
        optionValue="id"
        display="chip"
        [filter]="options().length > 8"
        filterBy="name,code"
        [showToggleAll]="true"
        [maxSelectedLabels]="1"
        [selectedItemsLabel]="selectedItemsLabel()"
        [placeholder]="'labels.all_facilities' | translate"
        [ariaLabel]="'labels.facility' | translate"
        [showClear]="!scope.isAll()"
        (onClear)="onClearIcon()"
        appendTo="body"
        panelStyleClass="facility-scope-panel"
      >
        <ng-template let-facility pTemplate="item">
          <div class="facility-scope-option">
            <span class="facility-scope-name">{{ facility.name }}</span>
            @if (facility.code) {
              <span class="facility-scope-code text-muted-color text-xs">{{
                facility.code
              }}</span>
            }
          </div>
        </ng-template>

        <ng-template pTemplate="footer">
          <div class="filter-panel-footer">
            <p-button
              [label]="'buttons.clear' | translate"
              icon="pi pi-times"
              severity="secondary"
              [outlined]="true"
              size="small"
              (onClick)="onClear()"
            />
            <p-button
              [label]="'buttons.apply' | translate"
              icon="pi pi-check"
              size="small"
              (onClick)="onApply()"
            />
          </div>
        </ng-template>
      </p-multiselect>
      <!-- Dates follow the facilities' zone: say so when it is not the browser's. -->
      @if (zoneHint(); as hint) {
        <span class="zone-hint hidden md:inline-flex items-center gap-1 ml-2 text-xs text-surface-500 whitespace-nowrap" [title]="hint.zone">
          <i class="pi pi-clock text-xs"></i>
          @if (hint.mixed) {
            {{ 'labels.zone_hint_mixed' | translate }}
          } @else {
            {{ 'labels.zone_hint' | translate: { city: hint.city } }}
          }
        </span>
      }
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
      }
      /* Keep the control compact so it sits comfortably beside the
         icon-sized topbar actions on smaller viewports. */
      :host ::ng-deep .facility-scope-select {
        min-width: 9rem;
        max-width: 15rem;
      }
      /* A long facility name ends in an ellipsis instead of being cut mid-glyph.
         PrimeNG lays the label out as flex, where text-overflow has no effect. */
      :host ::ng-deep .facility-scope-select .p-multiselect-label {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /*
       * The dropdown is appended to <body>, so it is outside this component's
       * view and no \`:host\`-prefixed rule can reach it — hence the bare
       * \`::ng-deep\`, which compiles to a plain global selector. The class name
       * is unique to this component to keep that global footprint contained.
       *
       * PrimeNG sizes the overlay to the widest thing inside it and only sets
       * \`min-width\` from the trigger; with the search box present the header
       * pushed the panel to ~800px. Sizing to \`max-content\` under a cap makes
       * it follow the labels instead.
       */
      ::ng-deep .facility-scope-panel {
        width: max-content;
        max-width: min(20rem, calc(100vw - 2rem));
      }
      ::ng-deep .facility-scope-panel .p-multiselect-header {
        /* Stop the search input's intrinsic width from setting the floor. */
        min-width: 0;
      }
      ::ng-deep .facility-scope-panel .p-multiselect-filter-container {
        min-width: 0;
      }
      ::ng-deep .facility-scope-panel .p-multiselect-filter {
        /* An <input> reports a ~20-character intrinsic width to max-content;
           without this it, not the labels, decides how wide the panel gets. */
        min-width: 0;
        width: 100%;
      }

      /* Long facility names ellipsize rather than widen the panel; the code
         keeps its natural width so it never gets clipped away entirely. */
      .facility-scope-option {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
        overflow: hidden;
      }
      .facility-scope-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .facility-scope-code {
        flex-shrink: 0;
      }
      /* Mirrors filter-multiselect-panel's footer so the topbar selector and
         the table column filters read as the same control. */
      .filter-panel-footer {
        display: flex;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-top: 1px solid var(--p-surface-200);
        justify-content: flex-end;
      }
      /*
       * Phones and tablets keep the selector — operators in the warehouse use
       * them, and the scope is just as global there. The tab bar wraps to its
       * own row below 768px, so the control shares the first row only with the
       * logo and two icon buttons: it shrinks with the viewport and the label
       * ellipsizes instead of pushing the icons off screen.
       */
      @media (max-width: 768px) {
        :host ::ng-deep .facility-scope-select {
          min-width: 0;
          width: clamp(6.5rem, 38vw, 12rem);
        }
      }
    `,
  ],
})
export class FacilityScopeSelectorComponent implements OnInit {
  protected readonly scope = inject(FacilityScopeService)
  private readonly translate = inject(TranslateService)
  private readonly translateLan = inject(TranslateLanService)

  /**
   * Shown when the times on screen are not the browser's: the facilities in
   * scope are in another zone, or in several. Null when they match.
   */
  protected readonly zoneHint = computed(() => {
    const zone = this.scope.zone()
    const mixed = this.scope.mixedZones()
    if (!mixed && zone === browserZone()) return null
    return { zone, mixed, city: zoneLabel(zone) }
  })

  /** Used to close the panel once a selection is committed. */
  @ViewChild('ms') private readonly ms?: MultiSelect

  /**
   * Buffered selection. Only Apply writes it through to the service, so
   * ticking three boxes costs one app-wide refetch instead of three.
   */
  protected readonly pendingIds = signal<string[]>([])

  /**
   * "No facility" first, then every facility the user can reach. Reading
   * `changeLanguage()` keeps the label in step with language switches.
   */
  protected readonly options = computed<ScopeFacility[]>(() => {
    this.translateLan.changeLanguage()
    const noFacility: ScopeFacility = {
      id: NO_FACILITY_ID,
      name: this.translate.instant('labels.no_facility_option'),
    }
    return [noFacility, ...this.scope.all()]
  })

  /**
   * What the trigger shows. A user with a single facility keeps the default
   * `[]` selection, which would render as the "All facilities" placeholder;
   * show that facility instead, since it is the whole scope.
   */
  protected readonly displayedIds = computed(() =>
    this.scope.hasSingleFacility() ? [this.scope.all()[0].id] : this.pendingIds()
  )

  /**
   * Label the trigger shows for a non-empty selection.
   *
   * In chip mode PrimeNG renders this label as soon as `maxSelectedLabels` (1)
   * is reached — a single facility included — so that case returns the
   * facility's own name rather than "1 facilities". It also covers the locked
   * trigger of a user who can reach only one facility.
   *
   * Otherwise PrimeNG interpolates `{0}` with the number of selected items, so
   * `labels.n_facilities` ("{0} facilities") renders as "3 facilities".
   * Checking every option — "No facility" included — is no narrowing at all,
   * so that case reads
   * "All facilities" — matching the placeholder shown for an empty selection.
   *
   * Driven by `displayedIds` rather than the committed scope so the trigger
   * tracks what the open panel shows.
   *
   * Reading `changeLanguage()` keeps the computed reactive to language
   * switches, since `translate.instant()` is a one-shot lookup.
   */
  protected readonly selectedItemsLabel = computed(() => {
    this.translateLan.changeLanguage()
    const ids = this.displayedIds()
    if (ids.length === 1) {
      const only = this.options().find((f) => f.id === ids[0])
      if (only) return only.name
    }
    const key = this.scope.coversAll(ids)
      ? 'labels.all_facilities'
      : 'labels.n_facilities'
    return this.translate.instant(key)
  })

  constructor() {
    // Keep the buffer in step with the committed scope: restore from
    // localStorage on load, prune() dropping a revoked facility, or the
    // trigger's own clear icon.
    effect(() => {
      this.pendingIds.set([...this.scope.selectedIds()])
    })
  }

  ngOnInit(): void {
    this.scope.restoreSelection()
    this.scope.load()
  }

  protected onPendingChange(ids: string[]): void {
    this.pendingIds.set(ids ?? [])
  }

  protected onApply(): void {
    this.scope.setSelection(this.pendingIds())
    this.ms?.hide()
  }

  protected onClear(): void {
    this.pendingIds.set([])
    this.scope.clear()
    this.ms?.hide()
  }

  /** The trigger's clear icon commits immediately; keep the buffer in step. */
  protected onClearIcon(): void {
    this.scope.clear()
    this.pendingIds.set([])
  }

  /**
   * Dismissing the panel without pressing Apply discards the buffer, so the
   * trigger label can never advertise a scope the tables are not using.
   */
  protected onPanelHide(): void {
    this.pendingIds.set([...this.scope.selectedIds()])
  }
}
