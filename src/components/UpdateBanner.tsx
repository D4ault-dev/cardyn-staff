import React, { useEffect, useState } from 'react'

type UpdateState = 'idle' | 'checking' | 'downloading' | 'ready' | 'up-to-date' | 'error'

declare global {
  interface Window {
    electron?: {
      platform?: string
      onUpdateAvailable?: (cb: () => void) => void
      onUpdateNotAvailable?: (cb: () => void) => void
      onUpdateDownloaded?: (cb: (v: string) => void) => void
      onUpdateError?: (cb: (msg: string) => void) => void
      onDownloadProgress?: (cb: (pct: number) => void) => void
      checkForUpdate?: () => void
      installUpdate?: () => void
      getAppVersion?: () => Promise<string>
    }
  }
}

export default function UpdateBanner() {
  const [state,    setState]    = useState<UpdateState>('idle')
  const [newVer,   setNewVer]   = useState('')
  const [currVer,  setCurrVer]  = useState('')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    window.electron?.getAppVersion?.().then(v => setCurrVer(v)).catch(() => {})

    const el = window.electron
    if (!el) return

    el.onUpdateAvailable?.(() => {
      setState('downloading')
      setProgress(0)
    })

    el.onUpdateNotAvailable?.(() => {
      setState('up-to-date')
      // Auto-hide after 3s
      setTimeout(() => setState('idle'), 3000)
    })

    el.onUpdateDownloaded?.((v) => {
      setState('ready')
      setNewVer(v || '')
      setProgress(100)
    })

    el.onDownloadProgress?.((pct) => {
      setProgress(Math.round(pct))
    })

    el.onUpdateError?.((msg) => {
      console.warn('[Update error]', msg)
      setState('error')
    })
  }, [])

  // Not in Electron — don't render
  if (!window.electron?.installUpdate) return null

  // ── Update ready — green banner ──────────────────────────────────────────
  if (state === 'ready') return (
    <div style={readyBanner}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          新版本 {newVer} 已下载完成
        </span>
        <span style={{ fontSize: 11, opacity: 0.85 }}>
          点击立即重启安装，全程不超过30秒
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={installBtn} onClick={() => window.electron?.installUpdate?.()}>
          立即重启安装
        </button>
        <button style={laterBtn} onClick={() => setState('idle')}>
          稍后
        </button>
      </div>
    </div>
  )

  // ── Downloading — progress bar ───────────────────────────────────────────
  if (state === 'downloading') return (
    <div style={downloadingBanner}>
      <div style={progressTrack}>
        <div style={{ ...progressFill, width: `${Math.max(progress, 8)}%` }} />
      </div>
      <span style={{ fontSize: 11, color: '#1677ff', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {progress > 0 ? `下载中 ${progress}%...` : '新版本下载中...'}
      </span>
    </div>
  )

  // ── Version bar (idle / checking / up-to-date / error) ──────────────────
  return (
    <div style={versionBar}>
      {currVer && <span style={verText}>v{currVer}</span>}

      {state === 'up-to-date' && (
        <span style={upToDateTag}>已是最新版本</span>
      )}

      {state === 'error' && (
        <button
          style={{ ...checkBtn, borderColor: '#ff4d4f', color: '#ff4d4f' }}
          onClick={() => {
            setState('checking')
            window.electron?.checkForUpdate?.()
            setTimeout(() => setState(s => s === 'checking' ? 'idle' : s), 20_000)
          }}
        >
          更新失败，重试
        </button>
      )}

      {(state === 'idle' || state === 'checking') && (
        <button
          style={checkBtn}
          disabled={state === 'checking'}
          onClick={() => {
            setState('checking')
            window.electron?.checkForUpdate?.()
            // Fallback: if no response in 20s, go back to idle
            setTimeout(() => setState(s => s === 'checking' ? 'idle' : s), 20_000)
          }}
        >
          {state === 'checking' ? '检查中...' : '检查更新'}
        </button>
      )}
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const readyBanner: React.CSSProperties = {
  position: 'fixed', bottom: 0, left: 0, right: 0,
  background: 'linear-gradient(135deg, #16a34a, #15803d)',
  color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 16, padding: '12px 24px', zIndex: 9999,
  boxShadow: '0 -4px 16px rgba(22,163,74,0.4)',
}
const installBtn: React.CSSProperties = {
  background: '#fff', color: '#16a34a',
  border: 'none', borderRadius: 6,
  padding: '6px 18px', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', whiteSpace: 'nowrap',
}
const laterBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.15)', color: '#fff',
  border: '1px solid rgba(255,255,255,0.4)',
  borderRadius: 6, padding: '6px 14px',
  fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
}
const downloadingBanner: React.CSSProperties = {
  position: 'fixed', bottom: 0, left: 0, right: 0,
  background: '#fff', borderTop: '1px solid #e8e8e8',
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '8px 24px', zIndex: 9999,
}
const progressTrack: React.CSSProperties = {
  flex: 1, height: 4, background: '#e8e8e8',
  borderRadius: 2, overflow: 'hidden',
}
const progressFill: React.CSSProperties = {
  height: '100%', background: '#1677ff', borderRadius: 2,
  transition: 'width 0.3s ease',
}
const versionBar: React.CSSProperties = {
  position: 'fixed', bottom: 10, left: 12,  // moved to LEFT so it doesn't overlap pending FAB
  zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8,
}
const verText: React.CSSProperties = {
  fontSize: 11, color: '#bbb',
}
const checkBtn: React.CSSProperties = {
  background: '#fff', color: '#1677ff',
  border: '1px solid #1677ff',
  borderRadius: 4, padding: '3px 12px',
  fontSize: 11, cursor: 'pointer', fontWeight: 600,
}
const upToDateTag: React.CSSProperties = {
  fontSize: 11, color: '#52c41a', fontWeight: 600,
  background: '#f6ffed', border: '1px solid #b7eb8f',
  borderRadius: 4, padding: '2px 8px',
}
