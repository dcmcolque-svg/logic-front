import { Component, signal } from '@angular/core'
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
import { SkuFormDialogComponent } from './sku-form-dialog.component'

/**
 * Verifies that the edit dialog shows the company in a disabled dropdown field
 * instead of the dialog sub-header, and that the sub-header is always empty.
 */

const COMPANIES: Company[] = [
  { id: 'c1', name: 'Company 1' },
  { id: 'c2', name: 'Company 2' },
]

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
  unit_factor: 1,
  name: 'Termo 1L',
  serial_control_mode: 'NONE',
  sku_description: null,
} as unknown as CatalogItem

@Component({
  standalone: true,
  imports: [SkuFormDialogComponent],
  template: `<app-sku-form-dialog
    [visible]="open()"
    [sku]="row"
    [companies]="companies"
    (hide)="open.set(false)"
  />`,
})
class EditHost {
  open = signal(false)
  row = ROW
  companies = COMPANIES
}

@Component({
  standalone: true,
  imports: [SkuFormDialogComponent],
  template: `<app-sku-form-dialog
    [visible]="open()"
    [sku]="null"
    [companies]="companies"
    (hide)="open.set(false)"
  />`,
})
class CreateHost {
  open = signal(false)
  companies = COMPANIES
}

describe('SkuFormDialog · company dropdown in edit mode', () => {
  let fixture: ComponentFixture<EditHost>
  let host: EditHost
  let dialog: SkuFormDialogComponent
  let service: CatalogServiceSpy

  const dialogEl = () => document.body.querySelector<HTMLElement>('.p-dialog')
  const subHeader = () =>
    dialogEl()?.querySelector('.base-dialog-sub-header')?.textContent?.trim() ?? null

  /** Returns the rendered p-select element inside the company base-form-field */
  const companyDropdown = () =>
    dialogEl()?.querySelector<HTMLElement>('base-form-field[label="labels.company"] p-select')

  beforeEach(async () => {
    service = catalogServiceSpy()
    TestBed.configureTestingModule({
      imports: [EditHost],
      providers: catalogTestProviders(service),
    })
    useEnglish()
    fixture = TestBed.createComponent(EditHost)
    host = fixture.componentInstance
    document.body.appendChild(fixture.nativeElement)
    dialog = fixture.debugElement.query(
      By.directive(SkuFormDialogComponent)
    ).componentInstance

    host.open.set(true)
    await settle(fixture, 400)
  })

  afterEach(() => {
    fixture.destroy()
    fixture.nativeElement.remove()
    cleanBody()
  })

  it('does not show company name in the dialog sub-header', () => {
    expect(subHeader()).toBeNull()
  })

  it('has a disabled company dropdown control with the correct value', () => {
    expect(dialog.companyControl.value).toBe('c1')
    expect(dialog.companyControl.disabled).toBeTrue()
  })

  it('renders the company dropdown as disabled with the company label in the DOM', () => {
    const dropdown = companyDropdown()
    expect(dropdown).toBeTruthy()
    // PrimeNG adds the p-disabled class on disabled selects
    expect(dropdown!.classList.contains('p-disabled')).toBeTrue()
    // The rendered label should contain the company name
    const label = dropdown!.querySelector('.p-select-label')
    expect(label?.textContent?.trim()).toBe('Company 1')
  })

  it('populates companyOptions from the companies input', () => {
    const options = dialog.companyOptions()
    expect(options.length).toBe(2)
    expect(options[0]).toEqual({ label: 'Company 1', value: 'c1' })
    expect(options[1]).toEqual({ label: 'Company 2', value: 'c2' })
  })
})

describe('SkuFormDialog · company not in companies list (fallback)', () => {
  let fixture: ComponentFixture<EditHost>
  let dialog: SkuFormDialogComponent

  const dialogEl = () => document.body.querySelector<HTMLElement>('.p-dialog')
  const companyDropdown = () =>
    dialogEl()?.querySelector<HTMLElement>('base-form-field[label="labels.company"] p-select')

  beforeEach(async () => {
    const service = catalogServiceSpy()
    TestBed.configureTestingModule({
      imports: [EditHost],
      providers: catalogTestProviders(service),
    })
    useEnglish()
    fixture = TestBed.createComponent(EditHost)
    document.body.appendChild(fixture.nativeElement)

    // The row's company_id is 'c1' but companies list does NOT include it
    fixture.componentInstance.companies = [{ id: 'c99', name: 'Other Corp' }]
    dialog = fixture.debugElement.query(
      By.directive(SkuFormDialogComponent)
    ).componentInstance

    fixture.componentInstance.open.set(true)
    await settle(fixture, 400)
  })

  afterEach(() => {
    fixture.destroy()
    fixture.nativeElement.remove()
    cleanBody()
  })

  it('injects a fallback option from the row when its company is missing from the list', () => {
    const options = dialog.companyOptions()
    expect(options.some(o => o.value === 'c1' && o.label === 'Company 1')).toBeTrue()
  })

  it('renders the fallback company name in the disabled dropdown', () => {
    const dropdown = companyDropdown()
    expect(dropdown).toBeTruthy()
    const label = dropdown!.querySelector('.p-select-label')
    expect(label?.textContent?.trim()).toBe('Company 1')
  })
})

describe('SkuFormDialog · create mode (no sku)', () => {
  let fixture: ComponentFixture<CreateHost>

  const dialogEl = () => document.body.querySelector<HTMLElement>('.p-dialog')
  const subHeader = () =>
    dialogEl()?.querySelector('.base-dialog-sub-header')?.textContent?.trim() ?? null

  beforeEach(async () => {
    const service = catalogServiceSpy()
    TestBed.configureTestingModule({
      imports: [CreateHost],
      providers: catalogTestProviders(service),
    })
    useEnglish()
    fixture = TestBed.createComponent(CreateHost)
    document.body.appendChild(fixture.nativeElement)

    fixture.componentInstance.open.set(true)
    await settle(fixture, 400)
  })

  afterEach(() => {
    fixture.destroy()
    fixture.nativeElement.remove()
    cleanBody()
  })

  it('returns empty sub-header when no SKU is set', () => {
    expect(subHeader()).toBeNull()
  })
})

