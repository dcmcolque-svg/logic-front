import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { provideRouter } from '@angular/router'
import { provideTranslateService } from '@ngx-translate/core'
import { providePrimeNG } from 'primeng/config'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'

import ReceivingProcessingComponent from './processing';

describe('Processing', () => {
  let component: ReceivingProcessingComponent;
  let fixture: ComponentFixture<ReceivingProcessingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceivingProcessingComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTranslateService(),
        providePrimeNG(),
        { provide: DynamicDialogRef, useValue: { close: () => {} } },
        { provide: DynamicDialogConfig, useValue: { data: {} } },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReceivingProcessingComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Two lines of a receiving that can be received
  function seed(): void {
    component.receiving.set({ status: 'PROCESSING' } as any)
    component.lines.set([
      { id: 'l1', sku_code: 'SKU-1', barcode: '7790001', qty_expected: 5, qty_received: 0, qty_pending: 5,
        qty_to_receive: 0, batch_lot: '', expiry: null, serials: [], receive_cost: null, error: null } as any,
      { id: 'l2', sku_code: 'SKU-2', barcode: null, qty_expected: 3, qty_received: 0, qty_pending: 3,
        qty_to_receive: 0, batch_lot: '', expiry: null, serials: [], receive_cost: null, error: null } as any,
    ])
  }

  describe('scan', () => {
    beforeEach(seed)

    it('adds 1 to the line whose barcode was scanned', () => {
      component.scanCode = '7790001'
      component.onScan()
      component.scanCode = '7790001'
      component.onScan()
      expect(component.lines()[0].qty_to_receive).toBe(2)
      expect(component.scannedLineId()).toBe('l1')
      expect(component.scanCode).toBe('')
    })

    it('matches the SKU code too, ignoring case', () => {
      component.scanCode = 'sku-2'
      component.onScan()
      expect(component.lines()[1].qty_to_receive).toBe(1)
    })

    it('leaves the lines alone for an unknown code', () => {
      component.scanCode = 'NOPE'
      component.onScan()
      expect(component.lines().every(l => l.qty_to_receive === 0)).toBeTrue()
    })

    it('does nothing while the receiving cannot be received', () => {
      component.receiving.set({ status: 'IN-TRANSIT' } as any)
      component.scanCode = '7790001'
      component.onScan()
      expect(component.lines()[0].qty_to_receive).toBe(0)
    })
  })

  describe('leaving with typed quantities', () => {
    beforeEach(seed)

    it('leaves freely when nothing was typed', () => {
      expect(component.canLeave()).toBeTrue()
    })

    it('asks first when there are quantities not received', () => {
      component.updateLine('l1', { qty_to_receive: 2 } as any)
      expect(component.hasUnsavedChanges()).toBeTrue()
      expect(component.canLeave() instanceof Promise).toBeTrue()
    })
  })

  describe('expiryDays', () => {
    it('is negative for a past date and 0 for today', () => {
      const today = new Date()
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
      expect(component.expiryDays(today)).toBe(0)
      expect(component.expiryDays(yesterday)).toBe(-1)
      expect(component.expiryDays(null)).toBeNull()
    })
  })
});
