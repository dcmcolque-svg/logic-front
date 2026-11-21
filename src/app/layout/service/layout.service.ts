import { Injectable, effect, signal, computed, inject } from '@angular/core'
import { Router } from '@angular/router'

export interface LayoutConfig {
  preset: string
  primary: string
  surface: string | undefined | null
  darkTheme: boolean
  menuMode: string
  layoutTheme: string
}

interface LayoutState {
  staticMenuInactive: boolean
  overlayMenuActive: boolean
  configSidebarVisible: boolean
  mobileMenuActive: boolean
  menuHoverActive: boolean
  activePath: any
}

@Injectable({
  providedIn: 'root',
})
export class LayoutService {
  private readonly themeKey = 'user-theme'

  layoutConfig = signal<LayoutConfig>({
    preset: 'Aura',
    primary: 'sky',
    surface: null,
    darkTheme: this.getStoredThemeIsDark(),
    menuMode: 'static',
    layoutTheme: 'colorScheme',
  })

  layoutState = signal<LayoutState>({
    staticMenuInactive: false,
    overlayMenuActive: false,
    configSidebarVisible: false,
    mobileMenuActive: false,
    menuHoverActive: false,
    activePath: null,
  })

  router = inject(Router)

  isDarkTheme = computed(() => this.layoutConfig().darkTheme)

  isSlim = computed(() => this.layoutConfig().menuMode === 'slim')

  isSlimPlus = computed(() => this.layoutConfig().menuMode === 'slim-plus')

  isOverlay = computed(() => this.layoutConfig().menuMode === 'overlay')

  hasOverlaySubmenu = computed(
    () =>
      this.layoutConfig().menuMode === 'slim' ||
      this.layoutConfig().menuMode === 'slim-plus' ||
      this.layoutConfig().menuMode === 'horizontal'
  )

  hasOpenOverlaySubmenu = computed(
    () =>
      this.hasOverlaySubmenu() &&
      this.layoutState().activePath !== null &&
      this.layoutState().activePath !== '/'
  )

  hasOpenOverlay = computed(
    () => this.layoutState().overlayMenuActive || this.hasOpenOverlaySubmenu()
  )

  private initialized = false

  constructor() {
    // Apply stored theme on startup
    if (this.layoutConfig().darkTheme) {
      document.documentElement.classList.add('app-dark')
    }

    effect(() => {
      const config = this.layoutConfig()

      if (!this.initialized || !config) {
        this.initialized = true
        return
      }

      // Persist theme to localStorage
      localStorage.setItem(this.themeKey, config.darkTheme ? 'dark' : 'light')

      this.handleDarkModeTransition(config)
    })
  }

  private handleDarkModeTransition(config: LayoutConfig): void {
    const supportsViewTransition = 'startViewTransition' in document

    if (supportsViewTransition) {
      this.startViewTransition(config)
    } else {
      this.toggleDarkMode(config)
    }
  }

  private startViewTransition(config: LayoutConfig): void {
    document.startViewTransition(() => {
      this.toggleDarkMode(config)
    })
  }

  toggleDarkMode(config?: LayoutConfig): void {
    const _config = config || this.layoutConfig()
    if (_config.darkTheme) {
      document.documentElement.classList.add('app-dark')
    } else {
      document.documentElement.classList.remove('app-dark')
    }
  }

  toggleMenu() {
    if (this.isDesktop()) {
      if (this.layoutConfig().menuMode === 'static') {
        this.layoutState.update((prev) => ({
          ...prev,
          staticMenuInactive: !prev.staticMenuInactive,
        }))
      }

      if (this.layoutConfig().menuMode === 'overlay') {
        this.layoutState.update((prev) => ({
          ...prev,
          overlayMenuActive: !prev.overlayMenuActive,
        }))
      }
    } else {
      this.layoutState.update((prev) => ({
        ...prev,
        mobileMenuActive: !prev.mobileMenuActive,
      }))
    }
  }

  toggleConfigSidebar() {
    this.layoutState.update((prev) => ({
      ...prev,
      configSidebarVisible: !prev.configSidebarVisible,
    }))
  }

  hideMobileMenu() {
    this.layoutState.update((prev) => ({
      ...prev,
      mobileMenuActive: false,
    }))
  }

  changeMenuMode(mode: string) {
    this.layoutConfig.update((prev) => ({ ...prev, menuMode: mode }))
    this.layoutState.update((prev) => ({
      ...prev,
      staticMenuInactive: false,
      overlayMenuActive: false,
      mobileMenuActive: false,
      menuHoverActive: false,
    }))

    if (this.isDesktop()) {
      this.layoutState.update((prev) => ({
        ...prev,
        activePath: this.hasOverlaySubmenu() ? null : this.router.url,
      }))
    }
  }

  isDesktop() {
    return window.innerWidth > 991
  }

  getStoredTheme(): string {
    return localStorage.getItem(this.themeKey) || 'light'
  }

  private getStoredThemeIsDark(): boolean {
    return localStorage.getItem(this.themeKey) === 'dark'
  }
}
