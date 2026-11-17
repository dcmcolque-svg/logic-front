import { FormGroup } from '@angular/forms';
import { AppErrorResponse } from '../../interceptors/app-error.schema';

/**
 * Mapea los errores de validación (HTTP 422) de la API v2 a un FormGroup de Angular.
 * Esto aplica la regla (ej: 'max_length': true) en el input para que PrimeNG lo marque como inválido.
 * 
 * @param form El FormGroup de la vista
 * @param err El error atrapado, usualmente validado previamente por el errorInterceptor
 */
export function setFormErrorsFromBackend(form: FormGroup, err: unknown): void {
  const appError = err as AppErrorResponse;
  
  if (appError?.errors && Array.isArray(appError.errors)) {
    appError.errors.forEach(detail => {
      const control = form.get(detail.field);
      if (control) {
        control.setErrors({ [detail.rule]: true });
        control.markAsDirty();
        control.markAsTouched();
      }
    });
  }
}
