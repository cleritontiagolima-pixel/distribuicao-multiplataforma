const { app, BrowserWindow, shell, ipcMain, Menu } = require("electron");
const path = require("path");
const http = require("http");
const https = require("https");
const fs = require("fs");
const url = require("url");
const crypto = require("crypto");

// ============================================================
// CONFIGURATION
// ============================================================
const LOCAL_PORT = 3210;
const LOCAL_URL = `http://localhost:${LOCAL_PORT}`;

// Remote URL: try env var first, then hardcoded Vercel deployment
const REMOTE_URL =
  (process.env.CTUBE_URL && process.env.CTUBE_URL.trim()) ||
  "https://distribuicao-multiplataforma.vercel.app";

const ADMIN_EMAIL = "ctinformatic@gmail.com";

// Optional config baked at build time by the Windows workflow
// (desktop/baked-config.json, gitignored). Carries CTUBE_PLAN and
// CTUBE_LICENSE_SECRET so the packaged app enforces paid mode + production
// codes even fully offline (against its local server). Falls back to the
// environment, then to the dev defaults.
let bakedConfig = null;
try {
  bakedConfig = require("./baked-config.json");
} catch {
  /* no baked config (dev) */
}

// License codes are HMAC-signed the same way as the web app
// (lib/server-crypto.ts). The default secret matches the dev default so
// codes issued in development validate here too. In production set
// CTUBE_LICENSE_SECRET (baked at build or on the machine) so the desktop app
// accepts the same codes as the Vercel deployment.
const LICENSE_SECRET =
  process.env.CTUBE_LICENSE_SECRET ||
  (bakedConfig && bakedConfig.licenseSecret) ||
  "ctube-license-dev-secret";

function validateLicenseCode(code, expectedEmail) {
  if (!code || typeof code !== "string" || !code.startsWith("CTUBE-")) {
    return { valid: false, reason: "invalid-format" };
  }
  const [, rest] = code.split("-");
  const [body, sig] = (rest || "").split(".");
  if (!body || !sig) return { valid: false, reason: "invalid-format" };
  const expected = crypto.createHmac("sha256", LICENSE_SECRET).update(body).digest("hex").slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "bad-signature" };
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (expectedEmail && payload.email !== String(expectedEmail).trim().toLowerCase()) {
      return { valid: false, reason: "email-mismatch" };
    }
    if (payload.exp < Date.now()) return { valid: false, reason: "expired", payload };
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: "invalid-format" };
  }
}

function getPlan() {
  if (process.env.CTUBE_PLAN === "paid") return "paid";
  if (bakedConfig && bakedConfig.plan === "paid") return "paid";
  return "free";
}

let mainWindow = null;
let httpServer = null;
let isQuitting = false;
let menuBarVisible = false;

// ============================================================
// SINGLE INSTANCE LOCK
// ============================================================
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ============================================================
// PATH HELPERS
// ============================================================
function getProjectRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "static");
  }
  return path.join(__dirname, "..");
}

function getPublicDir() {
  return path.join(getProjectRoot(), "public");
}

function getNextStaticDir() {
  return path.join(getProjectRoot(), ".next", "static");
}

function getServerAppDir() {
  return path.join(getProjectRoot(), ".next", "server", "app");
}

// MIME types
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  // RSC payloads: Next.js App Router client-side navigation fetches these with
  // the "RSC: 1" header; the router only treats the response as a flight
  // payload when the content-type starts with text/x-component.
  ".rsc": "text/x-component; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// ============================================================
// YOUTUBE API HANDLER
// ============================================================
let ytApi;
function getYoutubeApi() {
  if (!ytApi) {
    try {
      ytApi = require("./youtube.cjs");
    } catch (err) {
      console.error("[CTUBE] Failed to load youtube.cjs:", err.message);
    }
  }
  return ytApi;
}

