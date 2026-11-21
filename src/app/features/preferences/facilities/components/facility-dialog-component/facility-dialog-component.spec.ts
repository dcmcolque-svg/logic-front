import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { provideRouter } from '@angular/router'
import { provideTranslateService } from '@ngx-translate/core'
import { providePrimeNG } from 'primeng/config'
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog'

import { FacilityDialogComponent } from './facility-dialog-component';

describe('FacilityDialogComponent', () => {
  let component: FacilityDialogComponent;
  let fixture: ComponentFixture<FacilityDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FacilityDialogComponent],
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

    fixture = TestBed.createComponent(FacilityDialogComponent);
    component = fixture.componentInstance;
    // Leaflet needs a real DOM container and fires from a delayed timer; not under test here.
    spyOn(component, 'initMap')
    await fixture.whenStable();
    // ngAfterViewInit calls initMap after 150ms; let it fire while the spy is still active.
    await new Promise((resolve) => setTimeout(resolve, 200))
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
