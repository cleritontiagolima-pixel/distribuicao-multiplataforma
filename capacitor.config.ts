import type { CapacitorConfig } from '@capacitor/cli'

// A URL publicada do CTUBE (ex.: https://ctube.vercel.app).
// Definida em tempo de build pela variável de ambiente CTUBE_URL.
const CTUBE_URL = process.env.CTUBE_URL?.trim()

const config: CapacitorConfig = {
  appId: 'app.ctube.player',
  appName: 'CTUBE',
  webDir: 'out',
  // Só define server.url quando a URL existe; caso contrário o Capacitor
  // carrega o shell local em `out/` (que redireciona para a URL publicada).
  ...(CTUBE_URL ? { server: { url: CTUBE_URL, cleartext: false } } : {}),
  ios: {
    // Permite tocar vídeo/áudio inline sem forçar tela cheia.
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
}
export default config
