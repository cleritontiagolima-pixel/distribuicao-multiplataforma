// Configura a assinatura de release do projeto Android gerado pelo Capacitor.
// Executado no CI logo após `cap add android` / `cap sync` e antes do build.
//
// - Sem secrets de keystore: apenas ajusta versionCode/versionName a partir do
//   package.json (o CI continua gerando o APK debug assinado de sempre).
// - Com `ANDROID_KEYSTORE_B64` (keystore em base64), `ANDROID_KEYSTORE_PASSWORD`
//   e `ANDROID_KEYSTORE_ALIAS` (padrão "ctube"): grava a keystore + um
//   keystore.properties e liga o signingConfig ao buildType release, gerando um
//   APK/AAB assinado com a MESMA chave em toda versão — updates instalam por
//   cima sem erro de assinatura e o Play Protect para de tratar o app como
//   "aplicativo de desenvolvedor".
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const BUILD_GRADLE = 'android/app/build.gradle'
const KEYSTORE_DIR = 'android'
const KEYSTORE_FILE = 'ctube-release.keystore'
const KEYSTORE_PROPS = 'keystore.properties'

const KEYSTORE_B64 = process.env.ANDROID_KEYSTORE_B64 || ''
const KEYSTORE_PASSWORD = process.env.ANDROID_KEYSTORE_PASSWORD || ''
const KEYSTORE_ALIAS = process.env.ANDROID_KEYSTORE_ALIAS || 'ctube'
// versionCode opcional, exato. Sem ele, deriva do version do package.json
// (1.1.0 -> 110, 1.10.0 -> 1100) — aumenta a cada release para a Play Store.
const VERSION_CODE_OVERRIDE = process.env.CTUBE_VERSION_CODE || ''

if (!existsSync(BUILD_GRADLE)) {
  console.error(`[patch-android-signing] ${BUILD_GRADLE} não encontrado. Rode "cap add android" antes.`)
  process.exit(1)
}

let buildGradle = readFileSync(BUILD_GRADLE, 'utf8')

// ---------------------------------------------------------------------------
// 1. versionCode / versionName a partir do package.json (sempre aplicado)
// ---------------------------------------------------------------------------
let version = ''
try {
  version = JSON.parse(readFileSync('package.json', 'utf8')).version || ''
} catch {
  /* sem package.json — mantém os valores do template */
}
let versionCode = VERSION_CODE_OVERRIDE
if (!versionCode && version) {
  versionCode = version.replace(/[^0-9]/g, '').replace(/^0+/, '') || '1'
}
if (versionCode) {
  buildGradle = buildGradle.replace(/(versionCode\s+)\d+/, `$1${versionCode}`)
  console.log(`[patch-android-signing] versionCode -> ${versionCode}`)
}
if (version) {
  buildGradle = buildGradle.replace(/(versionName\s+"?)[^"\n]+/, `$1${version}"`)
  console.log(`[patch-android-signing] versionName -> ${version}`)
}

// ---------------------------------------------------------------------------
// 2. Keystore de release (quando ANDROID_KEYSTORE_B64 está presente)
// ---------------------------------------------------------------------------
const useReleaseSigning = KEYSTORE_B64.trim().length > 0

if (useReleaseSigning) {
  const keystorePath = `${KEYSTORE_DIR}/${KEYSTORE_FILE}`
  writeFileSync(keystorePath, Buffer.from(KEYSTORE_B64, 'base64'))
  writeFileSync(
    `${KEYSTORE_DIR}/${KEYSTORE_PROPS}`,
    [
      `storeFile=${KEYSTORE_FILE}`,
      `storePassword=${KEYSTORE_PASSWORD}`,
      `keyAlias=${KEYSTORE_ALIAS}`,
      // Sem ANDROID_KEY_PASSWORD, a senha da chave é a mesma do cofre
      `keyPassword=${process.env.ANDROID_KEY_PASSWORD || KEYSTORE_PASSWORD}`,
      '',
    ].join('\n'),
  )
  console.log(`[patch-android-signing] Keystore gravada em ${keystorePath} (alias "${KEYSTORE_ALIAS}")`)
} else {
  console.log('[patch-android-signing] Sem ANDROID_KEYSTORE_B64 — o APK será assinado com a keystore de debug do Android.')
}

// ---------------------------------------------------------------------------
// 3. Liga o signingConfig de release no build.gradle
// ---------------------------------------------------------------------------
const hasSigningConfigs = buildGradle.includes('signingConfigs {')

if (useReleaseSigning && !hasSigningConfigs) {
  const signingBlock = `    signingConfigs {
        release {
            def keystorePropertiesFile = rootProject.file('${KEYSTORE_PROPS}')
            if (keystorePropertiesFile.exists()) {
                def keystoreProperties = new Properties()
                keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
                storeFile rootProject.file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }

`
  const anchor = /\n(\s+)buildTypes \{/
  if (anchor.test(buildGradle)) {
    buildGradle = buildGradle.replace(anchor, `\n${signingBlock}$1buildTypes {`)
  } else {
    console.error('[patch-android-signing] Bloco "buildTypes {" não encontrado no build.gradle — não foi possível configurar a assinatura de release.')
    process.exit(1)
  }
}

if (useReleaseSigning) {
  const releaseAnchor = /(buildTypes \{\s*release \{\s*)(minifyEnabled)/
  if (releaseAnchor.test(buildGradle)) {
    buildGradle = buildGradle.replace(
      releaseAnchor,
      `$1signingConfig signingConfigs.release\n            $2`,
    )
  } else {
    console.error('[patch-android-signing] Bloco "release {" do buildTypes não encontrado no build.gradle.')
    process.exit(1)
  }
  console.log('[patch-android-signing] signingConfig de release ativado no build.gradle')
}

writeFileSync(BUILD_GRADLE, buildGradle)
console.log('[patch-android-signing] build.gradle atualizado')