async function handleApiRequest(req, res, pathname) {
  const api = getYoutubeApi();
  if (!api) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "YouTube API not available" }));
    return;
  }

  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url, true);
    const params = parsedUrl.query;

    if (pathname === "/api/videos" || pathname.startsWith("/api/videos/")) {
      const idMatch = pathname.match(/^\/api\/videos\/([^/]+)$/);
      if (idMatch) {
        const videoId = idMatch[1];
        const type = params.type || "details";
        if (type === "related") {
          const videos = await api.getRelatedVideos(videoId);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ videos }));
        } else {
          const video = await api.getVideoDetails(videoId);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ video }));
        }
      } else {
        const continuation = params.continuation || undefined;
        const result = await api.getHomeFeed(continuation);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      }
    } else if (pathname === "/api/search") {
      const query = params.q || "";
      const continuation = params.continuation || undefined;
      const type = params.type || "search";
      if (type === "suggestions") {
        const suggestions = await api.getSuggestions(query);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ suggestions }));
      } else {
        const result = await api.searchVideos(query, continuation);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      }
    } else if (pathname === "/api/trending") {
      const videos = await api.getTrending();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ videos }));
    } else if (pathname === "/api/app-config") {
      const pkg = require("../package.json");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          plan: getPlan(),
          appVersion: pkg.version || "1.0.0",
          ownerEmail: ADMIN_EMAIL,
          purchaseUrl:
            (process.env.CTUBE_PURCHASE_URL || "").trim() ||
            `mailto:${ADMIN_EMAIL}?subject=CTUBE%20Premium%20(1%20ano)`,
        })
      );
    } else if (pathname === "/api/license/validate" && req.method === "POST") {
      // Offline license activation: same algorithm as the Vercel route.
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
        if (raw.length > 10000) req.destroy();
      });
      req.on("end", () => {
        try {
          const body = JSON.parse(raw || "{}");
          const code = String(body.code || "").trim();
          const email = String(body.email || "").trim();
          const result = validateLicenseCode(code, email || undefined);
          if (!result.valid || !result.payload) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, valid: false, reason: result.reason || "invalid" }));
            return;
          }
          const daysLeft = Math.max(0, Math.ceil((result.payload.exp - Date.now()) / 86400000));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              valid: true,
              email: result.payload.email,
              plan: result.payload.plan,
              days: result.payload.days,
              daysLeft,
              expiresAt: result.payload.exp,
              activatedAt: result.payload.iat,
            })
          );
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, valid: false, reason: "bad-request" }));
        }
      });
    } else if (pathname === "/api/download/url") {
      const videoId = String(params.videoId || "");
      const code = String(params.code || "");
      const email = String(params.email || "");
      if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid-video" }));
        return;
      }
      if (getPlan() === "paid") {
        const result = validateLicenseCode(code, email || undefined);
        if (!result.valid || !result.payload) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "license-required", reason: result.reason || "invalid" }));
          return;
        }
      }
      try {
        const stream = await api.resolveAudioStream(videoId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            videoId,
            url: stream.url,
            mimeType: stream.mimeType,
            size: stream.size,
            title: stream.title,
            duration: stream.duration ?? null,
            plan: getPlan(),
          })
        );
      } catch (err) {
        console.error("[CTUBE] download/url error:", err.message);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "resolve-failed", message: err.message }));
      }
    } else if (pathname === "/api/download/chunk") {
      const videoId = String(params.videoId || "");
      const code = String(params.code || "");
      const email = String(params.email || "");
      const start = parseInt(params.start || "0", 10) || 0;
      const requestedEnd = parseInt(params.end || "0", 10) || start;
      if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId) || start < 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid-video" }));
        return;
      }
      if (getPlan() === "paid") {
        const result = validateLicenseCode(code, email || undefined);
        if (!result.valid || !result.payload) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "license-required", reason: result.reason || "invalid" }));
          return;
        }
      }
      try {
        const end = Math.min(requestedEnd, start + 3400000);
        const { buffer, total } = await api.fetchAudioRange(videoId, start, end);
        if (buffer.byteLength === 0 || start >= total) {
          res.writeHead(200, { "x-done": "1", "x-total": String(total), "Content-Length": "0" });
          res.end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(buffer.byteLength),
          "x-total": String(total),
        });
        res.end(Buffer.from(buffer));
      } catch (err) {
        console.error("[CTUBE] download/chunk error:", err.message);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "chunk-failed", message: err.message }));
      }
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  } catch (error) {
    console.error("[CTUBE] API Error:", error.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// ============================================================
// STATIC FILE SERVING
// ============================================================
function serveStaticFile(filePath, res, contentTypeOverride) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const mimeType = contentTypeOverride || getMimeType(filePath);
    res.writeHead(200, { "Content-Type": mimeType });
    res.end(data);
  });
}

// ----------------------------------------------------------------------------
// NEXT.JS APP ROUTER OFFLINE SERVING
// ----------------------------------------------------------------------------
// The pre-rendered pages live in .next/server/app/<route>.html plus a matching
// <route>.rsc file — the flight (RSC) payload that the App Router requests to
// do client-side navigation. Serving those payloads makes navigation work
// offline (clicking around stays on one page, no reloads).
//
// For routes that have no pre-rendered file (dynamic routes like /watch/<id>),
// we serve a pre-rendered shell instead. Next.js detects that the response to
// an RSC request is a full HTML document (not text/x-component) and falls back
// to a full-page load — so those routes still work, just with a reload.

