import React, { useState, useCallback } from 'react'
import { HashRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useHeartbeat } from './hooks/useHeartbeat'
import { useChatNotifications } from './hooks/useChatNotifications'
import type { NotificationEvent } from './hooks/useChatNotifications'
import OnlineBar from './components/OnlineBar'
import ChatToast from './components/ChatToast'
import UpdateBanner from './components/UpdateBanner'
import type { ToastItem } from './components/ChatToast'
import { playNewChat, playNewOrder, playNewWithdrawal } from './utils/sound'
import LoginScreen from './screens/LoginScreen'
import ChatScreen from './screens/ChatScreen'
import OrdersScreen from './screens/OrdersScreen'
import WithdrawalsScreen from './screens/WithdrawalsScreen'
import UsersScreen from './screens/UsersScreen'
import './App.css'

// ── SVG icons for sidebar ─────────────────────────────────────────────────────
const IconChat = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)
const IconOrders = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
  </svg>
)
const IconWithdraw = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
  </svg>
)
const IconUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const IconLogout = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)

function Shell() {
  const { user, loading, logout } = useAuth()
  const [unread,       setUnread]       = useState(0)
  const [toasts,       setToasts]       = useState<ToastItem[]>([])
  const [pendingChatId, setPendingChatId] = useState<number | null>(null)
  const [orderBadge,   setOrderBadge]   = useState(0)
  const [wdBadge,      setWdBadge]      = useState(0)

  useHeartbeat()

  const handleNotification = useCallback((event: NotificationEvent) => {
    const id = `${event.type}-${Date.now()}`
    if (event.type === 'chat') {
      playNewChat()
      event.chats.forEach(c => {
        setToasts(prev => [...prev, {
          id:        `chat-${c.id}-${Date.now()}`,
          type:      'chat',
          title:     '新聊天请求',
          message:   `${c.userName || `User#${c.userId}`} 发起了会话${c.orderNo ? ` · ${c.orderNo}` : ''}`,
          sessionId: c.id,
        }])
      })
      setUnread(prev => prev + event.chats.length)
    } else if (event.type === 'order') {
      playNewOrder()
      setOrderBadge(prev => prev + event.count)
      setToasts(prev => [...prev, {
        id, type: 'order',
        title:   '新订单',
        message: `${event.count} 个新订单等待处理`,
      }])
    } else if (event.type === 'withdrawal') {
      playNewWithdrawal()
      setWdBadge(prev => prev + event.count)
      setToasts(prev => [...prev, {
        id, type: 'withdrawal',
        title:   '新提现申请',
        message: `${event.count} 个新提现请求`,
      }])
    }
  }, [])

  useChatNotifications(handleNotification)

  if (loading) return (
    <div className="app-loading">
      <div className="spinner" />
      <span className="app-loading-text">Loading…</span>
    </div>
  )
  if (!user) return <LoginScreen />

  const initials = (user.nickName || user.username || 'S')[0].toUpperCase()

  return (
    <div className="app-shell">
      {/* ── Left Sidebar ── */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">C</div>
          <span className="sidebar-logo-name">Cardyn Staff</span>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <NavLink
            to="/chat"
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            <span className="nav-icon"><IconChat /></span>
            <span className="nav-label">客服聊天</span>
            {unread > 0 && <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>}
          </NavLink>

          <NavLink
            to="/orders"
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
            onClick={() => setOrderBadge(0)}
          >
            <span className="nav-icon"><IconOrders /></span>
            <span className="nav-label">订单管理</span>
            {orderBadge > 0 && <span className="nav-badge orange">{orderBadge}</span>}
          </NavLink>

          <NavLink
            to="/withdrawals"
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
            onClick={() => setWdBadge(0)}
          >
            <span className="nav-icon"><IconWithdraw /></span>
            <span className="nav-label">提现管理</span>
            {wdBadge > 0 && <span className="nav-badge orange">{wdBadge}</span>}
          </NavLink>

          <NavLink
            to="/users"
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            <span className="nav-icon"><IconUsers /></span>
            <span className="nav-label">用户管理</span>
          </NavLink>
        </nav>

        {/* Footer: user info + logout */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-name">{user.nickName || user.username}</div>
              <div className="sidebar-role">{user.roleType}</div>
            </div>
          </div>
          <button className="sidebar-logout" onClick={logout}>
            <IconLogout />
            退出登录
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="app-main">
        {/* Online staff bar */}
        <OnlineBar />

        {/* Screen content */}
        <Routes>
          <Route path="/"            element={<Navigate to="/orders" replace />} />
          <Route path="/chat"        element={
            <ChatScreen
              onUnreadChange={setUnread}
              autoOpenSessionId={pendingChatId}
              onAutoOpenDone={() => setPendingChatId(null)}
            />
          } />
          <Route path="/orders"      element={<OrdersScreen />} />
          <Route path="/withdrawals" element={<WithdrawalsScreen />} />
          <Route path="/users"       element={<UsersScreen />} />
        </Routes>
      </div>

      {/* Toast notifications */}
      <ChatToast
        toasts={toasts}
        onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))}
        onOpen={toast => {
          if (toast.type === 'chat' && toast.sessionId) {
            setPendingChatId(toast.sessionId)
          }
        }}
      />

      {/* Auto-update banner */}
      <UpdateBanner />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AuthProvider>
  )
}
