import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import {
  Report,
  ReportFilterDTO,
  GeneratedReportListResponse,
  BaseReportsResponse,
  GenerateReportDTO,
  UpdateReportDTO,
} from './reports.types';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.URL_API}v2/reports-template`;

  /** Standard report template catalog (INBOUNDS / INVENTORY / OUTBOUNDS / PARCELS) */
  getBaseReports(): Observable<BaseReportsResponse> {
    return this.http.get<BaseReportsResponse>(this.url);
  }

  /** Custom saved report templates for the current account */
  getBaseReportTemplateList(): Observable<Report[]> {
    return this.http.get<Report[]>(`${this.url}/list`).pipe(
      map(reports => reports.map(r => ({
        ...r,
        schedule_config: {
          ...r.schedule_config,
          enabled: r.schedule_config?.enabled === true
                || (r.schedule_config?.enabled as unknown) === 'true'
                || (r.schedule_config?.enabled as unknown) === 1,
        },
      })))
    );
  }

  /** Paginated list of generated reports */
  getGeneratedReportList(dto: ReportFilterDTO): Observable<GeneratedReportListResponse> {
    return this.http.post<GeneratedReportListResponse>(`${this.url}/history`, dto);
  }

  /** Create a new report template */
  createReport(report: Partial<Report>): Observable<Report> {
    return this.http.post<Report>(this.url, report);
  }

  /** Update an existing report template */
  updateReport(id: string, dto: UpdateReportDTO): Observable<Report> {
    return this.http.put<Report>(`${this.url}/${id}`, dto);
  }

  /** Delete a report template by ID */
  deleteReport(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  /** Generate and download a report (returns Blob) */
  generateReport(dto: GenerateReportDTO): Observable<Blob> {
    return this.http.post(`${this.url}/generate`, dto, {
      responseType: 'blob',
    });
  }
}
