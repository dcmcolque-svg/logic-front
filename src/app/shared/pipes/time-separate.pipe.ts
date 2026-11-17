import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core'
import { DatePipe } from '@angular/common'

@Pipe({
  name: 'timeSeparate',
  standalone: true,
})
export class TimeSeparatePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID)

  transform(value: string | Date | null | undefined): string {
    if (!value) return ''
    const datePipe = new DatePipe(this.locale)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return datePipe.transform(value, 'HH:mm', timezone) ?? ''
  }
}
