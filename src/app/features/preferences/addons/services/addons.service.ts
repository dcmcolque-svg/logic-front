import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@/environments/environment';
import {
  AddonApplicationDto,
  AddonConfigDto,
  FilterPayload,
  PaginatedResponse,
} from './addons.types';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AddonsService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.URL_API;

  // State
  private readonly _applications = signal<AddonApplicationDto[]>([]);
  private readonly _configs = signal<AddonConfigDto[]>([]);
  private readonly _companies = signal<{ id: string; name: string }[]>([]); // Assuming companies list format
  private readonly _loading = signal(false);

  // Readonly access
  readonly applications = this._applications.asReadonly();
  readonly configs = this._configs.asReadonly();
  readonly companies = this._companies.asReadonly();
  readonly loading = this._loading.asReadonly();

  // Load Base Applications
  loadApplications(payload: FilterPayload) {
    this._loading.set(true);
    this.http
      .post<PaginatedResponse<AddonApplicationDto>>(
        `${this.url}v2/integrations/addon-application/list`,
        payload
      )
      .subscribe({
        next: (res) => {
          this._applications.set(res.data || []);
          this._loading.set(false);
        },
        error: () => this._loading.set(false),
      });
  }

  // Load Active Configurations
  loadConfigs(payload: FilterPayload) {
    this._loading.set(true);
    this.http
      .post<PaginatedResponse<AddonConfigDto>>(
        `${this.url}v2/integrations/addon/list`,
        payload
      )
      .subscribe({
        next: (res) => {
          this._configs.set(res.data || []);
          this._loading.set(false);
        },
        error: () => this._loading.set(false),
      });
  }

  // Load Companies
  loadCompanies(payload: FilterPayload) {
    this.http
      .post<PaginatedResponse<{ id: string; name: string }>>(
        `${this.url}v2/company/list`,
        payload
      )
      .subscribe({
        next: (res) => {
          this._companies.set(res.data || []);
        },
        error: () => {},
      });
  }

  createConfig(dto: AddonConfigDto): Observable<AddonConfigDto> {
    return this.http.post<AddonConfigDto>(`${this.url}v2/integrations/addon`, dto);
  }

  updateConfig(dto: AddonConfigDto): Observable<AddonConfigDto> {
    return this.http.put<AddonConfigDto>(
      `${this.url}v2/integrations/addon/${dto.id}`,
      dto
    );
  }

  deleteConfig(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}v2/integrations/addon/${id}`);
  }
}
