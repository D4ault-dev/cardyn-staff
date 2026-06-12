import React, { useEffect, useState } from 'react'

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready'

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
  const [state, setState]     = useState<UpdateState>('idle')
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const el = window.electron
    if (!el) return

    el.onUpdateAvailable?.(() => {
      setState('available')
      setChecking(false)
    })
    el.onUpdateDownloaded?.((v) => {
      setState('ready')
      setVersion(v || '')
    })
    el.onUpdateError?.(() => {
      setChecking(false)
    })
  }, [])

  function handleCheck() {
    setChecking(true)
    window.electron?.checkForUpdate?.()
    // Reset checking after 10s if no response
    setTimeout(() => setChecking(false), 10_000)
  }

  function handleInstall() {
    window.electron?.installUpdate?.()
  }

  // Don't render anything in browser / dev
  if (!window.electron?.installUpdate) return null

  // Update ready to install
  if (state === 'ready') {
    return (
      <div style={styles.banner('#16a34a')}>
        <span>🎉 新版本 {version} 已下载完成，点击安装更新</span>
        <button style={styles.btn('#fff', '#15803d')} onClick={handleInstall}>
          立即更新
        </button>
      </div>
    )
  }

  // Update available — downloading
  if (state === 'available') {
    return (
      <div style={styles.banner('#2563eb')}>
        <span>⬇ 新版本下载中…</span>
      </div>
    )
  }

  // Idle — show manual check button
  return (
    <div style={styles.checkWrap}>
      <button
        style={styles.checkBtn}
        onClick={handleCheck}
        disabled={checking}
        title="检查更新"
      >
        {checking ? '检查中…' : '检查更新'}
      </button>
    </div>
  )
}

const styles = {
  banner: (bg: string) => ({
    position: 'fixed' as const,
    bottom: 0, left: 0, right: 0,
    background: bg,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    zIndex: 9999,
  }),
  btn: (color: string, bg: string) => ({
    background: bg,
    color,
    border: 'none',
    borderRadius: 6,
    padding: '5px 16px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  }),
  checkWrap: {
    position: 'fixed' as const,
    bottom: 12,
    right: 12,
    zIndex: 9999,
  },
  checkBtn: {
    background: 'rgba(0,0,0,0.15)',
    color: '#94a3b8',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
}
