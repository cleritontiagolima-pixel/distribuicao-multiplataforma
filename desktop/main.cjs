const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 900, minWidth: 980, minHeight: 620, backgroundColor: '#dbeafe', webPreferences: { contextIsolation: true, sandbox: true } })
  const url = process.env.CTUBE_URL || 'http://localhost:3000'
  win.loadURL(url)
  win.webContents.setWindowOpenHandler(({ url: target }) => { shell.openExternal(target); return { action: 'deny' } })
}
app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() }) })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
