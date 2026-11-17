import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
    Facility,
    FacilityDTO,
    FacilityListResponse,
    OptionSelect,
    XenvioFacilitiesResponse,
    XenvioFulfillmentLocationsResponse,
} from './facilities.types';

@Injectable({ providedIn: 'root' })
export class FacilitiesService {
    private readonly http = inject(HttpClient);
    private readonly facilityUrl = `${environment.URL_API}v2/facility`;
    private readonly xenvioUrl = `${environment.URL_API}v2/integration/providers/xenvio`;

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

    deleteFacility(id: string): Observable<void> {
        return this.http.delete<void>(`${this.facilityUrl}/${id}`);
    }

    // ── Xenvio Connection ───────────────────────────────────────────────────────

    /** Fulfillment locations of the Xenvio account configured in Providers */
    getXenvioFulfillmentLocations(): Observable<XenvioFulfillmentLocationsResponse> {
        return this.http.get<XenvioFulfillmentLocationsResponse>(`${this.xenvioUrl}/fulfillment-locations`);
    }

    /** Fulfillment location assigned to each facility */
    getXenvioFacilities(): Observable<XenvioFacilitiesResponse> {
        return this.http.get<XenvioFacilitiesResponse>(`${this.xenvioUrl}/facilities`);
    }

    /** Assign (location) or remove (null) the Xenvio connection of a facility */
    setXenvioFacility(facilityId: string, location: OptionSelect | null): Observable<void> {
        return this.http.put<void>(`${this.xenvioUrl}/facilities/${facilityId}`, location);
    }
}
