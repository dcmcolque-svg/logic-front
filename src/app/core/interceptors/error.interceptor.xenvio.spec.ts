import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { errorInterceptor } from './error.interceptor';
import { MessageEdgeService } from '../services/message.service';
import { AuthService } from '../services/auth.service';
import { AppErrorResponse } from './app-error.schema';
import { environment } from '../../../environments/environment';

/** The facilities page handles the errors of the Xenvio connection endpoints itself. */
describe('errorInterceptor – Xenvio facility connections', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let messages: jasmine.SpyObj<MessageEdgeService>;
  let auth: jasmine.SpyObj<AuthService>;

  const base = `${environment.URL_API}v2/integration/providers`;
  const notFound = { success: false, code: 'PROVIDER_NOT_FOUND', message: 'Provider not found.' };

  beforeEach(() => {
    messages = jasmine.createSpyObj<MessageEdgeService>('MessageEdgeService', ['showError', 'showInfo']);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MessageEdgeService, useValue: messages },
        { provide: AuthService, useValue: (auth = jasmine.createSpyObj<AuthService>('AuthService', ['redirectTologin'])) },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('does not toast a missing provider when loading the fulfillment locations', () => {
    let received: AppErrorResponse | undefined;
    http.get(`${base}/xenvio/fulfillment-locations`).subscribe({ error: e => (received = e) });
    backend.expectOne(`${base}/xenvio/fulfillment-locations`).flush(notFound, { status: 404, statusText: 'Not Found' });

    expect(messages.showError).not.toHaveBeenCalled();
    expect(received?.code).toBe('PROVIDER_NOT_FOUND');
  });

  it('does not toast a failed connection save: the page shows it', () => {
    http.put(`${base}/xenvio/facilities/fac-1`, null).subscribe({ error: () => {} });
    backend.expectOne(`${base}/xenvio/facilities/fac-1`).flush(
      { success: false, code: 'INVALID_REQUEST_BODY', message: 'Invalid request body.' }, { status: 400, statusText: 'Bad Request' });

    expect(messages.showError).not.toHaveBeenCalled();
  });

  it('still toasts the other provider endpoints', () => {
    http.get(`${base}/xenvio`).subscribe({ error: () => {} });
    backend.expectOne(`${base}/xenvio`).flush(notFound, { status: 404, statusText: 'Not Found' });

    expect(messages.showError).toHaveBeenCalledOnceWith('Provider not found.');
  });

  it('still sends an expired session to login from a suppressed endpoint', () => {
    http.put(`${base}/xenvio/facilities/fac-1`, { id: '373' }).subscribe({ error: () => {} });
    backend.expectOne(`${base}/xenvio/facilities/fac-1`).flush('unauthorized\n', { status: 401, statusText: 'Unauthorized' });

    expect(auth.redirectTologin).toHaveBeenCalledTimes(1);
    expect(messages.showError).not.toHaveBeenCalled();
  });

  // The login redirect applies to every suppressed endpoint, not only Xenvio's:
  // before, a suppressed request with an expired session failed silently.
  it('sends an expired session to login from any suppressed endpoint', () => {
    const facility = `${environment.URL_API}v2/facility/fac-1`;
    http.put(facility, {}).subscribe({ error: () => {} });
    backend.expectOne(facility).flush('unauthorized\n', { status: 401, statusText: 'Unauthorized' });

    expect(auth.redirectTologin).toHaveBeenCalledTimes(1);
    expect(messages.showError).not.toHaveBeenCalled();
  });

  it('does not send other failures of a suppressed endpoint to login', () => {
    http.get(`${base}/xenvio/fulfillment-locations`).subscribe({ error: () => {} });
    backend.expectOne(`${base}/xenvio/fulfillment-locations`).flush('upstream timeout', { status: 504, statusText: 'Gateway Timeout' });

    expect(auth.redirectTologin).not.toHaveBeenCalled();
    expect(messages.showError).not.toHaveBeenCalled();
  });
});
