const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { spawn } = require("child_process");

const CTUBE_URL = (process.env.CTUBE_URL || "").trim();
const LOCAL_PORT = 3210;
const LOCAL_URL = `http://localhost:${LOCAL_PORT}`;

let serverProcess = null;
let mainWindow = null;
let isQuitting = false;

// ============================================================
// SINGLE INSTANCE LOCK — prevent multiple app instances
// ============================================================
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // If user opens a second instance, focus the existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ============================================================
// PATH HELPERS
// ============================================================
function getStandaloneDir() {
  if (app.isPackaged) {
    // extraResources with asar:false → files at resourcesPath
    const candidates = [
      path.join(process.resourcesPath, "standalone"),
    ];
    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, "server.js"))) return dir;
    }
  }
  // Development
  return path.join(__dirname, "..", ".next", "standalone");
}

// ============================================================
// NEXT.JS STANDALONE SERVER
// ============================================================
function startNextServer() {
  if (CTUBE_URL) return Promise.resolve();

  const standaloneDir = getStandaloneDir();
  const serverFile = path.join(standaloneDir, "server.js");

  console.log("[CTUBE] Standalone dir:", standaloneDir);
  console.log("[CTUBE] server.js exists:", fs.existsSync(serverFile));

  if (!fs.existsSync(serverFile)) {
    try {
      const items = fs.readdirSync(app.isPackaged ? process.resourcesPath : path.join(__dirname, ".."));
      console.log("[CTUBE] Available:", items.join(", "));
    } catch (e) { /* ignore */ }
    return Promise.reject(new Error("Next.js standalone server not found."));
  }

  // Verify .next/static is in the right place
  const nextStatic = path.join(standaloneDir, ".next", "static");
  if (!fs.existsSync(nextStatic)) {
    console.log("[CTUBE] .next/static not found in standalone, checking alternatives...");
    // Try to find it
    const altLocations = [
      app.isPackaged ? path.join(process.resourcesPath, "static") : null,
      app.isPackaged ? path.join(process.resourcesPath, "app", "static") : null,
      !app.isPackaged ? path.join(__dirname, "..", ".next", "static") : null,
    ].filter(Boolean);

    for (const alt of altLocations) {
      if (fs.existsSync(alt)) {
        fs.mkdirSync(path.join(standaloneDir, ".next"), { recursive: true });
        copyDirSync(alt, nextStatic);
        console.log("[CTUBE] Copied .next/static from", alt);
        break;
      }
    }
  }

  // Verify public is in the right place
  const publicDir = path.join(standaloneDir, "public");
  if (!fs.existsSync(publicDir)) {
    const altPublic = app.isPackaged
      ? path.join(process.resourcesPath, "public")
      : path.join(__dirname, "..", "public");
    if (fs.existsSync(altPublic)) {
      copyDirSync(altPublic, publicDir);
      console.log("[CTUBE] Copied public/ from", altPublic);
    }
  }

  // Kill any existing server on the port
  killServerOnPort(LOCAL_PORT);

  // Start the Next.js standalone server
  serverProcess = spawn(process.execPath, [serverFile], {
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

  serverProcess.on("error", (err) => {
    console.error("[CTUBE] Server process error:", err);
  });

  serverProcess.on("exit", (code) => {
    console.log("[CTUBE] Server process exited with code:", code);
    serverProcess = null;
    // If server crashes and app is still open, show error
    if (!isQuitting && mainWindow) {
      mainWindow.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(loadingHTML("O servidor parou inesperadamente.<br/>Reinicie o aplicativo."))
      );
    }
  });

  // Wait for server to be ready
  return waitForServer(LOCAL_URL, 30000);
}

function waitForServer(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Servidor não respondeu em 30 segundos."));
      }
    }, timeoutMs);

    const check = () => {
      if (resolved) return;
      http.get(url, (res) => {
        if (!resolved && res.statusCode && res.statusCode < 500) {
          resolved = true;
          clearTimeout(timeout);
          res.resume();
          console.log("[CTUBE] Server ready on", url);
          resolve();
        } else {
          res.resume();
          setTimeout(check, 500);
        }
      }).on("error", () => {
        if (!resolved) setTimeout(check, 500);
      });
    };

    setTimeout(check, 2000);
  });
}

