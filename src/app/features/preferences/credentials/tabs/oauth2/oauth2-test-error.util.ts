import { TranslateService } from '@ngx-translate/core'

const BASE = 'credential_types.oauth2.errors'

/**
 * Maps the raw `message` string returned by the test-token API endpoint
 * to a user-friendly translated string.
 *
 * Falls back to the raw message when no pattern matches, so new API errors
 * are still visible to the user without needing a code change.
 */
export function translateOAuth2TestError(
  raw: string,
  translate: TranslateService
): string {
  const t = (key: string) => translate.instant(`${BASE}.${key}`)

  if (!raw) return t('fetch_failed')

  // 1. record not found
  if (raw === 'record not found')
    return t('record_not_found')

  // 2. error decrypting client_secret: <cause>
  if (raw.startsWith('error decrypting client_secret:'))
    return t('decrypt_secret_failed')

  // 3. token_url is not configured for this provider
  if (raw === 'token_url is not configured for this provider')
    return t('token_url_not_configured')

  // 4. error fetching new token: parse "<url>": <cause>  (malformed URL)
  if (raw.startsWith('error fetching new token: parse "'))
    return t('invalid_token_url')

  // 6. error fetching new token: credentials are not valid
  if (raw === 'error fetching new token: credentials are not valid')
    return t('credentials_invalid')

  // 7. error fetching new token: error parsing token response: <cause>
  if (raw.startsWith('error fetching new token: error parsing token response:'))
    return t('parse_response_failed')

  // 5. error fetching new token: Post "<url>": <cause>  (network-level errors)
  if (raw.startsWith('error fetching new token: Post "'))
    return translateNetworkError(raw, t)

  // Fallback: return the raw message so nothing is silently hidden
  return raw
}

/** Maps network-level "Post" errors from the token fetch to a translated message. */
function translateNetworkError(raw: string, t: (key: string) => string): string {
  if (raw.includes('context deadline exceeded')) return t('fetch_timeout')
  if (raw.includes('no such host'))             return t('fetch_no_host')
  if (raw.includes('connection refused'))        return t('fetch_connection_refused')
  if (raw.includes('tls:'))                      return t('fetch_tls_failed')
  // Generic Post error
  return t('fetch_failed')
}

/**
 * Translates the success message returned by the test-token API.
 * Extracts the expiry date from the raw string and returns a translated
 * user-friendly message with the date interpolated.
 *
 * Raw format: "Token obtained successfully. Expires: 2027-06-09T13:51:38Z"
 */
export function translateOAuth2TestSuccess(
  raw: string,
  translate: TranslateService
): string {
  const match = /Expires:\s*(\S.*)$/.exec(raw)
  if (match) {
    return translate.instant(
      'credential_types.oauth2.test_connection_ok_detail',
      { expires: match[1] }
    )
  }
  // Fallback to raw if format changes
  return raw
}
