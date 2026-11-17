import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { of, throwError } from 'rxjs';

import FacilitiesComponent from './facilities.component';
import { FacilitiesService } from './facilities.service';
import { Facility, FacilityListResponse } from './facilities.types';
import en from '../../../../../public/i18n/en.json';
import es from '../../../../../public/i18n/es.json';

/**
 * Xenvio connection column of Preferences > Facility, including the case of a
 * Xenvio provider deleted while facilities were still connected to it.
 */
describe('FacilitiesComponent – Xenvio connection', () => {
  let svc: jasmine.SpyObj<FacilitiesService>;
  let messages: jasmine.SpyObj<MessageService>;

  const locations = { data: [{ id: 373, name: 'samuel-stable-x52', company: 'acme' }] };
  const facility = { id: 'fac-1' } as Facility;

  // Toasts are checked against the real English texts.
  const msg = en.messages;
  const xenvioErrors: Record<string, string> = en.preferences.facilities.xenvio_errors;

  function create() {
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', en);
    translate.use('en');
    const fixture = TestBed.createComponent(FacilitiesComponent);
    fixture.componentInstance.ngOnInit();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    svc = jasmine.createSpyObj<FacilitiesService>('FacilitiesService', [
      'getFacilities', 'getXenvioFulfillmentLocations', 'getXenvioFacilities', 'setXenvioFacility',
    ]);
    const noFacilities: FacilityListResponse = { data: [], meta_data: { page: 1, rows: 15, total_records: 0 } };
    svc.getFacilities.and.returnValue(of(noFacilities));
    svc.getXenvioFulfillmentLocations.and.returnValue(of(locations));
    svc.getXenvioFacilities.and.returnValue(of({ data: [] }));
    svc.setXenvioFacility.and.returnValue(of(void 0));
    messages = jasmine.createSpyObj<MessageService>('MessageService', ['add']);

    TestBed.configureTestingModule({
      imports: [FacilitiesComponent, TranslateModule.forRoot()],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), { provide: FacilitiesService, useValue: svc }],
    }).overrideComponent(FacilitiesComponent, {
      set: { template: '', providers: [DialogService, { provide: MessageService, useValue: messages }] },
    });
  });

  // The backend answers with AppErrorResponse bodies ({ success: false, code, message }).
  const apiError = (code: string, message = '') => ({ success: false, code, message });
  const connected = (facility_id: string, fulfillment_location_id: string, name: string) =>
    ({ facility_id, fulfillment_location_id, name, company: 'acme' });

  it('loads silently when the Xenvio provider was deleted', () => {
    svc.getXenvioFulfillmentLocations.and.returnValue(throwError(() => apiError('PROVIDER_NOT_FOUND', 'Provider not found.')));

    const component = create();

    expect(messages.add).not.toHaveBeenCalled();
    expect(component.xenvioLocations()).toEqual([]);
    expect(component.xenvioOptions()).toEqual([]);
    expect(component.xenvioLoading()).toBeFalse();
  });

  it('leaves every select empty when the deleted provider left no connections', () => {
    svc.getXenvioFulfillmentLocations.and.returnValue(throwError(() => apiError('PROVIDER_NOT_FOUND')));
    // Without an active provider the backend lists no connections.
    svc.getXenvioFacilities.and.returnValue(of({ data: [] }));

    const component = create();

    expect(component.xenvioByFacility()).toEqual({});
    expect(component.xenvioOptions()).toEqual([]);
  });

  it('keeps showing a connected location, disabled, when Xenvio fails to list the locations', () => {
    svc.getXenvioFulfillmentLocations.and.returnValue(throwError(() => apiError('XENVIO_EXTERNAL_FAILED', 'Xenvio is down')));
    svc.getXenvioFacilities.and.returnValue(of({ data: [connected('fac-1', '373', 'samuel-stable-x52')] }));

    const component = create();

    expect(component.xenvioByFacility()).toEqual({ 'fac-1': '373' });
    expect(component.xenvioOptions()).toEqual([{ id: '373', name: 'samuel-stable-x52', company: 'acme', disabled: true }]);
  });

  it('adds the connected locations Xenvio no longer returns, disabled and without duplicates', () => {
    svc.getXenvioFacilities.and.returnValue(of({ data: [
      connected('fac-1', '373', 'samuel-stable-x52'),
      connected('fac-2', '999', 'removed-in-xenvio'),
      connected('fac-3', '999', 'removed-in-xenvio'),
    ] }));

    const component = create();

    expect(component.xenvioOptions().map(o => o.id)).toEqual(['373', '999']);
    expect(component.xenvioOptions()[0].name).toBe('samuel-stable-x52');
    expect(component.xenvioOptions().map(o => o.disabled ?? false)).toEqual([false, true]);
    expect(component.xenvioByFacility()).toEqual({ 'fac-1': '373', 'fac-2': '999', 'fac-3': '999' });
  });

  it('still reports any other failure loading the locations, translated, never with the raw API message', () => {
    svc.getXenvioFulfillmentLocations.and.returnValue(throwError(() => apiError('XENVIO_EXTERNAL_FAILED', 'Xenvio is down')));

    create();

    expect(messages.add).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      severity: 'error', summary: msg.error, detail: xenvioErrors['XENVIO_EXTERNAL_FAILED'],
    }));
  });

  it('shows the generic message, not the raw HTTP text, when the request never reached the API', () => {
    const network = new HttpErrorResponse({ status: 0, statusText: 'Unknown Error', url: '/v2/integration/providers/xenvio/fulfillment-locations' });
    svc.getXenvioFulfillmentLocations.and.returnValue(throwError(() => network));

    create();

    expect(messages.add).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      severity: 'error', summary: msg.error, detail: msg.error_generic,
    }));
  });

  it('clearing the select disconnects the facility with a null body', () => {
    svc.getXenvioFacilities.and.returnValue(of({ data: [connected('fac-1', '373', 'samuel-stable-x52')] }));
    const component = create();

    component.updateFulfillmentLocation(facility, null);

    expect(svc.setXenvioFacility).toHaveBeenCalledOnceWith('fac-1', null);
    expect(component.xenvioByFacility()).toEqual({});
    expect(messages.add).toHaveBeenCalledOnceWith(jasmine.objectContaining({ severity: 'success', detail: msg.xenvio_disconnected }));
  });

  it('a connected location Xenvio no longer returns can still be cleared', () => {
    svc.getXenvioFacilities.and.returnValue(of({ data: [connected('fac-1', '999', 'removed-in-xenvio')] }));
    const component = create();
    expect(component.xenvioOptions().some(o => o.id === '999')).toBeTrue();

    component.updateFulfillmentLocation(facility, null);

    expect(svc.setXenvioFacility).toHaveBeenCalledOnceWith('fac-1', null);
  });

  it('another facility cannot connect a location Xenvio no longer returns', () => {
    svc.getXenvioFacilities.and.returnValue(of({ data: [connected('fac-1', '999', 'removed-in-xenvio')] }));
    const component = create();

    component.updateFulfillmentLocation({ id: 'fac-2' } as Facility, '999');

    expect(svc.setXenvioFacility).not.toHaveBeenCalled();
    expect(component.xenvioByFacility()).toEqual({ 'fac-1': '999' });
    expect(messages.add).not.toHaveBeenCalled();
  });

  it('connecting saves the location picked among the options', () => {
    const component = create();

    component.updateFulfillmentLocation(facility, '373');

    expect(svc.setXenvioFacility).toHaveBeenCalledOnceWith('fac-1', jasmine.objectContaining({ id: '373', name: 'samuel-stable-x52' }));
    expect(messages.add).toHaveBeenCalledOnceWith(jasmine.objectContaining({ severity: 'success', detail: msg.xenvio_connected }));
  });

  it('the connection messages exist in every language', () => {
    const codes = ['PROVIDER_NOT_FOUND', 'XENVIO_PROVIDER_CHANGED', 'XENVIO_LOCATION_NOT_FOUND', 'XENVIO_EXTERNAL_FAILED',
      'XENVIO_INVALID_CREDENTIALS', 'XENVIO_FACILITY_NOT_FOUND', 'XENVIO_NO_COMPANY', 'XENVIO_VALIDATION_ERROR'];
    for (const [lang, i18n] of Object.entries({ en, es })) {
      expect(i18n.messages.xenvio_connected).withContext(lang).toBeTruthy();
      expect(i18n.messages.xenvio_disconnected).withContext(lang).toBeTruthy();
      const errors: Record<string, string> = i18n.preferences.facilities.xenvio_errors;
      for (const code of codes) expect(errors[code]).withContext(`${lang} ${code}`).toBeTruthy();
    }
  });

  it('shows the generic message for an error code without translation, never the API text', () => {
    const component = create();
    svc.setXenvioFacility.and.returnValue(throwError(() => apiError('PROVIDER_DB_FAILED', 'pq: connection refused')));

    component.updateFulfillmentLocation(facility, '373');

    expect(messages.add).toHaveBeenCalledOnceWith(jasmine.objectContaining({ severity: 'error', detail: msg.error_generic }));
  });

  it('shows the translated error and reloads when saving the connection fails', () => {
    const component = create();
    svc.getXenvioFacilities.calls.reset();
    svc.setXenvioFacility.and.returnValue(throwError(() => apiError('PROVIDER_NOT_FOUND', 'Provider not found.')));

    component.updateFulfillmentLocation(facility, '373');

    expect(messages.add).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      severity: 'error', summary: msg.error, detail: xenvioErrors['PROVIDER_NOT_FOUND'],
    }));
    expect(svc.getXenvioFacilities).toHaveBeenCalledTimes(1);
  });

  for (const code of ['XENVIO_PROVIDER_CHANGED', 'XENVIO_LOCATION_NOT_FOUND']) {
    it(`reloads the locations when saving fails with ${code}`, () => {
      const component = create();
      svc.setXenvioFacility.and.returnValue(throwError(() => apiError(code, 'stale')));

      component.updateFulfillmentLocation(facility, '373');

      expect(svc.getXenvioFulfillmentLocations).toHaveBeenCalledTimes(2);
      expect(messages.add).toHaveBeenCalledOnceWith(jasmine.objectContaining({ severity: 'error', detail: xenvioErrors[code] }));
    });
  }

  it('drops the deleted account locations when saving finds the provider gone', () => {
    const component = create();
    expect(component.xenvioOptions().length).toBe(1);
    svc.getXenvioFulfillmentLocations.and.returnValue(throwError(() => apiError('PROVIDER_NOT_FOUND', 'Provider not found.')));
    svc.setXenvioFacility.and.returnValue(throwError(() => apiError('PROVIDER_NOT_FOUND', 'Provider not found.')));

    component.updateFulfillmentLocation(facility, '373');

    expect(svc.getXenvioFulfillmentLocations).toHaveBeenCalledTimes(2);
    expect(component.xenvioOptions()).toEqual([]);
    expect(component.xenvioByFacility()).toEqual({});
    expect(messages.add).toHaveBeenCalledOnceWith(jasmine.objectContaining({ severity: 'error', detail: xenvioErrors['PROVIDER_NOT_FOUND'] }));
  });

  it('keeps the locations when saving fails for another reason', () => {
    const component = create();
    svc.setXenvioFacility.and.returnValue(throwError(() => apiError('XENVIO_FACILITY_NOT_FOUND', 'Facility not found.')));

    component.updateFulfillmentLocation(facility, '373');

    expect(svc.getXenvioFulfillmentLocations).toHaveBeenCalledTimes(1);
    expect(component.xenvioOptions().length).toBe(1);
  });
});