function killServerOnPort(port) {
  try {
    if (process.platform === "win32") {
      // Windows: find and kill process using the port
      spawn("netstat", ["-ano"], { stdio: ["ignore", "pipe", "ignore"] })
        .stdout?.on("data", (data) => {
          const lines = data.toString().split("\n");
          for (const line of lines) {
            if (line.includes(`:${port}`) && line.includes("LISTENING")) {
              const pid = line.trim().split(/\s+/).pop();
              if (pid && pid !== String(process.pid)) {
                spawn("taskkill", ["/F", "/PID", pid], { stdio: "ignore" });
                console.log("[CTUBE] Killed old server PID:", pid);
              }
            }
          }
        });
    } else {
      // Unix: kill by port
      spawn("fuser", ["-k", `${port}/tcp`], { stdio: "ignore" });
    }
  } catch (e) {
    // Ignore
  }
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

// ============================================================
// LOADING HTML
// ============================================================
function loadingHTML(message) {
  return `<body style="font-family:system-ui;background:#0f0f0f;color:#f1f1f1;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
    <div>
      <div style="width:60px;height:60px;border:4px solid #333;border-top:4px solid #ff4e45;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 2rem"></div>
      <h1 style="color:#ff4e45;font-size:2rem;margin-bottom:1rem">▶ CTUBE</h1>
      <p style="color:#aaa;line-height:1.6">${message || "Carregando aplicativo..."}</p>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  </body>`;
}

// ============================================================
// WINDOW
// ============================================================
function createWindow(url) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(url);
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    title: "CTUBE",
    icon: path.join(__dirname, "..", "public", "icon.svg"),
    backgroundColor: "#0f0f0f",
    show: false, // Don't show until ready
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  // Show window when content is ready (avoids white flash)
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Retry loading on failure (max 3 retries)
  let retryCount = 0;
  const MAX_RETRIES = 3;

  const loadWithRetry = (targetUrl) => {
    mainWindow.loadURL(targetUrl);
  };

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDesc) => {
    console.log("[CTUBE] Load failed:", errorCode, errorDesc);
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`[CTUBE] Retrying (${retryCount}/${MAX_RETRIES})...`);
      setTimeout(() => loadWithRetry(url), 2000);
    } else {
      mainWindow.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(loadingHTML(
            `Não foi possível conectar ao CTUBE.<br/>Verifique sua conexão e reinicie o aplicativo.<br/><small style="opacity:.5">${errorDesc}</small>`
          ))
      );
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    retryCount = 0; // Reset on successful load
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  loadWithRetry(url);
  return mainWindow;
}

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
    webPreferences: { contextIsolation: true },
  });
  loadingWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(loadingHTML()));

  try {
    await startNextServer();
    const url = CTUBE_URL || LOCAL_URL;
    console.log("[CTUBE] Loading:", url);

    // Close loading window and show main window
    if (loadingWin && !loadingWin.isDestroyed()) loadingWin.close();
    createWindow(url);
  } catch (err) {
    console.error("[CTUBE] Fatal:", err);
    if (loadingWin && !loadingWin.isDestroyed()) loadingWin.close();

    const win = new BrowserWindow({
      width: 800,
      height: 600,
      title: "CTUBE",
      backgroundColor: "#0f0f0f",
    });
    win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(loadingHTML(
          `Ocorreu um erro ao iniciar.<br/>Tente reinstalar o aplicativo.<br/><small style="opacity:.5">${err.message}</small>`
        ))
    );
  }

  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow(CTUBE_URL || LOCAL_URL);
    } else {
      mainWindow.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (!isQuitting) {
    killServer();
    if (process.platform !== "darwin") app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  killServer();
});

function killServer() {
  if (serverProcess) {
    try {
      serverProcess.kill("SIGTERM");
      // Force kill after 3 seconds if still alive
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          try { serverProcess.kill("SIGKILL"); } catch (e) { /* ignore */ }
        }
      }, 3000);
    } catch (e) { /* ignore */ }
    serverProcess = null;
  }
  killServerOnPort(LOCAL_PORT);
}
