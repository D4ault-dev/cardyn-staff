import client from './client'
import type { ChatSession, ChatMessage, UserOrder } from '../types'
import { swrFetch, invalidatePrefix } from './cache'

export type { ChatSession, ChatMessage, UserOrder }

export type PollResult = {
  messages:  ChatMessage[]
  status:    string
  agentId:   number | null
  agentName: string | null
}

export const getSessions = (
  status = '',
  options: { onFresh?: (rows: ChatSession[]) => void; ttl?: number } = {},
) =>
  swrFetch(
    'sessions:' + status,
    () =>
      client
        .get('/tuka/chat/admin/sessions', { params: { status, pageSize: 100 } })
        .then(r => (r.data.rows || []) as ChatSession[]),
    { onFresh: options.onFresh, ttl: options.ttl ?? 5000 },  // 5s TTL — reduced from 2s
  )

export const getMessages = (sessionId: number) =>
  client.get(`/tuka/chat/messages/${sessionId}`, { params: { pageSize: 100 } })
    .then(r => (r.data.data || []) as ChatMessage[])

// Returns messages + session status so UI can react to auto-close/claim changes
export const pollSession = (sessionId: number, lastId: number): Promise<PollResult> =>
  client.get(`/tuka/chat/poll/${sessionId}`, { params: { lastId } })
    .then(r => {
      const data = r.data.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        return {
          messages:  (data.messages  || []) as ChatMessage[],
          status:    data.status    || 'open',
          agentId:   data.agentId   ?? null,
          agentName: data.agentName ?? null,
        }
      }
      // Fallback: old plain-array format
      return { messages: (Array.isArray(data) ? data : []) as ChatMessage[], status: 'open', agentId: null, agentName: null }
    })

// Backward compat
export const pollMessages = (sessionId: number, lastId: number) =>
  pollSession(sessionId, lastId).then(r => r.messages)

export const sendReply = (sessionId: number, content: string) =>
  client.post('/tuka/chat/admin/reply', { sessionId, content })
    .then(r => r.data.data as ChatMessage)

export const claimSession = (sessionId: number) => {
  invalidatePrefix('sessions:')
  return client.post(`/tuka/chat/admin/claim/${sessionId}`)
}

export const closeSession = (sessionId: number) => {
  invalidatePrefix('sessions:')
  return client.post(`/tuka/chat/admin/close/${sessionId}`)
}

export const getUserOrders = (sessionId: number) =>
  client.get(`/tuka/chat/admin/user-orders/${sessionId}`)
    .then(r => (r.data.data || []) as UserOrder[])

export const getUserProfile = (sessionId: number) =>
  client.get(`/tuka/chat/admin/user-profile/${sessionId}`)
    .then(r => r.data.data as {
      userId: number; phone: string; email: string; realName: string
      avatar: string | null; balance: number; totalSales: number
      totalWithdrawn: number; tradeCount: number; level: number
      country: string; status: number; createTime: string
      totalOrders: number; paidOrders: number
    } | null)

export const transferSession = (sessionId: number, toUsername: string) =>
  client.post(`/tuka/chat/admin/transfer/${sessionId}`, { toUsername })
