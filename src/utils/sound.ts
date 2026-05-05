// ── Sound notification engine ─────────────────────────────────────────────────
// Uses Web Audio API — no external files needed, works offline

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(freq: number, duration: number, volume = 0.4, type: OscillatorType = 'sine') {
  const c = getCtx()
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
}

// 🔔 New chat — urgent double-beep (loud)
export function playNewChat() {
  tone(880, 0.15, 0.6, 'square')
  setTimeout(() => tone(1100, 0.2, 0.6, 'square'), 180)
  setTimeout(() => tone(880, 0.15, 0.5, 'square'), 380)
  setTimeout(() => tone(1100, 0.25, 0.5, 'square'), 560)
}

// 📦 New order — triple ascending beep
export function playNewOrder() {
  tone(660, 0.12, 0.5, 'sine')
  setTimeout(() => tone(880, 0.12, 0.5, 'sine'), 150)
  setTimeout(() => tone(1100, 0.2,  0.5, 'sine'), 300)
}

// 💬 New message in active chat — soft single ping
export function playNewMessage() {
  tone(1200, 0.08, 0.25, 'sine')
  setTimeout(() => tone(900, 0.12, 0.2, 'sine'), 100)
}

// ✅ Success — pleasant ascending chord
export function playSuccess() {
  tone(523, 0.15, 0.3, 'sine')
  setTimeout(() => tone(659, 0.15, 0.3, 'sine'), 100)
  setTimeout(() => tone(784, 0.25, 0.3, 'sine'), 200)
}

// ❌ Error — descending buzz
export function playError() {
  tone(400, 0.1, 0.4, 'sawtooth')
  setTimeout(() => tone(300, 0.2, 0.4, 'sawtooth'), 120)
}

// 💸 New withdrawal request — cash register style
export function playNewWithdrawal() {
  tone(1047, 0.08, 0.4, 'square')
  setTimeout(() => tone(1319, 0.08, 0.4, 'square'), 100)
  setTimeout(() => tone(1568, 0.08, 0.4, 'square'), 200)
  setTimeout(() => tone(2093, 0.2,  0.4, 'square'), 300)
}
