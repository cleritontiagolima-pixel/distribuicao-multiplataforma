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
    const candidate = path.join(process.resourcesPath, "standalone");
    if (fs.existsSync(path.join(candidate, "server.js"))) return candidate;
  }
  // Development
  return path.join(__dirname, "..", ".next", "standalone");
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
// NEXT.JS STANDALONE SERVER
// ============================================================
function startNextServer() {
  // If CTUBE_URL is set, skip local server
  if (CTUBE_URL) return Promise.resolve();

  const standaloneDir = getStandaloneDir();
  const serverFile = path.join(standaloneDir, "server.js");

  console.log("[CTUBE] Standalone dir:", standaloneDir);
  console.log("[CTUBE] server.js exists:", fs.existsSync(serverFile));

  if (!fs.existsSync(serverFile)) {
    // Log what's available for debugging
    try {
      const basePath = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
      const items = fs.readdirSync(basePath);
      console.log("[CTUBE] Available in basePath:", items.join(", "));
      if (fs.existsSync(path.join(basePath, "standalone"))) {
        const saItems = fs.readdirSync(path.join(basePath, "standalone"));
        console.log("[CTUBE] Available in standalone:", saItems.join(", "));
      }
    } catch (e) { /* ignore */ }
    return Promise.reject(
      new Error("Next.js standalone server not found. Reinstall the app.")
    );
  }

  // Ensure .next/static is present
  const nextStatic = path.join(standaloneDir, ".next", "static");
  if (!fs.existsSync(nextStatic)) {
    console.log("[CTUBE] .next/static missing, trying to copy...");
    const altStatic = app.isPackaged
      ? path.join(process.resourcesPath, "static")
      : path.join(__dirname, "..", ".next", "static");
    if (fs.existsSync(altStatic)) {
      fs.mkdirSync(path.join(standaloneDir, ".next"), { recursive: true });
      copyDirSync(altStatic, nextStatic);
      console.log("[CTUBE] Copied .next/static from", altStatic);
    } else {
      console.warn("[CTUBE] WARNING: .next/static not found at", altStatic);
    }
  }

  // Ensure public/ is present
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

  // Kill any existing process on the port
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
    console.error("[CTUBE:next:err]", data.toString().trim());
  });

  serverProcess.on("error", (err) => {
    console.error("[CTUBE] Server process error:", err.message);
  });

  serverProcess.on("exit", (code) => {
    console.log("[CTUBE] Server exited with code:", code);
    serverProcess = null;
    if (!isQuitting && mainWindow) {
      mainWindow.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            loadingHTML(
              "O servidor parou inesperadamente.<br/>Reinicie o aplicativo."
            )
          )
      );
    }
  });

  return waitForServer(LOCAL_URL, 20000);
}

function waitForServer(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(
          new Error(
            "O servidor não respondeu a tempo. Feche e reinicie o aplicativo."
          )
        );
      }
    }, timeoutMs);

    let attempts = 0;
    const maxAttempts = Math.floor(timeoutMs / 500);

    const check = () => {
      if (resolved) return;
      attempts++;

      const req = http
        .get(url, (res) => {
          res.resume();
          if (!resolved && res.statusCode && res.statusCode < 500) {
            resolved = true;
            clearTimeout(timeout);
            console.log("[CTUBE] Server ready on", url);
            resolve();
          } else if (!resolved) {
            setTimeout(check, 500);
          }
        })
        .on("error", () => {
          if (!resolved) {
            if (attempts >= maxAttempts) {
              resolved = true;
              clearTimeout(timeout);
              reject(
                new Error("Servidor não conseguiu iniciar. Reinicie o app.")
              );
            } else {
              setTimeout(check, 500);
            }
          }
        });
    };

    // Start checking after a short delay
    setTimeout(check, 1500);
  });
}

function killServerOnPort(port) {
  try {
    if (process.platform === "win32") {
      spawn("netstat", ["-ano"], {
        stdio: ["ignore", "pipe", "ignore"],
      }).stdout?.on("data", (data) => {
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
      spawn("fuser", ["-k", `${port}/tcp`], { stdio: "ignore" });
    }
  } catch (e) {
    /* ignore */
  }
}

// ============================================================
// LOADING HTML
// ============================================================
function loadingHTML(message) {
  return `<body style="font-family:system-ui;background:#0f0f0f;color:#f1f1f1;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
    <div>
      <div style="width:60px;height:60px;border:4px solid #333;border-top:4px solid #ff4e45;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 2rem"></div>
      <h1 style="color:#ff4e45;font-size:2rem;margin-bottom:1rem">&#9654; CTUBE</h1>
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
    backgroundColor: "#0f0f0f",
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  // Show window only when content is ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Retry on failure
  let retryCount = 0;
  const MAX_RETRIES = 3;

  const loadWithRetry = (targetUrl) => {
    mainWindow.loadURL(targetUrl);
  };

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDesc) => {
      console.log("[CTUBE] Load failed:", errorCode, errorDesc);
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`[CTUBE] Retrying (${retryCount}/${MAX_RETRIES})...`);
        setTimeout(() => loadWithRetry(url), 2000);
      } else {
        mainWindow.loadURL(
          "data:text/html;charset=utf-8," +
            encodeURIComponent(
              loadingHTML(
                `Não foi possível conectar ao CTUBE.<br/>Verifique sua conexão e reinicie o aplicativo.<br/><small style="opacity:.5">${errorDesc}</small>`
              )
            )
        );
      }
    }
  );

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
  loadingWin.loadURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(loadingHTML())
  );

  try {
    await startNextServer();
    const url = CTUBE_URL || LOCAL_URL;
    console.log("[CTUBE] Loading:", url);

    if (loadingWin && !loadingWin.isDestroyed()) loadingWin.close();
    createWindow(url);
  } catch (err) {
    console.error("[CTUBE] Fatal:", err.message);
    if (loadingWin && !loadingWin.isDestroyed()) loadingWin.close();

    // If CTUBE_URL is available, try loading from web as fallback
    if (CTUBE_URL) {
      console.log("[CTUBE] Falling back to CTUBE_URL:", CTUBE_URL);
      createWindow(CTUBE_URL);
    } else {
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
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          try {
            serverProcess.kill("SIGKILL");
          } catch (e) {
            /* ignore */
          }
        }
      }, 3000);
    } catch (e) {
      /* ignore */
    }
    serverProcess = null;
  }
  killServerOnPort(LOCAL_PORT);
}
