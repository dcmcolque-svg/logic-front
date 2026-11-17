import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable, map } from 'rxjs'
import { environment } from '@/environments/environment'

export interface Operator {
  id: string
  name: string
  slug?: string
  is_active?: boolean
}

interface OperatorListResponse {
  data: Operator[]
  meta_data: { total_records: number; page: number; rows: number }
}

@Injectable({ providedIn: 'root' })
export class OperatorService {
  private readonly http = inject(HttpClient)
  private readonly base = `${environment.URL_API}v2/operator`

  /** Lists all operators accessible to the current user */
  list(page = 1, rows = 100): Observable<Operator[]> {
    return this.http
      .post<OperatorListResponse>(`${this.base}/list`, {
        filter: {},
        config: { page, rows },
      })
      .pipe(map((r) => r?.data ?? []))
  }
}
