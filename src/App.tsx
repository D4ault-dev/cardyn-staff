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

function Shell() {
  const { user, loading, logout } = useAuth()
  const [unread,       setUnread]       = useState(0)
  const [toasts,       setToasts]       = useState<ToastItem[]>([])
  const [pendingChatId, setPendingChatId] = useState<number | null>(null)
  const [orderBadge,   setOrderBadge]   = useState(0)
  const [wdBadge,      setWdBadge]      = useState(0)
  // Global pending order count — shared with OrdersScreen
  const [pendingCount, setPendingCount] = useState(0)
  const [newOrderAlert, setNewOrderAlert] = useState(false)
  const [newWdAlert, setNewWdAlert] = useState(false)

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
      setPendingCount(prev => prev + event.count)
      setNewOrderAlert(true)
      setToasts(prev => [...prev, {
        id, type: 'order',
        title:   '新订单',
        message: `${event.count} 个新订单等待处理`,
      }])
    } else if (event.type === 'withdrawal') {
      playNewWithdrawal()
      setWdBadge(prev => prev + event.count)
      setNewWdAlert(true)
      setToasts(prev => [...prev, {
        id, type: 'withdrawal',
        title:   '新提现申请',
        message: `${event.count} 个新提现请求`,
      }])
    }
  }, [])

  useChatNotifications(handleNotification, setPendingCount, setWdBadge)

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
      {/* ── Top Navigation Bar ── */}
      <div className="top-nav">
        <div className="top-nav-left">
          {/* Nav tabs — no logo */}
          <div className="nav-tabs">
            <NavLink to="/chat"
              className={({ isActive }) => 'nav-tab' + (isActive ? ' active' : '')}
            >
              客服聊天
              {unread > 0 && <span className="nav-tab-badge">{unread > 99 ? '99+' : unread}</span>}
            </NavLink>

            <NavLink to="/orders"
              className={({ isActive }) => 'nav-tab' + (isActive ? ' active' : '')}
              onClick={() => setOrderBadge(0)}
            >
              核销中心
              {orderBadge > 0 && <span className="nav-tab-badge orange">{orderBadge}</span>}
            </NavLink>

            <NavLink to="/withdrawals"
              className={({ isActive }) => 'nav-tab' + (isActive ? ' active' : '')}
              onClick={() => setWdBadge(0)}
            >
              提现中心
              {wdBadge > 0 && <span className="nav-tab-badge orange">{wdBadge}</span>}
            </NavLink>

            <NavLink to="/users"
              className={({ isActive }) => 'nav-tab' + (isActive ? ' active' : '')}
            >
              用户管理
            </NavLink>
          </div>
        </div>

        {/* Right: user + logout */}
        <div className="top-nav-right">
          <div className="top-nav-user">
            <div className="top-nav-avatar">{initials}</div>
            <div>
              <div className="top-nav-username">{user.nickName || user.username}</div>
              <div className="top-nav-role">{user.roleType}</div>
            </div>
          </div>
          <button className="top-nav-logout" onClick={logout}>退出登录</button>
        </div>      </div>

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
          <Route path="/orders"      element={
            <OrdersScreen
              globalPendingCount={pendingCount}
              newOrderAlert={newOrderAlert}
              onAlertDismissed={() => setNewOrderAlert(false)}
              onPendingCountChange={setPendingCount}
            />
          } />
          <Route path="/withdrawals" element={
            <WithdrawalsScreen
              globalPendingCount={wdBadge}
              newWdAlert={newWdAlert}
              onAlertDismissed={() => setNewWdAlert(false)}
              onPendingCountChange={n => setWdBadge(n)}
            />
          } />
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
