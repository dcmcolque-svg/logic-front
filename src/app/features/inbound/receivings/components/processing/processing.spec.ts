import { ComponentFixture, TestBed } from '@angular/core/testing';

import ReceivingProcessingComponent from './processing';

describe('Processing', () => {
  let component: ReceivingProcessingComponent;
  let fixture: ComponentFixture<ReceivingProcessingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceivingProcessingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReceivingProcessingComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