// App Router navigation requests carry the "RSC: 1" header and/or a
// ?_rsc= (previously ?__flight__=) query parameter.
function isRscRequest(req, parsedUrl) {
  return (
    req.headers["rsc"] === "1" ||
    req.headers["__flight__"] === "1" ||
    parsedUrl.query._rsc !== undefined ||
    parsedUrl.query.__flight__ !== undefined
  );
}

// Resolve a pre-rendered page for a pathname: /trending -> trending.html|.rsc,
// / -> index.html|.rsc, /some/dir -> some/dir/index.html|.rsc
function resolvePageFile(serverAppDir, cleanPath, wantRsc) {
  const ext = wantRsc ? ".rsc" : ".html";
  const indexName = wantRsc ? "index.rsc" : "index.html";
  const rel = cleanPath.replace(/^\//, "");
  const candidates = rel
    ? [`${rel}${ext}`, path.join(rel, indexName)]
    : [indexName];
  for (const candidate of candidates) {
    const filePath = path.join(serverAppDir, candidate);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }
  return null;
}

// Dynamic routes (/watch/<id>) have no per-id file. A single shell was
// pre-rendered at build time via generateStaticParams (id "_"); serve that
// shell for any value. The page itself reads the real id from the URL.
function resolveParamShell(serverAppDir, cleanPath) {
  const parts = cleanPath.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const [segment, value] = parts;
  if (!value || /\.[a-z0-9]{2,6}$/i.test(value)) return null;
  const shellPath = path.join(serverAppDir, segment, "_.html");
  if (fs.existsSync(shellPath) && fs.statSync(shellPath).isFile()) {
    return shellPath;
  }
  return null;
}

// ============================================================
// EMBEDDED HTTP SERVER (fallback when no internet)
// ============================================================
function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const parsedUrl = url.parse(req.url, true);
      const pathname = parsedUrl.pathname;

      // Handle API routes
      if (pathname.startsWith("/api/")) {
        return handleApiRequest(req, res, pathname);
      }

      const publicDir = getPublicDir();
      const serverAppDir = getServerAppDir();
      const cleanPath = pathname.split("?")[0];

      // Check public directory first
      let filePath = path.join(publicDir, cleanPath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return serveStaticFile(filePath, res);
      }

      // Check _next/static (CSS, JS bundles)
      if (cleanPath.startsWith("/_next/static/")) {
        const nextStaticDir = getNextStaticDir();
        const relativePath = cleanPath.replace("/_next/static/", "");
        filePath = path.join(nextStaticDir, relativePath);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          return serveStaticFile(filePath, res);
        }
      }

      // Handle _next/data routes for client-side navigation
      if (cleanPath.startsWith("/_next/data/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
        return;
      }

      // Try pre-rendered pages from .next/server/app/
      if (serverAppDir && fs.existsSync(serverAppDir)) {
        const rscRequest = isRscRequest(req, parsedUrl);

        // 1) RSC navigation requests: serve the pre-rendered flight payload
        //    (.rsc) so the App Router can navigate without a full page load.
        //    Dynamic routes have no .rsc file — fall through to HTML below;
        //    Next.js detects the HTML document and does a full-page load.
        if (rscRequest) {
          const rscFile = resolvePageFile(serverAppDir, cleanPath, true);
          if (rscFile) {
            return serveStaticFile(
              rscFile,
              res,
              "text/x-component; charset=utf-8"
            );
          }
        }

        // 2) Pre-rendered HTML documents (also the MPA fallback for RSC
        //    requests without a payload file).
        const htmlFile = resolvePageFile(serverAppDir, cleanPath, false);
        if (htmlFile) {
          return serveStaticFile(htmlFile, res);
        }

        // 3) Dynamic routes: serve the pre-rendered param shell (e.g.
        //    /watch/_ generated by generateStaticParams) for any value, so
        //    /watch/<id> renders the watch page even fully offline.
        const paramShell = resolveParamShell(serverAppDir, cleanPath);
        if (paramShell) {
          return serveStaticFile(paramShell, res);
        }
      }

      // SPA fallback: for all page routes (no file extension), serve the shell
      const hasExtension = /\.[a-z0-9]{2,6}$/i.test(cleanPath);
      if (!hasExtension) {
        // Serve the root index.html as the SPA shell for client-side routing
        const rootIndex = path.join(serverAppDir, "index.html");
        if (fs.existsSync(rootIndex)) {
          return serveStaticFile(rootIndex, res);
        }
        // Fallback to out/index.html for Capacitor builds
        const outIndex = path.join(getProjectRoot(), "out", "index.html");
        if (fs.existsSync(outIndex)) {
          return serveStaticFile(outIndex, res);
        }
        // Last resort: public index.html
        const publicIndex = path.join(publicDir, "index.html");
        if (fs.existsSync(publicIndex)) {
          return serveStaticFile(publicIndex, res);
        }
      }

      // Try the out/ directory for Capacitor builds
      const outPath = path.join(getProjectRoot(), "out", cleanPath);
      if (fs.existsSync(outPath) && fs.statSync(outPath).isFile()) {
        return serveStaticFile(outPath, res);
      }

      res.writeHead(404);
      res.end("Not found");
    } catch (err) {
      console.error("[CTUBE] Server error:", err.message);
      res.writeHead(500);
      res.end("Internal error");
    }
  });
}

