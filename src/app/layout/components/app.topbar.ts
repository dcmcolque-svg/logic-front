import {
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core'
import { RouterModule } from '@angular/router'
import { CommonModule, isPlatformBrowser, NgOptimizedImage } from '@angular/common'
import { StyleClassModule } from 'primeng/styleclass'
import { LayoutService } from '@/app/layout/service/layout.service'
import { Ripple } from 'primeng/ripple'
import { InputText } from 'primeng/inputtext'
import { ButtonModule } from 'primeng/button'
import { IconField } from 'primeng/iconfield'
import { InputIcon } from 'primeng/inputicon'
import { FormsModule } from '@angular/forms'
import { AuthService } from '../../core/services/auth.service'
import { SelectButton } from 'primeng/selectbutton'
import { Divider } from 'primeng/divider'
import { RouteMenuComponent } from './route-menu.component'
import { Popover } from 'primeng/popover'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TranslateLanService } from '../../core/services/translate-lan.service'
import { RadioButtonModule } from 'primeng/radiobutton'
import { $t, updatePreset, updateSurfacePalette } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'
import Lara from '@primeuix/themes/lara'
import Nora from '@primeuix/themes/nora'
import { PrimeNG } from 'primeng/config'
import { DialogService, DynamicDialogModule } from 'primeng/dynamicdialog'
import { AppEditUserProfile } from './app.edit-user-profile'
import { OperatorBrandingDialogComponent } from '@/app/features/preferences/operator-branding/operator-branding-dialog.component'
import { FacilityScopeSelectorComponent } from './facility-scope-selector.component'
import { environment } from '@/environments/environment'

const presets = { Aura, Lara, Nora } as const
type KeyOfType<T> = keyof T extends infer U ? U : never

interface SurfacesType {
  name?: string
  palette?: Record<string, string>
}

