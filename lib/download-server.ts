import "server-only";
import { getYT } from "@/lib/youtube";

// ---------------------------------------------------------------------------
// Server-side audio resolution for offline downloads.
//
// The client never runs youtubei.js: resolving the stream URL here (Vercel or
// the Electron local server) keeps the Innertube API calls out of the browser
// (they are CORS-restricted). The resolved googlevideo URL is either fetched
// directly by the client (when the CDN allows CORS) or streamed through the
// /api/download/chunk proxy (fallback, used by WebViews).
// ---------------------------------------------------------------------------

export interface AudioStream {
  url: string;
  mimeType: string;
  size: number; // bytes (0 when unknown)
  title: string;
  duration?: number; // seconds
}

const RESOLVE_TTL = 10 * 60_000; // stream URLs expire after a few hours
const NEG_TTL = 60_000; // failed resolutions are retried after 1 minute
const FAILED_STREAM: AudioStream = { url: "", mimeType: "audio/mp4", size: 0, title: "" };
const globalForDownload = globalThis as unknown as {
  __ctubeAudioStreams?: Record<string, { at: number; stream: AudioStream }>;
};

function getCache(): Record<string, { at: number; stream: AudioStream }> {
  if (!globalForDownload.__ctubeAudioStreams) globalForDownload.__ctubeAudioStreams = {};
  return globalForDownload.__ctubeAudioStreams;
}

// ---------------------------------------------------------------------------
// Fallback Invidious: instâncias públicas proxyam o stream pelo próprio
// domínio (o YouTube NÃO bloqueia o IP delas). Quando o YouTube esvazia o
// streaming-data para o IP de datacenter da Vercel (WEB/TV sem URL, pot
// recusado), servimos o áudio através da instância — o cliente baixa via
// /api/download/chunk, que busca na instância server-side (sem CORS).
// ---------------------------------------------------------------------------
const INVIDIOUS_HOSTS = [
  "https://yewtu.be",
  "https://inv.nadeko.net",
  "https://invidious.tiekoetter.com",
  "https://invidious.f5.si",
  "https://yt.chocolatemoo53.com",
];
// itag 140 = m4a 128kbps (universal), 141/139 como alternativas raras.
const INVIDIOUS_ITAGS = ["140", "141", "139"];

