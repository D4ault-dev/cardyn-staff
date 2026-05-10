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
          <img src="/icon.png" alt="logo" style={{ width: 36, height: 36, borderRadius: 8 }} onError={(e) => { e.currentTarget.style.display='none' }} />
          <span className="logo-text">Cardyn Staff</span>
        </div>
        <p className="login-sub">Customer Service Dashboard</p>

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
      </div>
    </div>
  )
}
