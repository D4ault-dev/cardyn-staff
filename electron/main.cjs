const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')

const isDev = !app.isPackaged

// ── Auto-updater setup (production only) ──────────────────────────────────────
function setupAutoUpdater(win) {
  if (isDev) return

  // Point to your server where GitHub Actions uploads the latest.yml + installers
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'https://cardyn.net/downloads/',
  })

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true  // install when app quits naturally

  // Check on startup after 10s
  setTimeout(() => autoUpdater.checkForUpdates(), 10_000)

  // Check every 4 hours
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)

  autoUpdater.on('update-available', () => {
    win.webContents.send('update-available')
  })

  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update-downloaded', info.version)
  })

  autoUpdater.on('error', (err) => {
    console.log('[Updater] Error:', err.message)
    win.webContents.send('update-error', err.message)
  })
}

// ── IPC handlers ───────────────────────────────────────────────────────────────
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall()
})

ipcMain.on('check-update', () => {
  if (!isDev) {
    autoUpdater.checkForUpdates()
  }
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// ── Window ─────────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Open external links in browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  setupAutoUpdater(win)
  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
