const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

const CTUBE_URL = (process.env.CTUBE_URL || "").trim();
const LOCAL_PORT = 3210;
const LOCAL_URL = `http://localhost:${LOCAL_PORT}`;

let serverProcess = null;

function getStandaloneDir() {
  if (app.isPackaged) {
    const candidates = [
      path.join(process.resourcesPath, "standalone"),
      path.join(process.resourcesPath, "app", "standalone"),
      path.join(process.resourcesPath, "app.asar.unpacked", "standalone"),
    ];
    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, "server.js"))) return dir;
    }
    // Try resources root
    if (fs.existsSync(path.join(process.resourcesPath, "server.js"))) {
      return process.resourcesPath;
    }
  }
  // Development: .next/standalone/ is at project root
  return path.join(__dirname, "..", ".next", "standalone");
}

function getStaticDir() {
  if (app.isPackaged) {
    const candidates = [
      path.join(process.resourcesPath, "static"),
      path.join(process.resourcesPath, "app", "static"),
      path.join(process.resourcesPath, "app.asar.unpacked", "static"),
    ];
    for (const dir of candidates) {
      if (fs.existsSync(dir)) return dir;
    }
  }
  return path.join(__dirname, "..", ".next", "static");
}

function getPublicDir() {
  if (app.isPackaged) {
    const candidates = [
      path.join(process.resourcesPath, "public"),
      path.join(process.resourcesPath, "app", "public"),
    ];
    for (const dir of candidates) {
      if (fs.existsSync(dir)) return dir;
    }
  }
  return path.join(__dirname, "..", "public");
}

function startNextServer() {
  if (CTUBE_URL) return Promise.resolve();

  const standaloneDir = getStandaloneDir();
  const serverFile = path.join(standaloneDir, "server.js");

  console.log("[CTUBE] Standalone dir:", standaloneDir);
  console.log("[CTUBE] server.js exists:", fs.existsSync(serverFile));

  if (!fs.existsSync(serverFile)) {
    // List what's available for debugging
    try {
      const items = fs.readdirSync(app.isPackaged ? process.resourcesPath : path.join(__dirname, ".."));
      console.log("[CTUBE] Available at root:", items.join(", "));
    } catch (e) { /* ignore */ }
    return Promise.reject(new Error("Next.js standalone server not found. App may not be built correctly."));
  }

  // Copy .next/static and public into the standalone directory if not already there
  const staticDir = getStaticDir();
  const publicDir = getPublicDir();
  const standaloneStatic = path.join(standaloneDir, ".next", "static");
  const standalonePublic = path.join(standaloneDir, "public");

  // Ensure .next/static exists in standalone
  if (!fs.existsSync(standaloneStatic) && fs.existsSync(staticDir)) {
    try {
      fs.mkdirSync(path.join(standaloneDir, ".next"), { recursive: true });
      copyDirSync(staticDir, standaloneStatic);
      console.log("[CTUBE] Copied .next/static to standalone");
    } catch (e) {
      console.warn("[CTUBE] Could not copy .next/static:", e.message);
    }
  }

  // Ensure public exists in standalone
  if (!fs.existsSync(standalonePublic) && fs.existsSync(publicDir)) {
    try {
      copyDirSync(publicDir, standalonePublic);
      console.log("[CTUBE] Copied public/ to standalone");
    } catch (e) {
      console.warn("[CTUBE] Could not copy public:", e.message);
    }
  }

  // Start the Next.js standalone server
  const { spawn } = require("child_process");
  serverProcess = spawn(process.execPath || "node", [serverFile], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      PORT: String(LOCAL_PORT),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout?.on("data", (data) => {
    console.log("[CTUBE:next]", data.toString().trim());
  });
  serverProcess.stderr?.on("data", (data) => {
    console.log("[CTUBE:next]", data.toString().trim());
  });

  // Wait for server to be ready
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Next.js server failed to start within 15 seconds"));
      }
    }, 15000);

    // Poll for readiness
    const check = () => {
      if (resolved) return;
      http.get(LOCAL_URL, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolved = true;
          clearTimeout(timeout);
          console.log("[CTUBE] Next.js server ready on", LOCAL_URL);
          resolve();
        } else {
          setTimeout(check, 500);
        }
      }).on("error", () => {
        setTimeout(check, 500);
      });
    };

    // Start checking after a short delay
    setTimeout(check, 1000);
  });
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
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
    await startNextServer();
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
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});
