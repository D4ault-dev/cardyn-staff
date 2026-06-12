const { app, BrowserWindow, ipcMain, shell, autoUpdater, dialog } = require('electron')
const path = require('path')

const isDev = !app.isPackaged

// ── Auto-updater setup (production only) ──────────────────────────────────────
const GITHUB_OWNER = 'D4ault-dev'
const GITHUB_REPO  = 'cardyn-staff'

function setupAutoUpdater(win) {
  if (isDev) return

  const platform = process.platform === 'darwin' ? 'darwin' : 'win32'
  const arch     = process.arch === 'arm64'       ? 'arm64'  : 'x64'
  const version  = app.getVersion()

  // Squirrel-based update server URL (GitHub Releases feed)
  // electron-builder publishes a RELEASES file that autoUpdater reads
  const feedUrl = `https://update.electronjs.org/${GITHUB_OWNER}/${GITHUB_REPO}/${platform}-${arch}/${version}`

  try {
    autoUpdater.setFeedURL({ url: feedUrl })
  } catch (e) {
    console.log('[Updater] setFeedURL failed:', e.message)
    return
  }

  // Check on startup (delay 10s so app loads first)
  setTimeout(() => {
    autoUpdater.checkForUpdates()
  }, 10_000)

  // Check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates()
  }, 4 * 60 * 60 * 1000)

  autoUpdater.on('update-available', () => {
    win.webContents.send('update-available')
  })

  autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
    win.webContents.send('update-downloaded', releaseName)
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
    backgroundColor: '#0f172a',
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
