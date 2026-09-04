"use client";

// Client-side error capture & diagnostics for CTUBE.
// - Keeps a local ring buffer (survives reloads).
// - Tries to send a copy to the server telemetry endpoint (best effort).
// - The owner console (/admin) reads these logs.

import { APP_VERSION, getPlatform } from "@/lib/constants";

export interface ErrorEntry {
  ts: number;
  kind: "error" | "promise" | "console";
  message: string;
  source?: string;
  stack?: string;
  route?: string;
  platform: string;
  version: string;
}

const LOCAL_KEY = "ctube_error_log_v1";
const UNSENT_KEY = "ctube_error_unsent_v1";
const MAX_LOCAL = 120;

function safeGet(key: string): ErrorEntry[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ErrorEntry[]) : [];
  } catch {
    return [];
  }
}

function safeSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

export function getLocalErrors(): ErrorEntry[] {
  return safeGet(LOCAL_KEY);
}

export function clearLocalErrors() {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

export function getUnsentErrors(): ErrorEntry[] {
  return safeGet(UNSENT_KEY);
}

export function clearUnsentErrors() {
  try {
    localStorage.removeItem(UNSENT_KEY);
  } catch {
    /* ignore */
  }
}

function pushEntry(entry: ErrorEntry) {
  const list = safeGet(LOCAL_KEY);
  list.push(entry);
  if (list.length > MAX_LOCAL) list.splice(0, list.length - MAX_LOCAL);
  safeSet(LOCAL_KEY, list);

  const unsent = safeGet(UNSENT_KEY);
  unsent.push(entry);
  if (unsent.length > MAX_LOCAL) unsent.splice(0, unsent.length - MAX_LOCAL);
  safeSet(UNSENT_KEY, unsent);
}

function makeEntry(
  kind: ErrorEntry["kind"],
  message: string,
  source?: string,
  stack?: string
): ErrorEntry {
  return {
    ts: Date.now(),
    kind,
    message: String(message || "").slice(0, 2000),
    source,
    stack: stack ? String(stack).slice(0, 4000) : undefined,
    route: typeof window !== "undefined" ? window.location.pathname : undefined,
    platform: getPlatform(),
    version: APP_VERSION,
  };
}

function report(kind: ErrorEntry["kind"], message: string, source?: string, stack?: string) {
  try {
    pushEntry(makeEntry(kind, message, source, stack));
    void flushUnsent();
  } catch {
    /* never let telemetry crash the app */
  }
}

export async function flushUnsent() {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;
  const unsent = getUnsentErrors();
  if (unsent.length === 0) return;
  try {
    const res = await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: unsent }),
      keepalive: true,
    });
    if (res.ok) {
      clearUnsentErrors();
    }
  } catch {
    /* offline or server unreachable — retry later */
  }
}

let installed = false;

/** Installs global error handlers once. Safe to call multiple times. */
export function installErrorCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    report("error", event.message || "Unknown error", event.filename, event.error?.stack || "");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Unhandled promise rejection";
    report("promise", message, undefined, reason instanceof Error ? reason.stack : undefined);
  });

  // Network failures are very common in this app; keep only interesting ones.
  window.addEventListener("offline", () => report("console", "[CTUBE] Conexão perdida — modo offline"));

  // Flush pending reports when the app comes back online.
  window.addEventListener("online", () => {
    void flushUnsent();
  });

  // Periodic flush (e.g. long-running desktop sessions).
  setInterval(() => void flushUnsent(), 60_000);
}