@Component({
  selector: '[app-topbar]',
  standalone: true,
  imports: [
    RouterModule,
    CommonModule,
    StyleClassModule,
    FormsModule,
    Ripple,
    InputText,
    ButtonModule,
    IconField,
    InputIcon,
    SelectButton,
    Divider,
    RouteMenuComponent,
    Popover,
    TranslateModule,
    RadioButtonModule,
    NgOptimizedImage,
    DynamicDialogModule,
    OperatorBrandingDialogComponent,
    FacilityScopeSelectorComponent,
  ],
  providers: [DialogService],
  template: `
    <div class="layout-topbar">
      <a class="app-logo" routerLink="/">
        <img
          alt="app logo"
          [ngSrc]="logo()"
          width="155"
          height="40"
        />
        <span class="app-name"></span>
      </a>

      <button
        #menubutton
        class="topbar-menubutton p-link cursor-pointer"
        type="button"
        (click)="onMenuButtonClick()"
      >
        <span></span>
      </button>

      <ul class="topbar-menu">
        @for (item of tabs(); track item.routerLink; let i = $index) {
          <li>
            <a
              [routerLink]="item.routerLink"
              routerLinkActive="active-route"
              [routerLinkActiveOptions]="
                item.routerLinkActiveOptions || {
                  paths: 'exact',
                  queryParams: 'ignored',
                  fragment: 'ignored',
                  matrixParams: 'ignored',
                }
              "
              [fragment]="item.fragment"
              [queryParamsHandling]="item.queryParamsHandling"
              [preserveFragment]="item.preserveFragment!"
              [skipLocationChange]="item.skipLocationChange!"
              [replaceUrl]="item.replaceUrl!"
              [state]="item.state"
              [queryParams]="item.queryParams"
            >
              <span>{{ item.labelKey ? ('pages.' + item.labelKey | translate) : item.label }}</span>
            </a>
            <i class="pi pi-times" (click)="removeTab($event, i)"></i>
          </li>
        }
        @if (tabs().length === 0) {
          <li class="topbar-menu-empty">
            {{ 'topbar.openTabMac' | translate }}
          </li>
        }
      </ul>

      <!-- Contendor para acciones del topbar derecha -->
      <div class="topbar-actions">
        <!-- Global facility scope — narrows every base-data-table in the app -->
         <!-- TODO DESCOMENTAR CUANDO EL TICKET ESTE APROBADO -->
        <app-facility-scope-selector />

        <!-- Settings gear (route-menu) -->
        <app-route-menu class="ml-2 sm:ml-0"></app-route-menu>

        <!-- Apps grid button -->
        <p-button
          [rounded]="true"
          severity="secondary"
          (click)="appsOverlay.toggle($event)"
          class="hidden md:inline-flex"
        >
          <ng-template pTemplate="icon">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M6.6 2.4C6.6 3.73 5.53 4.8 4.2 4.8C2.87 4.8 1.8 3.73 1.8 2.4C1.8 1.07 2.87 0 4.2 0C5.53 0 6.6 1.07 6.6 2.4Z" fill="currentColor"/>
              <path d="M4.2 14.4C5.53 14.4 6.6 13.33 6.6 12C6.6 10.67 5.53 9.6 4.2 9.6C2.87 9.6 1.8 10.67 1.8 12C1.8 13.33 2.87 14.4 4.2 14.4Z" fill="currentColor"/>
              <path d="M4.2 24C5.53 24 6.6 22.93 6.6 21.6C6.6 20.27 5.53 19.2 4.2 19.2C2.87 19.2 1.8 20.27 1.8 21.6C1.8 22.93 2.87 24 4.2 24Z" fill="currentColor"/>
              <path d="M14.4 2.4C14.4 3.73 13.33 4.8 12 4.8C10.67 4.8 9.6 3.73 9.6 2.4C9.6 1.07 10.67 0 12 0C13.33 0 14.4 1.07 14.4 2.4Z" fill="currentColor"/>
              <path d="M12 14.4C13.33 14.4 14.4 13.33 14.4 12C14.4 10.67 13.33 9.6 12 9.6C10.67 9.6 9.6 10.67 9.6 12C9.6 13.33 10.67 14.4 12 14.4Z" fill="currentColor"/>
              <path d="M12 24C13.33 24 14.4 22.93 14.4 21.6C14.4 20.27 13.33 19.2 12 19.2C10.67 19.2 9.6 20.27 9.6 21.6C9.6 22.93 10.67 24 12 24Z" fill="currentColor"/>
              <path d="M22.2 2.4C22.2 3.73 21.13 4.8 19.8 4.8C18.47 4.8 17.4 3.73 17.4 2.4C17.4 1.07 18.47 0 19.8 0C21.13 0 22.2 1.07 22.2 2.4Z" fill="currentColor"/>
              <path d="M19.8 14.4C21.13 14.4 22.2 13.33 22.2 12C22.2 10.67 21.13 9.6 19.8 9.6C18.47 9.6 17.4 10.67 17.4 12C17.4 13.33 18.47 14.4 19.8 14.4Z" fill="currentColor"/>
              <path d="M19.8 24C21.13 24 22.2 22.93 22.2 21.6C22.2 20.27 21.13 19.2 19.8 19.2C18.47 19.2 17.4 20.27 17.4 21.6C17.4 22.93 18.47 24 19.8 24Z" fill="currentColor"/>
            </svg>
          </ng-template>
        </p-button>


        <!-- Apps Overlay -->
        <p-popover #appsOverlay styleClass="apps-popover">
          <div class="grid grid-cols-2" style="width: 23rem">
            @for (item of itemsApps; track item.label) {
              <div
                (click)="navigateTo(item)"
                style="cursor: pointer"
                class="flex flex-col items-center p-4 hover:bg-emphasis rounded-border transition-colors duration-150"
              >
                <img
                  [src]="item.img"
                  [alt]="item.label"
                  style="width: 3rem; height: 3rem"
                />
                <span class="ml-2 mt-2">{{ item.label }}</span>
              </div>
            }
          </div>
        </p-popover>

        <!-- Profile -->
        <div class="topbar-profile">
          <button
            class="topbar-profile-button"
            type="button"
            pStyleClass="@next"
            enterFromClass="hidden"
            enterActiveClass="animate-scalein"
            leaveToClass="hidden"
            leaveActiveClass="animate-fadeout"
            [hideOnOutsideClick]="true"
          >
            <img
              alt="avatar"
              [src]="avatarUrl()"
              class="profile-image-avatar"
            />
            <span class="profile-details">
              <span class="profile-name">{{ username() }}</span>
              <span class="profile-job">{{ role() }}</span>
            </span>
            <i class="pi pi-angle-down"></i>
          </button>
          <ul
            class="list-none hidden p-2 sm:p-4 m-0 rounded-border shadow absolute bg-surface-0 dark:bg-surface-900 origin-top mt-2 right-0 top-auto overflow-y-auto"
            style="width: 22rem; z-index: 1100; max-height: 85vh;"
          >
            <!-- Profile section -->
            <li class="flex items-start flex-col gap-2">
              <div class="text-sm font-bold">
                {{ 'topbar.profile' | translate }}
              </div>
              <a
                pRipple
                class="flex p-2 rounded-border w-full items-center hover:bg-emphasis transition-colors duration-150 cursor-pointer"
                (click)="openEditProfile()"
              >
                <i class="pi pi-user mr-4"></i>
                <span>{{ 'topbar.edit_profile' | translate }}</span>
              </a>

              <!-- Theme (Light / Dark) -->
              <div class="text-sm font-bold mt-2">
                {{ 'topbar.theme' | translate }}
              </div>
              <p-selectbutton
                [options]="themeOptions"
                [(ngModel)]="selectedTheme"
                optionLabel="label"
                [allowEmpty]="false"
                (onChange)="handleThemeChange($event)"
                [style]="{
                  width: '100%',
                  display: 'flex',
                  'justify-content': 'center',
                }"
              >
                <ng-template let-item pTemplate="item">
                  <div class="flex items-center justify-center w-full">
                    <i
                      [class]="'pi ' + item.icon + ' mr-2'"
                      style="font-size: 1.2rem"
                    ></i>
                    <span class="text-center w-full" style="min-width: 3rem">{{
                      item.label | translate
                    }}</span>
                  </div>
                </ng-template>
              </p-selectbutton>

              <!-- Language -->
              <div class="text-sm font-bold mt-2">
                {{ 'topbar.language' | translate }}
              </div>
              <p-selectbutton
                [options]="languageOptions"
                [(ngModel)]="selectedLanguage"
                optionLabel="label"
                [allowEmpty]="false"
                (onChange)="handleLanguageChange($event)"
                [style]="{
                  width: '100%',
                  display: 'flex',
                  'justify-content': 'center',
                }"
              >
                <ng-template let-item pTemplate="item">
                  <div class="flex items-center justify-center w-full">
                    <img
                      [src]="item.icon"
                      [alt]="item.label"
                      class="mr-2"
                      style="width: 1.3rem; height: 1.3rem; border-radius: 50%"
                    />
                    <span class="text-center w-full" style="min-width: 3rem">{{
                      item.label | translate
                    }}</span>
                  </div>
                </ng-template>
              </p-selectbutton>

              <p-divider
                [style]="{ 'margin-top': '0.5rem', 'margin-bottom': '0.5rem' }"
              ></p-divider>

              <!-- Logos / Branding -->
              <a
                pRipple
                id="topbar-branding-btn"
                class="flex p-2 rounded-border w-full items-center hover:bg-emphasis transition-colors duration-150 cursor-pointer"
                (click)="openBrandingDialog()"
              >
                <i class="pi pi-image mr-4"></i>
                <span>{{ 'topbar.branding' | translate }}</span>
              </a>

              <!-- ╔══════════════════════════════════╗ -->
              <!-- ║       SETTINGS SECTION           ║ -->
              <!-- ╚══════════════════════════════════╝ -->
              <p-divider
                [style]="{ 'margin-top': '0.5rem', 'margin-bottom': '0.5rem' }"
              ></p-divider>

              <a
                pRipple
                class="flex p-2 rounded-border w-full items-center hover:bg-emphasis transition-colors duration-150 cursor-pointer"
                (click)="showSettings.set(!showSettings())"
              >
                <i class="pi pi-cog mr-4"></i>
                <span class="flex-1">{{ 'topbar.visual_settings' | translate }}</span>
                <i
                  [class]="
                    showSettings() ? 'pi pi-chevron-up' : 'pi pi-chevron-down'
                  "
                  style="font-size: 0.75rem"
                ></i>
              </a>

              @if (showSettings()) {
                <div
                  class="w-full flex flex-col gap-3 pl-2 pr-2 pb-2 animate-fadein"
                >
                  <div>
                    <span class="text-xs font-semibold text-surface-500 uppercase tracking-wide">Layout Theme</span>
                    <div class="flex flex-col gap-2 mt-2">
                      <div class="flex items-center gap-2">
                        <p-radio-button name="layoutTheme" value="colorScheme" [(ngModel)]="layoutThemeValue" (ngModelChange)="onLayoutThemeChange('colorScheme')"></p-radio-button>
                        <label class="text-sm cursor-pointer">Color Scheme</label>
                      </div>
                      <div class="flex items-center gap-2">
                        <p-radio-button name="layoutTheme" value="primaryColor" [(ngModel)]="layoutThemeValue" (ngModelChange)="onLayoutThemeChange('primaryColor')" [disabled]="layoutService.isDarkTheme()"></p-radio-button>
                        <label class="text-sm cursor-pointer" [class.text-surface-400]="layoutService.isDarkTheme()">Primary Color (Light Only)</label>
                      </div>
                    </div>
                  </div>
                  <div>
                    <span class="text-xs font-semibold text-surface-500 uppercase tracking-wide">Primary</span>
                    <div class="pt-2 flex gap-2 flex-wrap">
                      @for (pc of primaryColors(); track pc.name) {
                        <button type="button" [title]="pc.name ?? ''" (click)="updateColors($event, 'primary', pc)" [ngClass]="{ 'outline outline-primary': pc.name === selectedPrimaryColor() }" class="cursor-pointer w-5 h-5 rounded-full flex shrink-0 items-center justify-center outline-offset-1 shadow border-0 p-0" [style.background-color]="pc.name === 'noir' ? 'var(--text-color)' : pc.palette?.['500']"></button>
                      }
                    </div>
                  </div>
                  <div>
                    <span class="text-xs font-semibold text-surface-500 uppercase tracking-wide">Menu Type</span>
                    <div class="flex flex-wrap gap-x-6 gap-y-2 mt-2">
                      <div class="flex items-center gap-2"><p-radio-button name="menuMode" value="static" [(ngModel)]="menuModeValue" (ngModelChange)="onMenuModeChange($event)"></p-radio-button><label class="text-sm cursor-pointer">Static</label></div>
                      <div class="flex items-center gap-2"><p-radio-button name="menuMode" value="overlay" [(ngModel)]="menuModeValue" (ngModelChange)="onMenuModeChange($event)"></p-radio-button><label class="text-sm cursor-pointer">Overlay</label></div>
                      <div class="flex items-center gap-2"><p-radio-button name="menuMode" value="slim" [(ngModel)]="menuModeValue" (ngModelChange)="onMenuModeChange($event)"></p-radio-button><label class="text-sm cursor-pointer">Slim</label></div>
                      <div class="flex items-center gap-2"><p-radio-button name="menuMode" value="slim-plus" [(ngModel)]="menuModeValue" (ngModelChange)="onMenuModeChange($event)"></p-radio-button><label class="text-sm cursor-pointer">Slim+</label></div>
                    </div>
                  </div>
                  <div>
                    <span class="text-xs font-semibold text-surface-500 uppercase tracking-wide">Presets</span>
                    <div class="mt-2"><p-selectbutton [options]="presetOptions" [(ngModel)]="presetValue" (ngModelChange)="onPresetChange($event)" [allowEmpty]="false" size="small"></p-selectbutton></div>
                  </div>
                  <div>
                    <span class="text-xs font-semibold text-surface-500 uppercase tracking-wide">Surface</span>
                    <div class="pt-2 flex gap-2 flex-wrap">
                      @for (surface of surfaces; track surface.name) {
                        <button type="button" [title]="surface.name ?? ''" (click)="updateColors($event, 'surface', surface)" class="cursor-pointer w-5 h-5 rounded-full flex shrink-0 items-center justify-center p-0 outline-offset-1 border-0" [ngClass]="{ 'outline outline-primary': selectedSurface() ? selectedSurface() === surface.name : layoutService.isDarkTheme() ? surface.name === 'zinc' : surface.name === 'slate' }" [style.background-color]="surface.palette?.['500']"></button>
                      }
                    </div>
                  </div>
                </div>
              }

              <p-divider
                [style]="{ 'margin-top': '0.5rem', 'margin-bottom': '0.5rem' }"
              ></p-divider>

              <!-- Logout -->
              <a
                pRipple
                class="flex p-2 rounded-border w-full items-center hover:bg-emphasis transition-colors duration-150 cursor-pointer"
                style="color: var(--red-500)"
                (click)="logout()"
              >
                @if (loadingLogout()) {
                  <i class="pi pi-spin pi-spinner mr-4"></i>
                } @else {
                  <i class="pi pi-sign-out mr-4"></i>
                }
                <span>{{ 'topbar.logout' | translate }}</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Operator Branding Dialog -->
    <app-operator-branding-dialog
      [visible]="showBrandingDialog()"
      (hide)="showBrandingDialog.set(false)"
      (saved)="showBrandingDialog.set(false)"
    />
  `,
  host: {
    class: 'layout-topbar',
  },
})
export class AppTopbar implements OnInit {
  layoutService   = inject(LayoutService)
  authService     = inject(AuthService)
  translateService = inject(TranslateService)
  translateLanService = inject(TranslateLanService)
  primeng         = inject(PrimeNG)
  platformId      = inject(PLATFORM_ID)
  dialogService   = inject(DialogService)

