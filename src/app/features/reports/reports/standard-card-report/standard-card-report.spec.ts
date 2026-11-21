import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { provideRouter } from '@angular/router'
import { provideTranslateService } from '@ngx-translate/core'
import { providePrimeNG } from 'primeng/config'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'

import { StandardCardReport } from './standard-card-report';
import { Report } from '../reports.types';

describe('StandardCardReport', () => {
  let component: StandardCardReport;
  let fixture: ComponentFixture<StandardCardReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StandardCardReport],
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

    fixture = TestBed.createComponent(StandardCardReport);
    component = fixture.componentInstance;
    component.report = {
      id: 'r1',
      name: 'Report',
      report_type: 'standard',
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
