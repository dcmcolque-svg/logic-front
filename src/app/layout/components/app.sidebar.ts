import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core'
import { NavigationEnd, Router } from '@angular/router'
import { filter, Subject, takeUntil } from 'rxjs'
import { AppMenu } from './app.menu'
import { LayoutService } from '@/app/layout/service/layout.service'
import { environment } from '@/environments/environment'

const BREAKPOINT = 992

@Component({
  selector: '[app-sidebar]',
  standalone: true,
  imports: [AppMenu],
  styles: [`
    .sidebar-version {
      padding: 0.75rem 1.5rem;
    }
    .sidebar-version .version-badge {
      font-size: 0.68rem;
      font-family: monospace;
      font-weight: 600;
      letter-spacing: 0.03em;
    }
    .sidebar-version.theme-scheme {
      border-top: 1px solid var(--p-content-border-color);
    }
    .sidebar-version.theme-scheme .version-badge {
      color: var(--p-text-muted-color);
    }
    .sidebar-version.theme-primary {
      border-top: 1px solid rgba(255, 255, 255, 0.2);
    }
    .sidebar-version.theme-primary .version-badge {
      color: rgba(255, 255, 255, 0.5);
    }
    /* Slim — icon-only width, rotate text vertically */
    .sidebar-version.slim-only-mode {
      padding: 0.7rem 1rem;
      display: flex;
      justify-content: center;
    }
    .sidebar-version.slim-only-mode .version-badge {
      font-size: 0.65rem;
      word-break: break-all;
      overflow-wrap: break-word;
      letter-spacing: 0.04em;
    }
  `],
  template: `
    <div
      #sidebarRef
      class="layout-sidebar"
      (mouseenter)="onMouseEnter()"
      (mouseleave)="onMouseLeave()"
    >
      <div
        #menuContainer
        class="layout-menu-container"
        app-menu
        (scroll)="onMenuScroll()"
      ></div>

      <!-- Version badge: full in static/overlay, vertical in slim, small in slim+ -->
      <div class="sidebar-version"
        [class.theme-primary]="isPrimaryColorMode()"
        [class.theme-scheme]="!isPrimaryColorMode()"
        [class.slim-only-mode]="layoutService.isSlim()"
      >
        <span class="version-badge">{{ apiVersion }}</span>
      </div>
    </div>
  `,
})
export class AppSidebar implements OnInit, OnDestroy {
  layoutService = inject(LayoutService)

  router = inject(Router)

  el = inject(ElementRef)

  /** True when the sidebar background uses the primary color (not the neutral color scheme) */
  isPrimaryColorMode = computed(() => this.layoutService.layoutConfig().layoutTheme === 'primaryColor')

  /** App version read from environment — displayed at the bottom of the sidebar */
  readonly apiVersion = `v${environment.appVersion}`

  @ViewChild('menuContainer', { read: ElementRef }) menuContainer!: ElementRef

  @ViewChild('sidebarRef') sidebarRef!: ElementRef

  private timeout: any = null

  private observer: IntersectionObserver | null = null

  private outsideClickListener: ((event: MouseEvent) => void) | null = null

  private readonly mediaQuery = globalThis.matchMedia(`(min-width: ${BREAKPOINT}px)`)

  private readonly destroy$ = new Subject<void>()

  isDrawer = computed(
    () => this.layoutService.layoutConfig().menuMode === 'drawer'
  )

  isReveal = computed(
    () => this.layoutService.layoutConfig().menuMode === 'reveal'
  )

  constructor() {
    effect(() => {
      const hasOpenOverlay = this.layoutService.hasOpenOverlay()
      const mobileMenuActive = this.layoutService.layoutState().mobileMenuActive

      if (this.layoutService.isDesktop()) {
        if (hasOpenOverlay) {
          this.bindOutsideClickListener()
        } else {
          this.unbindOutsideClickListener()
        }
      } else if (mobileMenuActive) {
        this.bindOutsideClickListener()
      } else {
        this.unbindOutsideClickListener()
      }
    })

    effect(() => {
      const hasOpenOverlaySubmenu = this.layoutService.hasOpenOverlaySubmenu()
      if (this.layoutService.isDesktop()) {
        if (hasOpenOverlaySubmenu) {
          setTimeout(() => this.setupIntersectionObserver())
        } else {
          this.unbindObserver()
        }
      }
    })
  }

