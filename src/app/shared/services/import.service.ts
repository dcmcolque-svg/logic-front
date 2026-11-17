import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { environment } from '../../../environments/environment'
import {
  ImportFileFormat,
  ImportLog,
  ImportLogListRequest,
  ImportLogListResponse,
  ImportModule,
} from '../types/import.types'

/** Where the records are created: a facility, a company, or both. */
export interface ImportScope {
  facilityId?: string | null
  companyId?: string | null
}

/**
 * ImportService — CSV import and its upload logs.
 *
 * The file is sent as-is: the backend parses it, validates every row, creates
 * what passes and returns the log, so the same rules apply no matter who calls
 * the endpoint.
 */
@Injectable({ providedIn: 'root' })
export class ImportService {
  private readonly http = inject(HttpClient)
  private readonly baseUrl = `${environment.URL_API}v2/import`

  /**
   * Uploads a CSV for one module.
   * Resolves with the upload log — totals plus the rows that failed and why.
   *
   * The scope the records are created under depends on the module: parcels need
   * a facility, catalog a company, receivings both.
   */
  upload(
    module: ImportModule,
    file: File,
    scope: ImportScope
  ): Observable<ImportLog> {
    return this.http.post<ImportLog>(
      `${this.baseUrl}/upload/${module}`,
      this.form(file, scope)
    )
  }

  /**
   * Runs every check the upload would and writes nothing. The log comes back
   * marked `preview` with every parsed row, so the user can see what would
   * land before saving. Nothing is kept server-side: saving means sending the
   * same file to `upload()`.
   */
  validate(
    module: ImportModule,
    file: File,
    scope: ImportScope
  ): Observable<ImportLog> {
    return this.http.post<ImportLog>(
      `${this.baseUrl}/validate/${module}`,
      this.form(file, scope)
    )
  }

  /** Downloads the module's template (headers + one example row). */
  downloadSample(
    module: ImportModule,
    format: ImportFileFormat = 'csv'
  ): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/sample/${module}`, {
      params: { format },
      responseType: 'blob',
    })
  }

  private form(file: File, scope: ImportScope): FormData {
    const form = new FormData()
    form.append('file', file, file.name)
    if (scope.facilityId) form.append('facility_id', scope.facilityId)
    if (scope.companyId) form.append('company_id', scope.companyId)
    return form
  }

  /** Lists past uploads for the caller's operator, newest first. */
  listLogs(request: ImportLogListRequest): Observable<ImportLogListResponse> {
    return this.http.post<ImportLogListResponse>(
      `${this.baseUrl}/logs/list`,
      request
    )
  }

  /** One upload log with every failed row. */
  getLog(id: string): Observable<ImportLog> {
    return this.http.get<ImportLog>(`${this.baseUrl}/logs/detail/${id}`)
  }
}
