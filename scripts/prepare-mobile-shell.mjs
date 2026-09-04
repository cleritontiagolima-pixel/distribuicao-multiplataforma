import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Default to the same hosted URL that the Electron desktop app uses, so the
// Android/iOS builds always point at the working deployment even when the
// CTUBE_URL secret is not configured in the CI environment.
const DEFAULT_APP_URL = "https://distribuicao-multiplataforma.vercel.app";
const CTUBE_URL = process.env.CTUBE_URL?.trim() || DEFAULT_APP_URL;

// Create capacitor.config.ts with the CTUBE_URL
const capacitorConfig = `
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.ctube.player',
  appName: 'CTUBE',
  webDir: 'out',
  server: { url: '${CTUBE_URL}', cleartext: false },
  ios: {
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
`;

writeFileSync(join(process.cwd(), "capacitor.config.ts"), capacitorConfig);
console.log("✅ capacitor.config.ts updated with CTUBE_URL:", CTUBE_URL);

// Make sure the webDir shell exists so `cap sync` always succeeds in CI
// (out/ is gitignored except for out/index.html).
const outDir = join(process.cwd(), "out");
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}
const outIndex = join(outDir, "index.html");
if (!existsSync(outIndex)) {
  writeFileSync(
    outIndex,
    `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CTUBE</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #0f0f0f; color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .container { text-align: center; }
    h1 { font-size: 2rem; margin-bottom: 1rem; color: #ff4e45; }
    p { color: #aaa; line-height: 1.6; }
    a { color: #ff4e45; }
  </style>
</head>
<body>
  <div class="container">
    <h1>▶ CTUBE</h1>
    <p>Carregando aplicativo...</p>
    <p id="status" style="font-size: 0.85rem; margin-top: 1rem"></p>
  </div>
  <script>
    var APP_URL = ${JSON.stringify(CTUBE_URL)};
    // If this shell is ever loaded (no server.url configured), redirect to the app.
    try {
      if (window.location.origin.indexOf("vercel.app") === -1) {
        window.location.replace(APP_URL);
      }
    } catch (e) {
      document.getElementById("status").textContent = "Não foi possível abrir o CTUBE.";
    }
  </script>
</body>
</html>
`
  );
  console.log("📄 out/index.html shell created");
}

console.log("📱 Mobile shell prepared. Run 'npx cap sync' to continue.");