  ngOnInit() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        this.onRouteChange(event.urlAfterRedirects)
      })

    this.onRouteChange(this.router.url)

    this.mediaQuery.addEventListener('change', this.screenChangeListener)
  }

  ngOnDestroy() {
    this.destroy$.next()
    this.destroy$.complete()
    this.unbindOutsideClickListener()
    this.unbindObserver()
    this.mediaQuery.removeEventListener('change', this.screenChangeListener)
  }

  private onRouteChange(path: string) {
    let newActivePath: string | null

    if (
      this.layoutService.hasOverlaySubmenu() &&
      this.layoutService.isDesktop()
    ) {
      newActivePath = null
    } else {
      newActivePath = path
    }

    this.layoutService.layoutState.update((val) => ({
      ...val,
      activePath: newActivePath,
      overlayMenuActive: false,
      mobileMenuActive: false,
      menuHoverActive: false,
    }))
  }

  private readonly screenChangeListener = () => {
    if (this.layoutService.hasOverlaySubmenu()) {
      this.layoutService.layoutState.update((val) => ({
        ...val,
        activePath: this.layoutService.isDesktop() ? null : this.router.url,
        menuHoverActive: false,
      }))
      this.unbindOutsideClickListener()
      this.unbindObserver()
    }
  }

  private bindOutsideClickListener() {
    if (!this.outsideClickListener) {
      this.outsideClickListener = (event: MouseEvent) => {
        if (this.isOutsideClicked(event)) {
          if (this.layoutService.isDesktop()) {
            this.layoutService.layoutState.update((val) => ({
              ...val,
              overlayMenuActive: false,
            }))

            if (this.layoutService.hasOverlaySubmenu()) {
              this.layoutService.layoutState.update((val) => ({
                ...val,
                activePath: null,
                menuHoverActive: false,
              }))
            }
          } else {
            this.layoutService.layoutState.update((val) => ({
              ...val,
              mobileMenuActive: false,
            }))
          }
        }
      }

      document.addEventListener('click', this.outsideClickListener)
    }
  }

  private unbindOutsideClickListener() {
    if (this.outsideClickListener) {
      document.removeEventListener('click', this.outsideClickListener)
      this.outsideClickListener = null
    }
  }

  private isOutsideClicked(event: MouseEvent): boolean {
    const topbarButtonEl = document.querySelector('.topbar-menubutton')
    const sidebarEl = this.el.nativeElement

    return !(
      sidebarEl?.isSameNode(event.target as Node) ||
      sidebarEl?.contains(event.target as Node) ||
      topbarButtonEl?.isSameNode(event.target as Node) ||
      topbarButtonEl?.contains(event.target as Node)
    )
  }

  onMouseEnter() {
    if (this.isDrawer() || this.isReveal()) {
      if (this.timeout) {
        clearTimeout(this.timeout)
        this.timeout = null
      }
      this.layoutService.layoutState.update((state) => ({
        ...state,
        sidebarExpanded: true,
      }))
    }
  }

  onMouseLeave() {
    if (this.layoutService.layoutState().menuHoverActive && !this.timeout) {
      this.timeout = setTimeout(() => {
        this.layoutService.layoutState.update((state) => ({
          ...state,
          menuHoverActive: false,
          activePath:
            this.layoutService.hasOverlaySubmenu() &&
            this.layoutService.isDesktop()
              ? null
              : state.activePath,
        }))
      }, 300)
    }
  }

  onMenuScroll() {
    if (this.menuContainer?.nativeElement) {
      if (this.layoutService.isSlim() || this.layoutService.isSlimPlus()) {
        const scrollTop = this.menuContainer.nativeElement.scrollTop
        this.menuContainer.nativeElement.style.setProperty(
          '--menu-scroll-y',
          `-${scrollTop}px`
        )
      }
    }

    if (
      this.layoutService.hasOverlaySubmenu() &&
      this.layoutService.isDesktop()
    ) {
      this.layoutService.layoutState.update((val) => ({
        ...val,
        activePath: null,
        menuHoverActive: false,
      }))
    }
  }

  private setupIntersectionObserver() {
    if (!this.menuContainer?.nativeElement) return

    if (this.observer) {
      this.observer.disconnect()
    }

    const activeMenuItem = this.menuContainer.nativeElement.querySelector(
      '.layout-root-menuitem.active-menuitem'
    )
    if (!activeMenuItem) return

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (
            this.layoutService.isDesktop() &&
            !entry.isIntersecting &&
            this.layoutService.hasOverlaySubmenu() &&
            this.layoutService.layoutState().activePath
          ) {
            this.layoutService.layoutState.update((val) => ({
              ...val,
              activePath: null,
            }))
          }
        })
      },
      {
        root: this.menuContainer.nativeElement,
        threshold: 0,
      }
    )

    this.observer.observe(activeMenuItem)
  }

  private unbindObserver() {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  }
}
