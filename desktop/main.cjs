const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");

const CTUBE_URL = (process.env.CTUBE_URL || "").trim();
const LOCAL_PORT = 3210;
const LOCAL_URL = `http://localhost:${LOCAL_PORT}`;

let nextServer = null;
let serverHandle = null;

// Start Next.js server programmatically
async function startLocalServer() {
  if (CTUBE_URL) return;

  console.log("[CTUBE] Starting Next.js server on port", LOCAL_PORT);

  // Determine the app root — inside asar or on disk
  const appRoot = app.isPackaged
    ? path.join(process.resourcesPath)
    : path.join(__dirname, "..");

  try {
    // Use Next.js programmatic API
    const next = require(path.join(appRoot, "node_modules", "next"));
    nextServer = next({
      dev: false,
      dir: appRoot,
      conf: {
        images: { unoptimized: true },
      },
    });

    const handle = nextServer.getRequestHandler();
    await nextServer.prepare();

    serverHandle = http.createServer((req, res) => {
      // Pass all requests to Next.js handler
      handle(req, res);
    });

    await new Promise((resolve, reject) => {
      serverHandle.listen(LOCAL_PORT, "127.0.0.1", () => {
        console.log("[CTUBE] Server ready on", LOCAL_URL);
        resolve();
      });
      serverHandle.on("error", reject);
    });
  } catch (err) {
    console.error("[CTUBE] Failed to start Next.js:", err.message);
    // Fallback: try to serve static files from .next
    await startStaticFallback(appRoot);
  }
}

// Minimal static file server as fallback
async function startStaticFallback(appRoot) {
  const fs = require("fs");
  const nextDir = path.join(appRoot, ".next");

  if (!fs.existsSync(nextDir)) {
    throw new Error("No .next directory found");
  }

  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };

  serverHandle = http.createServer((req, res) => {
    let filePath = path.join(nextDir, "static", req.url);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(nextDir, req.url);
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(appRoot, "out", "index.html");
    }
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise((resolve) => {
    serverHandle.listen(LOCAL_PORT, "127.0.0.1", () => {
      console.log("[CTUBE] Static fallback ready on", LOCAL_URL);
      resolve();
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
    await startLocalServer();
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
  if (nextServer) nextServer.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverHandle) serverHandle.close();
  if (nextServer) nextServer.close();
});