async function resolveViaInvidious(videoId: string): Promise<AudioStream | null> {
  for (const base of INVIDIOUS_HOSTS) {
    for (const itag of INVIDIOUS_ITAGS) {
      const url = `${base}/latest_version?id=${videoId}&itag=${itag}&local=true`;
      try {
        // Probe com range minúsculo: confirma que a instância realmente
        // serve o stream (evita devolver URL que falha no meio do download).
        const probe = await withTimeout(
          fetch(url, { headers: { range: "bytes=0-1023" } }),
          8000
        );
        if (probe.status === 404 || probe.status === 403) continue;
        if (!probe.ok && probe.status !== 206) {
          try { await probe.body?.cancel(); } catch { /* ignore */ }
          continue;
        }
        const mimeHeader = probe.headers.get("content-type") || "";
        const total = Number(probe.headers.get("content-range")?.split("/")[1]) || 0;
        try { await probe.body?.cancel(); } catch { /* ignore */ }
        if (mimeHeader.includes("text/html")) continue; // página de erro
        return {
          url,
          mimeType: mimeHeader.startsWith("audio/") ? mimeHeader : "audio/mp4",
          size: total,
          title: "",
        };
      } catch {
        continue;
      }
    }
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

// Pick the best audio-only format. Prefer m4a (audio/mp4) because iOS
// WebViews have limited WebM/Opus playback support; fall back to whatever
// audio-only format exists (usually opus/webm 251).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickAudioFormat(info: any): { url: string; mimeType: string; size: number } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adaptive: any[] | undefined =
    info?.streaming_data?.adaptive_formats || info?.streamingData?.adaptive_formats;

  if (Array.isArray(adaptive)) {
    const audioOnly = adaptive.filter(
      (f) => f && f.has_audio && !f.has_video && (f.url || f.signature_cipher || f.cipher)
    );
    if (audioOnly.length) {
      const pool = audioOnly.filter((f) => String(f.mime_type || f.mimeType || "").includes("audio/mp4"));
      const chosen = (pool.length ? pool : audioOnly).sort(
        (a, b) => (b.bitrate || 0) - (a.bitrate || 0)
      )[0];
      const url =
        chosen.url ||
        (chosen.signature_cipher && decodeURIComponent(chosen.signature_cipher.split("&url=")[1] || "")) ||
        (chosen.cipher && decodeURIComponent(chosen.cipher.split("&url=")[1] || "")) ||
        "";
      if (url) {
        const mimeType = String(chosen.mime_type || chosen.mimeType || "audio/mp4");
        const size = parseInt(chosen.content_length || chosen.contentLength || "0", 10) || 0;
        return { url, mimeType, size };
      }
    }
  }

  // Fallback: rely on chooseFormat({ type: "audio" }).
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fmt: any = info.chooseFormat?.({ type: "audio", quality: "best" });
    if (fmt?.url) {
      return {
        url: fmt.url,
        mimeType: String(fmt.mime_type || fmt.mimeType || "audio/mp4"),
        size: parseInt(fmt.content_length || fmt.contentLength || "0", 10) || 0,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Resolves the best audio-only stream for a video. Results are cached in
 * memory for RESOLVE_TTL so the chunk proxy doesn't re-run getInfo per range.
 *
 * Since YouTube now strips stream URLs unless the request is PO-token
 * protected, the plain getInfo attempts usually find no URL-bearing format;
 * in that case we fall back to the BotGuard-backed PO-token engine
 * (desktop/pot-engine.mjs), which mints a per-video "pot" and resolves the
 * stream through the YTMUSIC client.
 */
export async function resolveAudioStream(videoId: string): Promise<AudioStream> {
  const cache = getCache();
  const hit = cache[videoId];
  if (hit && Date.now() - hit.at < RESOLVE_TTL) return hit.stream;

  const yt = await getYT();
  // IOS first: o cliente IOS ainda devolve formatos de áudio com URL pronta
  // mesmo sem PO token (o YouTube esvaziou WEB/TV para clientes anônimos).
  // TV em seguida; por último o default (WEB). O motor de PO token abaixo é
  // o último recurso e reporta o erro final.
  let lastClientErr: string = "";
  for (const client of ["IOS", "TV", undefined] as const) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info: any = await withTimeout(
        client ? yt.getInfo(videoId, client as never) : yt.getInfo(videoId),
        15000
      );
      const fmt = pickAudioFormat(info);
      if (!fmt) {
        lastClientErr = `client=${client || "WEB"}:no-audio-url`;
        continue;
      }
      const title = (info.basic_info?.title as string) || "";
      const duration = typeof info.basic_info?.duration === "number" ? info.basic_info.duration : undefined;
      const stream: AudioStream = {
        url: fmt.url,
        mimeType: fmt.mimeType,
        size: fmt.size,
        title,
        duration,
      };
      cache[videoId] = { at: Date.now(), stream };
      return stream;
    } catch (err) {
      lastClientErr = `client=${client || "WEB"}:${(err instanceof Error ? err.message : String(err)).slice(0, 80)}`;
      // Try the next client; the PO-token fallback below is the
      // last resort and reports the final error.
    }
  }

  // Fallback Invidious antes do pot: é rápido (~2s) e independe do tipo de
  // IP; o motor de PO token continua como último recurso (pesado, BotGuard).
  try {
    const viaInstance = await withTimeout(resolveViaInvidious(videoId), 45000);
    if (viaInstance) {
      cache[videoId] = { at: Date.now(), stream: viaInstance };
      return viaInstance;
    }
  } catch {
    /* instâncias indisponíveis — segue para o pot */
  }

  // PO-token fallback (lazy: jsdom + BotGuard are heavy and only needed here).
  try {
    const { resolveAudioWithPot } = await import("../desktop/pot-engine.mjs");
    const stream = await withTimeout(resolveAudioWithPot(yt, videoId), 30000);
    cache[videoId] = { at: Date.now(), stream };
    return stream;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ctube] pot resolution failed for ${videoId} (${Date.now() % 100000}ms):`, msg);
    // Mark the failure so repeated probes don't re-run the heavy BotGuard
    // engine every time — the negative entry expires quickly (1 min) and a
    // later request can try again (YouTube flakiness is often transient).
    const combined = `${lastClientErr} | pot:${msg.slice(0, 120)}`;
    if (err instanceof Error) err.message = combined;
    cache[videoId] = { at: Date.now() - RESOLVE_TTL + NEG_TTL, stream: FAILED_STREAM };
    throw err;
  }
}

/** Fetches a byte range of the audio stream (used by the chunk proxy). */
export async function fetchAudioRange(
  videoId: string,
  start: number,
  end: number,
  _retried = false
): Promise<{ buffer: ArrayBuffer; total: number; mimeType: string }> {
  const stream = await resolveAudioStream(videoId);
  if (!stream.url) {
    // Negative-cache hit (recent resolution failed) — fail fast instead of
    // requesting an empty googlevideo URL.
    throw new Error("stream-unavailable");
  }
  try {
    return await doRangeFetch(stream, start, end);
  } catch (err) {
    // A 403 from googlevideo usually means the signed URL expired (or the
    // IP got temporarily rate-limited). Drop the cached stream and re-resolve
    // once before giving up, so playback self-heals instead of hard-failing.
    if (!_retried && err instanceof Error && err.message === "stream-http-403") {
      delete getCache()[videoId];
      const fresh = await resolveAudioStream(videoId);
      if (fresh.url) {
        try {
          return await doRangeFetch(fresh, start, end);
        } catch (retryErr) {
          // Still 403 (transient IP rate-limit): wait briefly and try one
          // final time before surfacing the failure to the player.
          if (retryErr instanceof Error && retryErr.message === "stream-http-403") {
            await new Promise((r) => setTimeout(r, 2500));
            const again = await resolveAudioStream(videoId);
            if (again.url) return doRangeFetch(again, start, end);
          }
          throw retryErr;
        }
      }
    }
    throw err;
  }
}

async function doRangeFetch(
  stream: AudioStream,
  start: number,
  end: number
): Promise<{ buffer: ArrayBuffer; total: number; mimeType: string }> {
  const total = stream.size || end + 1;
  const safeEnd = Math.min(end, Math.max(total - 1, start));

  const res = await withTimeout(
    fetch(stream.url, {
      headers: {
        Range: `bytes=${start}-${safeEnd}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    }),
    15000
  );
  // 416 = range past the end of the stream → treat as "done" (empty buffer).
  if (res.status === 416) {
    return { buffer: new ArrayBuffer(0), total, mimeType: stream.mimeType || "audio/mp4" };
  }
  if (!res.ok && res.status !== 206) {
    throw new Error(`stream-http-${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  return { buffer, total, mimeType: stream.mimeType || "audio/mp4" };
}