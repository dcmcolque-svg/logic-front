import { provideZonelessChangeDetection, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { MessageService } from 'primeng/api'
import { of, throwError } from 'rxjs'

import PosComponent from './pos.component'
import { PaymentDialogComponent } from './payment-dialog.component'
import { SalesService } from '../sales.service'
import { CatalogItem, Customer, PaymentMethod, SaleDetail, SessionSummary } from '../sales.types'
import { AuthService } from '@/app/core/services/auth.service'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'

const FAC = 'f1'

function item(over: Partial<CatalogItem> = {}): CatalogItem {
  return {
    sku_id: 's1', sku_code: 'A1', sku_name: 'Arroz', barcode: '777', image_url: null,
    company_id: 'c1', company_name: 'Host', retail_price: 10, wholesale_price: 8,
    available: 3, exact_match: true, ...over,
  }
}

const SUMMARY: SessionSummary = {
  session: {
    id: 'sess1', facility_id: FAC, facility_name: 'Centro', user_id: 'u1', user_name: 'Ana', session_number: 'CAJA-1',
    status: 'OPEN', currency: 'BOB', opening_amount: 100, opening_note: null, opened_at: '2026-11-17T12:00:00Z',
    closed_at: null, closed_by_name: null, expected_amount: null, counted_amount: null, difference: null,
    closing_note: null, sales_count: 0, sales_total: 0,
  },
  methods: [], movements: [], cash_sales: 0, cash_in: 0, cash_out: 0, expected: 100,
  sales_count: 0, sales_total: 0, discounts: 0, units: 0,
}

const CUSTOMER: Customer = {
  id: 'cu1', company_id: 'c1', company_name: 'Tienda', name: 'Juan Pérez', business_name: 'Comercial Pérez SRL',
  doc: '123 LP', email: null, phone: '70012345', address: null, notes: null, is_active: true,
  sales_count: 2, last_sale_at: null, created_at: '', updated_at: '', balances: [{ currency: 'BOB', balance: 70 }],
}

const METHODS: PaymentMethod[] = [
  { id: 'cash', code: 'CASH', name: 'Efectivo', kind: 'CASH', requires_reference: false, sort_order: 10, is_active: true },
  { id: 'card', code: 'CARD', name: 'Tarjeta', kind: 'CARD', requires_reference: true, sort_order: 20, is_active: true },
]

describe('PosComponent', () => {
  let svc: jasmine.SpyObj<SalesService>

  function setup(keepStorage = false) {
    if (!keepStorage) localStorage.clear()
    svc = jasmine.createSpyObj('SalesService', [
      'searchCatalog', 'checkout', 'currentSession', 'openSession', 'sessionSummary', 'addMovement',
      'closeSession', 'listPaymentMethods', 'listCompanies', 'searchCustomers', 'createCustomer', 'registerCustomerPayment',
    ])
    svc.listCompanies.and.returnValue(of({ data: [{ id: 'c1', name: 'Tienda' }] }))
    svc.searchCustomers.and.returnValue(of({ data: [CUSTOMER] }))
    svc.currentSession.and.returnValue(of({ session: SUMMARY, currency: 'BOB' }))
    svc.sessionSummary.and.returnValue(of(SUMMARY))
    svc.listPaymentMethods.and.returnValue(of({ data: METHODS }))
    svc.searchCatalog.and.returnValue(of({ data: [item()] }))

    const facilities = signal([{ id: FAC, name: 'Centro' }])
    TestBed.configureTestingModule({
      imports: [PosComponent, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        MessageService,
        { provide: SalesService, useValue: svc },
        { provide: AuthService, useValue: { getAuthUserInfo: () => ({ uid: 'u1', role: 'OWNER' }) } },
        {
          provide: FacilityScopeService,
          useValue: { load: () => {}, zone: () => 'America/La_Paz', zoneOf: () => 'America/La_Paz', mixedZones: () => false, all: facilities, inScope: facilities, nameOf: () => 'Centro' },
        },
      ],
    })
    const fixture = TestBed.createComponent(PosComponent)
    fixture.detectChanges()
    TestBed.tick()
    return fixture.componentInstance
  }

  it('picks the facility and loads the open register', () => {
    const c = setup()
    expect(c.facilityId()).toBe(FAC)
    expect(svc.currentSession).toHaveBeenCalledWith(FAC)
    expect(c.isOpen()).toBeTrue()
  })

  it('adds the same product twice as one line with qty 2', () => {
    const c = setup()
    c.addItem(item())
    c.addItem(item())
    expect(c.cart().length).toBe(1)
    expect(c.cart()[0].qty).toBe(2)
    expect(c.totals().total).toBe(20)
  })

  it('refuses products of another company in the same sale', () => {
    const c = setup()
    c.addItem(item())
    c.addItem(item({ sku_id: 's2', company_id: 'c2' }))
    expect(c.cart().length).toBe(1)
  })

  it('switches price list but keeps prices edited by hand', () => {
    const c = setup()
    c.addItem(item())
    c.addItem(item({ sku_id: 's2', sku_code: 'B2' }))
    c.setPrice(1, 9.5)
    c.setPriceList('WHOLESALE')
    expect(c.cart()[0].unit_price).toBe(8)
    expect(c.cart()[1].unit_price).toBe(9.5)
  })

  it('applies a percent sale discount over the subtotal', () => {
    const c = setup()
    c.addItem(item())
    c.setQty(0, 4)
    c.setDiscountMode('percent')
    c.setDiscountInput(10)
    expect(c.totals().discount).toBe(4)
    expect(c.totals().total).toBe(36)
  })

  it('sends one checkout with the same client_ref on retry after no answer', () => {
    const c = setup()
    c.addItem(item())
    svc.checkout.and.returnValue(throwError(() => 'Http failure response: 0 Unknown Error'))
    c.startCharge()
    c.charge([{ payment_method_id: 'cash', amount: 10, received: 20, reference: '' }])
    expect(c.uncertain()).toBeTrue()
    const firstRef = svc.checkout.calls.mostRecent().args[0].client_ref

    const sale = { id: 'sale1', sale_number: 'VTA-1', total: 10, change_amount: 10, items: [], payments: [] } as unknown as SaleDetail
    svc.checkout.and.returnValue(of(sale))
    c.charge([{ payment_method_id: 'cash', amount: 10, received: 20, reference: '' }])
    expect(svc.checkout.calls.mostRecent().args[0].client_ref).toBe(firstRef)
    expect(c.lastSale()?.sale_number).toBe('VTA-1')
    expect(c.cart().length).toBe(0)
    expect(c.uncertain()).toBeFalse()
  })

  it('charges a registered customer by id, not by free text', () => {
    const c = setup()
    c.addItem(item())
    c.customer.set(CUSTOMER)
    expect(c.hasCustomer()).toBeTrue()
    svc.checkout.and.returnValue(of({ id: 'sale1', sale_number: 'VTA-1', items: [], payments: [] } as unknown as SaleDetail))
    c.charge([{ payment_method_id: 'cash', amount: 10, received: 10, reference: '' }])
    const sent = svc.checkout.calls.mostRecent().args[0]
    expect(sent.customer_id).toBe('cu1')
    expect(sent.customer.name).toBe('')
    expect(c.customer()).toBeNull() // cleared with the sale
  })

  it('sells to a walk-in customer with an empty customer_id', () => {
    const c = setup()
    c.addItem(item())
    expect(c.hasCustomer()).toBeFalse()
    svc.checkout.and.returnValue(of({ id: 'sale1', sale_number: 'VTA-1', items: [], payments: [] } as unknown as SaleDetail))
    c.charge([{ payment_method_id: 'cash', amount: 10, received: 10, reference: '' }])
    expect(svc.checkout.calls.mostRecent().args[0].customer_id).toBe('')
  })

  it('keeps the picked customer in the draft and drops free-text customers of old drafts', () => {
    localStorage.clear()
    localStorage.setItem('pos-draft:u1:f1', JSON.stringify({ cart: [], discount: 0, priceList: 'RETAIL', customer: { name: 'Juan', doc: '1', email: '', phone: '' } }))
    let c = setup(true)
    expect(c.customer()).toBeNull()

    c.customer.set(CUSTOMER)
    TestBed.tick()
    const saved = JSON.parse(localStorage.getItem('pos-draft:u1:f1') ?? 'null')
    expect(saved?.customer?.id).toBe('cu1')
    TestBed.resetTestingModule()
    c = setup(true)
    expect(c.customer()?.id).toBe('cu1')
  })

  it('marks lines without stock when the server rejects the charge', () => {
    const c = setup()
    c.addItem(item())
    svc.checkout.and.returnValue(
      throwError(() => ({
        success: false,
        code: 'SALES_INSUFFICIENT_STOCK',
        errors: [{ field: 'lines[0].qty', rule: 'insufficient_stock', context: { sku_id: 's1', qty_available: 0 } }],
      }))
    )
    c.charge([{ payment_method_id: 'cash', amount: 10, received: 10, reference: '' }])
    expect(c.lineIssues()['s1']).toBeTruthy()
    expect(c.cart()[0].item.available).toBe(0)
  })
})

describe('PaymentDialogComponent', () => {
  function setup(total: number, currency: 'BOB' | 'CLP' = 'BOB') {
    TestBed.configureTestingModule({
      imports: [PaymentDialogComponent, TranslateModule.forRoot()],
      providers: [provideZonelessChangeDetection()],
    })
    const fixture = TestBed.createComponent(PaymentDialogComponent)
    fixture.componentRef.setInput('total', total)
    fixture.componentRef.setInput('currency', currency)
    fixture.componentRef.setInput('methods', METHODS)
    const c = fixture.componentInstance
    c.reset()
    return c
  }

  it('starts with one cash payment for the total and computes change', () => {
    const c = setup(37.5)
    expect(c.rows().length).toBe(1)
    c.setReceived(0, 50)
    expect(c.change()).toBe(12.5)
    expect(c.problems()).toEqual([])
  })

  it('switches the single payment to card and asks for its voucher', () => {
    const c = setup(20)
    c.pick(METHODS[1])
    expect(c.rows()[0].method.id).toBe('card')
    expect(c.problems()).toContain('sales.pos.reference_missing')
    c.setReference(0, 'V-1')
    expect(c.problems()).toEqual([])
  })

  it('tapping another method without "add" switches the whole payment', () => {
    const c = setup(100)
    c.pick(METHODS[1])
    expect(c.rows().map(r => [r.method.id, r.amount])).toEqual([['card', 100]])
  })

  it('pays 100 as 50 cash + 50 card with "add another method"', () => {
    const c = setup(100)
    c.adding.set(true)
    c.pick(METHODS[1])
    expect(c.rows().map(r => [r.method.id, r.amount, r.received])).toEqual([
      ['cash', 50, 50],
      ['card', 50, 50],
    ])
    expect(c.change()).toBe(0)
    expect(c.remaining()).toBe(0)
    c.setReference(1, 'V-77')
    expect(c.problems()).toEqual([])
    let out: unknown
    c.confirmed.subscribe(p => (out = p))
    c.submit()
    expect(out).toEqual([
      { payment_method_id: 'cash', amount: 50, received: 50, reference: '' },
      { payment_method_id: 'card', amount: 50, received: 50, reference: 'V-77' },
    ])
  })

  it('rebalances the other payment when one amount changes', () => {
    const c = setup(100)
    c.adding.set(true)
    c.pick(METHODS[1])
    c.setAmount(0, 30)
    expect(c.rows().map(r => r.amount)).toEqual([30, 70])
    c.setAmount(1, 90)
    expect(c.rows().map(r => r.amount)).toEqual([10, 90])
    expect(c.remaining()).toBe(0)
  })

  it('gives change on the cash part only', () => {
    const c = setup(100)
    c.adding.set(true)
    c.pick(METHODS[1])
    c.setReceived(0, 100) // customer hands a 100 bill for the 50 cash part
    expect(c.change()).toBe(50)
    c.setAmount(0, 60) // received was typed: it stays
    expect(c.rows()[0].received).toBe(100)
    expect(c.change()).toBe(40)
  })

  it('removing a payment gives its amount back', () => {
    const c = setup(100)
    c.adding.set(true)
    c.pick(METHODS[1])
    c.remove(1)
    expect(c.rows().map(r => [r.method.id, r.amount])).toEqual([['cash', 100]])
  })

  it('splits whole pesos in CLP', () => {
    const c = setup(4351, 'CLP')
    c.adding.set(true)
    c.pick(METHODS[1])
    expect(c.rows().map(r => r.amount)).toEqual([2175, 2176])
  })

  it('emits payments with received = amount for non-cash methods', () => {
    const c = setup(20)
    c.pick(METHODS[1])
    c.setReference(0, 'V-9')
    let out: unknown
    c.confirmed.subscribe(p => (out = p))
    c.submit()
    expect(out).toEqual([{ payment_method_id: 'card', amount: 20, received: 20, reference: 'V-9' }])
  })
})
