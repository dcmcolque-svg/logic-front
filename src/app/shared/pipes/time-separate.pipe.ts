import { Pipe, PipeTransform } from '@angular/core'
import { FacilityDatePipe } from './facility-date.pipe'

/** `HH:mm` of an instant in the scope's facility zone (see FacilityDatePipe). */
@Pipe({ name: 'timeSeparate', standalone: true, pure: false })
export class TimeSeparatePipe extends FacilityDatePipe implements PipeTransform {
  override transform(value: string | Date | null | undefined): string {
    return super.transform(value, 'HH:mm')
  }
}
