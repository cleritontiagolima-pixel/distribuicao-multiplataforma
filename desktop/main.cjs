const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const CTUBE_URL = (process.env.CTUBE_URL || "").trim() || "http://localhost:3000";

function createWindow() {
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
      // Keep media playing when window is minimized
      backgroundThrottling: false,
    },
  });

  win.loadURL(CTUBE_URL);

  // Show friendly error page if the URL is unavailable
  win.webContents.on("did-fail-load", (_event, _code, description) => {
    win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<body style="font-family:system-ui;background:#0f0f0f;color:#f1f1f1;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h1 style="color:#ff4e45">CTUBE</h1><p>Não foi possível conectar ao CTUBE.<br/>Verifique sua conexão com a internet e tente novamente.</p><p style="opacity:.6;font-size:12px">${description}</p></div></body>`,
        ),
    );
  });

  // Open external links in the default browser
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
