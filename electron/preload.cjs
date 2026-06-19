const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,

  // Auto-updater
  onUpdateAvailable:    (cb) => ipcRenderer.on('update-available',     () => cb()),
  onUpdateNotAvailable: (cb) => ipcRenderer.on('update-not-available', () => cb()),
  onUpdateDownloaded:   (cb) => ipcRenderer.on('update-downloaded',    (_, version) => cb(version)),
  onUpdateError:        (cb) => ipcRenderer.on('update-error',         (_, msg) => cb(msg)),
  onDownloadProgress:   (cb) => ipcRenderer.on('download-progress',    (_, pct) => cb(pct)),
  checkForUpdate:       ()   => ipcRenderer.send('check-update'),
  installUpdate:        ()   => ipcRenderer.send('install-update'),
  getAppVersion:        ()   => ipcRenderer.invoke('get-app-version'),
})
