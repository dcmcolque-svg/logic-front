import { Component, provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { provideTranslateService, TranslateService } from '@ngx-translate/core'
import { BreadcrumbService } from './breadcrumb.service'

@Component({ template: '' })
class Blank {}

describe('BreadcrumbService', () => {
  let router: Router
  let service: BreadcrumbService

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTranslateService(),
        provideRouter([
          { path: '', component: Blank, data: { breadcrumb: 'pages.dashboard' } },
          {
            path: 'inventory',
            data: { breadcrumb: 'pages.inventory' },
            children: [
              { path: 'catalog', component: Blank, data: { breadcrumb: 'pages.catalog' } },
              // No data of its own: inherits the parent's, counted once.
              { path: 'plain', component: Blank },
            ],
          },
        ]),
      ],
    })
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('es', {
      pages: { dashboard: 'Panel', inventory: 'Inventario', catalog: 'Catálogo' },
    })
    translate.use('es')
    router = TestBed.inject(Router)
    service = TestBed.inject(BreadcrumbService)
  })

  it('takes the last crumb as title and the rest as trail', async () => {
    await router.navigateByUrl('/inventory/catalog')
    expect(service.title()).toBe('Catálogo')
    expect(service.trail().map(c => c.label)).toEqual(['Inventario'])
    expect(service.trail()[0].url).toBe('/inventory')
  })

  it('has no trail on a top-level page', async () => {
    await router.navigateByUrl('/')
    expect(service.title()).toBe('Panel')
    expect(service.trail()).toEqual([])
  })

  it('does not repeat an inherited crumb', async () => {
    await router.navigateByUrl('/inventory/plain')
    expect(service.crumbs().map(c => c.label)).toEqual(['Inventario'])
  })
})
