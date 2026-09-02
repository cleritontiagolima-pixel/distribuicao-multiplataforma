const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const url = require("url");

// ============================================================
// CONFIGURATION
// ============================================================
const LOCAL_PORT = 3210;
const LOCAL_URL = `http://localhost:${LOCAL_PORT}`;

let mainWindow = null;
let httpServer = null;
let isQuitting = false;

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
    // Packaged: everything is in resources/static
    return path.join(process.resourcesPath, "static");
  }
  // Development: project root is one level up from desktop/
  return path.join(__dirname, "..");
}

function getStaticDir() {
  return getProjectRoot();
}

function getPublicDir() {
  return path.join(getProjectRoot(), "public");
}

function getNextStaticDir() {
  // .next/static/ is at the project root (not inside standalone)
  return path.join(getProjectRoot(), ".next", "static");
}

function getServerAppDir() {
  // .next/server/app/ contains pre-rendered HTML pages
  return path.join(getProjectRoot(), ".next", "server", "app");
}

// MIME types
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
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

function parseUrlParams(queryString) {
  const params = {};
  if (!queryString) return params;
  const pairs = queryString.split("&");
  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || "");
  }
  return params;
}

async function handleApiRequest(req, res, pathname) {
  const api = getYoutubeApi();
  if (!api) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "YouTube API not available" }));
    return;
  }

  try {
    // CORS headers
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
      // /api/videos or /api/videos/[id]
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
function serveStaticFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const mimeType = getMimeType(filePath);
    res.writeHead(200, { "Content-Type": mimeType });
    res.end(data);
  });
}

// ============================================================
// HTTP SERVER
// ============================================================
function createServer() {
  return http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Handle API routes
    if (pathname.startsWith("/api/")) {
      return handleApiRequest(req, res, pathname);
    }

    const staticDir = getStaticDir();
    const publicDir = getPublicDir();

    // Check public directory first
    let filePath = path.join(publicDir, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return serveStaticFile(filePath, res);
    }

    // Check _next/static (CSS, JS bundles) -> maps to .next/static on disk
    if (pathname.startsWith("/_next/static/")) {
      const nextStaticDir = getNextStaticDir();
      const relativePath = pathname.replace("/_next/static/", "");
      filePath = path.join(nextStaticDir, relativePath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return serveStaticFile(filePath, res);
      }
      // Fallback: try in staticDir
      const diskPath = pathname.replace("/_next/", "/.next/");
      filePath = path.join(staticDir, diskPath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return serveStaticFile(filePath, res);
      }
    }

    // Try direct file match (for standalone, files are at root level)
    filePath = path.join(staticDir, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return serveStaticFile(filePath, res);
    }

    // Try pre-rendered pages from .next/server/app/ FIRST
    const serverAppDir = getServerAppDir();
    if (fs.existsSync(serverAppDir)) {
      // / -> .next/server/app/index.html
      // /search -> .next/server/app/search.html (flat file)
      // /trending -> .next/server/app/trending.html
      const cleanPath = pathname.split("?")[0];
      
      // Try flat file: /trending -> trending.html
      const flatFile = path.join(serverAppDir, cleanPath.replace(/^\//, "") + ".html");
      if (fs.existsSync(flatFile)) {
        return serveStaticFile(flatFile, res);
      }
      
      // Try directory: / -> index.html
      const dirFile = path.join(serverAppDir, cleanPath, "index.html");
      if (fs.existsSync(dirFile)) {
        return serveStaticFile(dirFile, res);
      }
      
      // Root
      if (cleanPath === "/") {
        const rootHtml = path.join(serverAppDir, "index.html");
        if (fs.existsSync(rootHtml)) {
          return serveStaticFile(rootHtml, res);
        }
      }
    }

    // SPA fallback: serve the main index.html
    const rootIndex = path.join(serverAppDir, "index.html") || path.join(staticDir, "index.html");
    if (fs.existsSync(rootIndex)) {
      return serveStaticFile(rootIndex, res);
    }

    res.writeHead(404);
    res.end("Not found");
  });
}

// ============================================================
// WAIT FOR SERVER
// ============================================================
function waitForServer(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("O servidor não respondeu a tempo."));
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
            console.log("[CTUBE] Server ready on port", port, "(attempt", attempts, ")");
            resolve();
          } else if (!resolved) {
            setTimeout(check, 300);
          }
        })
        .on("error", () => {
          if (!resolved) {
            if (attempts >= 60) {
              resolved = true;
              clearTimeout(timeout);
              reject(new Error("Servidor não conseguiu iniciar. Reinicie o app."));
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
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CTUBE</title></head><body style="font-family:system-ui;background:#0f0f0f;color:#f1f1f1;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
    <div>
      <div style="width:60px;height:60px;border:4px solid #333;border-top:4px solid #ff4e45;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 2rem"></div>
      <h1 style="color:#ff4e45;font-size:2rem;margin-bottom:1rem">&#9654; CTUBE</h1>
      <p style="color:#aaa;line-height:1.6">${message || "Carregando aplicativo..."}</p>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  </body></html>`;
}

// ============================================================
// WINDOW
// ============================================================
function createWindow(targetUrl) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(targetUrl);
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    title: "CTUBE",
    backgroundColor: "#0f0f0f",
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

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
          encodeURIComponent(loadingHTML(`Não foi possível conectar ao CTUBE.<br/>Verifique sua conexão e reinicie.<br/><small style="opacity:.5">${errorDesc}</small>`))
      );
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    retryCount = 0;
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
// APP LIFECYCLE
// ============================================================
app.whenReady().then(async () => {
  // Show loading screen
  const loadingWin = new BrowserWindow({
    width: 500,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    center: true,
    webPreferences: { contextIsolation: true },
  });
  loadingWin.loadURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(loadingHTML())
  );

  try {
    // Start the embedded HTTP server
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

    // Wait for the server to be fully ready
    await waitForServer(LOCAL_PORT, 15000);

    console.log("[CTUBE] Loading app from", LOCAL_URL);

    if (loadingWin && !loadingWin.isDestroyed()) loadingWin.close();
    createWindow(LOCAL_URL);
  } catch (err) {
    console.error("[CTUBE] Fatal:", err.message);
    if (loadingWin && !loadingWin.isDestroyed()) loadingWin.close();

    // Show error window
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

  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow(LOCAL_URL);
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
