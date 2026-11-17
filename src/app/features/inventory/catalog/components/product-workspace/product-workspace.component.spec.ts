import { ComponentFixture, TestBed } from '@angular/core/testing'
import { MessageService, ToastMessageOptions } from 'primeng/api'
import { of, throwError } from 'rxjs'

import {
  afterBorderTransition,
  borderColor,
  catalogServiceSpy,
  CatalogServiceSpy,
  catalogTestProviders,
  category,
  categoryPage,
  cleanBody,
  primaryColor,
  product,
  productPage,
  savedProduct,
  settle,
  textColor,
  themeColor,
  typeInto,
  useEnglish,
} from '../../testing/catalog-spec-utils'
import { ProductListItem } from '../../types/catalog.types'
import {
  ProductWorkspaceComponent,
  WorkspaceState,
} from './product-workspace.component'

/**
 * Product group selector + product editor embedded in the SKU dialogs, rendered with its
 * real template. QA observations covered: OBS-1 (toast on save), OBS-3 (dropdown width with
 * long descriptions), OBS-5 (editor title colour), OBS-6 (neutral border on empty inputs) and
 * MODAL-1 (outlined Back button at the bottom-left).
 */

const LONG_DESCRIPTION =
  'La línea térmica ThermoPro 2026 incluye una colección de botellas, termos y recipientes de acero ' +
  'inoxidable de grado alimenticio 18/8. Diseñados con aislamiento al vacío de doble pared que mantiene ' +
  'bebidas frías hasta por 24 horas y calientes hasta por 12 horas. Ideales para uso diario y actividades al aire libre'

