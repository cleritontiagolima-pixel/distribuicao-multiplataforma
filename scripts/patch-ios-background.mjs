// Ajusta o projeto iOS gerado pelo Capacitor para permitir áudio em segundo plano
// (continuar tocando com a tela bloqueada). Adiciona UIBackgroundModes=audio ao
// Info.plist. EXECUTADO:
//   1) no CI logo após `cap add ios` (workflow ios.yml)
//   2) localmente em `postinstall` (precisa ser tolerante: se ios/ ainda não
//      existe, avisa e sai 0 para não quebrar o install do dev).
//
// NOTA — iOS e o crash "abre e fecha":
//   O job do workflow ios.yml SÓ gera um .app instalável em iPhone real quando
//   o secret CERTIFICATE_OSX_APPLICATION (Apple Developer) está configurado.
//   Sem esse secret o build é apenas para simulador (Mac) — instalar esse
//   build num iPhone real é justamente o que causa o "abre e fecha". Use
//   este script só depois de `cap add ios`; em CI ele roda antes do xcodebuild.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const plistPath = 'ios/App/App/Info.plist'

if (!existsSync(plistPath)) {
  console.log(
    '[patch-ios] Pasta ios/ ainda não existe — nada a corrigir. ' +
      'Rode `npx cap add ios` quando precisar do build nativo.',
  )
  process.exit(0)
}

let plist = readFileSync(plistPath, 'utf8')

if (plist.includes('UIBackgroundModes')) {
  console.log('[patch-ios] UIBackgroundModes já presente — nada a fazer.')
  process.exit(0)
}

const entry = `\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>audio</string>\n\t</array>\n`
plist = plist.replace(/(<dict>\n)/, `$1${entry}`)
writeFileSync(plistPath, plist)
console.log('[patch-ios] ✔ UIBackgroundModes=audio adicionado ao Info.plist')
