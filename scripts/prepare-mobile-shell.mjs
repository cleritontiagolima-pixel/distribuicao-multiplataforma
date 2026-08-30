import { writeFileSync } from "fs";
import { join } from "path";

const CTUBE_URL = process.env.CTUBE_URL || "";

// Create capacitor.config.ts with the CTUBE_URL
const capacitorConfig = `
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.ctube.player',
  appName: 'CTUBE',
  webDir: 'out',
  ${CTUBE_URL ? `server: { url: '${CTUBE_URL}', cleartext: false },` : ""}
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
console.log("✅ capacitor.config.ts updated with CTUBE_URL:", CTUBE_URL || "(using local out/)");

console.log("📱 Mobile shell prepared. Run 'npx cap sync' to continue.");
