import './styles.css'
import { CardynApp } from './cardyn-app'

const app = document.getElementById('app')
if (app) {
  const cardyn = new CardynApp(app)
  cardyn.init()
}

// Save window position on move
if (window.__TAURI__) {
  const { getCurrentWindow } = window.__TAURI__.window
  const { invoke } = window.__TAURI__.core
  let saveTimeout: ReturnType<typeof setTimeout> | null = null
  const win = getCurrentWindow()
  win.listen('tauri://move', async () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(async () => {
      try {
        const pos = await win.outerPosition()
        await invoke('save_window_position', { x: pos.x, y: pos.y })
      } catch {}
    }, 500)
  })
}
