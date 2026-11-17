import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Receivings } from './receivings.component';

describe('Receivings', () => {
  let component: Receivings;
  let fixture: ComponentFixture<Receivings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Receivings]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Receivings);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
