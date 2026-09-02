const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  showMenuBar: () => ipcRenderer.send("show-menu-bar"),
  hideMenuBar: () => ipcRenderer.send("hide-menu-bar"),
  isElectron: true,
});
