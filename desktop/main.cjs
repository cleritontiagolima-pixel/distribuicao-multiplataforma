const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

const CTUBE_URL = (process.env.CTUBE_URL || "").trim();
const LOCAL_PORT = 3210;
const LOCAL_URL = `http://localhost:${LOCAL_PORT}`;

let serverHandle = null;

// MIME types for static files
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain",
  ".webp": "image/webp",
};

function getAppDir() {
  if (app.isPackaged) {
    // extraResources go to process.resourcesPath
    // files go to process.resourcesPath/app (or just resourcesPath with asar:false)
    const candidates = [
      process.resourcesPath,
      path.join(process.resourcesPath, "app"),
    ];
    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, ".next"))) return dir;
    }
    return process.resourcesPath;
  }
  return path.join(__dirname, "..");
}

function findNextStatic(appDir) {
  // Find the .next directory
  const candidates = [
    path.join(appDir, ".next"),
    path.join(process.resourcesPath, ".next"),
    path.join(process.resourcesPath, "app", ".next"),
  ];
  
  console.log("[CTUBE] Searching for .next in:");
  for (const dir of candidates) {
    console.log("[CTUBE]  ", dir, "->", fs.existsSync(dir));
    if (fs.existsSync(dir)) return dir;
  }
  
  // Debug: list what's available
  for (const dir of [process.resourcesPath, app.isPackaged ? process.resourcesPath : path.join(__dirname, "..")]) {
    try {
      console.log("[CTUBE] Contents of", dir, ":", fs.readdirSync(dir).join(", "));
    } catch (e) { /* ignore */ }
  }
  
  return null;
}

function findPublicDir(appDir) {
  const pub = path.join(appDir, "public");
  if (fs.existsSync(pub)) return pub;
  return null;
}

// Simple static file server for the Next.js build
function startStaticServer() {
  if (CTUBE_URL) return Promise.resolve();

  const appDir = getAppDir();
  const nextDir = findNextStatic(appDir);
  const publicDir = findPublicDir(appDir);

  console.log("[CTUBE] App dir:", appDir);
  console.log("[CTUBE] .next dir:", nextDir);
  console.log("[CTUBE] public dir:", publicDir);

  if (!nextDir) {
    console.error("[CTUBE] .next directory not found in", appDir);
    // List what's available
    try {
      const items = fs.readdirSync(appDir);
      console.log("[CTUBE] Available:", items.join(", "));
    } catch (e) {
      console.error("[CTUBE] Cannot read dir:", e.message);
    }
    return Promise.reject(new Error(".next directory not found"));
  }

  // Pre-load the HTML pages from .next/server/app
  const serverAppDir = path.join(nextDir, "server", "app");

  serverHandle = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${LOCAL_PORT}`);
    let pathname = url.pathname;

    // Try to serve from .next/static first (CSS, JS chunks)
    const staticFile = path.join(nextDir, "static", pathname);
    if (fs.existsSync(staticFile) && fs.statSync(staticFile).isFile()) {
      const ext = path.extname(staticFile);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      fs.createReadStream(staticFile).pipe(res);
      return;
    }

    // Try to serve from public/ directory
    if (publicDir) {
      const publicFile = path.join(publicDir, pathname);
      if (fs.existsSync(publicFile) && fs.statSync(publicFile).isFile()) {
        const ext = path.extname(publicFile);
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        fs.createReadStream(publicFile).pipe(res);
        return;
      }
    }

    // Try to serve the HTML page from .next/server/app
    // For routes like /search, try /search/index.html
    let htmlPath = path.join(serverAppDir, pathname, "index.html");
    if (!fs.existsSync(htmlPath)) {
      // Try with .html extension
      htmlPath = path.join(serverAppDir, pathname + ".html");
    }
    if (!fs.existsSync(htmlPath) && pathname !== "/") {
      // Try the root index.html for SPA routing
      htmlPath = path.join(serverAppDir, "index.html");
    }
    if (!fs.existsSync(htmlPath)) {
      htmlPath = path.join(serverAppDir, "index.html");
    }

    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(htmlPath).pipe(res);
      return;
    }

    // 404 fallback
    const notFoundPath = path.join(serverAppDir, "_not-found", "index.html");
    if (fs.existsSync(notFoundPath)) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(notFoundPath).pipe(res);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  return new Promise((resolve, reject) => {
    serverHandle.listen(LOCAL_PORT, "127.0.0.1", () => {
      console.log("[CTUBE] Static server ready on", LOCAL_URL);
      resolve();
    });
    serverHandle.on("error", (err) => {
      console.error("[CTUBE] Server error:", err);
      reject(err);
    });
  });
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    title: "CTUBE",
    icon: path.join(__dirname, "..", "public", "icon.svg"),
    backgroundColor: "#0f0f0f",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  win.loadURL(url);

  win.webContents.on("did-fail-load", (_event, _code, description) => {
    win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<body style="font-family:system-ui;background:#0f0f0f;color:#f1f1f1;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h1 style="color:#ff4e45">CTUBE</h1><p>Não foi possível conectar ao CTUBE.<br/>Verifique sua conexão com a internet e tente novamente.</p><p style="opacity:.6;font-size:12px">${description}</p></div></body>`,
        ),
    );
  });

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  try {
    await startStaticServer();
    const url = CTUBE_URL || LOCAL_URL;
    console.log("[CTUBE] Loading:", url);
    createWindow(url);
  } catch (err) {
    console.error("[CTUBE] Fatal:", err);
    const win = new BrowserWindow({
      width: 800,
      height: 600,
      title: "CTUBE",
      backgroundColor: "#0f0f0f",
    });
    win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<body style="font-family:system-ui;background:#0f0f0f;color:#f1f1f1;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h1 style="color:#ff4e45">CTUBE</h1><p>Ocorreu um erro ao iniciar.<br/>Tente reinstalar o aplicativo.</p><p style="opacity:.6;font-size:12px">${err.message}</p></div></body>`,
        ),
    );
  }

  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) {
      createWindow(CTUBE_URL || LOCAL_URL);
    }
  });
});

app.on("window-all-closed", () => {
  if (serverHandle) serverHandle.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverHandle) serverHandle.close();
});
