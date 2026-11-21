import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { provideRouter } from '@angular/router'
import { provideTranslateService } from '@ngx-translate/core'
import { providePrimeNG } from 'primeng/config'
import { MessageService } from 'primeng/api'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'

import ReceivingDetailsComponent from './details';

describe('Details', () => {
  let component: ReceivingDetailsComponent;
  let fixture: ComponentFixture<ReceivingDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceivingDetailsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTranslateService(),
        providePrimeNG(),
        MessageService,
        { provide: DynamicDialogRef, useValue: { close: () => {} } },
        { provide: DynamicDialogConfig, useValue: { data: {} } },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReceivingDetailsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
