import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomCardReport } from './custom-card-report';

describe('CustomCardReport', () => {
  let component: CustomCardReport;
  let fixture: ComponentFixture<CustomCardReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomCardReport]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomCardReport);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
