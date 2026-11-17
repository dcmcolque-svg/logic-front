import { TestBed } from '@angular/core/testing';

import { Receivings } from './receivings';

describe('Receivings', () => {
  let service: Receivings;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Receivings);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
