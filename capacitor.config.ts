import type { CapacitorConfig } from '@capacitor/cli'

// CTUBE_URL: the published web app URL (e.g. https://distribuicao-multiplataforma.vercel.app).
// Mobile apps load from this URL instead of a local server so they behave exactly
// like the web app on Vercel. Override with the CTUBE_URL env var when deploying
// to a different domain.
const DEFAULT_APP_URL = 'https://distribuicao-multiplataforma.vercel.app'
const CTUBE_URL = process.env.CTUBE_URL?.trim() || DEFAULT_APP_URL

const config: CapacitorConfig = {
  appId: 'app.ctube.player',
  appName: 'CTUBE',
  webDir: 'out',
  // Capacitor loads from the deployed web app (same URL Electron uses).
  // The out/ directory is just the offline/bootstrap shell for cap sync.
  server: { url: CTUBE_URL, cleartext: false },
  ios: {
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
}
export default config
