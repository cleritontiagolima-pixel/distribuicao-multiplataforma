// Verifica se uma GitHub Release tem todos os instaladores de plataforma
// anexados (.apk, .exe e .zip/.ipa). Usado pelo CI após o push de uma tag v*
// e localmente para conferência manual.
//
// Uso:
//   node scripts/check-release-assets.mjs [--tag v1.2.0] [--wait 30] [--repo dono/repo]
//
//   --tag   tag exata a verificar (padrão: a release mais recente)
//   --wait  minutos máximos de espera enquanto as builds paralelas terminam
//           de publicar os artefatos (padrão 30; 0 = sem espera)
//   --repo  repositório dono/repo (padrão: env GH_REPO)
//
// Variáveis de ambiente:
//   GH_TOKEN  token do GitHub (obrigatório para rate limit alto; o Actions usa
//             ${{ github.token }})
//   GH_REPO   repositório padrão
//
// Saída: exit 0 quando todos os artefatos existem; exit 1 quando algum falta
// (após o tempo de espera). Sem tag e sem release existente, sai 0 ("nada a
// verificar") — útil para builds manuais que não criam release.
const args = process.argv.slice(2);

function argValue(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const TAG = argValue("--tag");
const WAIT_MIN = Number(argValue("--wait") || "30");
const REPO = argValue("--repo") || process.env.GH_REPO || "cleritontiagolima-pixel/distribuicao-multiplataforma";
const TOKEN = process.env.GH_TOKEN || "";

// .exe (Windows), .apk (Android) e .zip/.ipa (iOS — o release tem o .zip ou o
// .ipa assinado, nunca os dois ao mesmo tempo).
const REQUIRED_PATTERNS = [
  { label: "Windows instalador (.exe)", test: (name) => /\.exe$/i.test(name) },
  { label: "Android APK (.apk)", test: (name) => /\.apk$/i.test(name) },
  { label: "iOS pacote (.zip ou .ipa)", test: (name) => /\.(zip|ipa)$/i.test(name) },
];

const headers = {
  Accept: "application/vnd.github+json",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function fetchRelease(tag) {
  const url = tag
    ? `https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(tag)}`
    : `https://api.github.com/repos/${REPO}/releases/latest`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} para ${url}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

function missingAssets(release) {
  if (!release) return REQUIRED_PATTERNS.map((p) => p.label);
  const names = (release.assets || []).map((a) => a.name);
  return REQUIRED_PATTERNS.filter((p) => !names.some(p.test)).map((p) => p.label);
}

async function main() {
  const deadline = Date.now() + WAIT_MIN * 60_000;
  let release = null;
  let missing = REQUIRED_PATTERNS.map((p) => p.label);
  let sawRelease = false;

  // Espera (com polling) enquanto as três Actions publicam os artefatos na
  // mesma release em paralelo — o check normalmente roda antes da última
  // terminar.
  while (true) {
    try {
      release = await fetchRelease(TAG);
    } catch (err) {
      console.warn(`[check-release] Erro ao consultar o GitHub: ${err.message}`);
    }
    if (release) sawRelease = true;
    missing = missingAssets(release);
    if (missing.length === 0) break;
    // Sem tag e sem release existente (ex.: build manual sem tag): não há o
    // que verificar — sai na hora em vez de esperar.
    if (!TAG && !sawRelease) {
      console.log("[check-release] ⏭️  Nenhuma release encontrada — nada a verificar (build manual sem tag).");
      process.exit(0);
    }
    if (Date.now() >= deadline) break;
    console.log(
      `[check-release] Aguardando artefatos${TAG ? ` de ${TAG}` : ""}... faltam: ${missing.join(", ")}`
    );
    await new Promise((r) => setTimeout(r, 30_000));
  }

  if (!release) {
    if (TAG) {
      console.error(`[check-release] ❌ Release ${TAG} não encontrada após ${WAIT_MIN} min de espera.`);
      process.exit(1);
    }
    console.log("[check-release] ⏭️  Nenhuma release encontrada — nada a verificar (build manual sem tag).");
    process.exit(0);
  }

  const names = (release.assets || []).map((a) => a.name);
  console.log(`[check-release] Release ${release.tag_name} (${release.html_url})`);
  if (names.length === 0) {
    console.log("[check-release]   (sem artefatos)");
  } else {
    for (const asset of release.assets || []) {
      console.log(
        `[check-release]   ✓ ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`
      );
    }
  }

  if (missing.length > 0) {
    console.error(`[check-release] ❌ Faltam artefatos obrigatórios: ${missing.join(", ")}`);
    console.error(
      "[check-release] Confira as Actions CTUBE Android / CTUBE iOS / CTUBE Windows — alguma delas falhou antes de publicar."
    );
    process.exit(1);
  }

  console.log("[check-release] ✅ Todos os instaladores estão na release.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[check-release] Erro fatal:", err.message);
  process.exit(1);
});