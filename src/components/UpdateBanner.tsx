import React, { useEffect, useState } from 'react'

type UpdateState = 'idle' | 'available' | 'ready'

declare global {
  interface Window {
    electron?: {
      platform?: string
      onUpdateAvailable?: (cb: () => void) => void
      onUpdateDownloaded?: (cb: (v: string) => void) => void
      onUpdateError?: (cb: (msg: string) => void) => void
      checkForUpdate?: () => void
      installUpdate?: () => void
      getAppVersion?: () => Promise<string>
    }
  }
}

export default function UpdateBanner() {
  const [state,    setState]   = useState<UpdateState>('idle')
  const [newVer,   setNewVer]  = useState('')
  const [currVer,  setCurrVer] = useState('')

  useEffect(() => {
    // Get current version to display
    window.electron?.getAppVersion?.().then(v => setCurrVer(v)).catch(() => {})

    const el = window.electron
    if (!el) return

    el.onUpdateAvailable?.(() => setState('available'))
    el.onUpdateDownloaded?.((v) => { setState('ready'); setNewVer(v || '') })
    el.onUpdateError?.(() => setState('idle'))
  }, [])

  // Not in Electron — don't render
  if (!window.electron?.installUpdate) return null

  if (state === 'ready') return (
    <div style={banner('#16a34a')}>
      <span>🎉 新版本 {newVer} 已下载完成</span>
      <button style={btn} onClick={() => window.electron?.installUpdate?.()}>立即重启安装</button>
      <button style={{ ...btn, background: 'transparent', border: 'none', opacity: 0.7 }}
        onClick={() => setState('idle')}>稍后</button>
    </div>
  )

  // While downloading — show nothing (silent background download)
  if (state === 'available') return null

  // Idle — show version number + check button
  return (
    <div style={versionBar}>
      {currVer && <span style={verText}>v{currVer}</span>}
      <button style={checkBtn} onClick={() => {
        setState('available')
        window.electron?.checkForUpdate?.()
        // Reset to idle after 15s if no update found
        setTimeout(() => setState('idle'), 15_000)
      }}>
        检查更新
      </button>
    </div>
  )
}

const banner = (bg: string): React.CSSProperties => ({
  position: 'fixed', bottom: 0, left: 0, right: 0,
  background: bg, color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 12, padding: '8px 16px', fontSize: 13, fontWeight: 600, zIndex: 9999,
})

const btn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.2)', color: '#fff',
  border: '1px solid rgba(255,255,255,0.4)',
  borderRadius: 4, padding: '3px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}

const versionBar: React.CSSProperties = {
  position: 'fixed', bottom: 10, right: 12, zIndex: 9999,
  display: 'flex', alignItems: 'center', gap: 8,
}

const verText: React.CSSProperties = {
  fontSize: 11, color: '#bbb',
}

const checkBtn: React.CSSProperties = {
  background: '#fff', color: '#999',
  border: '1px solid #e8e8e8',
  borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
}
