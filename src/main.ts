import { bootstrapApplication } from '@angular/platform-browser'
import { appConfig } from './app.config'
import { AppComponent } from './app.component'
import { applyInputNumberLocale } from './app/shared/utils/input-number-locale'

// <p-inputnumber> writes numbers like the rest of the app (display-format).
applyInputNumberLocale()

try {
  await bootstrapApplication(AppComponent, appConfig)
} catch (err) {
  console.error(err)
}
