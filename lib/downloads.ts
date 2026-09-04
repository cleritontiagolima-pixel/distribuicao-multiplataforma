// Client-side offline download manager for CTUBE.
//
// Downloads are AUDIO ONLY (offline listening) and are stored as Blobs in
// IndexedDB. The stream URL is resolved server-side (/api/download/url) and
// the bytes are fetched either directly from googlevideo (when the CDN
// allows CORS) or through the /api/download/chunk proxy (WebViews).
//
// Entitlement: when CTUBE_PLAN=paid a valid annual license (stored locally
// after activation) is required to download. The app itself stays free.

import {
  getStoredLicense,
  fetchAppConfig,
} from "@/lib/owner";

export interface DownloadSource {
  videoId: string;
  title: string;
  channelName: string;
  thumbnail: string;
  duration?: string;
}

export interface DownloadedAudio extends DownloadSource {
  mimeType: string;
  size: number;
  downloadedAt: number;
  blob: Blob;
}

export type DownloadPhase = "resolving" | "downloading" | "saving";

export interface DownloadProgress {
  phase: DownloadPhase;
  received: number;
  total?: number;
}

export class DownloadError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// ------------------------------ IndexedDB ------------------------------
const DB_NAME = "ctube-db";
const STORE_NAME = "audio";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb-unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "videoId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexeddb-open-failed"));
  });
  return dbPromise;
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexeddb-error"));
  });
}

export async function getDownloads(): Promise<DownloadedAudio[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const all = await idbRequest(tx.objectStore(STORE_NAME).getAll() as IDBRequest<DownloadedAudio[]>);
    return (all || []).sort((a, b) => b.downloadedAt - a.downloadedAt);
  } catch {
    return [];
  }
}

export async function isDownloaded(videoId: string): Promise<boolean> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const entry = await idbRequest(tx.objectStore(STORE_NAME).get(videoId) as IDBRequest<DownloadedAudio | undefined>);
    return !!entry;
  } catch {
    return false;
  }
}

export async function getDownload(videoId: string): Promise<DownloadedAudio | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const entry = await idbRequest(tx.objectStore(STORE_NAME).get(videoId) as IDBRequest<DownloadedAudio | undefined>);
    return entry || null;
  } catch {
    return null;
  }
}

export async function saveDownload(entry: DownloadedAudio): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  await idbRequest(tx.objectStore(STORE_NAME).put(entry));
}

export async function removeDownload(videoId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    await idbRequest(tx.objectStore(STORE_NAME).delete(videoId));
  } catch {
    /* ignore */
  }
}

export function audioObjectUrl(entry: DownloadedAudio): string {
  return URL.createObjectURL(entry.blob);
}

// ------------------------------ Entitlement ------------------------------
/** True when the user may download on this device. */
export async function hasDownloadEntitlement(): Promise<boolean> {
  const license = getStoredLicense();
  if (license && license.expiresAt > Date.now()) return true;
  try {
    const cfg = await fetchAppConfig();
    return cfg.plan !== "paid";
  } catch {
    // Unknown plan (offline): only a stored valid license unlocks downloads.
    return false;
  }
}

// ------------------------------ Download flow ------------------------------
const CHUNK_SIZE = 3_400_000; // must stay under the Vercel 4.5MB limit

function buildQuery(extra: Record<string, string | number>): string {
  const params = new URLSearchParams();
  const license = getStoredLicense();
  if (license) {
    params.set("code", license.code);
    params.set("email", license.email);
  }
  for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  return params.toString();
}

async function readBodyWithProgress(
  res: Response,
  onProgress?: (p: DownloadProgress) => void
): Promise<Blob> {
  const total = Number(res.headers.get("content-length")) || undefined;
  const contentType = res.headers.get("content-type") || "audio/mp4";
  if (!res.body) {
    return new Blob([await res.arrayBuffer()], { type: contentType });
  }
  const reader = res.body.getReader();
  const parts: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    received += value.byteLength;
    onProgress?.({ phase: "downloading", received, total });
  }
  return new Blob(parts, { type: contentType });
}

/**
 * Downloads the audio of a video and stores it in IndexedDB.
 * Throws DownloadError with code "license" when a license is required.
 */
export async function downloadAudio(
  source: DownloadSource,
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<DownloadedAudio> {
  const qs = buildQuery({ videoId: source.videoId });
  onProgress?.({ phase: "resolving", received: 0 });

  // 1) Resolve the stream URL server-side (validates the license there too).
  const res = await fetch(`/api/download/url?${qs}`, { signal });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    mimeType?: string;
    size?: number;
    title?: string;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.url) {
    if (data.error === "license-required") {
      throw new DownloadError("license", "Licença necessária para baixar.");
    }
    throw new DownloadError("resolve", "Não foi possível preparar o download.");
  }

  const mimeType = data.mimeType || "audio/mp4";
  const totalSize = data.size || undefined;
  let blob: Blob;

  // 2) Try a direct fetch from the CDN (works when CORS is allowed).
  try {
    const direct = await fetch(data.url, {
      headers: { Range: "bytes=0-" },
      signal,
    });
    if (direct.ok) {
      blob = await readBodyWithProgress(direct, onProgress);
    } else {
      throw new DownloadError("direct-failed", "direct-failed");
    }
  } catch (err) {
    if (err instanceof DownloadError && err.code === "direct-failed") {
      // fall through to chunked
    } else if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    } else {
      // CORS or network error → chunked fallback
    }

    // 3) Fallback: stream through the server in byte ranges.
    const parts: BlobPart[] = [];
    let received = 0;
    let start = 0;
    for (;;) {
      const end = start + CHUNK_SIZE - 1;
      const chunkRes = await fetch(
        `/api/download/chunk?${buildQuery({ videoId: source.videoId, start, end })}`,
        { signal }
      );
      if (!chunkRes.ok) {
        const j = (await chunkRes.json().catch(() => ({}))) as { error?: string };
        if (j.error === "license-required") {
          throw new DownloadError("license", "Licença necessária para baixar.");
        }
        throw new DownloadError("chunk", "Falha ao baixar (tente novamente).");
      }
      if (chunkRes.headers.get("x-done") === "1") break;
      const buf = await chunkRes.arrayBuffer();
      if (!buf.byteLength) break;
      parts.push(buf);
      received += buf.byteLength;
      start = received;
      onProgress?.({ phase: "downloading", received, total: totalSize });
      if (totalSize && received >= totalSize) break;
    }
    blob = new Blob(parts, { type: mimeType });
  }

  // 4) Persist.
  onProgress?.({ phase: "saving", received: blob.size, total: totalSize });
  const entry: DownloadedAudio = {
    videoId: source.videoId,
    title: data.title || source.title,
    channelName: source.channelName,
    thumbnail: source.thumbnail,
    duration: source.duration,
    mimeType,
    size: blob.size,
    downloadedAt: Date.now(),
    blob,
  };
  await saveDownload(entry);
  return entry;
}