import pkg from "@/package.json";

// Single source of truth for the app version (package.json drives
// both the web app and the Electron/electron-builder artifacts).
export const APP_VERSION = pkg.version || "1.0.0";
export const APP_NAME = "CTUBE";
export const APP_TAGLINE = "Vídeos sem anúncios";

// Owner / developer account (full access console).
export const OWNER_EMAIL = "ctinformatic@gmail.com";

// GitHub repo that hosts the installers (GitHub Releases).
export const GITHUB_REPO_OWNER = "cleritontiagolima-pixel";
export const GITHUB_REPO_NAME = "distribuicao-multiplataforma";

// Used when there is no payment link configured yet.
export const SUPPORT_EMAIL = OWNER_EMAIL;

export type Platform = "web" | "electron" | "android" | "ios";

/** Detects where this build is running. Safe to call from the browser only. */
export function getPlatform(): Platform {
  if (typeof window === "undefined") return "web";
  try {
    const nav = window.navigator as Navigator & { userAgent?: string };
    if ((window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron) {
      return "electron";
    }
    if (/Electron\//.test(nav.userAgent || "")) return "electron";
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      return cap.getPlatform?.() === "ios" ? "ios" : "android";
    }
  } catch {
    /* ignore */
  }
  return "web";
}

/** Simple semver compare: returns true when `latest` > `current`. Accepts "v1.2.3". */
export function isNewerVersion(current: string, latest: string): boolean {
  const norm = (v: string) => v.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const a = norm(current);
  const b = norm(latest);
  for (let i = 0; i < 3; i++) {
    if ((b[i] || 0) > (a[i] || 0)) return true;
    if ((b[i] || 0) < (a[i] || 0)) return false;
  }
  return false;
}

/** Opens an external URL using the right mechanism for each platform. */
export async function openExternalUrl(url: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (getPlatform() === "electron") {
      window.open(url, "_blank");
      return;
    }
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url });
        return;
      } catch {
        /* fall through */
      }
    }
  } catch {
    /* fall through */
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function formatDaysLeft(expiresAtIso?: string | null): number {
  if (!expiresAtIso) return 0;
  const diff = new Date(expiresAtIso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}
