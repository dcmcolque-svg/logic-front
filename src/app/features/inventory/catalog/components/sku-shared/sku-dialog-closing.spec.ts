import { Component, signal, Type } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'

import {
  catalogServiceSpy,
  CatalogServiceSpy,
  catalogTestProviders,
  cleanBody,
  settle,
  useEnglish,
} from '../../testing/catalog-spec-utils'
import { CatalogItem, Company } from '../../types/catalog.types'
import { SkuCreateDialogComponent } from '../sku-create-dialog/sku-create-dialog.component'
import { SkuFormDialogComponent } from '../sku-form-dialog/sku-form-dialog.component'
import { SkuDialogBase } from './sku-dialog-base'

/**
 * How the SKU dialogs (New SKU / Edit SKU) close, rendered for real inside a host that reacts
 * to (hide) exactly like catalog.component.html does. QA observations covered:
 * - OBS-2: a backdrop click must not close the dialog, and however it closes, the row's
 *   "Edit" must be able to open it again (it used to stay stuck until a page reload).
 * - OBS-4: the header X must be there in the "Product group" and "Categories" steps too.
 */

const COMPANIES: Company[] = [{ id: 'c1', name: 'Company 1' }]

const ROW = {
  company_id: 'c1',
  company_name: 'Company 1',
  product_id: null,
  sku_id: 'sku-1',
  image_path: null,
  sku: 'SKU-000026',
  barcode: null,
  description: 'Termo 1L',
  brand: null,
  weight: 0,
  dimensions: null,
  category: null,
  product_description: null,
  hs_code: null,
  retail_price: 0,
  wholesale_price: 0,
  cost: null,
  explicit_volume: 0,
  unit_factor: 0,
  name: 'Termo 1L',
  serial_control_mode: 'NONE',
  sku_description: null,
} as unknown as CatalogItem

/** Mirrors catalog.component: (hide)="showSkuEditDialog.set(false)" */
@Component({
  standalone: true,
  imports: [SkuFormDialogComponent],
  template: `<app-sku-form-dialog
    [visible]="open()"
    [sku]="row"
    [companies]="companies"
    (hide)="onHide()"
  />`,
})
class EditHost {
  open = signal(false)
  hides = 0
  row = ROW
  companies = COMPANIES
  onHide() {
    this.hides++
    this.open.set(false)
  }
}

/** Mirrors catalog.component: (hide)="showSkuCreateDialog.set(false)" */
@Component({
  standalone: true,
  imports: [SkuCreateDialogComponent],
  template: `<app-sku-create-dialog
    [visible]="open()"
    [companies]="companies"
    (hide)="onHide()"
  />`,
})
class CreateHost {
  open = signal(false)
  hides = 0
  companies = COMPANIES
  onHide() {
    this.hides++
    this.open.set(false)
  }
}

interface Case {
  name: string
  host: Type<EditHost | CreateHost>
  dialog: Type<SkuDialogBase>
  /** Header of the SKU step, i.e. what a fresh open shows */
  skuHeader: string
  /** Gets the dialog ready for the "Create product" link (the create dialog needs a company) */
  prepare(dialog: SkuDialogBase): void
}

const CASES: Case[] = [
  {
    name: 'Edit SKU (sku-form-dialog)',
    host: EditHost,
    dialog: SkuFormDialogComponent,
    skuHeader: 'Edit SKU-000026',
    prepare: () => {},
  },
  {
    name: 'New SKU (sku-create-dialog)',
    host: CreateHost,
    dialog: SkuCreateDialogComponent,
    skuHeader: 'New SKU',
    prepare: (d) =>
      (d as SkuCreateDialogComponent).companyControl.setValue('c1'),
  },
]

