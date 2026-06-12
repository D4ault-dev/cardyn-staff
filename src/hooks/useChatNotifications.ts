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
  | { type: 'chat';       chats: NewChatNotification[] }
  | { type: 'order';      count: number }
  | { type: 'withdrawal'; count: number }

// ── Single poller — replaces all individual pending-count polls ───────────────
export function useChatNotifications(
  onEvent: (event: NotificationEvent) => void,
  setPendingCount?: (n: number) => void,
  setWdCount?: (n: number) => void,
) {
  const { user } = useAuth()
  const sinceRef       = useRef(Date.now())
  const prevOrderRef   = useRef(-1)
  const prevWdRef      = useRef(-1)
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlightRef    = useRef(false)
  const failCountRef   = useRef(0)  // consecutive failures — back off when network is down

  const check = useCallback(async () => {
    if (!user || inFlightRef.current) return
    inFlightRef.current = true
    try {
      const [orderRes, wdRes, chatRes] = await Promise.allSettled([
        client.get('/tuka/order/list',      { params: { status: 'pending', pageSize: 1 } }),
        client.get('/tuka/withdrawal/list', { params: { status: 'pending', pageSize: 1 } }),
        client.get('/tuka/chat/admin/new-sessions', { params: { since: sinceRef.current } }),
      ])

      // If all 3 failed — network is down, don't process
      const allFailed = [orderRes, wdRes, chatRes].every(r => r.status === 'rejected')
      if (allFailed) {
        failCountRef.current++
        return
      }
      failCountRef.current = 0  // reset on any success

      if (orderRes.status === 'fulfilled') {
        const n = orderRes.value.data?.total || 0
        setPendingCount?.(n)
        if (prevOrderRef.current >= 0 && n > prevOrderRef.current) {
          playNewOrder()
          onEvent({ type: 'order', count: n - prevOrderRef.current })
        }
        prevOrderRef.current = n
      }

      if (wdRes.status === 'fulfilled') {
        const n = wdRes.value.data?.total || 0
        setWdCount?.(n)
        if (prevWdRef.current >= 0 && n > prevWdRef.current) {
          playNewWithdrawal()
          onEvent({ type: 'withdrawal', count: n - prevWdRef.current })
        }
        prevWdRef.current = n
      }

      if (chatRes.status === 'fulfilled') {
        const newChats: NewChatNotification[] = chatRes.value.data?.data || []
        if (newChats.length > 0) {
          const maxTs = Math.max(...newChats.map(c => c.createTs))
          sinceRef.current = maxTs
          playNewChat()
          onEvent({ type: 'chat', chats: newChats })
        }
      }
    } catch { /* silently ignore */ }
    finally { inFlightRef.current = false }
  }, [user, onEvent])

  useEffect(() => {
    if (!user) return
    // Seed initial counts after a 1s delay — let login/page data load first
    const seedTimer = setTimeout(() => {
      Promise.allSettled([
        client.get('/tuka/order/list',      { params: { status: 'pending', pageSize: 1 } })
          .then(r => {
            const n = r.data?.total || 0
            prevOrderRef.current = n
            setPendingCount?.(n)
          }),
        client.get('/tuka/withdrawal/list', { params: { status: 'pending', pageSize: 1 } })
          .then(r => {
            const n = r.data?.total || 0
            prevWdRef.current = n
            setWdCount?.(n)
          }),
      ])
    }, 1000)

    // Poll every 2s for near real-time order/withdrawal/chat notifications
    timerRef.current = setInterval(check, 2_000)
    return () => {
      clearTimeout(seedTimer)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [user, check])
}
