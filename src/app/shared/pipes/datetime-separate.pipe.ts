import { Pipe, PipeTransform } from '@angular/core'
import { FacilityDatePipe } from './facility-date.pipe'

/**
 * `yyyy-MM-dd\nHH:mm` of an instant in the scope's facility zone (see
 * FacilityDatePipe); `'utc'` as argument keeps it in UTC.
 */
@Pipe({ name: 'dateTimeSeparate', standalone: true, pure: false })
export class DateTimeSeparatePipe extends FacilityDatePipe implements PipeTransform {
  override transform(value: string | Date | null | undefined, utc?: string): string {
    if (!value) return ''
    if (utc === 'utc' || utc === 'UTC') {
      return `${this.formatIn(value, 'date', 'UTC')}\n${this.formatIn(value, 'time', 'UTC')}`
    }
    const zone = this.scopeZone()
    return `${this.formatIn(value, 'date', zone)}\n${this.formatIn(value, 'time', zone)}`
  }
}
