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
import { SelectButton } from 'primeng/selectbutton'
import { Divider } from 'primeng/divider'
import { RouteMenuComponent } from './route-menu.component'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { TranslateLanService } from '../../core/services/translate-lan.service'
import { DialogService, DynamicDialogModule } from 'primeng/dynamicdialog'
import { AppEditUserProfile } from './app.edit-user-profile'
import { OperatorBrandingDialogComponent } from '@/app/features/preferences/operator-branding/operator-branding-dialog.component'
import { FacilityScopeSelectorComponent } from './facility-scope-selector.component'

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
    TranslateModule,
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
        <!-- Global facility scope — narrows every base-data-table in the app -->
         <!-- TODO DESCOMENTAR CUANDO EL TICKET ESTE APROBADO -->
        <app-facility-scope-selector />

        <!-- Settings gear (route-menu) -->
        <app-route-menu class="ml-2 sm:ml-0"></app-route-menu>

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
