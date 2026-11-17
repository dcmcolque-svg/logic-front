import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core'
import { DatePipe } from '@angular/common'

@Pipe({
  name: 'dateTimeSeparate',
  standalone: true,
})
export class DateTimeSeparatePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID)

  transform(value: string | Date, utc?: string): string {
    const datePipe = new DatePipe(this.locale)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const tz = utc === 'utc' || utc === 'UTC' ? 'UTC' : timezone
    const formattedDate = datePipe.transform(value, 'yyyy-MM-dd', tz)
    const formattedTime = datePipe.transform(value, 'HH:mm', tz)
    return `${formattedDate}\n${formattedTime}`
  }
}
