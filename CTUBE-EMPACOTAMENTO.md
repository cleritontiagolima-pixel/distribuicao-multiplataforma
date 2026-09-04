# CTUBE — empacotamento

## Arquitetura: instaladores carregam a mesma aplicação da Vercel

O Windows (Electron), o Android e o iPhone (Capacitor) **não** embarcam uma cópia estática
do site: eles abrem a URL publicada (`CTUBE_URL`, padrão
`https://distribuicao-multiplataforma.vercel.app`) dentro de um WebView. Por isso o
comportamento é o mesmo da Vercel — mesmas rotas, mesma API `/api/videos`, mesma busca
— desde que haja internet. O Electron ainda tem um servidor local de reserva para
funcionar sem internet, usando o conteúdo pré-gerado de `.next`.

> Padrão: se a variável `CTUBE_URL` não existir, desktop e mobile usam o endereço
> padrão acima. Para apontar para outro domínio, defina a variável `CTUBE_URL`.

## Desktop (Windows/macOS/Linux)

1. Instale Node.js 20+ e pnpm.
2. Execute `pnpm install`.
3. Para abrir durante o desenvolvimento: `pnpm dev` em um terminal e `pnpm desktop` em outro.
4. Para gerar instaladores: `pnpm desktop:build`. O Electron Builder gera o formato compatível com o sistema operacional local.

O menu superior (File/Edit/View/Window) só aparece para o e-mail de administrador
`ctinformatic@gmail.com` depois do login no aplicativo.

## Android e iPhone

O projeto já inclui a configuração base do Capacitor. Para gerar os projetos nativos:

```bash
pnpm install
npx cap add android
npx cap sync android
```

No GitHub Actions (workflows `android.yml` e `ios.yml`) o processo é automático:
`pnpm build` → `prepare-mobile-shell.mjs` grava o `capacitor.config.ts` com o
`CTUBE_URL` (padrão = Vercel) → `cap add`/`cap sync` → build nativo.

### No GitHub (repositório `cleritontiagolima-pixel/distribuicao-multiplataforma`)

- **`CTUBE_URL` (secret opcional):** se quiser apontar os instaladores para outro
  domínio, crie um secret com esse nome. Sem o secret, o padrão é a Vercel
  (`https://distribuicao-multiplataforma.vercel.app`).
- **Windows:** gere o instalador pela aba **Actions → CTUBE Windows → Run workflow**
  (ou com uma tag `v*`). O artefato `CTUBE-Setup.exe` sai em `installers/windows/`.
  Por padrão o executável é assinado com um certificado autoassinado novo a cada
  build, então o Windows SmartScreen mostra “Windows protegeu seu PC” na primeira
  execução (clique em **Mais informações → Executar assim mesmo**). Para manter o
  mesmo certificado entre versões (publicador estável e menos avisos), gere um PFX
  uma vez e adicione-o como secrets `WIN_CERT_B64` (base64) e `WIN_CERT_PASSWORD`.
- **Android:** Actions → **CTUBE Android** → gera `CTUBE.apk`. Sem secrets, o APK
  é assinado com a keystore de debug do Android (instalável normalmente; o Google
  pode exibir o aviso “aplicativo de desenvolvedor”). Com os secrets
  `ANDROID_KEYSTORE_B64` (keystore em base64), `ANDROID_KEYSTORE_PASSWORD` e
  `ANDROID_KEYSTORE_ALIAS` (padrão `ctube`), o workflow assina o APK de release
  com a **mesma chave em toda versão** — updates instalam por cima sem erro de
  assinatura e o Play Protect reduz os avisos. Atenção: na **primeira** versão
  com a nova keystore, quem tinha o APK debug instalado precisa desinstalar uma
  vez (assinaturas diferentes); a partir daí as atualizações instalam por cima.
  Para publicar na Play Store (AAB + upload automático), veja `PUBLICACAO-LOJAS.md`.
