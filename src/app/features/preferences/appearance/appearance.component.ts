import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'
import { ButtonModule } from 'primeng/button'
import { SelectButtonModule } from 'primeng/selectbutton'
import { AuthService } from '@/app/core/services/auth.service'
import { isOwnerRole } from '@/app/shared/utils/costing.util'
import { BrandThemeService } from '@/app/layout/service/brand-theme.service'
import {
  BrandTheme,
  DEFAULT_BRAND_THEME,
  LAYOUT_THEMES,
  MENU_MODES,
  PRESETS,
  PRIMARY_COLORS,
  PresetName,
  primaryPalette,
  SURFACES,
} from '@/app/layout/service/brand-theme'

/**
 * Preferences → Appearance (OWNER only): the company's look for every user.
 * Each change previews at once on this screen; Save stores it for everyone,
 * and leaving without saving puts the stored look back.
 */
@Component({
  selector: 'app-appearance',
  standalone: true,
  imports: [FormsModule, TranslateModule, ButtonModule, SelectButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './appearance.component.html',
  styles: [
    `
      .swatch {
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        border: 1px solid var(--p-content-border-color);
        padding: 0;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 0.75rem;
        outline-offset: 2px;
      }
      .swatch-selected {
        outline: 2px solid var(--p-primary-color);
      }
      .swatch-default {
        background: var(--p-content-background);
        color: var(--p-text-muted-color);
      }
    `,
  ],
})
export default class AppearanceComponent implements OnDestroy {
  private readonly brand = inject(BrandThemeService)
  private readonly messages = inject(MessageService)
  private readonly translate = inject(TranslateService)

  readonly isOwner = isOwnerRole(inject(AuthService).getAuthUserInfo()?.role)

  /** The look being edited (already previewed on screen). */
  readonly draft = signal<BrandTheme>(this.brand.saved())
  readonly saving = signal(false)
  readonly dirty = computed(() => !sameTheme(this.draft(), this.brand.saved()))
  readonly isDefault = computed(() => sameTheme(this.draft(), DEFAULT_BRAND_THEME))

  readonly presets = Object.keys(PRESETS) as PresetName[]
  readonly menuModes = MENU_MODES.map(value => ({ value, key: `appearance.menu_${value}` }))
  readonly layoutThemes = LAYOUT_THEMES.map(value => ({ value, key: `appearance.sidebar_${value}` }))
  readonly surfaces = SURFACES

  /** Swatches of the primary colors in the chosen preset ('noir' shows the text color). */
  readonly primaryColors = computed(() =>
    PRIMARY_COLORS.map(name => ({
      name,
      color: name === 'noir' ? 'var(--text-color)' : (primaryPalette(this.draft().preset, name)?.['500'] ?? ''),
    }))
  )

  set<K extends keyof BrandTheme>(key: K, value: BrandTheme[K]): void {
    if (value === null && key !== 'surface') return // a select button cleared by a second click
    this.draft.update(t => ({ ...t, [key]: value }))
    this.brand.apply(this.draft())
  }

  resetToDefault(): void {
    this.draft.set(DEFAULT_BRAND_THEME)
    this.brand.apply(DEFAULT_BRAND_THEME)
  }

  discard(): void {
    this.draft.set(this.brand.saved())
    this.brand.apply(this.brand.saved())
  }

  save(): void {
    this.saving.set(true)
    this.brand.save(this.draft()).subscribe({
      next: stored => {
        this.draft.set(stored)
        this.saving.set(false)
        this.messages.add({ severity: 'success', summary: this.translate.instant('appearance.saved') })
      },
      error: () => {
        this.saving.set(false)
        this.messages.add({ severity: 'error', summary: this.translate.instant('appearance.save_error') })
      },
    })
  }

  ngOnDestroy(): void {
    // An unsaved preview stays on this screen only while it is open.
    if (this.dirty()) this.brand.apply(this.brand.saved())
  }
}

function sameTheme(a: BrandTheme, b: BrandTheme): boolean {
  return (
    a.preset === b.preset &&
    a.primary === b.primary &&
    a.surface === b.surface &&
    a.menuMode === b.menuMode &&
    a.layoutTheme === b.layoutTheme
  )
}
