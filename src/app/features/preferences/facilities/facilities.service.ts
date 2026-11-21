import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
    Facility,
    FacilityDTO,
    FacilityListResponse,
} from './facilities.types';
import { CostingInitializeResult, CostingSettings } from '../../../shared/utils/costing.util';

@Injectable({ providedIn: 'root' })
export class FacilitiesService {
    private readonly http = inject(HttpClient);
    private readonly facilityUrl = `${environment.URL_API}v2/facility`;

    /** Facility-scoped key (with facility_id) */
    getFacilities(dto: FacilityDTO): Observable<FacilityListResponse> {
        return this.http.post<FacilityListResponse>(`${this.facilityUrl}/my`, dto);
    }

    createFacility(facility: Partial<Facility>): Observable<Facility> {
        return this.http.post<Facility>(this.facilityUrl, facility);
    }

    updateFacility(id: string, facility: Partial<Facility>): Observable<Facility> {
        return this.http.put<Facility>(`${this.facilityUrl}/${id}`, facility);
    }

    /**
     * Turns inventory costing on/off (OWNER only). From NONE it values the
     * current stock at the catalog cost as the opening balance.
     * POST /v2/facility/:id/costing/initialize
     */
    initializeCosting(id: string, costing: CostingSettings): Observable<CostingInitializeResult> {
        return this.http.post<CostingInitializeResult>(`${this.facilityUrl}/${id}/costing/initialize`, costing);
    }

    deleteFacility(id: string): Observable<void> {
        return this.http.delete<void>(`${this.facilityUrl}/${id}`);
    }
}
