import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http'
import { inject } from '@angular/core'
import { catchError, Observable, throwError } from 'rxjs'
import { MessageEdgeService } from '../services/message.service'
import { AuthService } from '../services/auth.service'
import { isAppErrorResponse } from './app-error.schema'

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const messageService = inject(MessageEdgeService)
  const authService = inject(AuthService)

  return next(req).pipe(
    catchError((error: HttpErrorResponse): Observable<any> => {
      // 1. Type guard parsing para V2
      if (error.error && typeof error.error === 'object' && isAppErrorResponse(error.error)) {
        const v2Error = error.error;

        if (error.status !== 422 && v2Error.message && !shouldSuppressErrorMessage(req)) {
          messageService.showError(v2Error.message);
        }

        return throwError(() => v2Error);
      }
      
      // 2. V1 Fallback
      const errorMsg = resolveV1ErrorMessage(error)

      if (!shouldSuppressErrorMessage(req)) {
        notifyV1Error(error, errorMsg, messageService, authService)
      } else if (isAuthenticationError(error.error)) {
        // Suppressing only hides the toast: an expired session still goes to login.
        authService.redirectTologin()
      }

      throw error
    })
  )
}

function resolveV1ErrorMessage(error: HttpErrorResponse): string {
  switch (true) {
    case error.error instanceof ProgressEvent:
      return `${error.message} - Call to support`
    case typeof error.error === 'string':
      return `${error.error}`
    case typeof error.error === 'object' && error.error !== null:
      return (
        error.error.error ||
        error.error.message ||
        error.error.detail ||
        JSON.stringify(error.error)
      )
    default:
      return `${error.message}`
  }
}

/**
 * Shows the V1 error to the user (or redirects to login on auth errors).
 * Throws the error message for 404/400/500/0/401 statuses.
 */
function notifyV1Error(
  error: HttpErrorResponse,
  errorMsg: string,
  messageService: MessageEdgeService,
  authService: AuthService
): void {
  const isAuthError = isAuthenticationError(error.error)

  if ([404, 400, 500, 0, 401].includes(error.status)) {
    if (isAuthError) {
      authService.redirectTologin()
    } else {
      messageService.showError(errorMsg)
    }
    throw errorMsg
  }

  if ([422].includes(error.status)) {
    if (isAuthError) {
      authService.redirectTologin()
    } else {
      messageService.showInfo(errorMsg)
    }
  }
}

function isAuthenticationError(error: any): boolean {
  return (
    error === 'key required\n' || error === 'unauthorized\n'
    // error === 'You do not have permission for this action\n'
  )
}

function shouldSuppressErrorMessage(request: any): boolean {
  const suppressedEndpoints = [
    // login: errors are shown inline by the login page (it has no toast host)
    { pattern: /\/login$/, methods: ['POST'] },
    {
      pattern: /^\/eng\/v1\/bin\/delete(\/.*)?$/,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    },
    { pattern: /^\/eng\/v1\/storage\/unit\/\d+(\/\d+)?$/, methods: ['DELETE'] },
    { pattern: /^\/eng\/v1\/zone$/, methods: ['POST'] },
    { pattern: /^\/eng\/v1\/product\/create$/, methods: ['POST'] },
    { pattern: /^\/eng\/v1\/product\/update$/, methods: ['PUT'] },
    { pattern: /^\/eng\/v1\/reports-template\/generate$/, methods: ['POST'] },
    { pattern: /^\/eng\/v1\/account(\/.*)?$/, methods: ['PUT', 'POST'] },
    // operator-branding: 404 "not found" is normal when no branding exists yet
    { pattern: /^\/v2\/operator-branding(\/.*)?$/, methods: ['GET'] },
    { pattern: /^\/v2\/reports-template\/generate(\/.*)?$/, methods: ['POST'] },
    // webhook: field-level errors (422) are handled by handleFormError in the form component
    { pattern: /^\/v2\/integration\/webhook(\/.*)?$/, methods: ['POST', 'PUT'] },
    // facility: error messages are handled and translated directly in the facility dialog
    { pattern: /^\/v2\/facility(\/.*)?$/, methods: ['POST', 'PUT'] },
    // oauth2 test-token: error messages handled with full context in oauth2-config.component
    { pattern: /^\/v2\/integration\/test-token(\/.*)?$/, methods: ['POST'] },
    // v2/integration/apikey
    { pattern: /^\/v2\/integration\/apikey(\/.*)?$/, methods: ['POST'] },
    { pattern: /^\/v2\/integration\/providers\/sendgrid\/test-email(\/.*)?$/, methods: ['POST'] },
    // xenvio facility connections: the facilities page handles these errors (a missing provider is not one)
    { pattern: /^\/v2\/integration\/providers\/xenvio\/fulfillment-locations$/, methods: ['GET'] },
    { pattern: /^\/v2\/integration\/providers\/xenvio\/facilities\/[^/]+$/, methods: ['PUT'] },
    // wms/location: delete errors are handled in the confirm dialog with user-friendly messages
    { pattern: /^\/v2\/wms\/location\/[^/]+$/, methods: ['DELETE'] },
    // bin-layout: 404 is expected when no layout has been saved yet
    { pattern: /^\/v2\/wms\/bin-layout\/[^/]+$/, methods: ['GET'] },
    // cat/category + cat/product: duplicate / in-use errors are shown inline by the product workspace
    { pattern: /^\/v2\/cat\/category(\/.*)?$/, methods: ['POST', 'PUT', 'DELETE'] },
    { pattern: /^\/v2\/cat\/product$/, methods: ['POST'] },
    { pattern: /^\/v2\/cat\/product\/[^/]+$/, methods: ['PUT'] },
    // packaging: error messages are handled and translated directly in the packaging dialog
    { pattern: /^\/v2\/cat\/sku\/packaging\/intake$/, methods: ['POST'] },
    { pattern: /^\/v2\/cat\/sku\/[^/]+$/, methods: ['PUT'] },
  ]

  const urlPath = new URL(request.url, globalThis.location.origin).pathname

  return suppressedEndpoints.some(
    (endpoint) =>
      endpoint.pattern.test(urlPath) &&
      endpoint.methods.includes(request.method)
  )
}
