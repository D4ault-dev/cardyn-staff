import React, { useState, useCallback } from 'react'
import { HashRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useHeartbeat } from './hooks/useHeartbeat'
import { useChatNotifications } from './hooks/useChatNotifications'
import type { NotificationEvent } from './hooks/useChatNotifications'
import OnlineBar from './components/OnlineBar'
import ChatToast from './components/ChatToast'
import type { ToastItem } from './components/ChatToast'
import LoginScreen from './screens/LoginScreen'
import DashboardScreen from './screens/DashboardScreen'
import ChatScreen from './screens/ChatScreen'
import OrdersScreen from './screens/OrdersScreen'
import WithdrawalsScreen from './screens/WithdrawalsScreen'
import UsersScreen from './screens/UsersScreen'
import './App.css'

function Shell() {
  const { user, loading, logout } = useAuth()
  const [unread, setUnread]           = useState(0)
  const [toasts, setToasts]           = useState<ToastItem[]>([])
  const [pendingChatId, setPendingChatId] = useState<number | null>(null)
  const [orderBadge,    setOrderBadge]    = useState(0)
  const [wdBadge,       setWdBadge]       = useState(0)

  useHeartbeat()

  const handleNotification = useCallback((event: NotificationEvent) => {
    const id = `${event.type}-${Date.now()}`
    if (event.type === 'chat') {
      event.chats.forEach(c => {
        setToasts(prev => [...prev, {
          id:        `chat-${c.id}-${Date.now()}`,
          type:      'chat',
          title:     '新客服请求',
          message:   `${c.userName || `用户#${c.userId}`} 发起了对话${c.orderNo ? ` · ${c.orderNo}` : ''}`,
          sessionId: c.id,
        }])
      })
      setUnread(prev => prev + event.chats.length)
    } else if (event.type === 'order') {
      setOrderBadge(prev => prev + event.count)
      setToasts(prev => [...prev, {
        id, type: 'order',
        title:   '新订单待处理',
        message: `有 ${event.count} 个新订单等待核销`,
      }])
    } else if (event.type === 'withdrawal') {
      setWdBadge(prev => prev + event.count)
      setToasts(prev => [...prev, {
        id, type: 'withdrawal',
        title:   '新提现申请',
        message: `有 ${event.count} 笔新提现申请待处理`,
      }])
    }
  }, [])

  useChatNotifications(handleNotification)

  function dismissToast(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  function handleToastOpen(toast: ToastItem) {
    if (toast.type === 'chat' && toast.sessionId) {
      setPendingChatId(toast.sessionId)
    }
    // For order/withdrawal, navigation handled by NavLink click
  }

  if (loading) return (
    <div className="app-loading">
      <div className="spinner" />
      <span className="app-loading-text">Loading Cardyn Staff…</span>
    </div>
  )
  if (!user)   return <LoginScreen />

  return (
    <div className="app-shell">
      {/* Top navigation bar — matches screenshot */}
      <div className="top-nav">
        <div className="top-nav-left">
          <NavLink to="/dashboard"   className={({ isActive }) => 'tab-btn' + (isActive ? ' active' : '')}>数据概览</NavLink>
          <NavLink to="/chat"        className={({ isActive }) => 'tab-btn' + (isActive ? ' active' : '')}>
            客服中心{unread > 0 && <span className="tab-badge">{unread > 99 ? '99+' : unread}</span>}
          </NavLink>
          <NavLink to="/orders"      className={({ isActive }) => 'tab-btn' + (isActive ? ' active' : '')}
            onClick={() => setOrderBadge(0)}>
            核销中心{orderBadge > 0 && <span className="tab-badge orange">{orderBadge}</span>}
          </NavLink>
          <NavLink to="/withdrawals" className={({ isActive }) => 'tab-btn' + (isActive ? ' active' : '')}
            onClick={() => setWdBadge(0)}>
            提现中心{wdBadge > 0 && <span className="tab-badge orange">{wdBadge}</span>}
          </NavLink>
          <NavLink to="/users"       className={({ isActive }) => 'tab-btn' + (isActive ? ' active' : '')}>用户管理</NavLink>
        </div>
        <div className="top-nav-right">
          <div className="nav-user">
            <div className="nav-avatar">{(user.nickName || user.username)[0].toUpperCase()}</div>
            <span className="nav-username">{user.nickName || user.username}</span>
          </div>
          <button className="nav-logout" onClick={logout}>退出</button>
        </div>
      </div>

      {/* Online staff bar */}
      <OnlineBar />

      {/* Main content */}
      <main className="app-main">
        <Routes>
          <Route path="/"            element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"   element={<DashboardScreen />} />
          <Route path="/chat"        element={<ChatScreen onUnreadChange={setUnread} autoOpenSessionId={pendingChatId} onAutoOpenDone={() => setPendingChatId(null)} />} />
          <Route path="/orders"      element={<OrdersScreen />} />
          <Route path="/withdrawals" element={<WithdrawalsScreen />} />
          <Route path="/users"       element={<UsersScreen />} />
        </Routes>
      </main>

      {/* Toast notifications */}
      <ChatToast toasts={toasts} onDismiss={dismissToast} onOpen={handleToastOpen} />
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
