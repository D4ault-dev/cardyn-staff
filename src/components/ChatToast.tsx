import React, { useEffect, useState } from 'react'
import './ChatToast.css'

export type ToastItem = {
  id: string
  type: 'chat' | 'order' | 'withdrawal'
  title: string
  message: string
  sessionId?: number
}

type Props = {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
  onOpen?: (toast: ToastItem) => void
}

export default function ChatToast({ toasts, onDismiss, onOpen }: Props) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} onOpen={onOpen} />
      ))}
    </div>
  )
}

function ToastCard({ toast, onDismiss, onOpen }: {
  toast: ToastItem
  onDismiss: (id: string) => void
  onOpen?: (toast: ToastItem) => void
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setTimeout(() => setVisible(true), 10)
    const t = setTimeout(() => dismiss(), 8000)
    return () => clearTimeout(t)
  }, [])

  function dismiss() {
    setVisible(false)
    setTimeout(() => onDismiss(toast.id), 300)
  }

  const typeLabel = toast.type === 'chat' ? '聊天' : toast.type === 'order' ? '订单' : '提现'
  const color = toast.type === 'chat' ? '#52c41a' : toast.type === 'order' ? '#1677ff' : '#fa8c16'
  const actionLabel = toast.type === 'chat' ? '接入' : toast.type === 'order' ? '查看' : '处理'

  return (
    <div className={'toast-card' + (visible ? ' visible' : '')} style={{ borderLeftColor: color }}>
      <div className="toast-type-dot" style={{ background: color }} />
      <div className="toast-body">
        <div className="toast-title" style={{ color }}>{toast.title}</div>
        <div className="toast-msg">{toast.message}</div>
      </div>
      <div className="toast-actions">
        {onOpen && (
          <button className="toast-accept" style={{ background: color }}
            onClick={() => { onOpen(toast); dismiss() }}>
            {actionLabel}
          </button>
        )}
        <button className="toast-dismiss" onClick={dismiss}>✕</button>
      </div>
    </div>
  )
}
