import { useEffect, useRef, useCallback } from 'react'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'
import { playNewChat, playNewOrder, playNewWithdrawal } from '../utils/sound'

export type NewChatNotification = {
  id: number
  userId: number
  userName: string
  orderNo: string | null
  createTs: number
}

export type NotificationEvent =
  | { type: 'chat';       chats:       NewChatNotification[] }
  | { type: 'order';      count:       number }
  | { type: 'withdrawal'; count:       number }

// ── Unified polling — one request every 8s instead of 3 requests every 5s ──
// Reduces server load by 75% while keeping notifications responsive
export function useChatNotifications(
  onEvent: (event: NotificationEvent) => void
) {
  const { user } = useAuth()
  const sinceRef        = useRef(Date.now())
  const prevOrderCount  = useRef(-1)
  const prevWdCount     = useRef(-1)
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlightRef     = useRef(false)  // prevent overlapping requests

  const check = useCallback(async () => {
    if (!user || inFlightRef.current) return
    inFlightRef.current = true
    try {
      // Single unified endpoint — one request instead of 3
      const res = await client.get('/tuka/chat/admin/dashboard-poll', {
        params: { since: sinceRef.current }
      })
      const data = res.data?.data || {}

      // New chat sessions
      const newChats: NewChatNotification[] = data.newChats || []
      if (newChats.length > 0) {
        const maxTs = Math.max(...newChats.map((c: any) => c.createTs))
        sinceRef.current = maxTs
        playNewChat()
        onEvent({ type: 'chat', chats: newChats })
      }

      // Pending orders delta
      const orderCount = data.pendingOrders ?? 0
      if (prevOrderCount.current >= 0 && orderCount > prevOrderCount.current) {
        playNewOrder()
        onEvent({ type: 'order', count: orderCount - prevOrderCount.current })
      }
      prevOrderCount.current = orderCount

      // Pending withdrawals delta
      const wdCount = data.pendingWithdrawals ?? 0
      if (prevWdCount.current >= 0 && wdCount > prevWdCount.current) {
        playNewWithdrawal()
        onEvent({ type: 'withdrawal', count: wdCount - prevWdCount.current })
      }
      prevWdCount.current = wdCount

    } catch {
      // Fallback: if unified endpoint doesn't exist yet, use individual calls
      try {
        const [chatRes, orderRes, wdRes] = await Promise.all([
          client.get('/tuka/chat/admin/new-sessions', { params: { since: sinceRef.current } }),
          client.get('/tuka/order/list', { params: { status: 'pending', pageSize: 1 } }),
          client.get('/tuka/withdrawal/list', { params: { status: 'pending', pageSize: 1 } }),
        ])

        const newChats: NewChatNotification[] = chatRes.data?.data || []
        if (newChats.length > 0) {
          const maxTs = Math.max(...newChats.map(c => c.createTs))
          sinceRef.current = maxTs
          playNewChat()
          onEvent({ type: 'chat', chats: newChats })
        }

        const orderCount = orderRes.data?.total || 0
        if (prevOrderCount.current >= 0 && orderCount > prevOrderCount.current) {
          playNewOrder()
          onEvent({ type: 'order', count: orderCount - prevOrderCount.current })
        }
        prevOrderCount.current = orderCount

        const wdCount = wdRes.data?.total || 0
        if (prevWdCount.current >= 0 && wdCount > prevWdCount.current) {
          playNewWithdrawal()
          onEvent({ type: 'withdrawal', count: wdCount - prevWdCount.current })
        }
        prevWdCount.current = wdCount
      } catch { /* silently ignore */ }
    } finally {
      inFlightRef.current = false
    }
  }, [user, onEvent])

  useEffect(() => {
    if (!user) return
    // Initial counts (no notification on first load) — parallel
    Promise.all([
      client.get('/tuka/order/list', { params: { status: 'pending', pageSize: 1 } })
        .then(r => { prevOrderCount.current = r.data?.total || 0 }),
      client.get('/tuka/withdrawal/list', { params: { status: 'pending', pageSize: 1 } })
        .then(r => { prevWdCount.current = r.data?.total || 0 }),
    ]).catch(() => {})

    // Poll every 8s instead of 5s — 37% fewer requests, still responsive
    timerRef.current = setInterval(check, 8000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [user, check])
}