for (const c of CASES) {
  describe(`${c.name} · closing`, () => {
    let fixture: ComponentFixture<EditHost | CreateHost>
    let host: EditHost | CreateHost
    let dialog: SkuDialogBase
    let service: CatalogServiceSpy

    const dialogEl = () => document.body.querySelector<HTMLElement>('.p-dialog')
    const header = () =>
      dialogEl()?.querySelector('.p-dialog-title')?.textContent?.trim()
    const closeButton = () =>
      dialogEl()?.querySelector<HTMLElement>('.p-dialog-close-button') ?? null
    const link = (text: string) =>
      Array.from(
        document.body.querySelectorAll<HTMLButtonElement>(
          '.p-dialog .product-workspace__link'
        )
      ).find((b) => b.textContent?.trim() === text)!

    async function open() {
      host.open.set(true)
      await settle(fixture, 400)
    }

    /** SKU step → "Create product": the dialog becomes the "Product group" step */
    async function enterProductStep() {
      c.prepare(dialog)
      await settle(fixture, 0)
      link('Create product').click()
      await settle(fixture, 400)
      expect(dialog.workspaceOpen()).withContext('workspace open').toBeTrue()
      expect(header()).toBe('Product group')
    }

    beforeEach(async () => {
      service = catalogServiceSpy()
      TestBed.configureTestingModule({
        imports: [c.host],
        providers: catalogTestProviders(service),
      })
      useEnglish()
      fixture = TestBed.createComponent(c.host)
      host = fixture.componentInstance
      document.body.appendChild(fixture.nativeElement)
      dialog = fixture.debugElement.query(
        By.directive(c.dialog)
      ).componentInstance
      await open()
      expect(header()).toBe(c.skuHeader)
    })

    afterEach(() => {
      fixture.destroy()
      fixture.nativeElement.remove()
      cleanBody()
    })

    describe('OBS-2 · backdrop click and reopening', () => {
      it('a backdrop click on the SKU step does not close the dialog', async () => {
        document.body
          .querySelector('.p-dialog-mask')!
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await settle(fixture, 400)
        expect(dialogEl()).not.toBeNull()
        expect(host.hides).toBe(0)
      })

      it('a backdrop click on the "Product group" step does not close the dialog either', async () => {
        await enterProductStep()
        document.body
          .querySelector('.p-dialog-mask')!
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await settle(fixture, 400)
        expect(dialogEl()).not.toBeNull()
        expect(header()).toBe('Product group')
        expect(host.hides).toBe(0)
      })

      it('closing mid-workspace (Escape) tells the parent, so "Edit" opens it again on the SKU step', async () => {
        await enterProductStep()
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        )
        await settle(fixture, 400)

        expect(host.hides).toBe(1)
        expect(host.open()).toBeFalse()
        expect(dialogEl()).toBeNull()
        expect(dialog.workspaceOpen()).toBeFalse()
        expect(dialog.productEditing()).toBeFalse()

        await open() // what the row's "Edit" / "New SKU" button does
        expect(dialogEl()).not.toBeNull()
        expect(header()).toBe(c.skuHeader)
        expect(dialog.workspaceOpen()).toBeFalse()
      })
    })

    describe('OBS-4 · header close button', () => {
      it('the X is shown on the SKU step', () => {
        expect(closeButton()).not.toBeNull()
      })

      it('the X is shown on the "Product group" and "Categories" steps', async () => {
        await enterProductStep()
        expect(closeButton()).withContext('Product group').not.toBeNull()

        link('Manage').click()
        await settle(fixture, 400)
        expect(header()).toBe('Categories')
        expect(closeButton()).withContext('Categories').not.toBeNull()
      })

      it('the X closes the dialog from "Categories" and it opens again cleanly', async () => {
        await enterProductStep()
        link('Manage').click()
        await settle(fixture, 400)

        closeButton()!.click()
        await settle(fixture, 400)
        expect(host.hides).toBe(1)
        expect(dialogEl()).toBeNull()

        await open()
        expect(header()).toBe(c.skuHeader)
        expect(
          document.body.querySelector('.p-dialog app-category-manager')
        ).toBeNull()
      })
    })
  })
}
