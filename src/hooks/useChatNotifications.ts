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

export function useChatNotifications(
  onEvent: (event: NotificationEvent) => void
) {
  const { user } = useAuth()
  const sinceRef        = useRef(Date.now())
  const prevOrderCount  = useRef(-1)
  const prevWdCount     = useRef(-1)
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null)

  const check = useCallback(async () => {
    if (!user) return
    try {
      // 1. New chat sessions
      const chatRes = await client.get('/tuka/chat/admin/new-sessions', {
        params: { since: sinceRef.current }
      })
      const newChats: NewChatNotification[] = chatRes.data?.data || []
      if (newChats.length > 0) {
        const maxTs = Math.max(...newChats.map(c => c.createTs))
        sinceRef.current = maxTs
        playNewChat()
        onEvent({ type: 'chat', chats: newChats })
      }

      // 2. New pending orders
      const orderRes = await client.get('/tuka/order/list', {
        params: { status: 'pending', pageSize: 1 }
      })
      const orderCount = orderRes.data?.total || 0
      if (prevOrderCount.current >= 0 && orderCount > prevOrderCount.current) {
        playNewOrder()
        onEvent({ type: 'order', count: orderCount - prevOrderCount.current })
      }
      prevOrderCount.current = orderCount

      // 3. New pending withdrawals
      const wdRes = await client.get('/tuka/withdrawal/list', {
        params: { status: 'pending', pageSize: 1 }
      })
      const wdCount = wdRes.data?.total || 0
      if (prevWdCount.current >= 0 && wdCount > prevWdCount.current) {
        playNewWithdrawal()
        onEvent({ type: 'withdrawal', count: wdCount - prevWdCount.current })
      }
      prevWdCount.current = wdCount

    } catch { /* silently ignore */ }
  }, [user, onEvent])

  useEffect(() => {
    if (!user) return
    // Initial counts (no notification on first load)
    client.get('/tuka/order/list', { params: { status: 'pending', pageSize: 1 } })
      .then(r => { prevOrderCount.current = r.data?.total || 0 }).catch(() => {})
    client.get('/tuka/withdrawal/list', { params: { status: 'pending', pageSize: 1 } })
      .then(r => { prevWdCount.current = r.data?.total || 0 }).catch(() => {})

    timerRef.current = setInterval(check, 5000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [user, check])
}
