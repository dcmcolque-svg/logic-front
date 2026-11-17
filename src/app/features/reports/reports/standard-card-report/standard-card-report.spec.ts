import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StandardCardReport } from './standard-card-report';

describe('StandardCardReport', () => {
  let component: StandardCardReport;
  let fixture: ComponentFixture<StandardCardReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StandardCardReport]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StandardCardReport);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
