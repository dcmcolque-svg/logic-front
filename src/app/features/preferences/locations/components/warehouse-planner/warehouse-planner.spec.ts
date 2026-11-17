import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WarehousePlanner } from './warehouse-planner';

describe('WarehousePlanner', () => {
  let component: WarehousePlanner;
  let fixture: ComponentFixture<WarehousePlanner>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WarehousePlanner]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WarehousePlanner);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
