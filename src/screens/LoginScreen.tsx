import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { login } from '../api/auth'
import './LoginScreen.css'

export default function LoginScreen() {
  const { setUser } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!username || !password) { setError('Enter username and password'); return }
    setLoading(true); setError('')
    try {
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
          <div className="top-nav-logo-icon" style={{ width: 28, height: 28, borderRadius: 6, background: '#1677ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#fff' }}>C</div>
          <span className="logo-text">Cardyn Staff</span>
        </div>
        <p className="login-sub">客服管理系统</p>

        <form onSubmit={handleLogin} className="login-form">
          <input
            className="login-input"
            placeholder="用户名"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            disabled={loading}
          />
          <input
            className="login-input"
            type="password"
            placeholder="密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
          />
          {error && <div className="login-error">{error}</div>}
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? (
              <span className="login-btn-inner">
                <span className="spinner-sm" />
                登录中…
              </span>
            ) : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
