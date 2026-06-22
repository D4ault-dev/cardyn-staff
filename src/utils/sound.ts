// ── Sound notification engine ─────────────────────────────────────────────────
// Uses Web Audio API for synth sounds + HTML Audio for real sound files
// Windows fix: AudioContext must be resumed AFTER user interaction
// Electron fix: use absolute URL for audio files in production

let ctx: AudioContext | null = null
let _userInteracted = false

// Track first user interaction — required for AudioContext on Windows/Chrome
if (typeof window !== 'undefined') {
  const markInteracted = () => {
    _userInteracted = true
    // Pre-resume AudioContext on first interaction
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
  }
  window.addEventListener('click',    markInteracted, { once: false, passive: true })
  window.addEventListener('keydown',  markInteracted, { once: false, passive: true })
  window.addEventListener('mousedown', markInteracted, { once: false, passive: true })
}

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    // Resume if suspended — required on Windows after page focus
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
      // If still suspended, return null — sound will play on next tick
      if (ctx.state === 'suspended') return null
    }
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, duration: number, volume = 0.4, type: OscillatorType = 'sine') {
  const c = getCtx()
  if (!c) return  // AudioContext not ready — skip silently
  try {
    const osc  = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    osc.type = type
    osc.frequency.setValueAtTime(freq, c.currentTime)
    gain.gain.setValueAtTime(volume, c.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration)
    osc.start(c.currentTime)
    osc.stop(c.currentTime + duration)
  } catch { /* ignore — AudioContext may be in bad state */ }
}

// ── Audio file path resolution ────────────────────────────────────────────────
// In Electron production, files are served from the app bundle
// Use window.location to build the correct absolute URL
function resolveAudioPath(filename: string): string {
  try {
    // In Electron dev, window.location.origin is http://localhost:5173
    // In Electron prod, files are at ./ relative to index.html
    const base = window.location.origin
    if (base.startsWith('http')) {
      return `${base}/${filename}`
    }
    // Electron file:// protocol — use relative path
    return `./${filename}`
  } catch {
    return `/${filename}`
  }
}

// Pre-load the new order sound (real MP3 file)
let _orderAudio: HTMLAudioElement | null = null
function getOrderSound(): HTMLAudioElement {
  if (!_orderAudio) {
    const path = resolveAudioPath('new-order.mp3')
    _orderAudio = new Audio(path)
    _orderAudio.volume = 0.9
    _orderAudio.preload = 'auto'
    _orderAudio.load()
  }
  return _orderAudio
}

// Pre-load the bell audio (fallback)
let _bellAudio: HTMLAudioElement | null = null
function getBell(): HTMLAudioElement {
  if (!_bellAudio) {
    const path = resolveAudioPath('order-bell.mp3')
    _bellAudio = new Audio(path)
    _bellAudio.volume = 0.8
    _bellAudio.preload = 'auto'
    _bellAudio.load()
  }
  return _bellAudio
}

// ── Resume AudioContext and play ──────────────────────────────────────────────
// Windows requires AudioContext.resume() before playing after user interaction
async function ensureCtxReady(): Promise<boolean> {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    return ctx.state === 'running'
  } catch {
    return false
  }
}

// 🔔 New chat — urgent double-beep (loud)
export function playNewChat() {
  ensureCtxReady().then(ready => {
    if (!ready) return
    tone(880, 0.15, 0.6, 'square')
    setTimeout(() => tone(1100, 0.2, 0.6, 'square'), 180)
    setTimeout(() => tone(880, 0.15, 0.5, 'square'), 380)
    setTimeout(() => tone(1100, 0.25, 0.5, 'square'), 560)
  })
}

// 🆕 New order — plays MP3 with multiple fallbacks
export function playNewOrder() {
  // Always try MP3 first — works on Windows/Mac/Linux
  const tryMp3 = () => {
    try {
      const snd = getOrderSound()
      snd.currentTime = 0
      const p = snd.play()
      if (p) {
        p.catch(() => tryBell())
      }
    } catch {
      tryBell()
    }
  }

  const tryBell = () => {
    try {
      const bell = getBell()
      bell.currentTime = 0
      const p = bell.play()
      if (p) {
        p.catch(() => trySynth())
      }
    } catch {
      trySynth()
    }
  }

  const trySynth = () => {
    ensureCtxReady().then(ready => {
      if (!ready) return
      tone(660, 0.12, 0.5, 'sine')
      setTimeout(() => tone(880, 0.12, 0.5, 'sine'), 150)
      setTimeout(() => tone(1100, 0.2, 0.5, 'sine'), 300)
    })
  }

  tryMp3()
}

// 💬 New message in active chat — soft single ping
export function playNewMessage() {
  ensureCtxReady().then(ready => {
    if (!ready) return
    tone(1200, 0.08, 0.25, 'sine')
    setTimeout(() => tone(900, 0.12, 0.2, 'sine'), 100)
  })
}

// ✅ Success — pleasant ascending chord
export function playSuccess() {
  ensureCtxReady().then(ready => {
    if (!ready) return
    tone(523, 0.15, 0.3, 'sine')
    setTimeout(() => tone(659, 0.15, 0.3, 'sine'), 100)
    setTimeout(() => tone(784, 0.25, 0.3, 'sine'), 200)
  })
}

// ❌ Error — descending buzz
export function playError() {
  ensureCtxReady().then(ready => {
    if (!ready) return
    tone(400, 0.1, 0.4, 'sawtooth')
    setTimeout(() => tone(300, 0.2, 0.4, 'sawtooth'), 120)
  })
}

// 💸 New withdrawal request — cash register style
export function playNewWithdrawal() {
  ensureCtxReady().then(ready => {
    if (!ready) return
    tone(1047, 0.08, 0.4, 'square')
    setTimeout(() => tone(1319, 0.08, 0.4, 'square'), 100)
    setTimeout(() => tone(1568, 0.08, 0.4, 'square'), 200)
    setTimeout(() => tone(2093, 0.2,  0.4, 'square'), 300)
  })
}

// ── Pre-warm audio on first click ─────────────────────────────────────────────
// Call this once when the app starts to ensure audio is ready
export function initAudio() {
  // Pre-load audio files in background
  try { getOrderSound() } catch {}
  try { getBell() } catch {}
  // Resume AudioContext if it was created suspended
  if (ctx) ensureCtxReady().catch(() => {})
}
