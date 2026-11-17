import { ComponentFixture, TestBed } from '@angular/core/testing';

import ReceivingDetailsComponent from './details';

describe('Details', () => {
  let component: ReceivingDetailsComponent;
  let fixture: ComponentFixture<ReceivingDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceivingDetailsComponent]
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
