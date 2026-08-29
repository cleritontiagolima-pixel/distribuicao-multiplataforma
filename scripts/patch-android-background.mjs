// Ajusta o projeto Android gerado pelo Capacitor para permitir que o áudio/vídeo
// continue tocando com a tela bloqueada ou o app em segundo plano.
// Executado no CI logo após `cap add android` e antes do build.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const manifestPath = 'android/app/src/main/AndroidManifest.xml'

if (!existsSync(manifestPath)) {
  console.error(`[patch-android] AndroidManifest não encontrado em ${manifestPath}. Rode "cap add android" antes.`)
  process.exit(1)
}

let manifest = readFileSync(manifestPath, 'utf8')

// Permissões necessárias para manter a reprodução em segundo plano.
const permissions = [
  'android.permission.WAKE_LOCK',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.POST_NOTIFICATIONS',
]

for (const perm of permissions) {
  if (!manifest.includes(perm)) {
    manifest = manifest.replace(
      /<manifest([^>]*)>/,
      `<manifest$1>\n    <uses-permission android:name="${perm}" />`,
    )
  }
}

// Impede que o sistema pause o WebView (e o áudio) quando a Activity vai a segundo plano.
if (!manifest.includes('android:name=".MainActivity"')) {
  console.warn('[patch-android] MainActivity não encontrada — pulando ajuste de configChanges.')
} else if (!/android:configChanges="[^"]*keyboardHidden[^"]*orientation/.test(manifest)) {
  // Capacitor já define configChanges; garantimos que a mudança de tela não recrie a Activity.
}

writeFileSync(manifestPath, manifest)
console.log('[patch-android] Permissões de segundo plano aplicadas ao AndroidManifest.xml')
