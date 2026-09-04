const { app, BrowserWindow, shell, ipcMain, Menu } = require("electron");
const path = require("path");
const http = require("http");
const https = require("https");
const fs = require("fs");
const url = require("url");

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
        const flatFile = path.join(
          serverAppDir,
          cleanPath.replace(/^\//, "") + ".html"
        );
        if (fs.existsSync(flatFile)) {
          return serveStaticFile(flatFile, res);
        }
        const dirFile = path.join(serverAppDir, cleanPath, "index.html");
        if (fs.existsSync(dirFile)) {
          return serveStaticFile(dirFile, res);
        }
        if (cleanPath === "/") {
          const rootHtml = path.join(serverAppDir, "index.html");
          if (fs.existsSync(rootHtml)) {
            return serveStaticFile(rootHtml, res);
          }
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