- **iPhone:** Actions → **CTUBE iOS** → gera `CTUBE.app` **para simulador**, sem
  assinatura. Para instalar num iPhone físico é obrigatório ter conta Apple Developer
  (US$ 99/ano), certificado e provisioning profile, e adicioná-los como secrets
  (`CERTIFICATE_OSX_APPLICATION`, `CERTIFICATE_PASSWORD`, `PROVISIONING_PROFILE`) no
  workflow — a Apple não permite instalar apps não assinados em aparelhos reais.
  Com esses secrets configurados, o workflow assina o app e gera **`CTUBE.ipa`**
  (instalável em iPhones reais por sideload/ferramentas de distribuição); sem eles,
  o artefato só roda no simulador.
- **Releases em paralelo:** ao publicar uma tag `v*`, as três Actions rodam ao mesmo
  tempo e cada uma publica seu instalador no **mesmo GitHub Release**. O passo de
  publicação é idempotente (cria a release uma única vez e anexa cada artefato com
  sobrescrita), então a release final sempre contém `.exe`, `.apk` e `.zip`/`.ipa`.

## Segundo plano / tela bloqueada

- O Android recebe as permissões de segundo plano (WAKE_LOCK, foreground service,
  notificações) no build de CI.
- O iPhone recebe `UIBackgroundModes=audio` no `Info.plist` no build de CI.
- **Limitação real:** o player é um iframe do YouTube dentro de um WebView. Com a tela
  **ligada** (travada ou em outro app) a reprodução continua no Android/iOS quando as
  permissões acima existem; com a tela **desligada**, o comportamento depende do
  sistema operacional e do iframe — para garantia total seria necessário reprodução
  nativa (baixar o stream com `youtubei.js` e tocar num player nativo com foreground
  service). O preview web não garante esse comportamento.

## Publicar uma atualização (alerta “nova versão”)

1. Aumente `version` no `package.json` (ex.: `1.1.0`).
2. Faça commit/push e crie uma tag: `git tag v1.1.0 && git push origin v1.1.0`.
3. As três Actions (Windows/Android/iOS) rodam sozinhas; ao final de cada uma o
   instalador é anexado ao **GitHub Release** da tag (arquivos `.exe`, `.apk` e
   `.zip`). A **CTUBE Release Check** (e o passo final do workflow Windows)
   verificam que a release ficou completa — se alguma plataforma falhou, a
   checagem falha com a lista dos artefatos ausentes. Opcionalmente, a
   **CTUBE Store Publishing** envia o AAB para a Google Play e o IPA para o
   TestFlight (veja `PUBLICACAO-LOJAS.md`).
4. O app instalado verifica `/api/update` (último Release do GitHub) e mostra o
   alerta “Nova versão disponível” com o botão de download correto para a
   plataforma. Instalar por cima preserva os dados (histórico, playlists etc.) —
   eles ficam na pasta de dados do app, que o instalador não apaga.

## Painel do desenvolvedor (`/admin`) — erros, plano e licenças

Ao entrar com o e-mail do dono (`ctinformatic@gmail.com`) e a senha dele, o app
mostra o menu superior (desktop) e libera o painel `/admin` (link em Configurações).
O painel pede a senha do dono uma vez a cada 12 horas e oferece:

- **Erros registrados:** captura automática de erros de runtime em cada dispositivo
  (log local) + envio opcional ao `/api/telemetry` do servidor. Botões para exportar
  e limpar.
- **Plano atual:** mostra se os downloads exigem licença (`CTUBE_PLAN=paid`) ou são
  livres (`free`). O app em si é sempre grátis para assistir.
- **Gerar licença anual:** emite um código assinado (HMAC) para o e-mail de um
  cliente, com validade de N dias (padrão 365).

### Plano e licença (modelo atual: app grátis, downloads Premium)

O app **não** bloqueia mais a reprodução: assistir é sempre grátis. A licença anual
(365 dias) desbloqueia o **download de áudio para ouvir offline**. O modo é
controlado por variáveis de ambiente no deploy (Vercel / Keys tab):

