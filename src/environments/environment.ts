import pkg from '../../package.json'

export const environment = {
  URL_API: 'https://apilogic.nuvex.uk/',
  defaultLanguage: 'en',
  // Version shown at the foot of the sidebar — bump it in package.json
  appVersion: pkg.version,
  stripe: {
    apiVersion: 'v1.0.0' as const,
  },
}