  searchInput = viewChild<ElementRef>('searchinput')
  menuButton = viewChild<ElementRef>('menubutton')

  searchActive = signal<boolean>(false)
  loadingLogout = signal(false)
  username = signal('')
  role = signal('')
  avatarUrl = signal('/layout/images/avatar.png')
  showSettings       = signal(false)
  showBrandingDialog = signal(false)

  tabs = computed(() => this.layoutService.tabs())

  logo = computed(() => {
    const path = '/layout/images/logo-'
    const logo =
      this.layoutService.isDarkTheme() ||
      this.layoutService.layoutConfig().layoutTheme === 'primaryColor'
        ? 'light.png'
        : 'dark.png'
    return path + logo
  })

  themeOptions = [
    { label: 'topbar.themeLight', value: 'light', icon: 'pi-sun' },
    { label: 'topbar.themeDark', value: 'dark', icon: 'pi-moon' },
  ]
  selectedTheme = this.themeOptions[0]

  languageOptions: { label: string; value: string; icon: string }[] = [
    { label: 'labels.english', value: 'en', icon: '/layout/icons/um.png' },
    { label: 'labels.spanish', value: 'es', icon: '/layout/icons/es.png' },
  ]
  selectedLanguage: { label: string; value: string; icon: string }

  itemsApps = [
    {
      label: 'Omniorders',
      img: '/layout/apps/omniorder_logo.svg',
      link: 'https://app.omniorders.com/',
    },
    { label: 'Ionflows', img: '/layout/apps/ionflow_logo.svg', link: environment.ionflowAppUrl },
    {
      label: 'Xenvio',
      img: '/layout/apps/xenvio_logo.svg',
      link: 'https://x5.shipedge.com/',
    },
  ]

