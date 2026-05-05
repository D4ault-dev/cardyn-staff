const { contextBridge } = require('electron')

// Expose minimal API surface — all HTTP calls go through axios in renderer
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
})
