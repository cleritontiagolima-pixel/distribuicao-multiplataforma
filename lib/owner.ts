// Client-side helpers for the owner session + licenses + app config.
// All secrets stay server-side; this module only stores what the server
// returns after verifying credentials.


export interface OwnerSession {
  token: string;
  expiresAt: number;
}

export interface StoredLicense {
  email: string;
  code: string;
  activatedAt: number;
  expiresAt: number;
  days: number;
}

interface LicensePayload {
  email: string;
  days: number;
  iat: number;
  exp: number;
  plan: "paid" | "trial";
}

export interface AppConfig {
  plan: "free" | "paid";
  appVersion: string;
  ownerEmail: string;
  purchaseUrl: string;
}

const SESSION_KEY = "ctube_owner_session";
const LICENSE_KEY = "ctube_license_v1";
const CONFIG_KEY = "ctube_app_config_v1";

function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// ------------------------------ Owner session ------------------------------
export function getOwnerSession(): OwnerSession | null {
  const s = readJSON<OwnerSession>(SESSION_KEY);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
  return s;
}

export function setOwnerSession(token: string, ttlMs = 12 * 3600_000) {
  writeJSON(SESSION_KEY, { token, expiresAt: Date.now() + ttlMs });
}

export function clearOwnerSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// ------------------------------ License ------------------------------------
export function getStoredLicense(): StoredLicense | null {
  return readJSON<StoredLicense>(LICENSE_KEY);
}

export function storeLicense(data: StoredLicense) {
  writeJSON(LICENSE_KEY, data);
}

export function clearStoredLicense() {
  try {
    localStorage.removeItem(LICENSE_KEY);
  } catch {
    /* ignore */
  }
}

export function licenseDaysLeft(license: StoredLicense | null): number {
  if (!license) return 0;
  const diff = license.expiresAt - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / 86_400_000);
}

function decodeBase64Url(str: string): string {
  try {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    return decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch {
    return "";
  }
}

export function licensePayloadFromCode(code: string): LicensePayload | null {
  try {
    const [, rest] = code.split("-");
    const [body] = (rest || "").split(".");
    if (!body) return null;
    return JSON.parse(decodeBase64Url(body)) as LicensePayload;
  } catch {
    return null;
  }
}

// ------------------------------ App config ---------------------------------
let configCache: AppConfig | null = null;
let configPromise: Promise<AppConfig> | null = null;

export async function fetchAppConfig(force = false): Promise<AppConfig> {
  if (typeof window === "undefined") {
    return { plan: "free", appVersion: "0.0.0", ownerEmail: "", purchaseUrl: "" };
  }
  if (configCache && !force) return configCache;
  const cached = readJSON<AppConfig & { ts: number }>(CONFIG_KEY);
  if (cached && cached.plan && !force && Date.now() - (cached.ts || 0) < 10 * 60_000) {
    configCache = cached;
    return cached;
  }
  if (!configPromise) {
    configPromise = fetch("/api/app-config")
      .then((r) => (r.ok ? (r.json() as Promise<AppConfig>) : Promise.reject(new Error("config" + r.status))))
      .then((cfg) => {
        configCache = cfg;
        writeJSON(CONFIG_KEY, { ...cfg, ts: Date.now() });
        return cfg;
      })
      .finally(() => {
        configPromise = null;
      });
  }
  return configPromise;
}