  // ── Settings config mirrors ──
  presetOptions = Object.keys(presets)
  presetValue = ''
  menuModeValue = ''
  layoutThemeValue = ''

  selectedPrimaryColor = computed(
    () => this.layoutService.layoutConfig().primary
  )
  selectedSurface = computed(() => this.layoutService.layoutConfig().surface)

  surfaces: SurfacesType[] = [
    {
      name: 'slate',
      palette: {
        0: '#ffffff',
        50: '#f8fafc',
        100: '#f1f5f9',
        200: '#e2e8f0',
        300: '#cbd5e1',
        400: '#94a3b8',
        500: '#64748b',
        600: '#475569',
        700: '#334155',
        800: '#1e293b',
        900: '#0f172a',
        950: '#020617',
      },
    },
    {
      name: 'gray',
      palette: {
        0: '#ffffff',
        50: '#f9fafb',
        100: '#f3f4f6',
        200: '#e5e7eb',
        300: '#d1d5db',
        400: '#9ca3af',
        500: '#6b7280',
        600: '#4b5563',
        700: '#374151',
        800: '#1f2937',
        900: '#111827',
        950: '#030712',
      },
    },
    {
      name: 'zinc',
      palette: {
        0: '#ffffff',
        50: '#fafafa',
        100: '#f4f4f5',
        200: '#e4e4e7',
        300: '#d4d4d8',
        400: '#a1a1aa',
        500: '#71717a',
        600: '#52525b',
        700: '#3f3f46',
        800: '#27272a',
        900: '#18181b',
        950: '#09090b',
      },
    },
    {
      name: 'neutral',
      palette: {
        0: '#ffffff',
        50: '#fafafa',
        100: '#f5f5f5',
        200: '#e5e5e5',
        300: '#d4d4d4',
        400: '#a3a3a3',
        500: '#737373',
        600: '#525252',
        700: '#404040',
        800: '#262626',
        900: '#171717',
        950: '#0a0a0a',
      },
    },
    {
      name: 'stone',
      palette: {
        0: '#ffffff',
        50: '#fafaf9',
        100: '#f5f5f4',
        200: '#e7e5e4',
        300: '#d6d3d1',
        400: '#a8a29e',
        500: '#78716c',
        600: '#57534e',
        700: '#44403c',
        800: '#292524',
        900: '#1c1917',
        950: '#0c0a09',
      },
    },
    {
      name: 'soho',
      palette: {
        0: '#ffffff',
        50: '#ececec',
        100: '#dedfdf',
        200: '#c4c4c6',
        300: '#adaeb0',
        400: '#97979b',
        500: '#7f8084',
        600: '#6a6b70',
        700: '#55565b',
        800: '#3f4046',
        900: '#2c2c34',
        950: '#16161d',
      },
    },
    {
      name: 'viva',
      palette: {
        0: '#ffffff',
        50: '#f3f3f3',
        100: '#e7e7e8',
        200: '#cfd0d0',
        300: '#b7b8b9',
        400: '#9fa1a1',
        500: '#87898a',
        600: '#6e7173',
        700: '#565a5b',
        800: '#3e4244',
        900: '#262b2c',
        950: '#0e1315',
      },
    },
    {
      name: 'ocean',
      palette: {
        0: '#ffffff',
        50: '#fbfcfc',
        100: '#F7F9F8',
        200: '#EFF3F2',
        300: '#DADEDD',
        400: '#B1B7B6',
        500: '#828787',
        600: '#5F7274',
        700: '#415B61',
        800: '#29444E',
        900: '#183240',
        950: '#0c1920',
      },
    },
  ]

