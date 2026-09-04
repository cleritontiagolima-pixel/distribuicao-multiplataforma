# CTUBE — publicar nas lojas oficiais (Google Play + TestFlight)

Este guia cobre a publicação do CTUBE nas lojas, em vez de sideload dos
instaladores do GitHub Release. O CI correspondente está em
`.github/workflows/stores.yml` e é acionado a cada tag `v*` (ou manualmente pela
aba **Actions → CTUBE Store Publishing**).

Visão geral do fluxo:

| Plataforma | Artefato | Upload automático | Secrets necessários |
|---|---|---|---|
| Google Play | `app-release.aab` (assinado) | track **internal** | `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEYSTORE_ALIAS`, `SERVICE_ACCOUNT_JSON` |
| Apple TestFlight | `CTUBE-Store.ipa` (assinado app-store) | App Store Connect via `altool` | `CERTIFICATE_OSX_APPLICATION`, `CERTIFICATE_PASSWORD`, `PROVISIONING_PROFILE`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |

Sem os secrets de loja, o workflow apenas **gera os artefatos assinados** como
artefatos da Action (você faz o upload manual no console).

---

## Google Play

### 1. Gerar a keystore de release (uma única vez)

```bash
keytool -genkeypair -v \
  -keystore ctube-release.keystore \
  -alias ctube \
  -keyalg RSA -keysize 2048 -validity 10000
```

**Guarde essa keystore e suas senhas em lugar seguro** — ela é a sua chave de
upload; perdê-la impede publicar atualizações do mesmo app.

### 2. Adicionar os secrets no GitHub (Settings → Secrets → Actions)

```bash
# Base64 da keystore:
base64 -w0 ctube-release.keystore   # Linux/macOS
# (no Windows PowerShell: [Convert]::ToBase64String([IO.File]::ReadAllBytes("ctube-release.keystore")))
```

- `ANDROID_KEYSTORE_B64` — keystore em base64 (acima)
- `ANDROID_KEYSTORE_PASSWORD` — senha do cofre
- `ANDROID_KEYSTORE_ALIAS` — alias usado no `keytool` (padrão `ctube`)
- `SERVICE_ACCOUNT_JSON` — JSON da service account do Google Play (passo 4)

> Com `ANDROID_KEYSTORE_B64` configurado, **todos** os builds (inclusive o APK do
> GitHub Release) passam a ser assinados com a mesma chave: updates instalam por
> cima sem erro de assinatura e o Play Protect deixa de tratar o app como
> "aplicativo de desenvolvedor".

### 3. Criar o app no Play Console

1. Acesse [play.google.com/console](https://play.google.com/console) → **Criar app**.
2. Nome: CTUBE. **Pacote (applicationId): `app.ctube.player`** (id do Capacitor).
3. Preencha a ficha da loja, política de privacidade e declarações de dados.
   O app acessa e reproduz vídeos do YouTube — revise as políticas de conteúdo
   de terceiros.

### 4. Service account (upload automático)

1. Play Console → **Configuração → Acesso à API** → vincule o projeto do Google
   Cloud e **Criar nova service account** seguindo o assistente.
2. No Google Cloud, crie a chave JSON dessa service account e copie o conteúdo
   para o secret `SERVICE_ACCOUNT_JSON`.
3. De volta ao Play Console, conceda à service account a permissão
   **"Release to production, testing tracks, and apps"** (ou ao menos
   **"View app information" + permissões de release**).

### 5. Publicar

```bash
git tag v1.2.0 && git push origin v1.2.0
```

O job **Google Play (AAB)** gera o `app-release.aab` assinado com
`versionCode`/`versionName` vindos do `package.json` (1.2.0 → 120; para um
número exato, defina o secret/env `CTUBE_VERSION_CODE` no workflow) e faz o
upload no track **internal**. A cada versão o `versionCode` precisa **aumentar**
— basta subir a `version` no `package.json`.

Depois: Play Console → **Testing → Internal testing → Promover** para alpha/beta
e, por fim, **Produção** (a revisão da Google costuma levar de algumas horas a
dias). Testadores entram pelo **Google Play Console → Testadores internos** ou
pelo link público do track.

> **Play App Signing:** a Google re-assina seu app com a chave de assinatura
> dela e guarda a sua keystore como "upload key". Siga o aviso do console na
> primeira publicação — não é necessário mudar nada no CI.

---

## Apple TestFlight

### 1. Requisitos (conta Apple Developer)

- Conta **Apple Developer Program** (US$ 99/ano).
- **Certificado de distribuição (App Store Distribution)** — um `.p12`.
- **Provisioning profile de distribuição (App Store)** para o bundle id
  `app.ctube.player` — o perfil de *development* usado no sideload **não
  serve** para o TestFlight.
- Uma **App Store Connect API Key** (App Store Connect → Users and Access →
  Keys) com acesso **App Manager**.

### 2. Secrets no GitHub

- `CERTIFICATE_OSX_APPLICATION` — o `.p12` em base64
- `CERTIFICATE_PASSWORD` — senha do `.p12`
- `PROVISIONING_PROFILE` — o `.mobileprovision` em base64
- `APPLE_API_KEY` — o arquivo `AuthKey_XXXXXXXXXX.p8` em base64
- `APPLE_API_KEY_ID` — o id da chave (10 caracteres)
- `APPLE_API_ISSUER` — o issuer id da conta

### 3. Criar o app no App Store Connect

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps →
   +** → preencha com o **bundle id `app.ctube.player`** (crie-o antes em
   Certificates, Identifiers & Profiles).
2. Preencha a ficha do app (descrição, capturas, privacidade). O app reproduz
   vídeos do YouTube — a revisão da Apple pode pedir justificativa de uso de
   conteúdo de terceiros.

### 4. Publicar

```bash
git tag v1.2.0 && git push origin v1.2.0
```

O job **Apple TestFlight (IPA)**:
1. Importa certificado + provisioning profile;
2. Seta `CFBundleShortVersionString` (versão do `package.json`) e
   `CFBundleVersion` (derivado: 1.2.0 → 120) — **deve aumentar a cada upload**;
3. Arquiva e exporta o `.ipa` (método `app-store`);
4. Envia para o App Store Connect via `xcrun altool` com a API Key.

No App Store Connect o build aparece em **TestFlight**. Adicione testadores
internos (até 100, sem revisão da Apple) ou externos (Beta App Review, que exige
metadados). Promover para a App Store é feito pelo console (App Review).

> Se `APPLE_API_KEY*` não estiverem configurados, o workflow apenas gera o
> artefato `CTUBE-TestFlight-IPA` e você faz o upload manual com
> `xcrun altool --upload-app -f CTUBE-Store.ipa -t ios --apiKey ... --apiIssuer ...`
> (ou via Transporter).

---

## Checklist rápida por versão

1. Suba `version` no `package.json` (o `versionCode`/`CFBundleVersion` derivam
   dela e precisam crescer).
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. Actions: **CTUBE Windows/Android/iOS** (GitHub Release) +
   **CTUBE Store Publishing** (Play internal + TestFlight) + **CTUBE Release
   Check** (confere se a release tem todos os instaladores).
4. Play Console: promova internal → produção. App Store: aprove o build no
   TestFlight e promova.