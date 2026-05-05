import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { login } from '../api/auth'
import { setBaseUrl, BASE_URL } from '../api/client'
import './LoginScreen.css'

export default function LoginScreen() {
  const { setUser } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [server,   setServer]   = useState(BASE_URL)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [showCfg,  setShowCfg]  = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!username || !password) { setError('Enter username and password'); return }
    setLoading(true); setError('')
    try {
      setBaseUrl(server)
      const user = await login(username, password)
      setUser(user)
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">Tuka Staff</span>
        </div>
        <p className="login-sub">Customer Service Dashboard</p>

        {/* Current server indicator */}
        <div className="login-server-indicator">
          <span className="server-dot" />
          <span className="server-url">{server}</span>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <input className="login-input" placeholder="Username" value={username}
            onChange={e => setUsername(e.target.value)} autoFocus />
          <input className="login-input" type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)} />
          {error && <div className="login-error">{error}</div>}
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <button className="login-cfg-btn" onClick={() => setShowCfg(v => !v)}>
          ⚙ Server settings
        </button>
        {showCfg && (
          <div className="login-cfg-panel">
            <p className="login-cfg-hint">Change server IP if you switched networks:</p>
            <div className="login-cfg-row">
              <input className="login-input" placeholder="http://192.168.x.x:8080"
                value={server} onChange={e => setServer(e.target.value)} />
              <button className="login-btn-sm" onClick={() => { setBaseUrl(server); setShowCfg(false) }}>
                Save
              </button>
            </div>
            <button className="login-cfg-reset" onClick={() => {
              localStorage.removeItem('tuka_base_url')
              window.location.reload()
            }}>
              🔄 Reset to default
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