  primaryColors = computed<SurfacesType[]>(() => {
    const presetPalette =
      presets[
        this.layoutService.layoutConfig().preset as KeyOfType<typeof presets>
      ].primitive
    const colors = [
      'emerald',
      'green',
      'lime',
      'orange',
      'amber',
      'yellow',
      'teal',
      'cyan',
      'sky',
      'blue',
      'indigo',
      'violet',
      'purple',
      'fuchsia',
      'pink',
      'rose',
    ]
    const palettes: SurfacesType[] = [{ name: 'noir', palette: {} }]
    colors.forEach((color) => {
      palettes.push({
        name: color,
        palette: presetPalette?.[
          color as KeyOfType<typeof presetPalette>
        ] as SurfacesType['palette'],
      })
    })
    return palettes
  })

  constructor() {
    const lan = this.translateLanService.getLanguage()
    this.selectedLanguage =
      this.languageOptions.find((opt) => opt.value === lan) ||
      this.languageOptions[0]
    this.translateService.use(lan)
  }

  openEditProfile(): void {
    const user = this.authService.getCompleteUserInfo()
    const ref = this.dialogService.open(AppEditUserProfile, {
      header: this.translateService.instant('topbar.edit_profile'),
      width: '480px',
      modal: true,
      data: { user },
    })

    ref?.onClose.subscribe((result) => {
      if (!result) return
      // Update authInfo signal + localStorage (phone, img)
      this.authService.updateUserProfile(result)
      // Refresh topbar display immediately
      this.username.set(result.user_name || this.username())
      if (result.user_img) {
        this.avatarUrl.set(result.user_img)
      }
    })
  }