```
CTUBE_PLAN=paid          # 'free' (padrão) ou 'paid' — 'paid' exige licença nos downloads
CTUBE_PURCHASE_URL=...   # link de compra (Stripe/PayPal) mostrado no modal de ativação
CTUBE_LICENSE_SECRET=... # segredo para assinar/validar códigos de licença
CTUBE_ADMIN_SECRET=...   # segredo do token do painel do dono
CTUBE_ADMIN_PASSWORD_HASH=... # hash sha256 da senha do dono (padrão: senha fornecida)
CTUBE_GITHUB_TOKEN=...   # opcional: API do GitHub com limite maior (repo privado)
```

Quem não tiver licença válida (com `CTUBE_PLAN=paid`) vê o botão **Baixar** na
página do vídeo e, ao tocar, abre o modal de ativação com o código emitido no
painel do dono. A licença expira sozinha após os 365 dias. A integração de
pagamento (ex.: Stripe, cobrança anual) pode ser adicionada depois: o link de
compra entra em `CTUBE_PURCHASE_URL` e a liberação é o código gerado no painel.

> Segredos: os padrões embutidos servem para desenvolvimento. Antes de cobrar de
> verdade, defina `CTUBE_LICENSE_SECRET`, `CTUBE_ADMIN_SECRET` e
> `CTUBE_ADMIN_PASSWORD_HASH` no ambiente de produção.

## Downloads offline (áudio)

O CTUBE baixa **somente o áudio** (para ouvir offline) nos três clientes: Electron
(Windows/macOS/Linux), Android e iOS. Fluxo:

1. O cliente pede `/api/download/url?videoId=...` — o servidor resolve o stream de
   áudio com `youtubei.js` (m4a/opus, sem vídeo) e, com `CTUBE_PLAN=paid`, valida a
   licença antes de devolver a URL.
2. O cliente tenta baixar direto do CDN (googlevideo). Se o CORS do CDN bloquear
   (comum nos WebViews de Android/iOS), ele cai no fallback:
   `/api/download/chunk?videoId=...&start=...&end=...` — o servidor devolve o
   arquivo em blocos de até ~3,4MB (limite de resposta do Vercel Hobby).
3. O áudio é salvo em **IndexedDB** no aparelho e aparece na página **Downloads**
   (reprodução inline, sem internet, com botão de remover).

**Electron offline:** o servidor local do app (porta 3210) implementa os mesmos
endpoints (`/api/download/url`, `/api/download/chunk`, `/api/license/validate`,
`/api/app-config`) usando o `youtubei.js` embutido em `desktop/youtube.cjs` — ou
seja, o download e a ativação de licença funcionam mesmo sem internet. O segredo de
licença do desktop vem de `CTUBE_LICENSE_SECRET` (ou do padrão de desenvolvimento).

Para o instalador Windows **fora da internet** respeitar o modo pago, o workflow
**CTUBE Windows** "assa" a configuração no build (passo *Bake desktop config*): se
os secrets `CTUBE_PLAN` e `CTUBE_LICENSE_SECRET` existirem, eles são gravados em
`desktop/baked-config.json` (gitignored) dentro do instalador. Sem os secrets, o
desktop offline assume plano grátis + segredo de desenvolvimento — então, antes de
cobrar, configure os dois secrets no GitHub (Settings → Secrets → Actions) se
quiser validação de licença também no modo offline do desktop.

**Limitações conhecidas:**
- O download herda as falhas do `youtubei.js`/YouTube (stream indisponível, 403 por
  PO token) — nesses casos o botão mostra erro e basta tentar de novo mais tarde.
- Reprodução com a tela desligada em Android/iOS depende do sistema/WebView (mesma
  limitação do player por iframe documentada acima).
- O espaço do IndexedDB é limitado pelo WebView/Chromium (alguns GB no desktop,
  menos em aparelhos antigos).

## Como fazer melhorias

Edite o código, rode `pnpm build`, teste o fluxo no navegador e repita `pnpm desktop:build`
ou `pnpm mobile:sync` antes de publicar uma nova versão. Recomenda-se conectar o projeto
ao GitHub para manter histórico, branches e reversão das alterações.
