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
const globalForDownload = globalThis as unknown as {
  __ctubeAudioStreams?: Record<string, { at: number; stream: AudioStream }>;
};

function getCache(): Record<string, { at: number; stream: AudioStream }> {
  if (!globalForDownload.__ctubeAudioStreams) globalForDownload.__ctubeAudioStreams = {};
  return globalForDownload.__ctubeAudioStreams;
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
 */
export async function resolveAudioStream(videoId: string): Promise<AudioStream> {
  const cache = getCache();
  const hit = cache[videoId];
  if (hit && Date.now() - hit.at < RESOLVE_TTL) return hit.stream;

  const yt = await getYT();
  let lastErr: unknown = new Error("no-audio-format");
  // Try WEB first, then retry once with the TV client: it usually returns a
  // richer set of adaptive formats even when WEB omits streaming data.
  for (const client of [undefined, "TV"] as const) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info: any = await withTimeout(
        // The "TV" client usually returns richer adaptive formats.
        client ? yt.getInfo(videoId, "TV" as never) : yt.getInfo(videoId),
        15000
      );
      const fmt = pickAudioFormat(info);
      if (!fmt) {
        lastErr = new Error("no-audio-format");
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
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Fetches a byte range of the audio stream (used by the chunk proxy). */
export async function fetchAudioRange(
  videoId: string,
  start: number,
  end: number
): Promise<{ buffer: ArrayBuffer; total: number }> {
  const stream = await resolveAudioStream(videoId);
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
    return { buffer: new ArrayBuffer(0), total };
  }
  if (!res.ok && res.status !== 206) {
    throw new Error(`stream-http-${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  return { buffer, total };
}