  ngOnInit() {
    const user = this.authService.getAuthUserInfo()
    this.username.set(this.authService.getUserName() || '')
    this.role.set(user?.role || '')
    const avatar = this.authService.getAvatar()
    if (avatar) {
      this.avatarUrl.set(avatar)
    }

    // Restore theme selection from localStorage
    const storedTheme = this.layoutService.getStoredTheme()
    this.selectedTheme =
      this.themeOptions.find((t) => t.value === storedTheme) ||
      this.themeOptions[0]

    // Sync config values
    this.presetValue = this.layoutService.layoutConfig().preset
    this.menuModeValue = this.layoutService.layoutConfig().menuMode
    this.layoutThemeValue = this.layoutService.layoutConfig().layoutTheme

    // Apply preset on init
    if (isPlatformBrowser(this.platformId)) {
      this.onPresetChange(this.presetValue)
    }
  }

  onMenuButtonClick() {
    this.layoutService.toggleMenu()
  }

  activateSearch() {
    this.searchActive.set(true)
    setTimeout(() => {
      this.searchInput()?.nativeElement.focus()
    }, 100)
  }

  deactivateSearch() {
    this.searchActive.set(false)
  }

  removeTab(event: Event, index: number) {
    event.preventDefault()
    event.stopPropagation()
    this.layoutService.closeTab(index)
  }

