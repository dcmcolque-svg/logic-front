import { Component, inject, OnDestroy, signal } from '@angular/core'
import {
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterModule,
} from '@angular/router'
import { merge, Subscription } from 'rxjs'
import { filter } from 'rxjs/operators'
import { CommonModule } from '@angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'

interface Breadcrumb {
  label: string
  url?: string
}

@Component({
  selector: '[app-breadcrumb]',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule],
  template: `<ol>
    <li>
      <a [routerLink]="['/']">
        <i class="pi pi-home"></i>
      </a>
    </li>
    <li class="layout-breadcrumb-chevron">/</li>
    @for (item of breadcrumbs(); track $index; let last = $last) {
      <li style="cursor: pointer;">{{ item.label }}</li>
      @if (!last) {
        <li class="layout-breadcrumb-chevron">/</li>
      }
    }
  </ol>`,
  host: {
    class: 'layout-breadcrumb',
  },
})
export class AppBreadcrumb implements OnDestroy {
  private readonly router    = inject(Router)
  private readonly translate = inject(TranslateService)

  /** Signal-based breadcrumb list — always typed as Breadcrumb[], never null */
  readonly breadcrumbs = signal<Breadcrumb[]>([])

  private readonly sub: Subscription

  constructor() {
    // Rebuild on every navigation AND on every language change
    this.sub = merge(
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd)),
      this.translate.onLangChange,
    ).subscribe(() => this.rebuild())
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe()
  }

  private rebuild(): void {
    const root = this.router.routerState.snapshot.root
    const breadcrumbs: Breadcrumb[] = []
    this.addBreadcrumb(root, [], breadcrumbs)
    this.breadcrumbs.set(breadcrumbs)
  }

  private addBreadcrumb(
    route: ActivatedRouteSnapshot,
    parentUrl: string[],
    breadcrumbs: Breadcrumb[],
  ): void {
    const routeUrl = parentUrl.concat(route.url.map((url) => url.path))
    const breadcrumb = route.data['breadcrumb']
    const parentBreadcrumb =
      route.parent?.data ? route.parent.data['breadcrumb'] : null

    if (breadcrumb && breadcrumb !== parentBreadcrumb) {
      // translate.instant() returns the key itself if no translation exists,
      // so hardcoded strings remain unchanged as a safe fallback.
      breadcrumbs.push({
        label: this.translate.instant(breadcrumb),
        url: '/' + routeUrl.join('/'),
      })
    }

    if (route.firstChild) {
      this.addBreadcrumb(route.firstChild, routeUrl, breadcrumbs)
    }
  }
}
