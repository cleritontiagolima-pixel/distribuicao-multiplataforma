# CTUBE — empacotamento

## Desktop

1. Instale Node.js 20+ e pnpm.
2. Execute `pnpm install`.
3. Para abrir durante o desenvolvimento: `pnpm dev` em um terminal e `pnpm desktop` em outro.
4. Para gerar instaladores: `pnpm desktop:build`. O Electron Builder gera o formato compatível com o sistema operacional local.

A variável `CTUBE_URL` pode apontar o Electron para uma implantação HTTPS do CTUBE, permitindo que as rotas reais `/api/videos` funcionem no aplicativo empacotado.

## Android e iPhone

O projeto já inclui a configuração base do Capacitor. Para gerar os projetos nativos, instale Android Studio para Android e Xcode em um Mac para iPhone, depois execute:

```bash
pnpm install
pnpm add @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
pnpm mobile:sync
pnpm mobile:android
pnpm mobile:ios
```

Configure `CTUBE_URL` com a URL HTTPS publicada antes de sincronizar. A assinatura Android exige uma keystore; a assinatura iPhone exige Apple Developer, certificados e provisioning profile. Builds iOS só podem ser gerados em macOS com Xcode.

## Como fazer melhorias

Edite o código, rode `pnpm build`, teste o fluxo no navegador e repita `pnpm desktop:build` ou `pnpm mobile:sync` antes de publicar uma nova versão. Recomenda-se conectar o projeto ao GitHub para manter histórico, branches e reversão das alterações.

A reprodução em segundo plano e com tela bloqueada depende de implementação nativa adicional com Media Session, áudio em background e permissões específicas de Android/iOS; o preview web não garante esse comportamento.
