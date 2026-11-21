import { inject, Pipe, PipeTransform } from '@angular/core'
import { FacilityScopeService } from '@/app/core/services/facility-scope.service'
import { formatInZone } from '../utils/time-zone.util'
import { DateFormatName } from '../utils/display-format'

/**
 * Formats an instant in the time zone of a facility, with a named format of
 * display-format ('dateTime', 'date', 'time', …):
 * `{{ row.created_at | facilityDate: 'dateTime' : row.facility_id }}`.
 *
 * Without a facility id it uses the zone of the facilities in scope
 * (FacilityScopeService.zone). Replaces `| date` for timestamps of facility
 * records, which showed the browser's time. Not for date-only values (expir,
 * required_delivery_date): those have no zone.
 *
 * Impure because the facility list (and its zones) arrives asynchronously;
 * results are memoized, so a re-check costs a lookup.
 */
@Pipe({ name: 'facilityDate', standalone: true, pure: false })
export class FacilityDatePipe implements PipeTransform {
  private readonly scope = inject(FacilityScopeService)
  private readonly memo = new Map<string, string>()

  constructor() {
    this.scope.load()
  }

  transform(
    value: string | number | Date | null | undefined,
    format: DateFormatName | string = 'dateTime',
    facilityId?: string | null
  ): string {
    const zone = facilityId === undefined ? this.scope.zone() : this.scope.zoneOf(facilityId)
    return this.formatIn(value, format, zone)
  }

  /** Zone of the facilities in scope. */
  protected scopeZone(): string {
    return this.scope.zone()
  }

  /** formatInZone, memoized per pipe instance. */
  protected formatIn(value: string | number | Date | null | undefined, format: string, zone: string): string {
    if (value === null || value === undefined || value === '') return ''
    const raw = value instanceof Date ? value.getTime() : value
    const key = `${raw}|${format}|${zone}`
    let out = this.memo.get(key)
    if (out === undefined) {
      // One pipe instance serves one binding: a handful of keys at most.
      if (this.memo.size > 8) this.memo.clear()
      out = formatInZone(value, format, zone)
      this.memo.set(key, out)
    }
    return out
  }
}
