// Gera um "shell" web mínimo em ./out para o Capacitor.
// O app real é carregado pela URL definida em CTUBE_URL (capacitor.config.ts -> server.url).
// Como o CTUBE usa uma rota de API dinâmica (/api/videos), não é possível exportar o
// Next.js como site estático, então este shell serve apenas como tela de carregamento/fallback.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const outDir = join(process.cwd(), 'out')
const remoteUrl = process.env.CTUBE_URL || ''

const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>CTUBE</title>
    <style>
      html, body { margin: 0; height: 100%; background: #dbeafe; color: #1e3a8a;
        font-family: system-ui, -apple-system, sans-serif; }
      .wrap { height: 100%; display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 16px; text-align: center; padding: 24px; }
      .logo { font-size: 40px; font-weight: 800; letter-spacing: -1px; }
      .msg { font-size: 15px; opacity: .8; max-width: 320px; line-height: 1.5; }
      .spin { width: 28px; height: 28px; border: 3px solid #93c5fd; border-top-color: #1d4ed8;
        border-radius: 50%; animation: r 1s linear infinite; }
      @keyframes r { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="logo">CTUBE</div>
      <div class="spin"></div>
      <div class="msg">${
        remoteUrl
          ? 'Carregando o CTUBE...'
          : 'Defina a variável CTUBE_URL com a URL HTTPS publicada do CTUBE antes de sincronizar (pnpm mobile:sync) para que o aplicativo carregue o conteúdo real.'
      }</div>
    </div>
    <script>
      var url = ${JSON.stringify(remoteUrl)};
      if (url) { location.replace(url); }
    </script>
  </body>
</html>
`

await mkdir(outDir, { recursive: true })
await writeFile(join(outDir, 'index.html'), html, 'utf8')
console.log('[mobile:shell] out/index.html gerado' + (remoteUrl ? ' (CTUBE_URL definido)' : ' (sem CTUBE_URL)'))
