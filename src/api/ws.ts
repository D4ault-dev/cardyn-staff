/**
 * ChatWebSocket — manages a single persistent WebSocket connection to the backend.
 *
 * Usage:
 *   const ws = new ChatWebSocket(token)
 *   ws.onMessage = (frame) => { ... }
 *   ws.connect()
 *   ws.joinSession(sessionId)
 *   ws.leaveSession(sessionId)
 *   ws.disconnect()
 *
 * Frame types received:
 *   { type: 'message', data: ChatMessage }
 *   { type: 'status',  data: { sessionId, status, agentId, agentName } }
 *   { type: 'ping' }
 */

import { BASE_URL } from './client'

export type WsFrame =
  | { type: 'message'; data: Record<string, any> }
  | { type: 'status';  data: { sessionId: number; status: string; agentId: number | null; agentName: string | null } }
  | { type: 'ping' }

type FrameHandler = (frame: WsFrame) => void

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000]  // exponential backoff

export class ChatWebSocket {
  private token:       string
  private ws:          WebSocket | null = null
  private reconnectIdx = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed    = false
  private joinedSessions = new Set<number>()

  onMessage: FrameHandler = () => {}
  onConnect:    () => void = () => {}
  onDisconnect: () => void = () => {}

  constructor(token: string) {
    this.token = token
  }

  connect() {
    if (this.destroyed) return
    const wsUrl = this.buildUrl()
    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      this.reconnectIdx = 0
      // Re-join all sessions we were subscribed to before reconnect
      for (const sid of this.joinedSessions) {
        this.send({ type: 'join', sessionId: sid })
      }
      this.onConnect()
    }

    this.ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data) as WsFrame
        if (frame.type === 'ping') {
          this.send({ type: 'pong' })
          return
        }
        this.onMessage(frame)
      } catch { /* ignore malformed frames */ }
    }

    this.ws.onclose = () => {
      this.onDisconnect()
      if (!this.destroyed) this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose fires after onerror — reconnect handled there
    }
  }

  joinSession(sessionId: number) {
    this.joinedSessions.add(sessionId)
    this.send({ type: 'join', sessionId })
  }

  leaveSession(sessionId: number) {
    this.joinedSessions.delete(sessionId)
    this.send({ type: 'leave', sessionId })
  }

  disconnect() {
    this.destroyed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private send(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  private scheduleReconnect() {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectIdx, RECONNECT_DELAYS.length - 1)]
    this.reconnectIdx++
    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) this.connect()
    }, delay)
  }

  private buildUrl(): string {
    // Convert https://api.cardyn.net → wss://api.cardyn.net
    // Convert http://localhost:5173  → ws://localhost:5173  (dev proxy)
    const base = BASE_URL || window.location.origin
    const wsBase = base
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://')
    return `${wsBase}/ws/chat?token=${encodeURIComponent(this.token)}`
  }
}
