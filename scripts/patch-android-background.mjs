// Ajusta o projeto Android gerado pelo Capacitor para permitir que o áudio/vídeo
// continue tocando com a tela bloqueada ou o app em segundo plano. EXECUTADO:
//   1) no CI logo após `cap add android` (workflow android.yml)
//   2) localmente, adicionado automaticamente em `postinstall` package.json
//
// ✅ Correção do CRASH "abre e fecha" no Android 12+: garante que a MainActivity
//    tenha android:exported="true" (obrigatório). Sem isso, o sistema fecha o
//    app imediatamente ao iniciar.
// ✅ Garante permissão INTERNET para o WebView conseguir carregar o site.
// ✅ Adiciona permissões de segundo plano (WAKE_LOCK + FOREGROUND_SERVICE_*).
//
// Se o projeto nativo ainda não existe (primeira clonagem do repo), o script
// só avisa e sai 0 — `postinstall` não quebra a vida do dev.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const manifestPath = 'android/app/src/main/AndroidManifest.xml'

if (!existsSync(manifestPath)) {
  console.log(
    '[patch-android] Pasta android/ ainda não existe — nada a corrigir. ' +
      'Rode `npx cap add android` quando precisar do build nativo; ' +
      'o script será executado em seguida pelo postinstall.',
  )
  process.exit(0)
}

let manifest = readFileSync(manifestPath, 'utf8')
let changed = false

// 1. android:exported="true" OBRIGATÓRIO em Android 12+ → corrige CRASH
if (manifest.includes('.MainActivity')) {
  const re = /(<activity[^>]*android:name="\.MainActivity"[^>]*?)(\/?>)/
  const m = manifest.match(re)
  if (m && !m[0].includes('android:exported')) {
    manifest = manifest.replace(re, '$1 android:exported="true"$2')
    changed = true
    console.log('[patch-android] ✔ android:exported="true" aplicado em MainActivity (anti-crash)')
  }
}

// 2. INTERNET — sem isso o WebView não carrega o site
if (!manifest.includes('android.permission.INTERNET')) {
  manifest = manifest.replace(
    /(<manifest[^>]*>)/,
    '$1\n  <uses-permission android:name="android.permission.INTERNET" />',
  )
  changed = true
  console.log('[patch-android] ✔ uses-permission INTERNET adicionado ao manifest')
}

// 3. Permissões para tocar em segundo plano / Android 14+
for (const perm of [
  'android.permission.WAKE_LOCK',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.POST_NOTIFICATIONS',
]) {
  if (!manifest.includes(perm)) {
    manifest = manifest.replace(/(<manifest[^>]*>)/, `$1\n  <uses-permission android:name="${perm}" />`)
    changed = true
  }
}

if (changed) {
  writeFileSync(manifestPath, manifest)
  console.log('[patch-android] ✔ AndroidManifest corrigido em', manifestPath)
} else {
  console.log('[patch-android] ✔ AndroidManifest já tinha tudo — nada alterado.')
}
