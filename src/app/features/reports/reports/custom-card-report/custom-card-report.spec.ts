import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { provideRouter } from '@angular/router'
import { provideTranslateService } from '@ngx-translate/core'
import { providePrimeNG } from 'primeng/config'
import { ConfirmationService, MessageService } from 'primeng/api'
import { DialogService } from 'primeng/dynamicdialog'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'

import { CustomCardReport } from './custom-card-report';
import { Report } from '../reports.types';

describe('CustomCardReport', () => {
  let component: CustomCardReport;
  let fixture: ComponentFixture<CustomCardReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomCardReport],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTranslateService(),
        providePrimeNG(),
        ConfirmationService,
        MessageService,
        DialogService,
        { provide: DynamicDialogRef, useValue: { close: () => {} } },
        { provide: DynamicDialogConfig, useValue: { data: {} } },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomCardReport);
    component = fixture.componentInstance;
    component.report = {
      id: 'r1',
      name: 'Report',
      report_type: 'custom',
      color: '#336699',
      schedule_config: {} as Report['schedule_config'],
    };
    component.reportStructure = { file_type: ['csv'], report_frequency: ['daily'] };
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
