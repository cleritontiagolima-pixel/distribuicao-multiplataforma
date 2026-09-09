// Verificação anti-crash do APK: abre o APK gerado e confirma que o
// capacitor.config.json embutido tem um server.url https:// válido.
// Sem isso o app nativo abre e fecha imediatamente no Android/iOS
// (WebView apontando para um URL inválido). Falha o build do CI em caso de
// problema, impedindo a publicação de um instalador quebrado.
//
// Uso: node scripts/check-mobile-config.mjs caminho/para/CTUBE.apk
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'

const apkPath = process.argv[2]
if (!apkPath || !existsSync(apkPath)) {
  console.error(`[check-mobile-config] APK não encontrado: ${apkPath || '(não informado)'}`)
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), 'ctube-apk-'))
try {
  execFileSync('unzip', ['-o', '-q', apkPath, 'assets/capacitor.config.json', '-d', tmp], {
    stdio: 'pipe',
  })
  const cfgPath = join(tmp, 'assets', 'capacitor.config.json')
  if (!existsSync(cfgPath)) {
    console.error('[check-mobile-config] ❌ capacitor.config.json ausente dentro do APK')
    process.exit(1)
  }
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
  const url = cfg?.server?.url || ''
  const valid = /^https:\/\/[^\s]+$/i.test(url)
  if (!valid) {
    console.error(
      `[check-mobile-config] ❌ server.url inválido no APK: "${url}".\n` +
        '   O app nativo abriria e fecharia imediatamente (crash). Corrija o secret CTUBE_URL\n' +
        '   no GitHub (Settings → Secrets → Actions) com o URL completo https:// do deploy.'
    )
    process.exit(1)
  }
  console.log(`[check-mobile-config] ✔ server.url válido no APK: ${url}`)
  console.log(`[check-mobile-config] ✔ appId: ${cfg.appId} / appName: ${cfg.appName}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
