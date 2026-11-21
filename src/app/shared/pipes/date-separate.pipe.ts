import { Pipe, PipeTransform } from '@angular/core'
import { FacilityDatePipe } from './facility-date.pipe'

/** `yyyy-MM-dd` of an instant in the scope's facility zone (see FacilityDatePipe). */
@Pipe({ name: 'dateSeparate', standalone: true, pure: false })
export class DateSeparatePipe extends FacilityDatePipe implements PipeTransform {
  override transform(value: string | Date | null | undefined): string {
    return super.transform(value, 'yyyy-MM-dd')
  }
}
