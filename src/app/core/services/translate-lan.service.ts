import { inject, Injectable, signal } from '@angular/core'
import { PrimeNG } from 'primeng/config'
import { environment } from '../../../environments/environment'
import { DATEPICKER_FORMAT } from '@/app/shared/utils/display-format'


/** PrimeNG locale translations keyed by language code */
const PRIMENG_LOCALES: Record<string, Record<string, unknown>> = {
  en: {
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    dayNamesMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    today: 'Today',
    weekHeader: 'Wk',
    firstDayOfWeek: 0,
    dateFormat: DATEPICKER_FORMAT,
    chooseYear: 'Choose Year',
    chooseMonth: 'Choose Month',
    chooseDate: 'Choose Date',
    prevMonth: 'Previous Month',
    nextMonth: 'Next Month',
    prevYear: 'Previous Year',
    nextYear: 'Next Year',
    prevDecade: 'Previous Decade',
    nextDecade: 'Next Decade',
    am: 'am',
    pm: 'pm',
    // Shown by p-fileUpload next to the choose button.
    fileChosenMessage: 'Files',
    noFileChosenMessage: 'No file chosen',
    // Empty states of selects and multiselects, which fall back to PrimeNG's
    // own copy when the app does not pass its own message.
    emptyMessage: 'No results found',
    emptyFilterMessage: 'No results found',
    emptySearchMessage: 'No results found',
    emptySelectionMessage: 'No selected item',
    selectionMessage: '{0} items selected',
  },
  es: {
    dayNames: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    dayNamesShort: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    dayNamesMin: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'],
    monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
    monthNamesShort: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    today: 'Hoy',
    weekHeader: 'Sm',
    firstDayOfWeek: 1,
    dateFormat: DATEPICKER_FORMAT,
    chooseYear: 'Elegir Año',
    chooseMonth: 'Elegir Mes',
    chooseDate: 'Elegir Fecha',
    prevMonth: 'Mes Anterior',
    nextMonth: 'Mes Siguiente',
    prevYear: 'Año Anterior',
    nextYear: 'Año Siguiente',
    prevDecade: 'Década Anterior',
    nextDecade: 'Década Siguiente',
    am: 'am',
    pm: 'pm',
    fileChosenMessage: 'Archivos',
    noFileChosenMessage: 'Ningún archivo seleccionado',
    emptyMessage: 'Sin resultados',
    emptyFilterMessage: 'Sin resultados',
    emptySearchMessage: 'Sin resultados',
    emptySelectionMessage: 'Ningún elemento seleccionado',
    selectionMessage: '{0} elementos seleccionados',
  },
}

@Injectable({
  providedIn: 'root',
})
export class TranslateLanService {
  private static readonly STORAGE_KEY = 'lan'

  static lan: string =
    localStorage.getItem(TranslateLanService.STORAGE_KEY) ||
    environment.defaultLanguage

  changeLanguage = signal<string>(TranslateLanService.lan)

  private readonly primeNG = inject(PrimeNG)

  constructor() {
    if (!localStorage.getItem(TranslateLanService.STORAGE_KEY)) {
      localStorage.setItem(
        TranslateLanService.STORAGE_KEY,
        TranslateLanService.lan
      )
    }
    // Apply PrimeNG locale on startup
    this.applyPrimeNGLocale(TranslateLanService.lan)
  }

  setLanguage(lan: string): void {
    localStorage.setItem(TranslateLanService.STORAGE_KEY, lan)
    TranslateLanService.lan = lan
    this.changeLanguage.set(lan)
    this.applyPrimeNGLocale(lan)
  }

  getLanguage(): string {
    return TranslateLanService.lan
  }

  /** Updates PrimeNG's internal locale (month/day names for datepicker, etc.) */
  private applyPrimeNGLocale(lan: string): void {
    const locale = PRIMENG_LOCALES[lan] ?? PRIMENG_LOCALES['en']
    if (locale) {
      this.primeNG.setTranslation(locale)
    }
  }
}
