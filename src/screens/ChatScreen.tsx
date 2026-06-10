import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  getSessions, getMessages, pollSession, sendReply,
  claimSession, closeSession, getUserOrders, getUserProfile, transferSession,
} from '../api/chat'
import type { ChatSession, ChatMessage, UserOrder } from '../types'
import { useAuth } from '../context/AuthContext'
import { ChatWebSocket } from '../api/ws'
import client from '../api/client'
import { playNewMessage } from '../utils/sound'
import { resolveUrl } from '../utils/resolveUrl'
import './ChatScreen.css'

async function copyImageToClipboard(url: string): Promise<void> {
  const res = await fetch(url)
  const blob = await res.blob()
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
    }
    img.onerror = reject
    img.src = URL.createObjectURL(blob)
  })
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
}

type UserProfile = {
  userId: number; phone: string; email: string; realName: string
  avatar: string | null; balance: number; totalSales: number
  totalWithdrawn: number; tradeCount: number; level: number
  country: string; status: number; createTime: string
  totalOrders: number; paidOrders: number
}

function fmtNgn(n: number) { return '₦' + (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 }) }

export default function ChatScreen({ onUnreadChange, autoOpenSessionId, onAutoOpenDone }: {
  onUnreadChange: (n: number) => void
  autoOpenSessionId?: number | null
  onAutoOpenDone?: () => void
}) {
  const { user } = useAuth()
  const myUserId = user?.userId ?? 0

  const [sessions,     setSessions]     = useState<ChatSession[]>([])
  const [active,       setActive]       = useState<ChatSession | null>(null)
  const [messages,     setMessages]     = useState<ChatMessage[]>([])
  const [orders,       setOrders]       = useState<UserOrder[]>([])
  const [profile,      setProfile]      = useState<UserProfile | null>(null)
  const [filter,       setFilter]       = useState<string>('')  // default 全部
  const [search,       setSearch]       = useState('')
  const [input,        setInput]        = useState('')
  const [sending,      setSending]      = useState(false)
  const [loadingMsg,   setLoadingMsg]   = useState(false)
  const [showProfile,  setShowProfile]  = useState(false)
  const [lightbox,     setLightbox]     = useState<string | null>(null)
  const [copyMsg,      setCopyMsg]      = useState<string | null>(null)

  function copyImg(url: string) {
    copyImageToClipboard(url)
      .then(() => { setCopyMsg('已复制！'); setTimeout(() => setCopyMsg(null), 2000) })
      .catch(() => { setCopyMsg('复制失败'); setTimeout(() => setCopyMsg(null), 2000) })
  }
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferTo,   setTransferTo]   = useState('')
  const [transferring, setTransferring] = useState(false)
  const [staffList,    setStaffList]    = useState<Array<{
    username: string; nickName: string; isOnline: boolean; activeSessions: number
  }>>([])
  const [loadingStaff, setLoadingStaff] = useState(false)

  const lastIdRef = useRef(0)
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const wsRef     = useRef<ChatWebSocket | null>(null)
  const listRef   = useRef<HTMLDivElement>(null)
  const [wsConnected, setWsConnected] = useState(false)

  // ── WebSocket — connect once on mount, reconnects automatically ───────────
  useEffect(() => {
    if (!user) return
    const token = localStorage.getItem('cardyn_staff_token') || ''
    const ws = new ChatWebSocket(token)
    wsRef.current = ws

    ws.onConnect    = () => setWsConnected(true)
    ws.onDisconnect = () => setWsConnected(false)

    ws.onMessage = (frame) => {
      if (frame.type === 'message') {
        const msg = frame.data as ChatMessage & { sessionId?: number; session_id?: number }
        const sid = msg.sessionId ?? msg.session_id
        // Only append if this message belongs to the currently open session
        setActive(prev => {
          if (!prev || prev.id !== sid) return prev
          setMessages(prevMsgs => {
            if (prevMsgs.some(m => m.id === msg.id)) return prevMsgs
            lastIdRef.current = msg.id
            const hasUserMsg = msg.senderType === 'user'
            if (hasUserMsg) playNewMessage()
            scrollBottom()
            return [...prevMsgs, msg]
          })
          return prev
        })
        // Also refresh session list unread counts
        loadSessions()
      } else if (frame.type === 'status') {
        const { sessionId, status, agentId, agentName } = frame.data
        setActive(prev => {
          if (!prev || prev.id !== sessionId) return prev
          return { ...prev, status: status as any, agentId, agentName }
        })
      }
    }

    ws.connect()
    return () => ws.disconnect()
  }, [user]) // eslint-disable-line

  const scrollBottom = useCallback(() => {
    setTimeout(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }, 60)
  }, [])

  const loadSessions = useCallback(() => {
    getSessions(filter).then(rows => {
      setSessions(rows)
      // Only count unread from non-closed sessions
      onUnreadChange(rows.filter(r => r.status !== 'closed').reduce((s, r) => s + (r.unreadCount || 0), 0))
      setActive(prev => prev ? (rows.find(r => r.id === prev.id) || prev) : prev)
    }).catch(() => {})
  }, [filter, onUnreadChange])

  useEffect(() => {
    loadSessions()
    // Refresh session list every 15s when a chat is open,
    // every 30s otherwise to save bandwidth
    // Pause when window is hidden (minimized/background tab) to save CPU
    const interval = active ? 15000 : 30000
    const t = setInterval(() => {
      if (!document.hidden) loadSessions()
    }, interval)
    return () => clearInterval(t)
  }, [loadSessions, active])

  const activeSessionIdRef = useRef<number>(0)  // always current, used inside poll closure

  function openSession(s: ChatSession) {
    // Leave previous session's WS subscription
    if (activeSessionIdRef.current && activeSessionIdRef.current !== s.id) {
      wsRef.current?.leaveSession(activeSessionIdRef.current)
    }
    setActive(s); setMessages([]); setOrders([]); setProfile(null); setShowProfile(false)
    lastIdRef.current = 0
    activeSessionIdRef.current = s.id
    // Stop any existing poll immediately
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setLoadingMsg(true)
    // Mark session as read
    client.post(`/tuka/chat/admin/mark-read/${s.id}`).catch(() => {})
    // Join WebSocket session for real-time messages
    wsRef.current?.joinSession(s.id)
    // Load messages FIRST, then start fallback poll only if WS is not connected
    getMessages(s.id).then(msgs => {
      setMessages(msgs)
      lastIdRef.current = msgs.length ? msgs[msgs.length - 1].id : 0
      scrollBottom()
      // Fallback poll — only runs when WebSocket is disconnected
      if (pollRef.current) clearInterval(pollRef.current)
      let pollInFlight = false
      pollRef.current = setInterval(() => {
        // Skip poll if WS is connected — WS handles delivery
        if (wsRef.current?.isConnected) return
        // Skip if previous poll still pending — prevents pile-up
        if (pollInFlight) return
        const sid = activeSessionIdRef.current
        if (!sid) return
        pollInFlight = true
        pollSession(sid, lastIdRef.current).then(result => {
          if (result.messages.length > 0) {
            lastIdRef.current = result.messages[result.messages.length - 1].id
            const hasUserMsg = result.messages.some(m => m.senderType === 'user')
            if (hasUserMsg) playNewMessage()
            setMessages(prev => {
              const ids = new Set(prev.map(m => m.id))
              const fresh = result.messages.filter(m => !ids.has(m.id))
              if (!fresh.length) return prev
              scrollBottom()
              return [...prev, ...fresh]
            })
          }
          setActive(prev => {
            if (!prev || prev.id !== sid) return prev
            if (prev.status !== result.status) {
              return { ...prev, status: result.status as any, agentId: result.agentId, agentName: result.agentName }
            }
            return prev
          })
        }).catch(() => {})
          .finally(() => { pollInFlight = false })
      }, 5000)  // 5s fallback — was 1.5s, only used when WS is down
    }).finally(() => setLoadingMsg(false))
    getUserOrders(s.id).then(setOrders).catch(() => {})
    getUserProfile(s.id).then(p => { if (p) setProfile(p) }).catch(() => {})
  }

  // Auto-open session from toast notification
  useEffect(() => {
    if (!autoOpenSessionId || sessions.length === 0) return
    const target = sessions.find(s => s.id === autoOpenSessionId)
    if (target) { openSession(target); onAutoOpenDone?.() }
  }, [autoOpenSessionId, sessions])

  async function handleSend() {
    if (!input.trim() || !active || sending) return
    const text = input.trim(); setInput(''); setSending(true)
    try {
      const msg = await sendReply(active.id, text)
      setMessages(prev => [...prev, msg])
      lastIdRef.current = msg.id
      scrollBottom()
    } catch (e: any) { setInput(text); alert(e.message) }
    finally { setSending(false) }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!active || !isAssigned) return
    const file = e.target.files?.[0]; if (!file) return
    const formData = new FormData()
    formData.append('sessionId', String(active.id))
    formData.append('file', file)
    try {
      const res = await client.post('/tuka/chat/admin/replyImage', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const msg = res.data.data as ChatMessage
      setMessages(prev => [...prev, msg])
      lastIdRef.current = msg.id
      scrollBottom()
    } catch (e: any) { alert(e.message) }
    e.target.value = ''
  }

  async function handleClaim() {
    if (!active) return
    try {
      await claimSession(active.id)
      // Switch to 全部 so the claimed session stays visible (it moves from 'open' to 'claimed')
      setFilter('')
      // Immediately reload sessions with new filter
      getSessions('').then(rows => {
        setSessions(rows)
        onUnreadChange(rows.filter(r => r.status !== 'closed').reduce((s, r) => s + (r.unreadCount || 0), 0))
      }).catch(() => {})
      // Update active session state and reload messages (claim sends a greeting)
      const updatedSession = { ...active, status: 'claimed' as const, agentId: myUserId, agentName: user?.username || '' }
      openSession(updatedSession)
    } catch (e: any) { alert(e.message) }
  }

  async function handleClose() {
    if (!active || !confirm('确认关闭此对话？')) return
    try { await closeSession(active.id); setActive(prev => prev ? { ...prev, status: 'closed' } : prev); loadSessions() }
    catch (e: any) { alert(e.message) }
  }

  async function handleTransfer() {
    if (!active || !transferTo.trim()) return
    setTransferring(true)
    try {
      await transferSession(active.id, transferTo.trim())
      setTransferOpen(false); setTransferTo(''); loadSessions()
    } catch (e: any) { alert(e.message) }
    finally { setTransferring(false) }
  }

  async function openTransferModal() {
    setTransferOpen(true); setTransferTo(''); setLoadingStaff(true)
    try {
      // Fetch both staff-list (active sessions) and online status in parallel
      const [listRes, onlineRes] = await Promise.all([
        client.get('/tuka/chat/admin/staff-list'),
        client.get('/tuka/staff/online'),
      ])
      const list: any[]   = listRes.data?.data   || []
      const online: any[] = onlineRes.data?.data  || []
      const onlineMap: Record<string, boolean> = {}
      online.forEach((o: any) => { if (o.name) onlineMap[o.name] = o.isOnline })
      const merged = list
        .filter(s => s.username !== user?.username)  // exclude self
        .map(s => ({
          username:       s.username,
          nickName:       s.nickName || s.username,
          isOnline:       onlineMap[s.username] ?? false,
          activeSessions: s.activeSessions || 0,
        }))
        // Sort: free online first, then busy online, then offline
        .sort((a, b) => {
          const scoreA = a.isOnline ? (a.activeSessions === 0 ? 0 : 1) : 2
          const scoreB = b.isOnline ? (b.activeSessions === 0 ? 0 : 1) : 2
          return scoreA - scoreB
        })
      setStaffList(merged)
    } catch { setStaffList([]) }
    finally { setLoadingStaff(false) }
  }

  const isAssigned  = active?.agentId === myUserId
  const canReply    = active?.status === 'claimed' && isAssigned
  const canClaim    = active?.status === 'open'

  // Smart timestamp: show time only for today, date+time for older messages
  function formatMsgTime(t: string | undefined) {
    if (!t) return ''
    const today = new Date().toISOString().slice(0, 10)
    const msgDate = t.slice(0, 10)
    if (msgDate === today) return t.slice(11, 16)  // just HH:mm
    return t.slice(5, 16)  // MM-DD HH:mm
  }

  // Filter sessions by search
  const filteredSessions = sessions.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return (s.userName || '').toLowerCase().includes(q) ||
           String(s.userId).includes(q) ||
           (s.orderNo || '').toLowerCase().includes(q)
  })

  const statusColor = (s: string) =>
    s === 'claimed' ? '#52c41a' : s === 'closed' ? '#999' : '#fa8c16'

  return (
    <div className="chat-root">
      {/* Left: session list */}
      <div className="chat-sessions">
        {/* Search */}
        <div className="sessions-search">
          <input className="search-input" placeholder="搜索会话" value={search}
            onChange={e => setSearch(e.target.value)} />
          <button className="search-btn" onClick={() => {}}>搜索</button>
        </div>

        {/* Filter tabs */}
        <div className="sessions-tabs">
          {[['', '全部'], ['open', '待接'], ['claimed', '进行中'], ['closed', '已关闭']].map(([v, l]) => (
            <button key={v} className={'stab' + (filter === v ? ' active' : '')}
              onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>

        <div className="sessions-list">
          {filteredSessions.length === 0 && <div className="sessions-empty">暂无会话</div>}
          {filteredSessions.map(s => (
            <div key={s.id} className={'session-item' + (active?.id === s.id ? ' active' : '')}
              onClick={() => openSession(s)}>
              <div className="si-avatar">
                <span>{(s.userName || 'U')[0].toUpperCase()}</span>
              </div>
              <div className="si-info">
                <div className="si-top">
                  <span className="si-uid">{s.userId}</span>
                  <span className="si-name">{s.userName || `用户#${s.userId}`}</span>
                  {s.unreadCount > 0 && s.status !== 'closed' && <span className="si-badge">{s.unreadCount}</span>}
                </div>
                <div className="si-msg">{s.lastMessage || '暂无消息'}</div>
              </div>
              <span className="si-dot" style={{ background: statusColor(s.status) }} />
            </div>
          ))}
        </div>
      </div>

      {/* Right: chat window */}
      {active ? (
        <div className="chat-window">
          {/* Chat header */}
          <div className="chat-header">
            <div className="ch-left">
              <div className="ch-avatar">{(active.userName || 'U')[0].toUpperCase()}</div>
              <div>
                <div className="ch-name">{active.userName || `用户#${active.userId}`}
                  <span className="ch-uid"> #{active.userId}</span>
                </div>
                <div className="ch-status" style={{ color: statusColor(active.status) }}>
                  ● {active.status === 'claimed' ? `已接入 · ${active.agentName}` : active.status === 'open' ? '等待接入' : '已关闭'}
                </div>
              </div>
            </div>
            <div className="ch-actions">
              {/* WS connection indicator */}
              <span className="ws-indicator" title={wsConnected ? 'WebSocket 已连接' : '轮询模式'}>
                <span className="ws-dot" style={{ background: wsConnected ? '#52c41a' : '#fa8c16' }} />
                {wsConnected ? '实时' : '轮询'}
              </span>
              <button className="ch-btn view" onClick={() => setShowProfile(v => !v)}>
                {showProfile ? '隐藏资料' : '查看资料'}
              </button>
              {canClaim && <button className="ch-btn claim" onClick={handleClaim}>接入</button>}
              {isAssigned && active.status === 'claimed' && (
                <button className="ch-btn transfer" onClick={openTransferModal}>转接</button>
              )}
              {isAssigned && active.status !== 'closed' && (
                <button className="ch-btn close-btn" onClick={handleClose}>关闭</button>
              )}
            </div>
          </div>

          {/* Read-only banner */}
          {active.status === 'claimed' && !isAssigned && (
            <div className="readonly-banner">
              只读模式 — 已由 <strong>{active.agentName}</strong> 接入，您可查看但不能回复
            </div>
          )}

          <div className="chat-body">
            {/* Messages */}
            <div className="messages" ref={listRef}>
              {loadingMsg && (
                <div className="msg-loading">
                  <div className="spinner spinner-dark" style={{ width: 24, height: 24 }} />
                </div>
              )}
              {messages.map((m, idx) => {
                // Date separator
                const prevMsg = messages[idx - 1]
                const showDate = !prevMsg || m.createTime?.slice(0,10) !== prevMsg.createTime?.slice(0,10)

                if (m.senderType === 'system') return (
                  <React.Fragment key={m.id}>
                    {showDate && m.createTime && (
                      <div className="msg-date-sep"><span>{m.createTime.slice(0,10)}</span></div>
                    )}
                    <div className="msg-system"><span>{m.content}</span></div>
                  </React.Fragment>
                )
                const isAgent = m.senderType === 'agent'
                return (
                  <React.Fragment key={m.id}>
                    {showDate && m.createTime && (
                      <div className="msg-date-sep"><span>{m.createTime.slice(0,10)}</span></div>
                    )}
                    <div className={'msg-row' + (isAgent ? ' msg-me' : '')}>
                      {!isAgent && <div className="msg-avatar user-av">{(m.senderName || 'U')[0]}</div>}
                      <div className={'bubble' + (isAgent ? ' bubble-me' : ' bubble-user')}>
                        {!isAgent && <div className="bubble-name">{m.senderName}</div>}
                        {m.msgType === 'image'
                          ? <img src={resolveUrl(m.content)} className="bubble-img" alt=""
                              onClick={() => setLightbox(resolveUrl(m.content))} />
                          : <div className="bubble-text">{m.content}</div>
                        }
                        <div className="bubble-time">{formatMsgTime(m.createTime)}</div>
                      </div>
                      {isAgent && (
                        <div className="msg-avatar agent-av">
                          {user?.nickName?.[0]?.toUpperCase() || 'A'}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                )
              })}
              {messages.length === 0 && !loadingMsg && (
                <div className="msg-empty">暂无消息</div>
              )}
            </div>

            {/* User profile panel */}
            {showProfile && profile && (
              <div className="profile-panel">
                <div className="pp-header">用户资料</div>
                <div className="pp-avatar">{(profile.realName || profile.phone || 'U')[0].toUpperCase()}</div>
                <div className="pp-name">{profile.realName || '—'}</div>
                <div className="pp-phone">{profile.phone}</div>
                <div className="pp-stats">
                  <div className="pp-stat"><div className="pp-stat-val">Lv{profile.level}</div><div className="pp-stat-lbl">等级</div></div>
                  <div className="pp-stat"><div className="pp-stat-val">{profile.tradeCount}</div><div className="pp-stat-lbl">交易</div></div>
                  <div className="pp-stat"><div className="pp-stat-val">{profile.totalOrders}</div><div className="pp-stat-lbl">订单</div></div>
                </div>
                <div className="pp-rows">
                  <div className="pp-row"><span>余额</span><span className="green">₦{(profile.balance||0).toLocaleString()}</span></div>
                  <div className="pp-row"><span>总销售</span><span className="green">₦{(profile.totalSales||0).toLocaleString()}</span></div>
                  <div className="pp-row"><span>总提现</span><span>₦{(profile.totalWithdrawn||0).toLocaleString()}</span></div>
                  <div className="pp-row"><span>国家</span><span>{profile.country || '—'}</span></div>
                  <div className="pp-row"><span>邮箱</span><span>{profile.email || '—'}</span></div>
                  <div className="pp-row"><span>注册</span><span>{profile.createTime?.slice(0,10)}</span></div>
                  <div className="pp-row"><span>状态</span><span style={{color: profile.status===0?'#52c41a':'#ff4d4f'}}>{profile.status===0?'正常':'封禁'}</span></div>
                </div>
                <div className="pp-orders-title">最近订单</div>
                {orders.slice(0, 5).map(o => (
                  <div key={o.id} className="pp-order">
                    <div className="pp-order-no">{o.orderNo}</div>
                    <div className="pp-order-info">{o.categoryName} · ₦{(o.ngnAmount||0).toLocaleString()}</div>
                    <span className={'pp-order-status ' + o.status}>{o.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Input bar */}
          {canReply ? (
            <div className="chat-input-bar">
              <textarea className="chat-input" placeholder="输入消息"
                value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                rows={2} />
              <div className="input-actions">
                <label className="act-icon-btn img-label" title="发送图片">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                </label>
                <button className="send-btn" onClick={handleSend} disabled={!input.trim() || sending}>
                  {sending ? <span className="spinner-sm" /> : '发送'}
                </button>
              </div>
            </div>
          ) : active.status === 'closed' ? (
            <div className="chat-closed-bar">对话已关闭</div>
          ) : active.status === 'open' ? (
            <div className="chat-closed-bar">点击「接入」开始回复</div>
          ) : (
            <div className="chat-closed-bar">仅 <strong>{active.agentName}</strong> 可回复</div>
          )}
        </div>
      ) : (
        <div className="chat-placeholder">
          <div className="cp-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="56" height="56">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div className="cp-text">选择一个会话开始</div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="lightbox-img" alt="" onClick={e => e.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setLightbox(null)}>✕</button>
          <button
            onClick={e => { e.stopPropagation(); copyImg(lightbox) }}
            style={{
              position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '7px 22px',
              borderRadius: 6, fontSize: 13, border: 'none', cursor: 'pointer', backdropFilter: 'blur(4px)',
            }}>
            {copyMsg || '复制图片'}
          </button>
        </div>
      )}

      {/* Transfer modal — staff dropdown with status indicators */}
      {transferOpen && (
        <div className="modal-mask" onClick={() => setTransferOpen(false)}>
          <div className="transfer-modal" onClick={e => e.stopPropagation()}>
            <div className="tm-header">
              <span>转接会话</span>
              <button onClick={() => setTransferOpen(false)}>✕</button>
            </div>
            <div className="tm-body">
              <p className="tm-hint">选择要转接的客服：</p>

              {loadingStaff ? (
                <div className="tm-loading">加载客服列表…</div>
              ) : staffList.length === 0 ? (
                <div className="tm-loading">暂无可用客服</div>
              ) : (
                <div className="tm-staff-list">
                  {staffList.map(s => {
                    const isFree    = s.isOnline && s.activeSessions === 0
                    const isBusy    = s.isOnline && s.activeSessions > 0
                    const isOffline = !s.isOnline
                    const statusColor = isFree ? '#52c41a' : isBusy ? '#fa8c16' : '#bbb'
                    const statusLabel = isFree ? '空闲' : isBusy ? `忙碌(${s.activeSessions})` : '离线'
                    const isSelected  = transferTo === s.username
                    return (
                      <div
                        key={s.username}
                        className={'tm-staff-item' + (isSelected ? ' selected' : '') + (isOffline ? ' offline' : '')}
                        onClick={() => !isOffline && setTransferTo(s.username)}
                      >
                        <div className="tm-staff-avatar">{s.nickName[0].toUpperCase()}</div>
                        <div className="tm-staff-info">
                          <div className="tm-staff-name">{s.nickName}</div>
                          <div className="tm-staff-user">@{s.username}</div>
                        </div>
                        <div className="tm-staff-status">
                          <span className="tm-status-dot" style={{ background: statusColor }} />
                          <span className="tm-status-lbl" style={{ color: statusColor }}>{statusLabel}</span>
                        </div>
                        {isSelected && <span className="tm-check">✓</span>}
                      </div>
                    )
                  })}
                </div>
              )}

              <button className="tm-btn" onClick={handleTransfer}
                disabled={!transferTo || transferring || loadingStaff}>
                {transferring ? '转接中…' : transferTo ? `转接给 ${transferTo}` : '请选择客服'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
