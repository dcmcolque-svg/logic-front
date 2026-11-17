import { ComponentFixture, TestBed } from '@angular/core/testing';

import GeneratedReport from './generated-report';

describe('GeneratedReport', () => {
  let component: GeneratedReport;
  let fixture: ComponentFixture<GeneratedReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GeneratedReport]
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
