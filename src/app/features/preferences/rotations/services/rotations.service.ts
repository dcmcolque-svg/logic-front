import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { environment } from '../../../../../environments/environment'
import {
  InventoryRotation,
  RotationCreateInput,
  RotationListRequest,
  RotationListResponse,
  RotationUpdateInput,
  ZoneListResponse,
} from './rotations.types'

@Injectable({ providedIn: 'root' })
export class RotationsService {
  private readonly http = inject(HttpClient)
  private readonly baseUrl = environment.URL_API + 'v2/inventory/rotation'
  private readonly zonesUrl = environment.URL_API + 'v2/wms/zone'


  getRotations(request: RotationListRequest): Observable<RotationListResponse> {
    return this.http.post<RotationListResponse>(`${this.baseUrl}/list`, request)
  }

  createRotation(data: RotationCreateInput): Observable<InventoryRotation> {
    return this.http.post<InventoryRotation>(this.baseUrl, data)
  }

  updateRotation(id: string, data: RotationUpdateInput): Observable<InventoryRotation> {
    return this.http.put<InventoryRotation>(`${this.baseUrl}/${id}`, data)
  }

  deleteRotation(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}`)
  }

  toggleDefault(id: string, isDefault: boolean): Observable<InventoryRotation> {
    return this.http.patch<InventoryRotation>(`${this.baseUrl}/${id}/default`, { default: isDefault })
  }

  getZones(): Observable<ZoneListResponse> {
    // Return array directly to match edge-frontend pattern and the user's explicit log validation
  return this.http.post<ZoneListResponse>(`${this.zonesUrl}/list`, {
    "config": {
        "page": 1,
        "rows": 100,
        "populate_data": true,
        "sort_field": [
            {
                "field": "name",
                "order": 1
            }
        ]
    }
})
  }
}

