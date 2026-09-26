import "server-only";
import { get as httpsGet, Agent as HttpsAgent } from "node:https";
import { lookup as dnsLookup, setDefaultResultOrder as dnsSetDefaultResultOrder } from "node:dns";
import { getYT, getYTCookie } from "@/lib/youtube";
import type { Innertube } from "youtubei.js";

// Node prefere IPv6 por padrão (verbatim); várias instâncias Invidious e
// alguns gateways do googlevideo só respondem bem via IPv4. Iguala o
// comportamento do curl (happy-eyeballs prático = IPv4 primeiro).
try {
  dnsSetDefaultResultOrder("ipv4first");
} catch {
  /* versões antigas: ignora */
}

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

const CHUNK_PROBE_LIMIT = 3_400_000; // teto do range quando o total é desconhecido
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
        // UA de navegador: algumas instâncias recusam requests sem UA; e o
        // timeout curto evita que instâncias lentas travem o resolver.
        const probe = await withTimeout(
          fetch(url, {
            headers: {
              range: "bytes=0-1023",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(6000),
          }),
          7000
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
// audio-only format exists (usually opus/webm 251). Formatos cifrados (sem
// .url) são decifrados com o player da sessão.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pickAudioFormat(info: any, yt?: Innertube): Promise<{ url: string; mimeType: string; size: number } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adaptive: any[] | undefined =
    info?.streaming_data?.adaptive_formats || info?.streamingData?.adaptive_formats;

  if (Array.isArray(adaptive)) {
    const audioOnly = adaptive.filter(
      (f) => f && f.has_audio && !f.has_video && (f.url || f.signature_cipher || f.cipher)
    );
    if (audioOnly.length) {
      const pool = audioOnly.filter((f) => String(f.mime_type || f.mimeType || "").includes("audio/mp4"));
      const candidates = pool.length ? pool : audioOnly;
      // itag 140 (m4a 128kbps) é o formato padrão universal — preferência
      // explícita; senão o de maior bitrate.
      const chosen = candidates.find((f) => String(f.itag) === "140") || candidates.sort(
        (a, b) => (b.bitrate || 0) - (a.bitrate || 0)
      )[0];
      let url = chosen.url || "";
      if (!url && (chosen.signature_cipher || chosen.cipher) && yt?.session?.player && chosen.decipher) {
        // Formato cifrado: decifra com o player baixado pela sessão.
        try {
          url = await withTimeout(chosen.decipher(yt.session.player), 10000);
        } catch {
          /* segue para o chooseFormat abaixo */
        }
      }
      if (!url) {
        url =
          (chosen.signature_cipher && decodeURIComponent(chosen.signature_cipher.split("&url=")[1] || "")) ||
          (chosen.cipher && decodeURIComponent(chosen.cipher.split("&url=")[1] || "")) ||
          "";
      }
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
    let url = fmt?.url || "";
    if (!url && fmt?.decipher && yt?.session?.player) {
      url = await withTimeout(fmt.decipher(yt.session.player), 10000);
    }
    if (url) {
      return {
        url,
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
  // Cache hit só quando a URL existe (FAILED_STREAM/URL vazia = re-resolve).
  if (hit && hit.stream.url && Date.now() - hit.at < RESOLVE_TTL) return hit.stream;

  const yt = await getYT();

  // Com cookie de conta (CTUBE_YT_COOKIE, ex.: Vercel), o YouTube exige PO
  // token nos clientes logados (os formatos voltam SEM url). Ir direto ao
  // motor pot com a sessão logada resolve de primeira (testado: cookie+pot
  // devolvem itag 140 com URL e googlevideo aceita); a cadeia de clientes
  // abaixo continua como fallback para o cenário sem cookie.
  if (getYTCookie()) {
    try {
      const { resolveAudioWithPot } = await import("../desktop/pot-engine.mjs");
      const viaPot = await withTimeout(resolveAudioWithPot(yt, videoId), 30000);
      cache[videoId] = { at: Date.now(), stream: viaPot };
      return viaPot;
    } catch (err) {
      console.error(
        `[ctube] pot+cookie falhou (${videoId}), seguindo cadeia normal:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // ANDROID_VR primeiro: é o cliente que ainda devolve formatos de áudio com
  // URL pronta e serve em qualquer IP (comprovado em produção e residencial).
  // IOS em seguida; TV/WEB por último (normalmente esvaziados). O motor de
  // PO token + Invidious abaixo são os recursos finais.
  const diag: string[] = [];
  for (const client of ["ANDROID_VR", "IOS", "TV", undefined] as const) {
    try {
      // getBasicInfo (não getInfo): não baixa a página next — mais rápido e
      // o cliente ANDROID_VR devolve URLs prontas sem depender do decifrador.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info: any = await withTimeout(
        client
          ? yt.getBasicInfo(videoId, { client } as never)
          : yt.getBasicInfo(videoId),
        15000
      );
      // Diagnóstico por cliente: status + quantos formatos de áudio e
      // quantos com URL (aparece na mensagem final se todos falharem).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adaptive: any[] = info?.streaming_data?.adaptive_formats || [];
      const audioOnly = adaptive.filter((f) => f && f.has_audio && !f.has_video);
      const withUrl = audioOnly.filter((f) => f.url);
      const status = info?.playability_status?.status || "?";
      diag.push(`${client || "WEB"}:${status}:a${audioOnly.length}/u${withUrl.length}`);
      const fmt = await pickAudioFormat(info, yt);
      if (!fmt) continue;
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
      diag.push(`${client || "WEB"}:ERR:${(err instanceof Error ? err.message : String(err)).slice(0, 60)}`);
      // Try the next client; the PO-token fallback below is the
      // last resort and reports the final error.
    }
  }
  const lastClientErr = diag.join(" | ");

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
  end: number
): Promise<{ buffer: ArrayBuffer; total: number; mimeType: string }> {
  // URLs do googlevideo podem dar 403 por expiração/rate-limit do gateway.
  // Sempre que acontecer, descarta o cache e re-resolve com pausa crescente
  // (até 3 tentativas) — o download se cura sozinho em vez de falhar.
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      delete getCache()[videoId];
      await new Promise((r) => setTimeout(r, 4000 * attempt)); // respiro anti-rate-limit
    }
    let stream = await resolveAudioStream(videoId);
    if (!stream.url) {
      // Negative-cache hit (recent resolution failed) — fail fast instead of
      // requesting an empty googlevideo URL.
      throw new Error("stream-unavailable");
    }
    // Última tentativa: se o googlevideo segue recusando mesmo fatiado
    // (throttle de volume por IP), troca a fonte para um proxy Invidious —
    // o YouTube não bloqueia o IP delas e a instância serve fatias sem
    // esse limite.
    if (attempt === 2 && stream.url.includes("googlevideo.com")) {
      // Teto de 20s: instâncias públicas mortas não podem travar o chunk.
      const alt = await withTimeout(resolveViaInvidious(videoId), 20000).catch(() => null);
      if (alt?.url) {
        console.log("[chunk] tentativa 3: googlevideo segue recusando; trocando para Invidious");
        stream = alt;
      }
    }
    try {
      return await doRangeFetch(stream, start, end);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const ipParam = new URL(stream.url).searchParams.get("ip") || "?";
      console.error(`[chunk] tentativa ${attempt + 1} falhou: ${lastErr.message} | ip=${ipParam} | host=${new URL(stream.url).host}`);
      if (!lastErr.message.startsWith("stream-http-40")) throw lastErr;
      // 403/401: tenta de novo com URL fresca
    }
  }
  throw lastErr || new Error("stream-unavailable");
}

// Fetch de byte range via https nativo do Node: o fetch global (undici) do
// Next altera a ordem/normalização dos headers e o gateway do googlevideo
// responde 403 a esses requests — com https.get direto o mesmo URL serve 206.
function httpsRangeGet(
  url: string,
  headers: Record<string, string>,
  family?: 4 | 6
): Promise<{ status: number; headers: Record<string, string | undefined>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const go = (ip?: string) => {
      const u = new URL(url);
      // Pré-resolve o host na família certa e conecta ao IP direto (host = ip),
      // preservando SNI/Host com servername — a URL é vinculada ao IP que fez
      // o player request (param ip=); sair pela outra família dá 403.
      const req = httpsGet(
        {
          hostname: ip || u.hostname,
          path: u.pathname + u.search,
          port: 443,
          servername: u.hostname,
          headers: { ...headers, Host: u.hostname },
          agent: new HttpsAgent({ keepAlive: false }),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode || 0,
              headers: res.headers as Record<string, string | undefined>,
              body: Buffer.concat(chunks),
            })
          );
        }
      );
      req.on("error", reject);
      req.setTimeout(15000, () => {
        req.destroy(new Error("Timeout after 15000ms"));
      });
    };
    if (family) {
      dnsLookup(new URL(url).hostname, { family }, (err, address) => {
        if (err) reject(err);
        else go(address);
      });
    } else {
      go();
    }
  });
}

// Fatia máxima por request ao gateway: puxadas grandes (>1MB) sofrem 403 de
// throttle em alguns IPs/gateways — fatias de até 1MB passam consistentemente.
const SUBRANGE_SIZE = 1024 * 1024;
const SUBRANGE_MIN = 256 * 1024;

// Um range simples via httpsRangeGet (UA Android VR do cliente resolvido).
async function plainRangeGet(
  stream: AudioStream,
  start: number,
  end: number,
  family?: 4 | 6
): Promise<{ status: number; headers: Record<string, string | undefined>; body: Buffer }> {
  return httpsRangeGet(
    stream.url,
    {
      Range: `bytes=${start}-${end}`,
      // UA consistente com o cliente que resolveu (ANDROID_VR é Android;
      // googlevideo valida a coerência UA↔cliente em alguns gateways).
      "User-Agent":
        "com.google.android.apps.youtube.vr/1.62.27 (Linux; U; Android 11) gzip",
      Accept: "*/*",
    },
    family
  );
}

// Alguns gateways do googlevideo respondem 403 a puxadas grandes (limite de
// volume por IP) enquanto servem fatias pequenas normalmente. Se a puxada de
// uma vez falhar, recua automaticamente para fatias de SUBRANGE_SIZE.
async function rangeFetchWithFallback(
  stream: AudioStream,
  start: number,
  end: number,
  family?: 4 | 6
): Promise<{ status: number; headers: Record<string, string | undefined>; body: Buffer }> {
  // Já entra fatiado: evita a puxada grande que aciona o throttle.
  const sliceSize = Math.min(SUBRANGE_SIZE, end - start + 1);
  const first = await plainRangeGet(stream, start, Math.min(end, start + sliceSize - 1), family);
  if (first.status === 200 || first.status === 206) {
    // A primeira fatia passou — tenta as demais na mesma granularidade.
    if (start + sliceSize > end) return first;
    const chunks: Buffer[] = [first.body];
    let cursor = start + sliceSize;
    let current = sliceSize;
    while (cursor <= end) {
      const sliceEnd = Math.min(cursor + current - 1, end);
      let part = await plainRangeGet(stream, cursor, sliceEnd, family);
      if (part.status === 403) {
        // Throttle por volume é temporário: reduz a fatia, pausa e tenta de novo.
        current = Math.max(SUBRANGE_MIN, Math.floor(current / 2));
        await new Promise((r) => setTimeout(r, 1500));
        part = await plainRangeGet(stream, cursor, Math.min(cursor + current - 1, end), family);
      }
      if (part.status !== 200 && part.status !== 206) {
        throw new Error(`stream-http-${part.status}`);
      }
      chunks.push(part.body);
      cursor += current;
      if (cursor <= end) await new Promise((r) => setTimeout(r, 300));
    }
    return { status: 206, headers: first.headers, body: Buffer.concat(chunks) };
  }
  if (first.status !== 403) return first;

  // Nem a primeira fatia passou: pausa longa (janela de throttle) e recua
  // para a menor granularidade.
  console.log(
    `[chunk] fatia de ${sliceSize} recusada (403); aguardando e fatiando em ${SUBRANGE_MIN} bytes`
  );
  await new Promise((r) => setTimeout(r, 3000));
  const chunks: Buffer[] = [];
  let cursor = start;
  while (cursor <= end) {
    const sliceEnd = Math.min(cursor + SUBRANGE_MIN - 1, end);
    let part = await plainRangeGet(stream, cursor, sliceEnd, family);
    if (part.status === 403) {
      await new Promise((r) => setTimeout(r, 2500));
      part = await plainRangeGet(stream, cursor, sliceEnd, family);
    }
    if (part.status !== 200 && part.status !== 206) {
      throw new Error(`stream-http-${part.status}`);
    }
    chunks.push(part.body);
    if (sliceEnd < end) await new Promise((r) => setTimeout(r, 400));
    cursor = sliceEnd + 1;
  }
  return { status: 206, headers: first.headers, body: Buffer.concat(chunks) };
}

async function doRangeFetch(
  stream: AudioStream,
  start: number,
  end: number
): Promise<{ buffer: ArrayBuffer; total: number; mimeType: string }> {
  // IMPORTANTE: o googlevideo responde 403 (não 416!) para ranges que começam
  // além do fim do arquivo. Nunca pedir start >= total quando o tamanho é
  // conhecido; quando desconhecido, pedir um range pequeno de sonda.
  const knownTotal = stream.size > 0 ? stream.size : 0;
  if (knownTotal && start >= knownTotal) {
    return { buffer: new ArrayBuffer(0), total: knownTotal, mimeType: stream.mimeType || "audio/mp4" };
  }
  const total = knownTotal || end + 1;
  const safeEnd = knownTotal
    ? Math.min(end, knownTotal - 1)
    : Math.min(end, start + CHUNK_PROBE_LIMIT - 1);

  // Família de IP do token (ip= na URL): a conexão do range DEVE sair pela
  // mesma família ou o gateway responde 403.
  const ipParam = new URL(stream.url).searchParams.get("ip") || "";
  const family: 4 | 6 | undefined = ipParam.includes(":") ? 6 : ipParam ? 4 : undefined;
  const { status, headers, body } = await withTimeout(
    rangeFetchWithFallback(stream, start, safeEnd, family),
    40000
  );
  // 416 = range past the end of the stream → treat as "done" (empty buffer).
  if (status === 416) {
    return { buffer: new ArrayBuffer(0), total, mimeType: stream.mimeType || "audio/mp4" };
  }
  if (status !== 200 && status !== 206) {
    // 403 é comumente rate-limit transitório do gateway: espera breve para
    // o retry do chamador (fetchAudioRange re-resolve e tenta de novo).
    throw new Error(`stream-http-${status}`);
  }
  // Descobre o total real pelo Content-Range quando não conhecido.
  const realTotal = knownTotal || Number(headers["content-range"]?.split("/")[1]) || total;
  const buf = body;
  const out = new ArrayBuffer(buf.length);
  new Uint8Array(out).set(buf);
  return { buffer: out, total: realTotal, mimeType: stream.mimeType || "audio/mp4" };
}