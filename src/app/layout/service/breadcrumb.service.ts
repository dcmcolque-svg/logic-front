import { computed, inject, Injectable, signal } from '@angular/core'
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { merge } from 'rxjs'
import { filter } from 'rxjs/operators'
import { TranslateService } from '@ngx-translate/core'

export interface Breadcrumb {
  label: string
  url: string
}

/**
 * Where the user is, from the routes' `data.breadcrumb` (an i18n key, or a
 * literal when there is no translation). The topbar shows the last crumb as
 * the page title and the ones before it as the trail.
 */
@Injectable({ providedIn: 'root' })
export class BreadcrumbService {
  private readonly router = inject(Router)
  private readonly translate = inject(TranslateService)

  readonly crumbs = signal<Breadcrumb[]>([])
  /** i18n key a page can set when its title depends on state, not on the route. The page clears it on destroy. */
  readonly titleOverride = signal<string | null>(null)
  /** Extra text shown after the title, e.g. a document number. The page clears it on destroy. */
  readonly titleDetail = signal<string | null>(null)
  private readonly lang = signal(0)
  readonly title = computed(() => {
    this.lang()
    const key = this.titleOverride()
    const base = key ? this.translate.instant(key) : (this.crumbs().at(-1)?.label ?? '')
    const detail = this.titleDetail()
    return detail ? `${base} · ${detail}` : base
  })
  readonly trail = computed(() => this.crumbs().slice(0, -1))

  constructor() {
    // Rebuild on every navigation and on every language change.
    merge(this.router.events.pipe(filter(e => e instanceof NavigationEnd)), this.translate.onLangChange)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.rebuild())
    this.rebuild()
  }

  private rebuild(): void {
    const crumbs: Breadcrumb[] = []
    collect(this.router.routerState.snapshot.root, [], crumbs, key => this.translate.instant(key))
    this.crumbs.set(crumbs)
    this.lang.update(v => v + 1)
  }
}

function collect(
  route: ActivatedRouteSnapshot,
  parentUrl: string[],
  crumbs: Breadcrumb[],
  t: (key: string) => string
): void {
  const url = parentUrl.concat(route.url.map(s => s.path))
  const key = route.data['breadcrumb']
  // A child without its own data inherits the parent's: count it once.
  if (key && key !== route.parent?.data?.['breadcrumb']) {
    crumbs.push({ label: t(key), url: '/' + url.join('/') })
  }
  if (route.firstChild) collect(route.firstChild, url, crumbs, t)
}
