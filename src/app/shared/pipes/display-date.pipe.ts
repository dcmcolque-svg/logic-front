import { Pipe, PipeTransform } from '@angular/core'
import { DateFormatName, formatDisplayDate } from '../utils/display-format'

/**
 * A date without a facility (users, credentials, customers…) in a named
 * format: `{{ row.created_at | displayDate: 'dateTime' }}`. Date-only values
 * go with 'UTC': `{{ row.expir | displayDate: 'date' : 'UTC' }}`.
 *
 * Facility records use `facilityDate`, which also picks the facility's zone.
 */
@Pipe({ name: 'displayDate', standalone: true })
export class DisplayDatePipe implements PipeTransform {
  transform(
    value: string | number | Date | null | undefined,
    format: DateFormatName | string = 'dateTime',
    timeZone?: string
  ): string {
    return formatDisplayDate(value, format, timeZone)
  }
}
