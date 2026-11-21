import pkg from '../../package.json'

export const environment = {
  URL_API: 'http://localhost:8082/',
  defaultLanguage: 'en',
  // Version shown at the foot of the sidebar — bump it in package.json
  appVersion: pkg.version,
  stripe: {
    apiVersion: 'v1.0.0-dev.01' as const,
  },
}
