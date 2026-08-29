// Ajusta o projeto iOS gerado pelo Capacitor para permitir áudio em segundo plano
// (continuar tocando com a tela bloqueada). Adiciona UIBackgroundModes=audio ao Info.plist.
// Executado no CI logo após `cap add ios` e antes do build.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const plistPath = 'ios/App/App/Info.plist'

if (!existsSync(plistPath)) {
  console.error(`[patch-ios] Info.plist não encontrado em ${plistPath}. Rode "cap add ios" antes.`)
  process.exit(1)
}

let plist = readFileSync(plistPath, 'utf8')

if (plist.includes('UIBackgroundModes')) {
  console.log('[patch-ios] UIBackgroundModes já presente — nada a fazer.')
} else {
  const entry = `\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>audio</string>\n\t</array>\n`
  // Insere logo após a abertura do <dict> principal.
  plist = plist.replace(/(<dict>\n)/, `$1${entry}`)
  writeFileSync(plistPath, plist)
  console.log('[patch-ios] UIBackgroundModes=audio adicionado ao Info.plist')
}
