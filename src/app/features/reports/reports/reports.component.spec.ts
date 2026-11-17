import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';

import Reports from './reports.component';
import { Report, BaseReportsResponse } from './reports.types';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Minimal report stub for a given category */
function stubReport(category: string, id = '1'): Report {
  return {
    id,
    name: `test_${category.toLowerCase()}`,
    report_type: `${category}_REPORT`,
    category_report: category,
    schedule_config: { enabled: false, recipients: [], frequency: 'DAILY' },
  };
}

/** Build a BaseReportsResponse with reports for every category */
function buildBaseResponse(reports: Report[]): BaseReportsResponse {
  return {
    data: reports,
    facilities: null,
    operator: null,
    file_type: ['CSV', 'XLSX'],
    report_frequency: ['DAILY', 'WEEKLY'],
  };
}

describe('Reports', () => {
  let component: Reports;
  let fixture: ComponentFixture<Reports>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Reports,
        TranslateModule.forRoot(),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Reports);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Flush the initial base reports request that fires on ngOnInit */
  function initWithReports(reports: Report[]): void {
    fixture.detectChanges(); // triggers ngOnInit → loadBaseReports
    const req = httpMock.expectOne(r => r.url.includes('reports-template'));
    req.flush(buildBaseResponse(reports));
    fixture.detectChanges();
  }

  // ── Basic creation ───────────────────────────────────────────────────────

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── All categories are active ────────────────────────────────────────────

  it('should include every category group, each with its own reports', () => {
    initWithReports([
      stubReport('INBOUNDS', 'in-1'),
      stubReport('INVENTORY', 'inv-1'),
      stubReport('OUTBOUNDS', 'out-1'),
      stubReport('PARCELS', 'par-1'),
    ]);

    const groups = component.categoryGroups();

    expect(groups.map(g => g.key)).toEqual(['INBOUNDS', 'INVENTORY', 'OUTBOUNDS', 'PARCELS']);
    expect(groups.map(g => g.reports.map(r => r.id))).toEqual([['in-1'], ['inv-1'], ['out-1'], ['par-1']]);
  });

  // ── Category group building ──────────────────────────────────────────────

  it('should build category groups with matching reports only', () => {
    initWithReports([
      stubReport('PARCELS', 'p1'),
      stubReport('PARCELS', 'p2'),
    ]);

    const parcelGroup = component.categoryGroups().find(g => g.key === 'PARCELS');
    expect(parcelGroup).toBeTruthy();
    expect(parcelGroup!.reports.length).toBe(2);
  });

  it('should produce empty reports array for PARCELS when no parcels data exists', () => {
    initWithReports([]);

    const parcelGroup = component.categoryGroups().find(g => g.key === 'PARCELS');
    expect(parcelGroup).toBeTruthy();
    expect(parcelGroup!.reports.length).toBe(0);
  });

  // ── View mode ────────────────────────────────────────────────────────────

  it('should default to STANDARD view mode', () => {
    expect(component.viewMode).toBe('STANDARD');
  });

  it('should return the correct selectedMenuLabel', () => {
    expect(component.selectedMenuLabel).toBe('standard_reports');
  });

  // ── Loading state ────────────────────────────────────────────────────────

  it('should set loading to true while fetching base reports', () => {
    fixture.detectChanges();
    expect(component.loading()).toBeTrue();

    const req = httpMock.expectOne(r => r.url.includes('reports-template'));
    req.flush(buildBaseResponse([]));

    expect(component.loading()).toBeFalse();
  });

  it('should set loading to false on error', () => {
    fixture.detectChanges();
    expect(component.loading()).toBeTrue();

    const req = httpMock.expectOne(r => r.url.includes('reports-template'));
    req.error(new ProgressEvent('error'));

    expect(component.loading()).toBeFalse();
  });

  // ── Report structure ─────────────────────────────────────────────────────

  it('should populate reportStructure from API response', () => {
    initWithReports([]);

    const structure = component.reportStructure();
    expect(structure.file_type).toEqual(['CSV', 'XLSX']);
    expect(structure.report_frequency).toEqual(['DAILY', 'WEEKLY']);
  });
});
