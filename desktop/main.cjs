const { app, BrowserWindow, shell } = require('electron')

// URL publicada do CTUBE, injetada em tempo de build (CTUBE_URL).
// O app desktop só funciona online, então sempre carrega a versão publicada.
const CTUBE_URL = (process.env.CTUBE_URL || '').trim() || 'http://localhost:3000'

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#dbeafe',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      // Mantém a reprodução (áudio/vídeo) ativa mesmo com a janela minimizada.
      backgroundThrottling: false,
    },
  })

  win.loadURL(CTUBE_URL)

  // Mostra uma mensagem amigável caso a URL publicada esteja indisponível.
  win.webContents.on('did-fail-load', (_event, _code, description) => {
    win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          `<body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><div><h1 style="color:#3b82f6">CTUBE</h1><p>Não foi possível conectar ao CTUBE.<br/>Verifique sua conexão com a internet e tente novamente.</p><p style="opacity:.6;font-size:12px">${description}</p></div></body>`,
        ),
    )
  })

  // Abre links externos no navegador padrão em vez de novas janelas do app.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
