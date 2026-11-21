import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { provideRouter } from '@angular/router'
import { provideTranslateService } from '@ngx-translate/core'
import { providePrimeNG } from 'primeng/config'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'

import { ReportDialog } from './report-dialog';

describe('ReportDialog', () => {
  let component: ReportDialog;
  let fixture: ComponentFixture<ReportDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportDialog],
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

    fixture = TestBed.createComponent(ReportDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
