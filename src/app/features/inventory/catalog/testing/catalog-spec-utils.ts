import {
  EnvironmentProviders,
  Provider,
  provideZonelessChangeDetection,
} from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideTranslateService, TranslateService } from '@ngx-translate/core'
import Aura from '@primeuix/themes/aura'
import { MessageService } from 'primeng/api'
import { providePrimeNG } from 'primeng/config'
import { of } from 'rxjs'

import en from '../../../../../../public/i18n/en.json'
import { CatalogService } from '../catalog.service'
import {
  CategoryListItem,
  CategoryListResponse,
  ProductListItem,
  ProductListResponse,
} from '../types/catalog.types'
import { Product, Sku } from '../types/sku.types'

/**
 * Shared setup for the catalog specs. They render the real templates in ChromeHeadless
 * with the app's global styles and Tailwind (angular.json → test.styles), so colours,
 * borders and widths can be measured instead of only checking class names.
 */

export type CatalogServiceSpy = jasmine.SpyObj<CatalogService>

export function category(
  id: string,
  extra: Partial<CategoryListItem> = {}
): CategoryListItem {
  return {
    id,
    operator_id: 'op-1',
    company_id: 'c1',
    parent_id: null,
    name: `Cat-${id}`,
    description: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    product_count: 0,
    ...extra,
  }
}

export function product(
  id: string,
  extra: Partial<ProductListItem> = {}
): ProductListItem {
  return {
    id,
    company_id: 'c1',
    company_name: 'Company 1',
    name: `Product ${id}`,
    brand: null,
    description: null,
    category: null,
    categories: [],
    sku_count: 0,
    created_at: '2026-10-01T00:00:00Z',
    ...extra,
  }
}

export function categoryPage(rows: CategoryListItem[]): CategoryListResponse {
  return {
    data: rows,
    meta_data: { page: 1, rows: rows.length, total_records: rows.length },
  }
}

export function productPage(rows: ProductListItem[]): ProductListResponse {
  return {
    data: rows,
    meta_data: { page: 1, rows: rows.length, total_records: rows.length },
  }
}

/** What create/update product answer — the specs only read its id */
export const savedProduct = (id: string) => ({ id }) as Product

/** CatalogService with every method the catalog dialogs call, answering empty by default */
export function catalogServiceSpy(): CatalogServiceSpy {
  const spy = jasmine.createSpyObj<CatalogService>('CatalogService', [
    'listCategories',
    'createCategory',
    'updateCategory',
    'deleteCategory',
    'listProducts',
    'createProductOnly',
    'updateProduct',
    'getProductListItemById',
    'getAttributeKeys',
    'getSkuById',
    'skuCodeExists',
  ])
  spy.listCategories.and.returnValue(of(categoryPage([])))
  spy.listProducts.and.returnValue(of(productPage([])))
  spy.getProductListItemById.and.returnValue(of(null))
  spy.getAttributeKeys.and.returnValue(of([]))
  spy.getSkuById.and.returnValue(of({ images: [] } as Partial<Sku> as Sku))
  spy.skuCodeExists.and.returnValue(of(false))
  return spy
}

/** Zoneless + English translations from public/i18n/en.json + Aura theme (defines --p-* tokens), light mode like the app */
export function catalogTestProviders(
  service: CatalogServiceSpy
): (Provider | EnvironmentProviders)[] {
  return [
    provideZonelessChangeDetection(),
    provideTranslateService(),
    providePrimeNG({
      theme: { preset: Aura, options: { darkModeSelector: '.app-dark' } },
    }),
    MessageService,
    { provide: CatalogService, useValue: service },
  ]
}

/** Loads the real English strings so specs also prove the i18n keys exist */
export function useEnglish(): void {
  const translate = TestBed.inject(TranslateService)
  translate.setTranslation('en', en)
  translate.use('en')
}

/** Normalises a computed colour (rgb(), rgba() or Tailwind's color(srgb ...)) to "r,g,b" */
export function rgb(css: string): string {
  const srgb = css.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/)
  if (srgb)
    return srgb
      .slice(1, 4)
      .map((v) => Math.round(parseFloat(v) * 255))
      .join(',')
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) throw new Error(`Unexpected colour: ${css}`)
  return m.slice(1, 4).join(',')
}

/** A theme token as the browser resolves it, normalised with rgb() */
export function themeColor(token: string): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${token})`
  document.body.appendChild(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return rgb(color)
}

export const primaryColor = () => themeColor('--p-primary-color')

/** Text colour of an element, normalised */
export const textColor = (el: Element) => rgb(getComputedStyle(el).color)

/** Top border colour of an element, normalised */
export const borderColor = (el: Element) =>
  rgb(getComputedStyle(el).borderTopColor)

/** Lets PrimeNG enter/leave animations and overlay positioning finish */
export async function settle(
  fixture: { detectChanges(): void; whenStable(): Promise<unknown> },
  ms = 350
) {
  fixture.detectChanges()
  await fixture.whenStable()
  await new Promise((resolve) => setTimeout(resolve, ms))
  fixture.detectChanges()
  await fixture.whenStable()
}

/** Types into an input the way a user does (value + input event) and leaves it unfocused */
export function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.blur()
}

/** PrimeNG inputs animate border-color; wait past the transition before measuring it */
export const afterBorderTransition = () =>
  new Promise((resolve) => setTimeout(resolve, 400))

/** Removes whatever PrimeNG appended to <body> (dialogs, overlays, toasts) between specs */
export function cleanBody(): void {
  document.body
    .querySelectorAll(
      '.p-dialog-mask, .p-overlay, .p-select-overlay, .p-multiselect-overlay'
    )
    .forEach((el) => el.remove())
  ;(document.activeElement as HTMLElement | null)?.blur?.()
}
