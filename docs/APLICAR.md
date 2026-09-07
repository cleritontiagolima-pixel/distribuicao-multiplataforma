# CTUBE — aplicar as correções no seu GitHub

> ⚠️ **Importante:** esta sessão tem apenas acesso de **leitura e issues**
> ao GitHub. Os arquivos abaixo já estão editados no repositório clonado e
> estão prontos para subir. Você precisa **copiar os arquivos novos/alterados**
> e dar `git commit` + `git push` na sua máquina (ou diretamente pelo
> navegador do GitHub).

## Arquivos alterados ou criados nesta entrega

```
distribuicao-multiplataforma/
├── package.json                                  (editado: postinstall + version 1.1.2)
├── scripts/patch-android-background.mjs          (reescrito — corrige o crash)
├── scripts/patch-ios-background.mjs              (editado — tolerante a ios/ ausente)
├── .github/workflows/ios.yml                      (editado — não gera .app de simulador
│                                                 sem certificado Apple)
└── docs/APLICAR.md                              (este guia)
```

> Não há nada obrigatório dentro de `app/`, `lib/`, `components/` ou nas rotas
> de API — toda a lógica de login do dono, painel `/admin`, emissão de licença
> anual e ativação por código já existe e está funcional.
> O fluxo abaixo é: **subir esses 4/5 arquivos + gerar nova tag `v1.1.2`**,
> e a Action "CTUBE Android" produz um APK com `android:exported="true"`

---

## Como subir (PC, terminal)

```bash
git clone https://github.com/cleritontiagolima-pixel/distribuicao-multiplataforma.git
cd distribuicao-multiplataforma

# Copie os arquivos desta entrega para as mesmas pastas relativas.
# (descompacte o ZIP entregue abaixo na raiz do repositório)

git add package.json \
        scripts/patch-android-background.mjs \
        scripts/patch-ios-background.mjs \
        .github/workflows/ios.yml \
        docs/APLICAR.md

git commit -m "fix(mobile): corrige o 'abre e fecha' no Android 12+ (android:exported) e no iOS (sem IPA de simulador)"

# Sem secrets da Apple a action iOS gera apenas simulador (esperado).
# Sem keystore a action Android gera APK debug (instalável normalmente).
# Suba como tag para que Actions rodem e publiquem o instalador:
git tag v1.1.2
git push origin main v1.1.2
```

## Como subir (apenas pelo navegador do GitHub)

1. Abra https://github.com/cleritontiagolima-pixel/distribuicao-multiplataforma
2. **Add file → Upload files** e arraste cada arquivo da entrega na mesma pasta
   (`scripts/`, `.github/workflows/`, `docs/`, raiz para `package.json`).
3. Mande o commit com a mensagem acima.
4. Ainda pelo site: **Releases → Create a new release** com a tag `v1.1.2`
   (botão "Choose a tag → Create new tag on publish"). Disparar o release
   dispara automaticamente as 3 Actions (Windows, Android, iOS).
5. Espere as Actions terminarem. Em **Releases → v1.1.2** você terá os
   instaladores:
   - `CTUBE-Setup.exe` — Windows
   - `CTUBE.apk` — Android (com `android:exported="true"` corrigido)
   - `CTUBE-iOS.zip` — iPhone (será SOMENTE simulador até você começar a
     povoar os secrets da Apple abaixo)

---

## O que mudou em cada arquivo (resumo)

### `scripts/patch-android-background.mjs`
- Garante `android:exported="true"` na `<activity .MainActivity>` — corrige o
  crash do Android 12+ que "abre e fecha" na hora.
- Garante a permissão `INTERNET` (sem ela o WebView fica em branco).
- Garante permissões WAKE_LOCK + FOREGROUND_SERVICE_* (continuar tocando
  com tela bloqueada sem fechar).
- Idempotente: se já tem, não altera nada.
- Sai `0` (sem erro) se o projeto Android ainda não foi gerado — seguro
  para rodar em `postinstall`.

### `scripts/patch-ios-background.mjs`
- Idem: sai `0` quando o projeto iOS ainda não foi gerado.
- Quando há projeto, adiciona `UIBackgroundModes=audio` ao Info.plist
  (áudio continua com tela bloqueada).

### `.github/workflows/ios.yml`
- O job que rodava `xcodebuild ... CODE_SIGNING_ALLOWED=NO` para gerar um
  `.app` "de device" sem assinatura foi substituído por um passo que **só
  constrói para device quando há `CERTIFICATE_OSX_APPLICATION`**. Sem o
  secret, o workflow agora só publica o build de simulador (instalável com
  Xcode no Mac, MAS não em iPhone real) e dá um warning avisando que
  sem a conta Apple Developer o app "abriu e fechou" no iPhone real —
  alinhando a expectativa.
