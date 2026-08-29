import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const CTUBE_URL = process.env.CTUBE_URL || "https://your-domain.com";

// Create/update capacitor.config.ts
const capacitorConfig = `
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.ctube.mobile',
  appName: 'CTUBE',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    url: '${CTUBE_URL}',
    cleartext: true,
  },
  plugins: {
    MediaSession: {
      // Enable background audio on iOS/Android
    },
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
};

export default config;
`;

writeFileSync(join(process.cwd(), "capacitor.config.ts"), capacitorConfig);
console.log("✅ capacitor.config.ts updated");

// Create Next.js export config for static generation
const nextConfigPath = join(process.cwd(), "next.config.ts");
if (existsSync(nextConfigPath)) {
  let content = readFileSync(nextConfigPath, "utf-8");
  if (!content.includes("output:")) {
    // Note: For Capacitor, we need the Next.js app to work offline
    console.log("ℹ️  Run 'npx cap sync' after 'next build' to sync the mobile shell");
  }
}

console.log("📱 Mobile shell prepared. Run 'npx cap sync' to continue.");
