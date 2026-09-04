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

// --- 1. Ensure android:exported="true" on MainActivity (required for Android 12+) ---
if (manifest.includes('android:name=".MainActivity"')) {
  // If MainActivity already has android:exported, leave it alone.
  // If not, add exported="true" to the <activity> tag for .MainActivity.
  const mainActivityRegex = /(<activity[^>]*android:name="\.MainActivity"[^>]*?)(\/?>)/
  const match = manifest.match(mainActivityRegex)
  if (match) {
    const fullTag = match[0]
    if (!fullTag.includes('android:exported')) {
      const fixed = fullTag.replace(/(\/?>)/, ' android:exported="true"$1')
      manifest = manifest.replace(fullTag, fixed)
      console.log('[patch-android] Added android:exported="true" to MainActivity')
    } else {
      console.log('[patch-android] android:exported already present on MainActivity')
    }
  }
} else {
  console.warn('[patch-android] MainActivity não encontrada no manifest')
}

// --- 2. Add background playback permissions ---
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

// --- 3. Ensure foreground service type for Android 14+ ---
if (manifest.includes('FOREGROUND_SERVICE') && !manifest.includes('FOREGROUND_SERVICE_MEDIA_PLAYBACK')) {
  manifest = manifest.replace(
    /<manifest([^>]*)>/,
    `<manifest$1>\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />`,
  )
}

writeFileSync(manifestPath, manifest)
console.log('[patch-android] Permissões de segundo plano e android:exported aplicados ao AndroidManifest.xml')