- Quando há secret da Apple, o build passa a ser `Release` (antes era
  `Debug`), o que reduz a probabilidade de o app ser morto pelo watchdog.

### `package.json`
- Versão incrementada: `1.1.1` → `1.1.2`.
- Novo script `postinstall` que executa os dois patches de segundo plano
  automaticamente em qualquer `pnpm install` — em desenvolvimento, CI e
  também no seu PC. Cobre o caso de o build rodar fora do CI.

---

## Depois do push: ativar a venda do plano anual

A lógica inteira já existe. Você só precisa adicionar variáveis no Vercel:

1. Acesse https://vercel.com → projeto `distribuicao-multiplataforma` →
   **Settings → Environment Variables → Production**.
2. Crie:
   ```
   CTUBE_PLAN=paid
   CTUBE_PURCHASE_URL=https://mp.com/seu-link        # ou deixe vazio para mailto:ctinformatic@gmail.com
   CTUBE_LICENSE_SECRET=<64 caracteres aleatórios>
   CTUBE_ADMIN_SECRET=<outros 64 aleatórios>
   CTUBE_OWNER_EMAIL=ctinformatic@gmail.com          # já é o padrão
   ```
3. **Deploy** (ou aguarde o git push acima fazer o auto-deploy).

Quando o app carregar a `/api/app-config`, o card "Plano atual" em `/admin`
mostra `🔒 PAGO`. O cliente, ao tocar em "Baixar", cai no modal perguntando
pelo código.

### Como entrar no painel e liberar a licença (PC ou celular)

1. Abra https://distribuicao-multiplataforma.vercel.app/login
2. Login: `ctinformatic@gmail.com` · `Cleriton@ 271200@`
3. Você cai em `/admin` direto
4. Confirme a senha do dono (a mesma) — sessão de 12 h
5. Card **"Gerar licença anual"**:
   - e-mail do cliente
   - dias = `365`
   - **Emitir** → código no formato `CTUBE-<base64>.<assinatura-hex>`
6. **Copie** e envie ao cliente (WhatsApp, e-mail, etc.)

### Fluxo do cliente no app

1. Toca "Baixar" em qualquer vídeo
2. Abre o **modal Premium**
3. Cola o e-mail dele + o código
4. Licença ativada → música baixável offline por 1 ano

---

## Quando quiser publicar nas lojas (Play Store + App Store)

O `PUBLICACAO-LOJAS.md` (já no seu repositório) tem o passo a passo completo.
Resumo do que precisa preparar **uma vez**:

### Google Play (Android)
- Conta Play Console (US$ ~~120~~ = R$ ~R$?? único)
- Gerar keystore:
  ```bash
  keytool -genkeypair -v -keystore ctube-release.keystore -alias ctube \
          -keyalg RSA -keysize 2048 -validity 25000 \
          -storepass Cleriton@271200 -keypass Cleriton@271200 \
          -dname "CN=CTUBE, OU=Mobile, O=CTube, L=Sao Paulo, ST=SP, C=BR"
  base64 -w0 ctube-release.keystore > ctube-release.keystore.b64
  ```
- Criar Service Account JSON no Play Console (Settings → API access)
- Adicionar em **GitHub → Settings → Secrets → Actions**:
  | Secret | Valor |
  |---|---|
  | `ANDROID_KEYSTORE_B64` | conteúdo de `ctube-release.keystore.b64` |
  | `ANDROID_KEYSTORE_PASSWORD` | `Cleriton@271200` |
  | `ANDROID_KEYSTORE_ALIAS` | `ctube` |
  | `CTUBE_KEY_PASSWORD` | `Cleriton@271200` |
  | `SERVICE_ACCOUNT_JSON` | o JSON do service account |

### App Store (iPhone)
- Apple Developer Program (US$ 99/ano)
- Distribuition certificate (`.p12`) + senha
- Provisioning profile de distribuição (App Store Distribution)
- App Store Connect API key (`.p8`) + Key ID + Issuer ID
- Adicionar em **GitHub → Secrets → Actions**:
  | Secret | Valor |
  |---|---|
  | `CERTIFICATE_OSX_APPLICATION` | `base64 -i cert.p12` |
  | `CERTIFICATE_PASSWORD` | senha do `.p12` |
  | `PROVISIONING_PROFILE` | `base64 -i profile.mobileprovision` |
  | `APPLE_API_KEY` | `base64 -i AuthKey_*.p8` |
  | `APPLE_API_KEY_ID` | ID da API key |
  | `APPLE_API_ISSUER` | Issuer UUID |

Sem esses secrets a Action iOS continua gerando **somente** simulador,
igual mostrado em `ios.yml`.
