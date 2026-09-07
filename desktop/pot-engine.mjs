// PO-token engine for offline audio downloads.
//
// Since late 2025 / 2026, YouTube strips stream URLs from player responses
// unless the request carries a valid PO token, and googlevideo additionally
// requires a per-video "pot" parameter on the stream URL itself. youtubei.js
// can accept a po_token but cannot mint one — that requires running YouTube's
// BotGuard attestation challenge, which is what this module does (following
// the reference example from the BgUtils repo, LuanRT/BgUtils#index-innertube).
//
// This file is plain ESM so it can be shared by:
//   - the Electron desktop local server  (desktop/youtube.cjs, dynamic import)
//   - the Next.js server / Vercel        (lib/download-server.ts, dynamic import)
//
// It is intentionally standalone: it never touches React/browser code and the
// caller passes its own youtubei.js Innertube session.
//
// IMPORTANT: the BotGuard challenge AND the mint callback both execute code
// that reads `window`/`document`/... off the real global object, so those
// jsdom globals must be installed on globalThis at attest time AND at mint
// time. To keep the rest of the server untouched, we install them only for
// the duration of each operation and restore afterwards.

/* eslint-disable no-console */

import { Platform } from "youtubei.js";

// youtubei.js refuses to run player decipher algorithms without a custom
// JavaScript evaluator (its Node default intentionally throws). This matches
// the reference BgUtils example and also unlocks deciphering for any other
// youtubei.js consumer in the same process (server or Electron main).
Platform.shim.eval = async (data) => new Function(data.output)();

const BOTGUARD_REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const GLOBAL_KEYS = ["yt", "window", "document", "location", "origin", "navigator"];

let env = null; // { dom, install(), restore(), minter, refreshAt }
let state = null; // { minter, refreshAt }
let lock = null;
let mintChain = Promise.resolve();

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`pot: timeout after ${ms}ms`)), ms)),
  ]);
}

// Serialize concurrent cold boots so only one attestation runs at a time.
function withLock(fn) {
  if (!lock) {
    lock = fn()
      .catch((err) => {
        lock = null;
        throw err;
      })
      .finally(() => {
        lock = null;
      });
  }
  return lock;
}

// Installs the jsdom browser environment on globalThis. Returns nothing; the
// caller is responsible for calling restore() afterwards.
function installBrowserEnv(dom) {
  const prev = {};
  for (const key of GLOBAL_KEYS) {
    const desc = Object.getOwnPropertyDescriptor(globalThis, key);
    if (desc) prev[key] = desc;
  }
  dom.window.yt = dom.window.yt || { config_: dom.ytConfig };
  Object.assign(globalThis, {
    yt: dom.window.yt,
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    origin: dom.window.origin,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
    enumerable: false,
  });
  return prev;
}

function restoreBrowserEnv(prev) {
  for (const key of GLOBAL_KEYS) {
    if (key in prev) Object.defineProperty(globalThis, key, prev[key]);
    else delete globalThis[key];
  }
}

async function loadInterpreter(interpreterUrl) {
  const res = await fetch(`https:${interpreterUrl}`, {
    headers: { accept: "*/*", "accept-language": "en-US,en;q=0.7", "user-agent": BROWSER_UA },
  });
  if (!res.ok) throw new Error(`pot: interpreter fetch failed (${res.status})`);
  return res.text();
}

