import {
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core'
import { RouterModule } from '@angular/router'
import { CommonModule, NgOptimizedImage } from '@angular/common'
import { StyleClassModule } from 'primeng/styleclass'
import { LayoutService } from '@/app/layout/service/layout.service'
import { BreadcrumbService } from '@/app/layout/service/breadcrumb.service'
import { Ripple } from 'primeng/ripple'
import { InputText } from 'primeng/inputtext'
import { ButtonModule } from 'primeng/button'
import { IconField } from 'primeng/iconfield'
import { InputIcon } from 'primeng/inputicon'
import { FormsModule } from '@angular/forms'
import { AuthService } from '../../core/services/auth.service'
import { Divider } from 'primeng/divider'
import { MenuModule } from 'primeng/menu'
import { TooltipModule } from 'primeng/tooltip'
import { MenuItem } from 'primeng/api'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TranslateLanService } from '../../core/services/translate-lan.service'
import { DialogService, DynamicDialogModule } from 'primeng/dynamicdialog'
import { AppEditUserProfile } from './app.edit-user-profile'
import { OperatorBrandingDialogComponent } from '@/app/features/preferences/operator-branding/operator-branding-dialog.component'

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
    Divider,
    MenuModule,
    TooltipModule,
    TranslateModule,
    NgOptimizedImage,
    DynamicDialogModule,
    OperatorBrandingDialogComponent,
  ],
  providers: [DialogService],
  template: `
    <div class="layout-topbar">
      <a class="app-logo" routerLink="/">
        <img
          alt="app logo"
          [ngSrc]="logo()"
          width="52"
          height="52"
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

      <!-- Where the user is: section trail + page title (from route data.breadcrumb) -->
      <div class="topbar-page">
        @if (breadcrumb.trail().length > 0) {
          <ol class="topbar-page-trail">
            @for (crumb of breadcrumb.trail(); track crumb.url) {
              <li>{{ crumb.label }}</li>
            }
          </ol>
        }
        <h1 class="topbar-page-title">{{ breadcrumb.title() }}</h1>
      </div>

      <!-- Contendor para acciones del topbar derecha -->
      <div class="topbar-actions">
        <!-- Theme (Light / Dark) -->
        <button
          type="button"
          class="topbar-icon-button"
          [attr.aria-label]="(layoutService.isDarkTheme() ? 'topbar.themeLight' : 'topbar.themeDark') | translate"
          [pTooltip]="(layoutService.isDarkTheme() ? 'topbar.themeLight' : 'topbar.themeDark') | translate"
          tooltipPosition="bottom"
          (click)="toggleTheme()"
        >
          <i [class]="layoutService.isDarkTheme() ? 'pi pi-sun' : 'pi pi-moon'"></i>
        </button>

        <!-- Language -->
        <button
          type="button"
          class="topbar-language-button"
          [attr.aria-label]="'topbar.language' | translate"
          [pTooltip]="'topbar.language' | translate"
          tooltipPosition="bottom"
          (click)="languageMenu.toggle($event)"
        >
          <img [src]="selectedLanguage.icon" [alt]="selectedLanguage.label | translate" />
          <span>{{ selectedLanguage.value | uppercase }}</span>
          <i class="pi pi-angle-down"></i>
        </button>
        <p-menu #languageMenu [model]="languageMenuItems()" [popup]="true" appendTo="body">
          <ng-template #item let-item>
            <a class="flex items-center gap-2 px-3 py-2 cursor-pointer">
              <img [src]="item.icon" alt="" style="width: 1.25rem; height: 1.25rem; border-radius: 50%" />
              <span class="flex-1">{{ item.label | translate }}</span>
              @if (item.id === selectedLanguage.value) {
                <i class="pi pi-check text-primary"></i>
              }
            </a>
          </ng-template>
        </p-menu>

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

              <!-- Temporarily hidden: Logos / Branding (incl. its leading divider)
              <p-divider
                [style]="{ 'margin-top': '0.5rem', 'margin-bottom': '0.5rem' }"
              ></p-divider>

              <a
                pRipple
                id="topbar-branding-btn"
                class="flex p-2 rounded-border w-full items-center hover:bg-emphasis transition-colors duration-150 cursor-pointer"
                (click)="openBrandingDialog()"
              >
                <i class="pi pi-image mr-4"></i>
                <span>{{ 'topbar.branding' | translate }}</span>
              </a>
              -->

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
  dialogService   = inject(DialogService)
  breadcrumb      = inject(BreadcrumbService)

  searchInput = viewChild<ElementRef>('searchinput')
  menuButton = viewChild<ElementRef>('menubutton')

  searchActive = signal<boolean>(false)
  loadingLogout = signal(false)
  username = signal('')
  role = signal('')
  avatarUrl = signal('/layout/images/avatar.png')
  showBrandingDialog = signal(false)

  logo = computed(() => {
    const path = '/layout/images/logo-'
    const logo =
      this.layoutService.isDarkTheme() ||
      this.layoutService.layoutConfig().layoutTheme === 'primaryColor'
        ? 'light.png'
        : 'dark.png'
    return path + logo
  })

  languageOptions: { label: string; value: string; icon: string }[] = [
    { label: 'labels.english', value: 'en', icon: '/layout/icons/um.png' },
    { label: 'labels.spanish', value: 'es', icon: '/layout/icons/es.png' },
  ]
  selectedLanguage: { label: string; value: string; icon: string }
  /** Items of the topbar language popup (label is an i18n key, translated in the template). */
  languageMenuItems = signal<MenuItem[]>(
    this.languageOptions.map((opt) => ({
      id: opt.value,
      label: opt.label,
      icon: opt.icon,
      command: () => this.setLanguage(opt),
    }))
  )

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

  toggleTheme(): void {
    this.layoutService.layoutConfig.update((prev) => ({
      ...prev,
      darkTheme: !prev.darkTheme,
    }))
  }

  setLanguage(opt: { label: string; value: string; icon: string }): void {
    this.selectedLanguage = opt
    this.translateLanService.setLanguage(opt.value)
    this.translateService.use(opt.value)
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
}