// ============================================================
// REMOTE URL CHECK
// ============================================================
function checkRemoteUrl(remoteUrl) {
  return new Promise((resolve) => {
    const client = remoteUrl.startsWith("https") ? https : http;
    const req = client
      .get(remoteUrl, { timeout: 8000 }, (res) => {
        res.resume();
        resolve(res.statusCode < 400);
      })
      .on("error", () => resolve(false))
      .on("timeout", () => {
        req.destroy();
        resolve(false);
      });
  });
}

// ============================================================
// WAIT FOR LOCAL SERVER
// ============================================================
function waitForLocalServer(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Local server did not respond in time."));
      }
    }, timeoutMs);

    let attempts = 0;
    const check = () => {
      if (resolved) return;
      attempts++;
      const req = http
        .get(`http://localhost:${port}`, (res) => {
          res.resume();
          if (!resolved && res.statusCode && res.statusCode < 500) {
            resolved = true;
            clearTimeout(timeout);
            console.log("[CTUBE] Local server ready on port", port);
            resolve();
          } else if (!resolved) {
            setTimeout(check, 300);
          }
        })
        .on("error", () => {
          if (!resolved) {
            if (attempts >= 40) {
              resolved = true;
              clearTimeout(timeout);
              reject(new Error("Local server failed to start."));
            } else {
              setTimeout(check, 300);
            }
          }
        });
    };

    setTimeout(check, 500);
  });
}