// Performs the BotGuard attestation. Returns { minter, refreshAt, installEnv, restoreEnv }.
async function attest() {
  const { JSDOM } = await import("jsdom");
  const { BotGuardClient } = await import("bgutils-js/botguard");
  const { WebPoMinter } = await import("bgutils-js/webpo");
  const { buildURL, parseLooseJSON, getHeaders } = await import("bgutils-js/utils");

  const dom = new JSDOM(
    '<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>',
    { url: "https://www.youtube.com", referrer: "https://www.youtube.com/", userAgent: BROWSER_UA }
  );

  const pageResponse = await fetch("https://www.youtube.com", {
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.7",
      "user-agent": BROWSER_UA,
    },
  });
  if (!pageResponse.ok) throw new Error(`pot: youtube page fetch failed (${pageResponse.status})`);
  const pageHtml = await pageResponse.text();
  const ytConfig = pageHtml.match(/ytcfg\.set\(({.+?})\);/s)?.[1];
  if (!ytConfig) throw new Error("pot: could not find ytcfg in page HTML");
  dom.ytConfig = JSON.parse(ytConfig);

  const prev = installBrowserEnv(dom);
  try {
    const initialAttestationData = pageHtml.match(/window\.ytAtN\(\s*({[\s\S]*?})\s*\)/);
    if (!initialAttestationData) throw new Error("pot: could not find challenge in page HTML");
    const initialAttestationDataJson = parseLooseJSON(initialAttestationData[1]);
    const challengeResponse = initialAttestationDataJson.R;
    if (!challengeResponse?.bgChallenge) throw new Error("pot: could not get challenge");

    const interpreterUrl =
      challengeResponse.bgChallenge.interpreterUrl.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
    const interpreterJavascript = await withTimeout(loadInterpreter(interpreterUrl), 15000);
    if (!interpreterJavascript) throw new Error("pot: could not load interpreter");
    new Function(interpreterJavascript)();

    const botGuardClient = await BotGuardClient.create({
      program: challengeResponse.bgChallenge.program,
      globalName: challengeResponse.bgChallenge.globalName,
      globalObject: globalThis,
    });

    const webPoSignalOutput = [];
    const botguardResponse = await botGuardClient.snapshot({ webPoSignalOutput });
    const payload = [BOTGUARD_REQUEST_KEY, botguardResponse];
    const integrityTokenResponse = await withTimeout(
      fetch(buildURL("GenerateIT", true), {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      }),
      20000
    );
    if (!integrityTokenResponse.ok) throw new Error(`pot: GenerateIT failed (${integrityTokenResponse.status})`);
    const integrityTokenJson = await integrityTokenResponse.json();
    const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] = integrityTokenJson;
    if (!integrityToken) throw new Error("pot: GenerateIT returned no token");

    const integrityTokenData = { integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken };
    const minter = await WebPoMinter.create(integrityTokenData, webPoSignalOutput);

    const ttl = Number(estimatedTtlSecs) || 6 * 3600;
    const threshold = Number(mintRefreshThreshold) || Math.floor(ttl * 0.6);
    const refreshAt = Date.now() + Math.max(ttl - threshold, 600) * 1000 * 0.8;
    return { minter, refreshAt, dom };
  } finally {
    restoreBrowserEnv(prev);
  }
}

async function ensureReady() {
  if (state && Date.now() < state.refreshAt) return state;
  const fresh = await withLock(async () => {
    if (state && Date.now() < state.refreshAt) return state;
    const next = await attest();
    state = { minter: next.minter, refreshAt: next.refreshAt, dom: next.dom };
    return state;
  });
  return state;
}

// The BotGuard VM's mint callback reads `window` off the global object, so the
// jsdom environment must be installed for the (fast) duration of each mint.
async function mintWithEnv(videoId) {
  const s = await ensureReady();
  const prev = installBrowserEnv(s.dom);
  try {
    return await s.minter.mintAsWebsafeString(videoId);
  } finally {
    restoreBrowserEnv(prev);
  }
}

/** Mints a content-bound websafe PO token for a video id. */
export function mintPot(videoId) {
  const run = async () => {
    try {
      const pot = await mintWithEnv(videoId);
      if (!pot) throw new Error("pot: empty token");
      return pot;
    } catch (err) {
      // Token may have expired or the challenge drifted: force a refresh once.
      state = null;
      const pot2 = await mintWithEnv(videoId);
      if (!pot2) throw new Error("pot: empty token");
      return pot2;
    }
  };
  // Mints are quick and share the global object: serialize them.
  const next = mintChain.then(run, run);
  mintChain = next.catch(() => {});
  return next;
}

/**
 * Resolves the audio-only stream for a video using a PO-token protected player
 * request, and returns { url, mimeType, size, title, duration }.
 *
 * `yt` must be an Innertube instance (youtubei.js) created by the caller.
 */
export async function resolveAudioWithPot(yt, videoId) {
  const pot = await mintPot(videoId);
  if (!pot) throw new Error("no-audio-format");

  // YTMUSIC is the client that still returns cipher-protected formats; the
  // per-video pot is appended to the deciphered googlevideo URL.
  const info = await withTimeout(yt.getBasicInfo(videoId, { client: "YTMUSIC" }), 20000);
  const fmt = info?.chooseFormat?.({ type: "audio", quality: "best" });
  if (!fmt) throw new Error("no-audio-format");

  let url = fmt.url;
  if (!url) {
    if (!fmt.decipher || !yt.session?.player) throw new Error("no-audio-format");
    url = await withTimeout(fmt.decipher(yt.session.player), 10000);
  }
  if (!url) throw new Error("no-audio-format");

  const sep = url.includes("?") ? "&" : "?";
  url = `${url}${sep}pot=${encodeURIComponent(pot)}`;

  const mimeType = String(fmt.mime_type || fmt.mimeType || "audio/mp4");
  const size = parseInt(fmt.content_length || fmt.contentLength || "0", 10) || 0;
  return {
    url,
    mimeType,
    size,
    title: info.basic_info?.title || "",
    duration: typeof info.basic_info?.duration === "number" ? info.basic_info.duration : undefined,
  };
}