describe('ProductWorkspaceComponent', () => {
  let fixture: ComponentFixture<ProductWorkspaceComponent>
  let cmp: ProductWorkspaceComponent
  let el: HTMLElement
  let service: CatalogServiceSpy
  let toasts: ToastMessageOptions[]
  let workspace: WorkspaceState[]
  let editing: boolean[]
  let chosen: (ProductListItem | null)[]

  const thermo = product('p-thermo', {
    name: 'Línea Térmica 2026',
    brand: 'ThermoPro',
    description: LONG_DESCRIPTION,
  })
  const appliances = product('p-home', {
    name: 'Electrodomesticos',
    description: 'grupo de articulos de hogar',
    sku_count: 8,
  })

  async function create(
    opts: {
      products?: ProductListItem[]
      initial?: ProductListItem | null
    } = {}
  ) {
    const rows = opts.products ?? [thermo, appliances]
    service.listProducts.and.returnValue(of(productPage(rows)))
    service.listCategories.and.returnValue(
      of(
        categoryPage([
          category('cat-1', { name: 'Accesorios' }),
          category('cat-2', { name: 'Termos' }),
        ])
      )
    )
    fixture = TestBed.createComponent(ProductWorkspaceComponent)
    cmp = fixture.componentInstance
    el = fixture.nativeElement
    // Same width as the "Product group" column of the New SKU dialog
    el.style.width = '380px'
    document.body.appendChild(el)
    fixture.componentRef.setInput('companyId', 'c1')
    if (opts.initial !== undefined)
      fixture.componentRef.setInput('initialProduct', opts.initial)
    workspace = []
    editing = []
    chosen = []
    cmp.workspaceChange.subscribe((s) => workspace.push(s))
    cmp.editingChange.subscribe((e) => editing.push(e))
    cmp.productChange.subscribe((p) => chosen.push(p))
    await settle(fixture, 0)
  }

  async function openEditor(p?: ProductListItem) {
    cmp.openEditor(p)
    // The editor's reveal animation focuses #product-name when it ends — let it finish
    await settle(fixture, 400)
  }

  beforeEach(() => {
    service = catalogServiceSpy()
    TestBed.configureTestingModule({
      imports: [ProductWorkspaceComponent],
      providers: catalogTestProviders(service),
    })
    useEnglish()
    toasts = []
    spyOn(TestBed.inject(MessageService), 'add').and.callFake(
      (m: ToastMessageOptions) => toasts.push(m)
    )
  })

  afterEach(() => {
    fixture?.destroy()
    el?.remove()
    cleanBody()
  })

  describe('selector', () => {
    it('loads the products and categories of the company', async () => {
      await create()
      expect(service.listProducts).toHaveBeenCalledOnceWith({
        filter: { company_id: { match_mode: 'equals', value: 'c1' } },
        config: {
          page: 1,
          rows: 1000,
          sort_field: [{ field: 'name', order: 1 }],
        },
      })
      expect(cmp.products().map((p) => p.id)).toEqual(['p-thermo', 'p-home'])
      expect(cmp.categories().map((c) => c.name)).toEqual([
        'Accesorios',
        'Termos',
      ])
    })

    it('starts on the initial product and drops the selection when the company changes', async () => {
      await create({ initial: thermo })
      expect(cmp.selected()?.id).toBe('p-thermo')

      fixture.componentRef.setInput('companyId', 'c2')
      await settle(fixture, 0)
      expect(cmp.selected()).toBeNull()
      expect(chosen.at(-1)).toBeNull()
    })
  })

  describe('OBS-3 · Product group dropdown stays inside the dialog', () => {
    async function openDropdown(): Promise<HTMLElement> {
      el.querySelector<HTMLElement>('.p-select')!.click()
      await settle(fixture, 300)
      const overlay =
        document.body.querySelector<HTMLElement>('.p-select-overlay')
      expect(overlay).withContext('dropdown overlay').not.toBeNull()
      return overlay!
    }

    it('the overlay is as wide as the field, not as the longest description', async () => {
      await create()
      const field = el
        .querySelector<HTMLElement>('.p-select')!
        .getBoundingClientRect()
      const overlay = (await openDropdown()).getBoundingClientRect()

      expect(field.width).toBeGreaterThan(300) // the column minus the fieldset padding
      expect(overlay.width).toBeLessThanOrEqual(field.width + 1)
      expect(overlay.right).toBeLessThanOrEqual(field.right + 1)
    })

    it('long descriptions are cut at 2 lines with an ellipsis and keep the full text in a tooltip', async () => {
      await create()
      const overlay = await openDropdown()
      const description = Array.from(
        overlay.querySelectorAll<HTMLElement>('.line-clamp-2')
      ).find((d) => d.textContent?.includes('ThermoPro 2026'))!

      expect(getComputedStyle(description).webkitLineClamp).toBe('2')
      expect(description.scrollHeight).toBeGreaterThan(description.clientHeight) // text really is truncated
      const lineHeight = parseFloat(getComputedStyle(description).lineHeight)
      expect(description.clientHeight).toBeLessThanOrEqual(
        Math.ceil(lineHeight * 2) + 1
      )
      expect(description.title).toBe(LONG_DESCRIPTION)
    })

    it('a long word without spaces wraps instead of widening the panel', async () => {
      await create({
        products: [product('p-long', { description: 'X'.repeat(400) })],
      })
      const field = el
        .querySelector<HTMLElement>('.p-select')!
        .getBoundingClientRect()
      const overlay = (await openDropdown()).getBoundingClientRect()
      expect(overlay.width).toBeLessThanOrEqual(field.width + 1)
    })

    it('short descriptions have no tooltip and missing ones say "No description"', async () => {
      await create({ products: [appliances, product('p-empty')] })
      const overlay = await openDropdown()
      const [home, empty] = Array.from(
        overlay.querySelectorAll<HTMLElement>('.line-clamp-2')
      )
      expect(home.title).toBe('grupo de articulos de hogar')
      expect(empty.textContent?.trim()).toBe('No description')
      expect(empty.hasAttribute('title')).toBeFalse()
    })
  })

  describe('workspace navigation', () => {
    it('opening the editor tells the dialog to swap to the workspace and blocks the SKU save', async () => {
      await create()
      await openEditor()
      expect(workspace.at(-1)).toEqual({ open: true, categories: false })
      expect(editing.at(-1)).toBeTrue()
    })

    it('"Manage" opens the category manager and "Back" returns to the product', async () => {
      await create()
      await openEditor()
      cmp.toggleCategories()
      await settle(fixture, 0)
      expect(workspace.at(-1)).toEqual({ open: true, categories: true })
      expect(el.querySelector('app-category-manager')).not.toBeNull()

      cmp.back()
      await settle(fixture, 0)
      expect(workspace.at(-1)).toEqual({ open: true, categories: false })
      expect(el.querySelector('app-category-manager')).toBeNull()
    })

    it('"Back to SKU" closes the workspace and restores the previous selection', async () => {
      await create({ initial: appliances })
      await openEditor(thermo)
      cmp.back()
      await settle(fixture, 0)
      expect(workspace.at(-1)).toEqual({ open: false, categories: false })
      expect(editing.at(-1)).toBeFalse()
      expect(cmp.selected()?.id).toBe('p-home')
    })

    it('destroying it (dialog closed) resets the host state', async () => {
      await create()
      await openEditor()
      fixture.destroy()
      expect(workspace.at(-1)).toEqual({ open: false, categories: false })
      expect(editing.at(-1)).toBeFalse()
    })
  })

  describe('OBS-1 · saving a product shows a toast', () => {
    it('creates the product with valid categories only, selects it and shows a success toast', async () => {
      const saved = product('p-new', { name: 'Botellas', company_id: 'c1' })
      service.createProductOnly.and.returnValue(of(savedProduct('p-new')))
      service.getProductListItemById.and.returnValue(of(saved))
      await create()
      await openEditor()
      cmp.name = ' Botellas '
      cmp.brand = ''
      cmp.description = 'Acero'
      cmp.categoryIds = ['cat-1', 'deleted-cat']
      cmp.save()
      await settle(fixture, 0)

      expect(service.createProductOnly).toHaveBeenCalledOnceWith({
        company_id: 'c1',
        name: 'Botellas',
        brand: null,
        description: 'Acero',
        category_ids: ['cat-1'],
      })
      expect(toasts.length).toBe(1)
      expect(toasts[0]).toEqual(
        jasmine.objectContaining({
          severity: 'success',
          summary: 'Success',
          detail:
            'Product saved and selected. Save the SKU to complete the link.',
        })
      )
      expect(toasts[0].life).toBeGreaterThanOrEqual(3000)
      expect(toasts[0].life).toBeLessThanOrEqual(5000)
      expect(cmp.selected()?.id).toBe('p-new')
      expect(workspace.at(-1)).toEqual({ open: false, categories: false })
      expect(el.querySelector('output')).toBeNull()
    })

    it('editing sends the product fields with the API names', async () => {
      service.updateProduct.and.returnValue(of(savedProduct('p-thermo')))
      service.getProductListItemById.and.returnValue(of(thermo))
      await create({ initial: thermo })
      await openEditor(thermo)
      cmp.name = 'Línea Térmica 2027'
      cmp.save()
      await settle(fixture, 0)

      expect(service.updateProduct).toHaveBeenCalledOnceWith('p-thermo', {
        description: 'Línea Térmica 2027',
        brand: 'ThermoPro',
        product_description: LONG_DESCRIPTION,
        category_ids: [],
      })
      expect(toasts.map((t) => t.severity)).toEqual(['success'])
    })

    it('if re-reading the saved product fails it still selects it, built from the form', async () => {
      service.createProductOnly.and.returnValue(of(savedProduct('p-new')))
      service.getProductListItemById.and.returnValue(
        throwError(() => new Error('down'))
      )
      await create()
      await openEditor()
      cmp.name = 'Botellas'
      cmp.categoryIds = ['cat-2']
      cmp.save()
      await settle(fixture, 0)

      expect(cmp.selected()).toEqual(
        jasmine.objectContaining({
          id: 'p-new',
          name: 'Botellas',
          category: 'Termos',
          sku_count: 0,
        })
      )
      expect(toasts.length).toBe(1)
    })

    it('a duplicate name stays inline in the editor, without a toast', async () => {
      service.createProductOnly.and.returnValue(
        throwError(() => ({ code: 'PRODUCT_ALREADY_EXISTS' }))
      )
      await create()
      await openEditor()
      cmp.name = 'Línea Térmica 2026'
      cmp.save()
      await settle(fixture, 0)

      expect(toasts).toEqual([])
      expect(el.querySelector('[role="alert"]')?.textContent).toContain(
        'A product with this name already exists for this company.'
      )
      expect(workspace.at(-1)).toEqual({ open: true, categories: false })
    })
  })

  describe('OBS-5 · editor title uses the primary colour', () => {
    it('"New product" and "Edit product" are rendered in the primary colour', async () => {
      await create()
      await openEditor()
      const title = () =>
        el.querySelector<HTMLElement>('.text-primary.font-semibold')!
      expect(title().textContent?.trim()).toBe('New product')
      expect(textColor(title())).toBe(primaryColor())
      expect(getComputedStyle(title()).fontWeight).toBe('600')

      cmp.closeWorkspace(false)
      await openEditor(thermo)
      expect(title().textContent?.trim()).toBe('Edit product')
      expect(textColor(title())).toBe(primaryColor())
    })
  })

  describe('OBS-6 · empty inputs keep the neutral border', () => {
    for (const id of ['product-name', 'product-brand', 'product-description']) {
      it(`#${id}: neutral while empty, primary once it has text`, async () => {
        await create()
        await openEditor()
        const field = el.querySelector<HTMLInputElement>(`#${id}`)!
        field.blur()
        await afterBorderTransition()

        expect(borderColor(field)).toBe(
          themeColor('--p-inputtext-border-color')
        )
        expect(borderColor(field)).not.toBe(primaryColor())

        typeInto(field, 'ThermoPro')
        await settle(fixture, 0)
        await afterBorderTransition()
        expect(borderColor(field)).toBe(primaryColor())
      })
    }
  })

  describe('MODAL-1 · Back is an outlined button at the bottom-left', () => {
    const rect = (node: Element) => node.getBoundingClientRect()
    const bar = () => el.querySelector<HTMLElement>('.product-workspace__actions')!
    const button = (label: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === label
      )

    async function openWide(width = '720px') {
      await create()
      // The workspace takes the whole body of the (lg) SKU dialog
      el.style.width = width
      await openEditor()
    }

    it('editor: "Back to SKU" sits below the form, on the left of the bottom bar, with Cancel / Save on the right', async () => {
      await openWide()
      const back = button('Back to SKU')!
      const cancel = button('Cancel')!
      const save = button('Save product')!
      expect(back).toBeDefined()
      expect(bar().contains(back)).toBeTrue()
      expect(rect(back).top).toBeGreaterThanOrEqual(
        rect(el.querySelector('#product-name')!).bottom
      )
      expect(Math.abs(rect(back).left - rect(bar()).left)).toBeLessThan(1)
      expect(Math.abs(rect(save).right - rect(bar()).right)).toBeLessThan(1)
      expect(rect(back).right).toBeLessThan(rect(cancel).left)
      expect(Math.abs(rect(back).top - rect(save).top)).toBeLessThan(1)
    })

    it('there is no Back button above the form any more', async () => {
      await openWide()
      const title = el.querySelector('.product-workspace__step .text-primary.font-semibold')!
      const backs = el.querySelectorAll('.pi-arrow-left')
      expect(backs.length).toBe(1)
      expect(rect(backs[0]).top).toBeGreaterThan(rect(title).bottom)
    })

    it('Back is outlined (visible border, transparent background) and matches Cancel', async () => {
      await openWide()
      const back = button('Back to SKU')!
      const cancel = button('Cancel')!
      const style = getComputedStyle(back)
      expect(back.classList).toContain('p-button-outlined')
      expect(back.classList).toContain('p-button-secondary')
      expect(back.classList).not.toContain('p-button-text')
      expect(style.borderTopStyle).toBe('solid')
      expect(parseFloat(style.borderTopWidth)).toBeGreaterThan(0)
      expect(style.borderTopColor).not.toBe('rgba(0, 0, 0, 0)')
      expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)')
      expect(borderColor(back)).toBe(borderColor(cancel))
      expect(textColor(back)).toBe(textColor(cancel))
    })

    it('clicking the bottom "Back to SKU" closes the workspace', async () => {
      await openWide()
      button('Back to SKU')!.click()
      await settle(fixture, 0)
      expect(workspace.at(-1)).toEqual({ open: false, categories: false })
    })

    it('categories: "Back to product" stays at the bottom-left under the manager, without Cancel / Save', async () => {
      await openWide()
      cmp.toggleCategories()
      await settle(fixture, 400)
      const back = button('Back to product')!
      expect(back).toBeDefined()
      expect(back.classList).toContain('p-button-outlined')
      expect(rect(back).top).toBeGreaterThanOrEqual(
        rect(el.querySelector('app-category-manager')!).bottom
      )
      expect(Math.abs(rect(back).left - rect(bar()).left)).toBeLessThan(1)
      expect(button('Cancel')).toBeUndefined()
      expect(button('Save product')).toBeUndefined()

      back.click()
      await settle(fixture, 0)
      expect(workspace.at(-1)).toEqual({ open: true, categories: false })
      expect(button('Back to SKU')).toBeDefined()
    })

    it('narrow screens: Back keeps the left edge and Cancel / Save wrap to the right', async () => {
      await openWide('300px')
      const back = button('Back to SKU')!
      const save = button('Save product')!
      expect(rect(save).top).toBeGreaterThan(rect(back).top)
      expect(Math.abs(rect(back).left - rect(bar()).left)).toBeLessThan(1)
      expect(Math.abs(rect(save).right - rect(bar()).right)).toBeLessThan(1)
    })
  })
})
