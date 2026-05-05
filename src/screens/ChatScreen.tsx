import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  getSessions, getMessages, pollMessages, pollSession, sendReply,
  claimSession, closeSession, getUserOrders, getUserProfile, transferSession,
} from '../api/chat'
import type { ChatSession, ChatMessage, UserOrder } from '../types'
import { useAuth } from '../context/AuthContext'
import client from '../api/client'
import { playNewMessage } from '../utils/sound'
import './ChatScreen.css'

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
  const myAvatar = null // could add agent avatar later

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
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferTo,   setTransferTo]   = useState('')
  const [transferring, setTransferring] = useState(false)
  const [staffList,    setStaffList]    = useState<Array<{
    username: string; nickName: string; isOnline: boolean; activeSessions: number
  }>>([])
  const [loadingStaff, setLoadingStaff] = useState(false)

  const lastIdRef = useRef(0)
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const listRef   = useRef<HTMLDivElement>(null)

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
    const t = setInterval(loadSessions, 4000)  // refresh session list every 4s
    return () => clearInterval(t)
  }, [loadSessions])

  const activeSessionIdRef = useRef<number>(0)  // always current, used inside poll closure

  function openSession(s: ChatSession) {
    setActive(s); setMessages([]); setOrders([]); setProfile(null); setShowProfile(false)
    lastIdRef.current = 0
    activeSessionIdRef.current = s.id
    // Stop any existing poll immediately
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setLoadingMsg(true)
    // Mark session as read
    client.post(`/tuka/chat/admin/mark-read/${s.id}`).catch(() => {})
    // Load messages FIRST, then start poll with correct lastId
    getMessages(s.id).then(msgs => {
      setMessages(msgs)
      lastIdRef.current = msgs.length ? msgs[msgs.length - 1].id : 0
      scrollBottom()
      // Start poll AFTER we have the correct lastId
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(() => {
        const sid = activeSessionIdRef.current
        if (!sid) return
        pollSession(sid, lastIdRef.current).then(result => {
          // Update messages
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
          // Update session status if it changed (e.g. auto-closed)
          setActive(prev => {
            if (!prev || prev.id !== sid) return prev
            if (prev.status !== result.status) {
              return { ...prev, status: result.status as any, agentId: result.agentId, agentName: result.agentName }
            }
            return prev
          })
        }).catch(() => {})
      }, 1500)
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

  // Status label matching spec: pending=待接入, claimed=已接入, closed=已关闭
  const statusText = (s: ChatSession) => {
    if (s.status === 'claimed') return `已接入 · ${s.agentName || ''}`
    if (s.status === 'closed')  return '已关闭'
    return '待接入'
  }

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
              👁 只读模式 — 已由 <strong>{active.agentName}</strong> 接入，您可查看但不能回复
            </div>
          )}

          <div className="chat-body">
            {/* Messages */}
            <div className="messages" ref={listRef}>
              {loadingMsg && <div className="msg-loading">加载中…</div>}
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
                const isMe = m.senderType === 'agent' && m.senderId === myUserId
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
                          ? <img src={m.content} className="bubble-img" alt=""
                              onClick={() => setLightbox(m.content)} />
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
                <label className="act-icon-btn" title="表情">😊
                  {/* emoji placeholder */}
                </label>
                <label className="act-icon-btn img-label" title="发送图片">
                  🖼
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                </label>
                <button className="send-btn" onClick={handleSend} disabled={!input.trim() || sending}>
                  {sending ? '…' : '发送'}
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
          <div className="cp-icon">💬</div>
          <div className="cp-text">选择一个会话开始</div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="lightbox-img" alt="" onClick={e => e.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setLightbox(null)}>✕</button>
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
