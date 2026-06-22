/**
 * PendingOrdersPopup — global floating popup that shows pending orders to all staff.
 * Mounted in App.tsx so it's visible on ALL screens (chat, withdrawals, users etc.)
 * Orders stay in popup until manually claimed by a staff member.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react'
import client, { clearClientCacheByUrl } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { canVerifyOrders } from '../utils/roles'
import { fmtUid } from '../utils/resolveUrl'
import './PendingOrdersPopup.css'

type PendingOrder = {
  id: number
  orderNo: string
  userId: number
  categoryName: string
  cardCurrency: string
  cardAmount: number
  ngnAmount: number
  quantity: number
  inputType: string
  status: string
  staffId: number | null
  staffName?: string
  createTime: string
}

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', GBP: '£', EUR: '€', CAD: 'C$', AUD: 'A$',
  US: '$', GB: '£', EU: '€', CA: 'C$', AU: 'A$',
  NGN: '₦', NG: '₦',
}
function currSym(code: string) { return CURRENCY_SYMBOL[code] || '' }
function fmtNgn(n: number) { return '₦' + (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 }) }

interface Props {
  onOrderClaimed?: () => void
  newOrderAlert?: boolean
  onAlertDismissed?: () => void
  globalPendingCount?: number
}

export default function PendingOrdersPopup({
  onOrderClaimed,
  newOrderAlert,
  onAlertDismissed,
  globalPendingCount = 0,
}: Props) {
  const { user } = useAuth()
  const canVerify = canVerifyOrders(user?.roleType || '')
  const [visible, setVisible] = useState(true)
  const [rows, setRows] = useState<PendingOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [claiming, setClaiming] = useState<number | null>(null)

  const load = useCallback(() => {
    if (!canVerify) return
    clearClientCacheByUrl('/tuka/order/list')
    // Fetch pending orders (unclaimed)
    client.get('/tuka/order/list', { params: { status: 'pending', pageSize: 50 } })
      .then(r => {
        const pending = r.data.rows || []
        // Fetch processing orders claimed by THIS staff
        client.get('/tuka/order/list', { params: { status: 'processing', pageSize: 50 } })
          .then(r2 => {
            const allProcessing = r2.data.rows || []
            const myProcessing = allProcessing.filter(
              (o: any) => user?.userId != null && Number(o.staffId) === Number(user?.userId)
            )
            const combined = [...pending, ...myProcessing]
            setRows(combined)
            // Auto-show popup when new orders arrive
            if (combined.length > 0) setVisible(true)
          })
          .catch(() => setRows(pending))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [canVerify, user?.userId])

  // Load on mount
  useEffect(() => {
    load()
  }, []) // eslint-disable-line

  // Auto-refresh every 6s
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) load()
    }, 6_000)
    return () => clearInterval(t)
  }, [load])

  // Auto-open when new order alert fires
  useEffect(() => {
    if (newOrderAlert) {
      load()
      setVisible(true)
      onAlertDismissed?.()
    }
  }, [newOrderAlert]) // eslint-disable-line

  async function claimOrder(orderId: number) {
    setClaiming(orderId)
    try {
      await client.put('/tuka/order/audit', { id: orderId, status: 'processing', verifyRemark: '' })
      load()
      onOrderClaimed?.()
    } catch (e: any) {
      const msg = e.message || ''
      if (msg.includes('already claimed') || msg.includes('409')) {
        load()
        // Non-blocking toast
        const toast = document.createElement('div')
        toast.textContent = 'Order already claimed by another staff'
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#ff4d4f;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;z-index:99999'
        document.body.appendChild(toast)
        setTimeout(() => toast.remove(), 3000)
      } else {
        alert(msg)
      }
    } finally { setClaiming(null) }
  }

  if (!canVerify) return null

  const pendingCount    = rows.filter(r => r.status === 'pending').length
  const processingCount = rows.filter(r => r.status === 'processing').length

  return (
    <>
      {/* Floating badge button — always visible */}
      {!visible && (
        <button
          className="pp-global-fab"
          onClick={() => { load(); setVisible(true) }}
        >
          待受理订单
          {(globalPendingCount > 0 || pendingCount > 0) && (
            <span className="pp-global-badge">{globalPendingCount || pendingCount}</span>
          )}
        </button>
      )}

      {/* Popup */}
      {visible && (
        <div className="pp-global-overlay" onClick={() => setVisible(false)}>
          <div className="pp-global-popup" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="pp-global-header">
              <span className="pp-global-title">待受理订单</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {rows.length > 0 && (
                  <span className="pp-global-count">
                    {pendingCount > 0 && `${pendingCount} 待接单`}
                    {pendingCount > 0 && processingCount > 0 && ' · '}
                    {processingCount > 0 && `${processingCount} 我的处理中`}
                  </span>
                )}
                <button className="pp-global-close" onClick={() => setVisible(false)}>✕</button>
              </div>
            </div>

            {/* Body */}
            <div className="pp-global-body">
              {loading && rows.length === 0 ? (
                <div className="pp-global-empty">加载中...</div>
              ) : rows.length === 0 ? (
                <div className="pp-global-empty">暂无待受理订单</div>
              ) : (
                <table className="pp-global-table">
                  <thead>
                    <tr>
                      <th>卡种</th>
                      <th>面值</th>
                      <th>结算金额</th>
                      <th>数量</th>
                      <th>类型</th>
                      <th>时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} style={{ background: r.status === 'processing' ? '#f0f9ff' : undefined }}>
                        <td>{r.categoryName}</td>
                        <td>{currSym(r.cardCurrency)}{r.cardAmount}</td>
                        <td>{fmtNgn(r.ngnAmount)}</td>
                        <td>{r.quantity ?? 1}</td>
                        <td>{r.inputType || '—'}</td>
                        <td style={{ fontSize: 11, color: '#888' }}>{r.createTime?.slice(0, 16)}</td>
                        <td>
                          {r.status === 'processing' ? (
                            <span style={{ fontSize: 11, color: '#1677ff', fontWeight: 600 }}>
                              {r.staffName || '处理中'}
                            </span>
                          ) : (
                            <button
                              className={'pp-global-claim' + (claiming === r.id ? ' loading' : '')}
                              disabled={!!claiming}
                              onClick={() => claimOrder(r.id)}
                            >
                              {claiming === r.id ? '接单中…' : '接单'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