// ============================================================
// LOADING HTML
// ============================================================
function loadingHTML(message) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CTUBE</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%23ff4e45'/><polygon points='40,25 40,75 80,50' fill='white'/></svg>">
</head><body style="font-family:system-ui;background:#0f0f0f;color:#f1f1f1;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
    <div>
      <div style="width:60px;height:60px;border:4px solid #333;border-top:4px solid #ff4e45;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 2rem"></div>
      <h1 style="color:#ff4e45;font-size:2rem;margin-bottom:1rem">&#9654; CTUBE</h1>
      <p style="color:#aaa;line-height:1.6">${message || "Carregando aplicativo..."}</p>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  </body></html>`;
}

// ============================================================
// BUILD APPLICATION MENU
// ============================================================
function buildMenu(isAdmin) {
  if (!isAdmin) {
    Menu.setApplicationMenu(null);
    menuBarVisible = false;
    return;
  }

  // Admin menu — only for the developer
  const template = [
    {
      label: "File",
      submenu: [
        { label: "Recarregar", accelerator: "CmdOrCtrl+R", click: () => mainWindow && mainWindow.reload() },
        { label: "DevTools", accelerator: "CmdOrCtrl+Shift+I", click: () => mainWindow && mainWindow.webContents.toggleDevTools() },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { role: "close" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  menuBarVisible = true;
}

// ============================================================
// CREATE WINDOW
// ============================================================
function createWindow(targetUrl) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(targetUrl);
    return mainWindow;
  }

  // Resolve icon path
  let iconPath;
  if (app.isPackaged) {
    iconPath = path.join(process.resourcesPath, "static", "public", "icon.svg");
  } else {
    iconPath = path.join(__dirname, "..", "public", "icon.svg");
  }
  // Fallback to .png if .svg not found
  if (!fs.existsSync(iconPath)) {
    iconPath = iconPath.replace(".svg", ".png");
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    title: "CTUBE — vídeo sem ruído",
    backgroundColor: "#0f0f0f",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,
    autoHideMenuBar: true,
    menuBarVisible: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  // Start with no menu (admin can show it via IPC)
  Menu.setApplicationMenu(null);

  // Inject CSP that allows YouTube embeds, ytimg thumbnails, and cross-origin resources
  // Register once per session, not per page load
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self' https:; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; " +
            "style-src 'self' 'unsafe-inline' https:; " +
            "img-src 'self' data: https: http:; " +
            "media-src 'self' https: blob:; " +
            "frame-src https://www.youtube.com https://www.youtube-nocookie.com; " +
            "connect-src 'self' https: wss:; " +
            "font-src 'self' https:;"
          ],
        },
      });
    }
  );

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  let retryCount = 0;
  const MAX_RETRIES = 3;

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDesc) => {
    console.log("[CTUBE] Load failed:", errorCode, errorDesc);
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      setTimeout(() => mainWindow.loadURL(targetUrl), 2000);
    } else {
      mainWindow.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            loadingHTML(
              `Não foi possível conectar ao CTUBE.<br/>Verifique sua conexão e reinicie.<br/><small style="opacity:.5">${errorDesc}</small>`
            )
          )
      );
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    retryCount = 0;
  });

  // Handle navigation to ensure proper routing
  mainWindow.webContents.on("will-navigate", (event, navUrl) => {
    const parsedNav = url.parse(navUrl);
    // Allow navigation within the same origin
    const currentUrl = url.parse(mainWindow.webContents.getURL());
    if (parsedNav.hostname === currentUrl.hostname || parsedNav.hostname === "localhost") {
      return; // Allow internal navigation
    }
    // External links open in default browser
    event.preventDefault();
    shell.openExternal(navUrl);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(targetUrl);
  return mainWindow;
}

// ============================================================
// IPC HANDLERS
// ============================================================
ipcMain.on("show-menu-bar", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setMenuBarVisibility(true);
    menuBarVisible = true;
  }
});

ipcMain.on("hide-menu-bar", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setMenuBarVisibility(false);
    Menu.setApplicationMenu(null);
    menuBarVisible = false;
  }
});

// ============================================================
// APP LIFECYCLE
// ============================================================
app.whenReady().then(async () => {
  // Show loading screen immediately
  const loadingWin = new BrowserWindow({
    width: 500,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    center: true,
    title: "CTUBE",
    webPreferences: { contextIsolation: true },
  });
  loadingWin.loadURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(loadingHTML())
  );

  try {
    let targetUrl;

    // Strategy 1: Try remote URL first (fast, works everywhere)
    console.log("[CTUBE] Checking remote URL:", REMOTE_URL);
    const remoteAvailable = await checkRemoteUrl(REMOTE_URL);

    if (remoteAvailable) {
      console.log("[CTUBE] Remote URL is available, using it");
      targetUrl = REMOTE_URL;
    } else {
      // Strategy 2: Start embedded local server
      console.log("[CTUBE] Remote unavailable, starting local server...");
      httpServer = createServer();

      await new Promise((resolve, reject) => {
        httpServer.on("error", (err) => {
          console.error("[CTUBE] Server error:", err.message);
          reject(err);
        });
        httpServer.listen(LOCAL_PORT, "127.0.0.1", () => {
          console.log("[CTUBE] Server listening on port", LOCAL_PORT);
          resolve();
        });
      });

      await waitForLocalServer(LOCAL_PORT, 20000);
      targetUrl = LOCAL_URL;
    }

    console.log("[CTUBE] Loading app from", targetUrl);

    if (loadingWin && !loadingWin.isDestroyed()) loadingWin.close();
    createWindow(targetUrl);
  } catch (err) {
    console.error("[CTUBE] Fatal:", err.message);
    if (loadingWin && !loadingWin.isDestroyed()) loadingWin.close();

    // Last resort: try loading remote URL directly
    try {
      console.log("[CTUBE] Attempting direct remote load as last resort");
      if (loadingWin && !loadingWin.isDestroyed()) loadingWin.close();
      createWindow(REMOTE_URL);
    } catch (err2) {
      const win = new BrowserWindow({
        width: 800,
        height: 600,
        title: "CTUBE",
        backgroundColor: "#0f0f0f",
      });
      win.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            loadingHTML(
              `Ocorreu um erro ao iniciar.<br/>Tente reinstalar o aplicativo.<br/><small style="opacity:.5">${err.message}</small>`
            )
          )
      );
    }
  }

  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow(REMOTE_URL);
    } else {
      mainWindow.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (!isQuitting) {
    cleanup();
    if (process.platform !== "darwin") app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  cleanup();
});

function cleanup() {
  if (httpServer) {
    try {
      httpServer.close();
    } catch (e) {
      /* ignore */
    }
    httpServer = null;
  }
}
