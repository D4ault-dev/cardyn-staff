import { ref, onUnmounted } from 'vue'
import request from '@/utils/request'

/**
 * Single unified poller — one request every 15s instead of 3 every 10s.
 * Uses a combined dashboard-poll endpoint that returns all counts in one hit.
 * Falls back to individual requests if the combined endpoint isn't available.
 */
export function useNotifications({ onChat, onOrder, onWithdrawal }) {
  const since       = ref(Date.now())
  const prevOrders  = ref(-1)
  const prevWd      = ref(-1)
  let   timer       = null
  let   inFlight    = false

  async function check() {
    if (inFlight || document.hidden) return  // skip when tab not visible
    inFlight = true
    try {
      // Try combined endpoint first — 1 request instead of 3
      const res = await request({
        url: '/tuka/staff/dashboard-poll',
        params: { since: since.value }
      })
      const d = res.data || {}

      const orderCount = d.pendingOrders ?? 0
      const wdCount    = d.pendingWithdrawals ?? 0
      const newChats   = d.newSessions || []

      if (prevOrders.value >= 0 && orderCount > prevOrders.value)
        onOrder?.(orderCount - prevOrders.value)
      prevOrders.value = orderCount

      if (prevWd.value >= 0 && wdCount > prevWd.value)
        onWithdrawal?.(wdCount - prevWd.value)
      prevWd.value = wdCount

      if (newChats.length > 0) {
        since.value = Math.max(...newChats.map(c => c.createTs || Date.now()))
        onChat?.(newChats)
      }
    } catch {
      // Fallback: individual requests (old behaviour)
      try {
        const [orderRes, wdRes, chatRes] = await Promise.allSettled([
          request({ url: '/tuka/order/list',      params: { status: 'pending', pageSize: 1 } }),
          request({ url: '/tuka/withdrawal/list', params: { status: 'pending', pageSize: 1 } }),
          request({ url: '/tuka/chat/admin/new-sessions', params: { since: since.value } }),
        ])
        if (orderRes.status === 'fulfilled') {
          const n = orderRes.value.total || 0
          if (prevOrders.value >= 0 && n > prevOrders.value) onOrder?.(n - prevOrders.value)
          prevOrders.value = n
        }
        if (wdRes.status === 'fulfilled') {
          const n = wdRes.value.total || 0
          if (prevWd.value >= 0 && n > prevWd.value) onWithdrawal?.(n - prevWd.value)
          prevWd.value = n
        }
        if (chatRes.status === 'fulfilled') {
          const chats = chatRes.value.data || []
          if (chats.length > 0) {
            since.value = Math.max(...chats.map(c => c.createTs))
            onChat?.(chats)
          }
        }
      } catch { /* ignore */ }
    } finally {
      inFlight = false
    }
  }

  // Run once immediately (after a short delay so the app finishes mounting)
  setTimeout(check, 3000)
  // Poll every 15s — balanced between real-time updates and server load
  timer = setInterval(check, 15_000)

  function stop() { if (timer) clearInterval(timer) }
  onUnmounted(stop)

  return { stop }
}