  handleThemeChange(event: any) {
    const isDark = event.value.value === 'dark'
    this.layoutService.layoutConfig.update((prev) => ({
      ...prev,
      darkTheme: isDark,
    }))
  }

  handleLanguageChange(event: any) {
    const lan = event.value.value
    this.translateLanService.setLanguage(lan)
    this.translateService.use(lan)
  }

  navigateTo(item: { link: string; internal?: boolean }) {
    if (!item.link) return
    if (item.internal) {
      globalThis.location.href = item.link
    } else {
      window.open(item.link, '_blank')
    }
  }

  openBrandingDialog(): void {
    this.showBrandingDialog.set(true)
  }

  logout() {
    const user = this.authService.getAuthUserInfo()
    const userId = user?.id || user?.uid
    
    if (!userId) {
      // Even if we don't have the user ID, we must forcefully clear local cookies/session
      // before redirecting to prevent zombie sessions where the payload persists.
      if (typeof this.authService['clearCookies'] === 'function') {
        this.authService.clearCookies()
      }
      if (typeof this.authService['clearSessionStorage'] === 'function') {
        this.authService['clearSessionStorage']()
      }
      this.authService.redirectTologin()
      return
    }
    
    this.loadingLogout.set(true)
    this.authService.logout(userId).subscribe({
      error: () => this.loadingLogout.set(false),
    })
  }

