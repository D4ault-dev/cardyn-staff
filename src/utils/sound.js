// ── Sound notification engine ──────────────────────────────────────────────
// Copied from Staff Desktop/src/utils/sound.ts — adapted for Tauri/Vue
// Uses Web Audio API synth + HTML Audio for real MP3/m4a files

let ctx = null

// Track user interaction — required for AudioContext on some browsers
if (typeof window !== 'undefined') {
  const markInteracted = () => {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
  }
  window.addEventListener('click',     markInteracted, { passive: true })
  window.addEventListener('keydown',   markInteracted, { passive: true })
  window.addEventListener('mousedown', markInteracted, { passive: true })
}

function getCtx() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch { return null }
}

function tone(freq, duration, volume = 0.4, type = 'sine') {
  const c = getCtx()
  if (!c) return
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
  } catch {}
}

async function ensureCtxReady() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') await ctx.resume()
    return ctx.state === 'running'
  } catch { return false }
}

// In Tauri dev, window.location.origin is http://localhost:1420
// In Tauri prod, files are served from tauri://localhost
function resolveAudioPath(filename) {
  try {
    return `/${filename}`
  } catch { return `/${filename}` }
}

// Pre-loaded audio elements
let _orderAudio = null
let _bellAudio  = null
let _withdrawalAudio = null

function getOrderSound() {
  if (!_orderAudio) {
    _orderAudio = new Audio(resolveAudioPath('new-order.mp3'))
    _orderAudio.volume = 0.9
    _orderAudio.preload = 'auto'
  }
  return _orderAudio
}

function getBell() {
  if (!_bellAudio) {
    _bellAudio = new Audio(resolveAudioPath('order-bell.mp3'))
    _bellAudio.volume = 0.8
    _bellAudio.preload = 'auto'
  }
  return _bellAudio
}

function getWithdrawalSound() {
  if (!_withdrawalAudio) {
    _withdrawalAudio = new Audio(resolveAudioPath('new-withdrawal.m4a'))
    _withdrawalAudio.volume = 0.9
    _withdrawalAudio.preload = 'auto'
  }
  return _withdrawalAudio
}

// 🔔 New chat message — urgent double-beep
export function playNewChat() {
  ensureCtxReady().then(ready => {
    if (!ready) return
    tone(880, 0.15, 0.6, 'square')
    setTimeout(() => tone(1100, 0.2,  0.6, 'square'), 180)
    setTimeout(() => tone(880, 0.15,  0.5, 'square'), 380)
    setTimeout(() => tone(1100, 0.25, 0.5, 'square'), 560)
  })
}

// 🆕 New order — plays MP3 with fallback to synth
export function playNewOrder() {
  const trySynth = () => {
    ensureCtxReady().then(ready => {
      if (!ready) return
      tone(660,  0.12, 0.5, 'sine')
      setTimeout(() => tone(880,  0.12, 0.5, 'sine'), 150)
      setTimeout(() => tone(1100, 0.2,  0.5, 'sine'), 300)
    })
  }

  const tryBell = () => {
    try {
      const bell = getBell()
      bell.currentTime = 0
      bell.play().catch(trySynth)
    } catch { trySynth() }
  }

  try {
    const snd = getOrderSound()
    snd.currentTime = 0
    snd.play().catch(tryBell)
  } catch { tryBell() }
}

// 💸 New withdrawal request
export function playNewWithdrawal() {
  const trySynth = () => {
    ensureCtxReady().then(ready => {
      if (!ready) return
      tone(1047, 0.08, 0.4, 'square')
      setTimeout(() => tone(1319, 0.08, 0.4, 'square'), 100)
      setTimeout(() => tone(1568, 0.08, 0.4, 'square'), 200)
      setTimeout(() => tone(2093, 0.2,  0.4, 'square'), 300)
    })
  }

  try {
    const snd = getWithdrawalSound()
    snd.currentTime = 0
    snd.play().catch(trySynth)
  } catch { trySynth() }
}

// 💬 New message — soft ping
export function playNewMessage() {
  ensureCtxReady().then(ready => {
    if (!ready) return
    tone(1200, 0.08, 0.25, 'sine')
    setTimeout(() => tone(900, 0.12, 0.2, 'sine'), 100)
  })
}

// ✅ Success
export function playSuccess() {
  ensureCtxReady().then(ready => {
    if (!ready) return
    tone(523, 0.15, 0.3, 'sine')
    setTimeout(() => tone(659, 0.15, 0.3, 'sine'), 100)
    setTimeout(() => tone(784, 0.25, 0.3, 'sine'), 200)
  })
}

// ❌ Error
export function playError() {
  ensureCtxReady().then(ready => {
    if (!ready) return
    tone(400, 0.1,  0.4, 'sawtooth')
    setTimeout(() => tone(300, 0.2, 0.4, 'sawtooth'), 120)
  })
}

// Pre-warm — call once on app start
export function initAudio() {
  try { getOrderSound() }      catch {}
  try { getBell() }            catch {}
  try { getWithdrawalSound() } catch {}
}
