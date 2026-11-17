import { ComponentFixture, TestBed } from '@angular/core/testing'
import { MessageService, ToastMessageOptions } from 'primeng/api'
import { of, Subject, throwError } from 'rxjs'

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
  settle,
  textColor,
  themeColor,
  typeInto,
  useEnglish,
} from '../../testing/catalog-spec-utils'
import { CategoryManagerComponent } from './category-manager.component'

/**
 * Category manager (Product group → Manage categories), rendered with its real template.
 * QA observations covered: OBS-1 (toast instead of static text), OBS-5 (title colour),
 * OBS-6 (neutral border on empty inputs) and MODAL-2 (create/edit form above the list).
 * The rest pins the CRUD flow around them.
 */
describe('CategoryManagerComponent', () => {
  let fixture: ComponentFixture<CategoryManagerComponent>
  let cmp: CategoryManagerComponent
  let el: HTMLElement
  let service: CatalogServiceSpy
  let toasts: ToastMessageOptions[]
  let changed: number

  async function create(
    rows = [
      category('1', { name: 'Accesorios' }),
      category('2', { name: 'Termos', product_count: 3 }),
    ]
  ) {
    service.listCategories.and.returnValue(of(categoryPage(rows)))
    fixture = TestBed.createComponent(CategoryManagerComponent)
    cmp = fixture.componentInstance
    el = fixture.nativeElement
    fixture.componentRef.setInput('companyId', 'c1')
    changed = 0
    cmp.changed.subscribe(() => changed++)
    document.body.appendChild(el)
    await settle(fixture, 0)
  }

  function input(id: string): HTMLInputElement {
    return el.querySelector<HTMLInputElement>(`#${id}`)!
  }

  async function openCreateForm() {
    cmp.create()
    await settle(fixture, 0)
  }

  beforeEach(() => {
    service = catalogServiceSpy()
    TestBed.configureTestingModule({
      imports: [CategoryManagerComponent],
      providers: catalogTestProviders(service),
    })
    useEnglish()
    const messages = TestBed.inject(MessageService)
    toasts = []
    spyOn(messages, 'add').and.callFake((m: ToastMessageOptions) =>
      toasts.push(m)
    )
  })

  afterEach(() => {
    fixture?.destroy()
    el?.remove()
    cleanBody()
  })

  describe('list', () => {
    it('loads the categories of its company', async () => {
      await create()
      expect(service.listCategories).toHaveBeenCalledOnceWith({
        filter: { company_id: { match_mode: 'equals', value: 'c1' } },
        config: { page: 1, rows: 500 },
      })
      expect(el.textContent).toContain('Accesorios')
      expect(el.textContent).toContain('Termos')
    })

    it('filters by name, ignoring case and surrounding spaces', async () => {
      await create()
      cmp.query.set('  TERM ')
      expect(cmp.rows().map((r) => r.name)).toEqual(['Termos'])
    })

    it('shows an inline error when the list cannot be loaded', async () => {
      service.listCategories.and.returnValue(
        throwError(() => new Error('boom'))
      )
      fixture = TestBed.createComponent(CategoryManagerComponent)
      cmp = fixture.componentInstance
      el = fixture.nativeElement
      fixture.componentRef.setInput('companyId', 'c1')
      await settle(fixture, 0)
      expect(el.querySelector('[role="alert"]')?.textContent).toContain(
        'Could not load categories'
      )
    })

    it('clears the list without calling the API when there is no company', async () => {
      await create()
      service.listCategories.calls.reset()
      fixture.componentRef.setInput('companyId', '')
      await settle(fixture, 0)
      expect(service.listCategories).not.toHaveBeenCalled()
      expect(cmp.categories()).toEqual([])
    })
  })

  describe('OBS-1 · success feedback is a toast, not static text', () => {
    it('creating a category shows a green toast that auto-dismisses in 3–5 s', async () => {
      service.createCategory.and.returnValue(of(category('3')))
      await create()
      await openCreateForm()
      cmp.name = '  Botellas '
      cmp.description = ' '
      cmp.save()
      await settle(fixture, 0)

      expect(service.createCategory).toHaveBeenCalledOnceWith({
        company_id: 'c1',
        name: 'Botellas',
        description: null,
      })
      expect(toasts.length).toBe(1)
      expect(toasts[0]).toEqual(
        jasmine.objectContaining({
          severity: 'success',
          summary: 'Success',
          detail: 'Category saved.',
        })
      )
      expect(toasts[0].life).toBeGreaterThanOrEqual(3000)
      expect(toasts[0].life).toBeLessThanOrEqual(5000)
    })

    it('leaves no "Category saved." text in the view', async () => {
      service.createCategory.and.returnValue(of(category('3')))
      await create()
      await openCreateForm()
      cmp.name = 'Botellas'
      cmp.save()
      await settle(fixture, 0)

      expect(el.querySelector('output')).toBeNull()
      expect(el.textContent).not.toContain('Category saved.')
    })

    it('editing a category updates it and shows the same toast', async () => {
      service.updateCategory.and.returnValue(of(category('1')))
      await create()
      cmp.edit(cmp.categories()[0])
      cmp.name = 'Accesorios 2026'
      cmp.description = 'Para termos'
      cmp.save()
      await settle(fixture, 0)

      expect(service.updateCategory).toHaveBeenCalledOnceWith('1', {
        name: 'Accesorios 2026',
        description: 'Para termos',
      })
      expect(toasts.map((t) => t.detail)).toEqual(['Category saved.'])
      expect(cmp.formOpen()).toBeFalse()
    })

    it('after saving it closes the form, reloads the list and notifies the parent', async () => {
      service.createCategory.and.returnValue(of(category('3')))
      await create()
      await openCreateForm()
      service.listCategories.calls.reset()
      cmp.name = 'Botellas'
      cmp.save()
      await settle(fixture, 0)

      expect(cmp.formOpen()).toBeFalse()
      expect(service.listCategories).toHaveBeenCalledTimes(1)
      expect(changed).toBe(1)
    })

    it('deleting a category shows a "Category deleted." toast', async () => {
      service.deleteCategory.and.returnValue(of(undefined))
      await create()
      cmp.remove(cmp.categories()[0])
      await settle(fixture, 0)

      expect(service.deleteCategory).toHaveBeenCalledOnceWith('1')
      expect(toasts.map((t) => [t.severity, t.detail])).toEqual([
        ['success', 'Category deleted.'],
      ])
      expect(cmp.confirm()).toBeNull()
      expect(changed).toBe(1)
    })

    it('errors stay inline next to the form and never raise a success toast', async () => {
      service.createCategory.and.returnValue(
        throwError(() => ({ code: 'CATEGORY_ALREADY_EXISTS' }))
      )
      await create()
      await openCreateForm()
      cmp.name = 'Accesorios'
      cmp.save()
      await settle(fixture, 0)

      expect(toasts).toEqual([])
      expect(el.querySelector('[role="alert"]')?.textContent).toContain(
        'A category with this name already exists.'
      )
      expect(cmp.formOpen()).toBeTrue()
    })
  })

  describe('errors', () => {
    it('explains that a category in use cannot be deleted', async () => {
      service.deleteCategory.and.returnValue(
        throwError(() => ({
          code: 'CATEGORY_IN_USE',
          meta: { product_count: 4 },
        }))
      )
      await create()
      cmp.remove(cmp.categories()[1])
      await settle(fixture, 0)

      expect(cmp.error()).toContain('4')
      expect(cmp.confirm()).toBeNull()
      expect(toasts).toEqual([])
    })

    it('falls back to the backend message, then to a generic text', async () => {
      service.updateCategory.and.returnValues(
        throwError(() => ({ code: 'X', message: 'backend says no' })),
        throwError(() => ({}))
      )
      await create()
      cmp.edit(cmp.categories()[0])
      cmp.save()
      expect(cmp.error()).toBe('backend says no')
      cmp.save()
      expect(cmp.error()).toBe('Could not save the category')
    })

    it('ignores a save with a blank name or while another save is running', async () => {
      const pending = new Subject<never>()
      service.createCategory.and.returnValue(pending)
      await create()
      await openCreateForm()
      cmp.name = '   '
      cmp.save()
      expect(service.createCategory).not.toHaveBeenCalled()

      cmp.name = 'Botellas'
      cmp.save()
      cmp.save()
      expect(service.createCategory).toHaveBeenCalledTimes(1)
    })
  })

  describe('OBS-5 · section title uses the primary colour', () => {
    it('"Manage categories" is rendered in the primary colour, with its icon', async () => {
      await create()
      const title = el.querySelector('h3')!
      expect(title.textContent?.trim()).toBe('Manage categories')
      expect(textColor(title)).toBe(primaryColor())
      expect(getComputedStyle(title).fontWeight).toBe('600')
      expect(title.previousElementSibling?.classList).toContain('pi-tags')
    })
  })

  describe('OBS-6 · empty inputs keep the neutral border', () => {
    for (const id of ['category-name', 'category-description']) {
      it(`#${id}: neutral while empty, primary once it has text`, async () => {
        await create()
        await openCreateForm()
        // The form's reveal animation focuses #category-name when it ends — let it finish first
        await settle(fixture, 400)
        const field = input(id)
        field.blur()
        await afterBorderTransition()

        expect(borderColor(field)).toBe(
          themeColor('--p-inputtext-border-color')
        )
        expect(borderColor(field)).not.toBe(primaryColor())

        typeInto(field, 'Botellas')
        await settle(fixture, 0)
        await afterBorderTransition()
        expect(borderColor(field)).toBe(primaryColor())
      })
    }
  })

  describe('MODAL-2 · create/edit form sits above the list', () => {
    const top = (node: Element) => node.getBoundingClientRect().top
    const bottom = (node: Element) => node.getBoundingClientRect().bottom
    const search = () => input('category-search')
    const list = () => el.querySelector('section section')!

    it('"Create category" is the first control under the header, before the search and the list', async () => {
      await create()
      const button = Array.from(el.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Create category'
      )!
      expect(button).toBeDefined()
      expect(button.compareDocumentPosition(search())).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      )
      expect(bottom(el.querySelector('h3')!)).toBeLessThan(top(button))
      expect(bottom(button)).toBeLessThanOrEqual(top(search()))
      expect(bottom(search())).toBeLessThanOrEqual(top(list()))
    })

    it('the create form opens above the search and the list, which stay visible below it', async () => {
      await create()
      await openCreateForm()
      await settle(fixture, 400)
      const form = input('category-name').closest('.category-reveal')!
      expect(form.textContent).toContain('Create category')
      expect(bottom(form)).toBeLessThanOrEqual(top(search()))
      expect(bottom(search())).toBeLessThanOrEqual(top(list()))
      expect(list().textContent).toContain('Accesorios')
      expect(list().textContent).toContain('Termos')
    })

    it('editing a row opens the prefilled form above the list', async () => {
      await create()
      cmp.edit(cmp.rows()[1])
      await settle(fixture, 400)
      const form = input('category-name').closest('.category-reveal')!
      expect(form.textContent).toContain('Edit category')
      expect(input('category-name').value).toBe('Termos')
      expect(bottom(form)).toBeLessThanOrEqual(top(list()))
    })

    it('a save error shows right under the form, before the search and the list', async () => {
      service.createCategory.and.returnValue(
        throwError(() => ({ code: 'CATEGORY_ALREADY_EXISTS' }))
      )
      await create()
      await openCreateForm()
      cmp.name = 'Accesorios'
      cmp.save()
      await settle(fixture, 0)
      const form = input('category-name').closest('.category-reveal')!
      const alert = el.querySelector('[role="alert"]')!
      expect(alert.textContent).toContain('A category with this name already exists.')
      expect(bottom(form)).toBeLessThanOrEqual(top(alert))
      expect(bottom(alert)).toBeLessThanOrEqual(top(search()))
    })
  })
})