  // ── Settings methods (from AppConfigurator) ──

  onLayoutThemeChange(theme: string) {
    this.layoutThemeValue = theme
    this.layoutService.layoutConfig.update((state) => ({
      ...state,
      layoutTheme: theme,
    }))
  }

  onMenuModeChange(mode: string) {
    this.layoutService.changeMenuMode(mode)
  }

  onPresetChange(preset: string) {
    this.layoutService.layoutConfig.update((state) => ({ ...state, preset }))
    const p = presets[preset as KeyOfType<typeof presets>]
    const surfacePalette = this.surfaces.find(
      (s) => s.name === this.selectedSurface()
    )?.palette
    $t()
      .preset(p)
      .preset(this.getPresetExt())
      .surfacePalette(surfacePalette)
      .use({ useDefaultOptions: true })
  }

  updateColors(event: any, type: string, color: SurfacesType) {
    if (type === 'primary') {
      this.layoutService.layoutConfig.update((state) => ({
        ...state,
        primary: color.name!,
      }))
    } else if (type === 'surface') {
      this.layoutService.layoutConfig.update((state) => ({
        ...state,
        surface: color.name,
      }))
    }
    this.applyTheme(type, color)
    event.stopPropagation()
  }

  private applyTheme(type: string, color: SurfacesType) {
    if (type === 'primary') {
      updatePreset(this.getPresetExt())
    } else if (type === 'surface') {
      updateSurfacePalette(color.palette)
    }
  }

  private getPresetExt() {
    const color: SurfacesType =
      this.primaryColors().find(
        (c) => c.name === this.selectedPrimaryColor()
      ) || {}

    if (color.name === 'noir') {
      return {
        semantic: {
          primary: {
            50: '{surface.50}',
            100: '{surface.100}',
            200: '{surface.200}',
            300: '{surface.300}',
            400: '{surface.400}',
            500: '{surface.500}',
            600: '{surface.600}',
            700: '{surface.700}',
            800: '{surface.800}',
            900: '{surface.900}',
            950: '{surface.950}',
          },
          colorScheme: {
            light: {
              primary: {
                color: '{primary.950}',
                contrastColor: '#ffffff',
                hoverColor: '{primary.800}',
                activeColor: '{primary.700}',
              },
              highlight: {
                background: '{primary.950}',
                focusBackground: '{primary.700}',
                color: '#ffffff',
                focusColor: '#ffffff',
              },
            },
            dark: {
              primary: {
                color: '{primary.50}',
                contrastColor: '{primary.950}',
                hoverColor: '{primary.200}',
                activeColor: '{primary.300}',
              },
              highlight: {
                background: '{primary.50}',
                focusBackground: '{primary.300}',
                color: '{primary.950}',
                focusColor: '{primary.950}',
              },
            },
          },
        },
      }
    } else {
      return {
        semantic: {
          primary: color.palette,
          colorScheme: {
            light: {
              primary: {
                color: '{primary.500}',
                contrastColor: '#ffffff',
                hoverColor: '{primary.600}',
                activeColor: '{primary.700}',
              },
              highlight: {
                background: '{primary.50}',
                focusBackground: '{primary.100}',
                color: '{primary.700}',
                focusColor: '{primary.800}',
              },
            },
            dark: {
              primary: {
                color: '{primary.400}',
                contrastColor: '{surface.900}',
                hoverColor: '{primary.300}',
                activeColor: '{primary.200}',
              },
              highlight: {
                background:
                  'color-mix(in srgb, {primary.400}, transparent 84%)',
                focusBackground:
                  'color-mix(in srgb, {primary.400}, transparent 76%)',
                color: 'rgba(255,255,255,.87)',
                focusColor: 'rgba(255,255,255,.87)',
              },
            },
          },
        },
      }
    }
  }
}
