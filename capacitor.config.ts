import type { CapacitorConfig } from '@capacitor/cli'

// CTUBE_URL: the published web app URL (e.g. https://ctube.vercel.app).
// Mobile apps load from this URL instead of a local server.
const CTUBE_URL = process.env.CTUBE_URL?.trim()

const config: CapacitorConfig = {
  appId: 'app.ctube.player',
  appName: 'CTUBE',
  webDir: 'out',
  // When CTUBE_URL is set, Capacitor loads from the deployed web app.
  // The out/ directory is just a placeholder for cap sync.
  ...(CTUBE_URL
    ? { server: { url: CTUBE_URL, cleartext: false } }
    : {}),
  ios: {
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
}
export default config
