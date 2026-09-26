// Device-side stream resolution for offline downloads.
//
// The server mints a per-video PO token (BotGuard requires jsdom — impossible
// in a WebView), but YouTube rejects streaming-data for datacenter IPs even
// with a valid pot. The device's residential/mobile IP is accepted, so the
// native app resolves the stream itself using the Capacitor native HTTP
// bridge (no CORS restrictions) and hands back a playable googlevideo URL.

"use client";

export interface DevicePotData {
  pot: string;
  visitorData: string;
  clientName: string;
  clientVersion: string;
  clientUserAgent?: string;
  apiKey: string;
}

export interface DeviceStream {
  url: string;
  mimeType: string;
  size: number;
  title: string;
  duration?: number;
}

function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return !!w.Capacitor?.isNativePlatform?.();
}

export { isNativeApp };

// HTTP request do player: no app nativo usa a ponte Capacitor (sem CORS);
// no navegador usa fetch com Content-Type text/plain (request simples, sem
// preflight — o endpoint youtubei responde direto ao navegador do usuário).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nativeFetch(url: string, options: { method?: string; headers?: Record<string, string>; data?: any }): Promise<{ status: number; json: any }> {
  const w = window as unknown as {
    Capacitor?: { Plugins?: { CapacitorHttp?: any } };
  };
  const http = w.Capacitor?.Plugins?.CapacitorHttp;
  if (http && isNativeApp()) {
    const res = await http.request({
      url,
      method: options.method || "GET",
      headers: options.headers,
      data: typeof options.data === "string" ? options.data : JSON.stringify(options.data ?? {}),
    });
    let json: unknown = null;
    try {
      json = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    } catch {
      json = null;
    }
    return { status: res.status, json };
  }
  // Navegador: request simples (sem cabeçalhos custom) para evitar preflight.
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: typeof options.data === "string" ? options.data : JSON.stringify(options.data ?? {}),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/**
 * Resolves the audio-only stream from the device itself.
 * Throws Error with a `device:`-prefixed message on failure so callers can
 * distinguish this stage from server-side failures.
 */
export async function resolveAudioFromDevice(
  videoId: string,
  potData: DevicePotData,
  license?: { code: string; email: string } | null
): Promise<DeviceStream> {
  // Funciona no app nativo (ponte Capacitor) E no navegador (fetch simples —
  // o youtubei responde ao IP residencial do usuário sem LOGIN_REQUIRED).

  const body = {
    context: {
      client: {
        clientName: potData.clientName,
        clientVersion: potData.clientVersion,
        gl: "BR",
        hl: "pt",
        visitorData: potData.visitorData,
      },
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  };

  const res = await nativeFetch(
    `https://www.youtube.com/youtubei/v1/player?key=${potData.apiKey}&prettyPrint=false`,
    {
      method: "POST",
      data: JSON.stringify(body),
    }
  );

  if (res.status !== 200 || !res.json) {
    throw new Error(`device:player-${res.status}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player = res.json as any;
  const status = player?.playabilityStatus?.status;
  if (status && status !== "OK") {
    throw new Error(`device:playability-${status}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adaptive: any[] = player?.streamingData?.adaptiveFormats || [];
  // Raw Innertube responses may omit hasAudio/hasVideo — filter by mimeType.
  const audioOnly = adaptive
    .filter((f) => f && String(f.mimeType || "").startsWith("audio/"))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  if (!audioOnly.length) throw new Error("device:no-audio-format");

  // Prefer m4a for WebView compatibility; itag 140 (128kbps) é o padrão
  // universal — senão o de maior bitrate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m4a = audioOnly.filter((f: any) => String(f.mimeType || f.mime_type || "").includes("mp4"));
  const pool = m4a.length ? m4a : audioOnly;
  const fmt = pool.find((f: any) => String(f.itag) === "140") || pool.sort(
    (a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0)
  )[0];

  // IOS client returns url OR cipher/signatureCipher. We can't decipher in the
  // WebView reliably, so require url-bearing formats; the IOS client usually
  // provides them when po_token is attached.
  let url: string = fmt.url || "";
  if (!url) {
    const cipher = fmt.signatureCipher || fmt.signature_cipher || fmt.cipher || "";
    const params = new URLSearchParams(cipher);
    const base = params.get("url") || "";
    const sig = params.get("s") || "";
    if (base && !sig) url = base; // no throttling cipher → usable directly
  }
  if (!url) throw new Error("device:decipher-required");

  const sep = url.includes("?") ? "&" : "?";
  url = `${url}${sep}pot=${encodeURIComponent(potData.pot)}`;

  const mimeType = String(fmt.mimeType || fmt.mime_type || "audio/mp4");
  const size = parseInt(fmt.contentLength || fmt.content_length || "0", 10) || 0;
  const videoDetails = player?.videoDetails || {};

  return {
    url,
    mimeType,
    size,
    title: videoDetails.title || "",
    duration: typeof videoDetails.lengthSeconds === "number"
      ? videoDetails.lengthSeconds
      : parseInt(videoDetails.lengthSeconds || "0", 10) || undefined,
  };
}

/**
 * Fetches the minted pot data for a video. Shared by the device fallback path.
 */
export async function fetchPotForDevice(
  videoId: string,
  license?: { code: string; email: string } | null
): Promise<DevicePotData> {
  // The pot endpoint serves PLAYBACK (free): the license params are accepted
  // but optional — offline DOWNLOADS are gated elsewhere (download/url, chunk).
  const params = new URLSearchParams({ videoId });
  if (license) {
    params.set("code", license.code);
    params.set("email", license.email);
  }
  const res = await fetch(`/api/download/pot?${params.toString()}`);
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    pot?: string;
    visitorData?: string;
    clientName?: string;
    clientVersion?: string;
    clientUserAgent?: string;
    apiKey?: string;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.pot || !data.visitorData) {
    if (data.error === "license-required") throw new Error("license-required");
    throw new Error(`pot-fetch-${res.status}`);
  }
  return {
    pot: data.pot,
    visitorData: data.visitorData,
    clientName: data.clientName || "IOS",
    clientVersion: data.clientVersion || "20.11.6",
    clientUserAgent: data.clientUserAgent,
    apiKey: data.apiKey || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
  };
}
