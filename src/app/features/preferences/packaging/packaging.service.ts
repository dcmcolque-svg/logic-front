import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
    PackagingListResponse,
    PackagingIntakeInput,
    PackagingIntakeResult,
    SkuUpdateInput,
    SkuModel,
    PackagingDTO,
    ContainerProfileListResponse,
    RecountInput,
    RecountResult,
} from './packaging.types';

@Injectable({ providedIn: 'root' })
export class PackagingService {
    private readonly http = inject(HttpClient);

    private readonly inventoryUrl = `${environment.URL_API}v2/inventory/list`;
    private readonly skuUrl       = `${environment.URL_API}v2/cat/sku`;
    private readonly containerProfileUrl = `${environment.URL_API}v2/wms/container/profile/list`;
    private readonly recountUrl  = `${environment.URL_API}v2/inventory/recount`;

    /** List packaging items via inventory endpoint with is_packaging filter */
    listPackaging(dto: PackagingDTO): Observable<PackagingListResponse> {
        // Always force is_packaging = true
        const payload = {
            ...dto,
            filter: {
                ...dto.filter,
                is_packaging: { value: true, match_mode: 'equals' },
            },
        };
        return this.http.post<PackagingListResponse>(this.inventoryUrl, payload);
    }

    /** List container profiles filtered by PACKAGING type */
    listContainerProfiles(): Observable<ContainerProfileListResponse> {
        return this.http.post<ContainerProfileListResponse>(this.containerProfileUrl, {
            config: { page: 1, rows: 50, sort_field: [] },
            filter: {
                container_type: { match_mode: 'equals', value: 'PACKAGING' },
            },
        });
    }

    /** Create a new packaging SKU + initial stock */
    createPackaging(input: PackagingIntakeInput): Observable<PackagingIntakeResult> {
        return this.http.post<PackagingIntakeResult>(`${this.skuUrl}/packaging/intake`, input);
    }

    /** Update an existing SKU's catalog fields */
    updatePackaging(id: string, input: SkuUpdateInput): Observable<SkuModel> {
        return this.http.put<SkuModel>(`${this.skuUrl}/${id}`, input);
    }

    /** Recount (adjust) inventory quantity for a packaging item */
    recountPackaging(input: RecountInput): Observable<RecountResult> {
        return this.http.post<RecountResult>(this.recountUrl, input);
    }
}
