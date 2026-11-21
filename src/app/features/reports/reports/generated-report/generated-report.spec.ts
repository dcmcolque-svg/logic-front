import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { provideRouter } from '@angular/router'
import { provideTranslateService } from '@ngx-translate/core'
import { providePrimeNG } from 'primeng/config'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'

import GeneratedReport from './generated-report';

describe('GeneratedReport', () => {
  let component: GeneratedReport;
  let fixture: ComponentFixture<GeneratedReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GeneratedReport],
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

    fixture = TestBed.createComponent(GeneratedReport);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
