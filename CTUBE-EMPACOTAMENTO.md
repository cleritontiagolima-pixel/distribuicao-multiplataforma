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
- **Android:** Actions → **CTUBE Android** → gera `CTUBE.apk`. O APK é assinado com a
  keystore de debug do Android (instalável normalmente; o Google pode exibir o aviso
  “aplicativo de desenvolvedor”). Para publicar na Play Store é preciso gerar uma
  keystore de release e configurar assinatura no workflow.
- **iPhone:** Actions → **CTUBE iOS** → gera `CTUBE.app` **para simulador**, sem
  assinatura. Para instalar num iPhone físico é obrigatório ter conta Apple Developer
  (US$ 99/ano), certificado e provisioning profile, e adicioná-los como secrets
  (`CERTIFICATE_OSX_APPLICATION`, `CERTIFICATE_PASSWORD`, `PROVISIONING_PROFILE`) no
  workflow — a Apple não permite instalar apps não assinados em aparelhos reais.

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
   `.zip`).
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
- **Plano atual:** mostra se o app está em modo gratuito ou pago.
- **Gerar licença anual:** emite um código assinado (HMAC) para o e-mail de um
  cliente, com validade de N dias (padrão 365).

### Plano gratuito → pago (365 dias)

O modo é controlado por variáveis de ambiente no deploy (Vercel / Keys tab):

```
CTUBE_PLAN=paid          # 'free' (padrão) ou 'paid'
CTUBE_PURCHASE_URL=...   # link de compra (Stripe/PayPal) mostrado no paywall
CTUBE_LICENSE_SECRET=... # segredo para assinar/validar códigos de licença
CTUBE_ADMIN_SECRET=...   # segredo do token do painel do dono
CTUBE_ADMIN_PASSWORD_HASH=... # hash sha256 da senha do dono (padrão: senha fornecida)
CTUBE_GITHUB_TOKEN=...   # opcional: API do GitHub com limite maior (repo privado)
```

Com `CTUBE_PLAN=paid`, quem não tiver licença válida vê uma tela de ativação com o
código emitido no painel do dono (a licença expira sozinha após os 365 dias e a tela
volta a bloquear). A integração de pagamento (ex.: Stripe, cobrança anual) pode ser
adicionada depois: o link de compra entra em `CTUBE_PURCHASE_URL` e a liberação é o
código gerado no painel.

> Segredos: os padrões embutidos servem para desenvolvimento. Antes de cobrar de
> verdade, defina `CTUBE_LICENSE_SECRET`, `CTUBE_ADMIN_SECRET` e
> `CTUBE_ADMIN_PASSWORD_HASH` no ambiente de produção.

## Como fazer melhorias

Edite o código, rode `pnpm build`, teste o fluxo no navegador e repita `pnpm desktop:build`
ou `pnpm mobile:sync` antes de publicar uma nova versão. Recomenda-se conectar o projeto
ao GitHub para manter histórico, branches e reversão das alterações.
