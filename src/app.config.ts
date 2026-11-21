import { provideHttpClient, withInterceptors } from '@angular/common/http'
import {
  ApplicationConfig,
  LOCALE_ID,
  provideZonelessChangeDetection,
} from '@angular/core'
import {
  provideRouter,
  withEnabledBlockingInitialNavigation,
  withInMemoryScrolling,
} from '@angular/router'
import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'
import { MessageService } from 'primeng/api'
import { providePrimeNG } from 'primeng/config'
import { TranslateModule } from '@ngx-translate/core'
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader'
import { appRoutes } from './app.routes'
import { apiInterceptor } from './app/core/interceptors/api.interceptor'
import { errorInterceptor } from './app/core/interceptors/error.interceptor'
import { TranslateLanService } from './app/core/services/translate-lan.service'
import { DISPLAY_LOCALE } from './app/shared/utils/display-format'

const AppPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{blue.50}',
      100: '{blue.100}',
      200: '{blue.200}',
      300: '{blue.300}',
      400: '{blue.400}',
      500: '{blue.500}',
      600: '{blue.600}',
      700: '{blue.700}',
      800: '{blue.800}',
      900: '{blue.900}',
      950: '{blue.950}'
    }
  }
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      appRoutes,
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled',
      }),
      withEnabledBlockingInitialNavigation()
    ),
    provideHttpClient(withInterceptors([apiInterceptor, errorInterceptor])),
    provideZonelessChangeDetection(),
    // Numbers (1.234,56) and dates through Angular pipes; see display-format.
    { provide: LOCALE_ID, useValue: DISPLAY_LOCALE },
    providePrimeNG({
      theme: { preset: AppPreset, options: { darkModeSelector: '.app-dark' } },
    }),
    MessageService,
    ...TranslateModule.forRoot({
      defaultLanguage: TranslateLanService.lan,
    }).providers!,
    ...provideTranslateHttpLoader({ prefix: './i18n/', suffix: '.json' }),
  ],
  
}
