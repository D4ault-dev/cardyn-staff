/**
 * PendingWithdrawalsPopup — global floating popup for pending withdrawals.
 * Shows on ALL pages. Staff claim a withdrawal to process it exclusively.
 */
import React, { useEffect, useState, useCallback } from 'react'
import client, { clearClientCacheByUrl } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { canProcessPayments } from '../utils/roles'
import { fmtUid } from '../utils/resolveUrl'
import type { Withdrawal } from '../types'
import './PendingOrdersPopup.css'  // reuse same styles

function fmtNgn(n: number) { return '₦' + (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 }) }

interface Props {
  onWithdrawalClaimed?: () => void
  onProcess?: (wd: Withdrawal) => void
  newWdAlert?: boolean
  onAlertDismissed?: () => void
  globalPendingCount?: number
}

export default function PendingWithdrawalsPopup({
  onWithdrawalClaimed,
  onProcess,
  newWdAlert,
  onAlertDismissed,
  globalPendingCount = 0,
}: Props) {
  const { user } = useAuth()
  const canPay = canProcessPayments(user?.roleType || '')
  const [visible, setVisible] = useState(true)
  const [rows, setRows] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(false)
  const [claiming, setClaiming] = useState<number | null>(null)

  const load = useCallback(() => {
    if (!canPay) return
    clearClientCacheByUrl('/tuka/withdrawal/list')
    // Fetch unclaimed pending
    client.get('/tuka/withdrawal/list', { params: { status: 'pending', pageSize: 50 } })
      .then(r => {
        const pending = (r.data.rows || []).filter((w: any) => !w.staffId || w.staffId === 0)
        // Fetch my claimed ones (pending with my staffId)
        const myClaimed = (r.data.rows || []).filter(
          (w: any) => w.staffId && Number(w.staffId) === Number(user?.userId)
        )
        const combined = [...pending, ...myClaimed]
        setRows(combined)
        if (combined.length > 0) setVisible(true)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [canPay, user?.userId])

  useEffect(() => { load() }, []) // eslint-disable-line
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load() }, 6_000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (newWdAlert) { load(); setVisible(true); onAlertDismissed?.() }
  }, [newWdAlert]) // eslint-disable-line

  async function claimWithdrawal(wdId: number) {
    setClaiming(wdId)
    try {
      await client.put('/tuka/withdrawal/claim', { id: wdId })
      load()
      onWithdrawalClaimed?.()
    } catch (e: any) {
      const msg = e.message || ''
      if (msg.includes('already claimed') || msg.includes('409')) {
        load()
        const toast = document.createElement('div')
        toast.textContent = 'Withdrawal already claimed by another staff'
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#ff4d4f;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;z-index:99999'
        document.body.appendChild(toast)
        setTimeout(() => toast.remove(), 3000)
      } else { alert(msg) }
    } finally { setClaiming(null) }
  }

  if (!canPay) return null

  const unclaimedCount = rows.filter(r => !r.staffId || r.staffId === 0).length
  const myClaimedCount = rows.filter(r => r.staffId && Number(r.staffId) === Number(user?.userId)).length

  return (
    <>
      {/* FAB button — bottom right, above the orders FAB */}
      {!visible && (
        <button
          className="pp-global-fab"
          style={{ bottom: 70, background: '#fa8c16' }}
          onClick={() => { load(); setVisible(true) }}
        >
          待处理提现
          {(globalPendingCount > 0 || unclaimedCount > 0) && (
            <span className="pp-global-badge">{globalPendingCount || unclaimedCount}</span>
          )}
        </button>
      )}

      {visible && (
        <div className="pp-global-overlay" onClick={() => setVisible(false)}>
          <div className="pp-global-popup" onClick={e => e.stopPropagation()}>
            <div className="pp-global-header">
              <span className="pp-global-title">待处理提现</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {rows.length > 0 && (
                  <span className="pp-global-count" style={{ background: '#fff7e6', color: '#d46b08' }}>
                    {unclaimedCount > 0 && `${unclaimedCount} 待接单`}
                    {unclaimedCount > 0 && myClaimedCount > 0 && ' · '}
                    {myClaimedCount > 0 && `${myClaimedCount} 我的处理中`}
                  </span>
                )}
                <button className="pp-global-close" onClick={() => setVisible(false)}>✕</button>
              </div>
            </div>
            <div className="pp-global-body">
              {loading && rows.length === 0 ? (
                <div className="pp-global-empty">加载中...</div>
              ) : rows.length === 0 ? (
                <div className="pp-global-empty">暂无待处理提现</div>
              ) : (
                <table className="pp-global-table">
                  <thead>
                    <tr>
                      <th>用户</th>
                      <th>银行</th>
                      <th>账号</th>
                      <th>金额</th>
                      <th>时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const isMine = r.staffId && Number(r.staffId) === Number(user?.userId)
                      return (
                        <tr key={r.id} style={{ background: isMine ? '#fff7e6' : undefined }}>
                          <td><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmtUid(r.userId)}</span></td>
                          <td style={{ fontSize: 11 }}>{r.bankName}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.accountNo}</td>
                          <td style={{ fontWeight: 700, color: '#d46b08' }}>{fmtNgn(r.amount)}</td>
                          <td style={{ fontSize: 11, color: '#888' }}>{r.createTime?.slice(0, 16)}</td>
                          <td>
                            {isMine ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 11, color: '#d46b08', fontWeight: 600 }}>
                                  {r.staffName || '处理中'}
                                </span>
                                <button
                                  className="pp-global-claim"
                                  style={{ background: '#fa8c16' }}
                                  onClick={() => { setVisible(false); onProcess?.(r) }}
                                >
                                  处理
                                </button>
                              </div>
                            ) : (!r.staffId || r.staffId === 0) ? (
                              <button
                                className={'pp-global-claim' + (claiming === r.id ? ' loading' : '')}
                                style={{ background: '#fa8c16' }}
                                disabled={!!claiming}
                                onClick={() => claimWithdrawal(r.id)}
                              >
                                {claiming === r.id ? '接单中…' : '接单'}
                              </button>
                            ) : (
                              <span style={{ fontSize: 11, color: '#999' }}>{r.staffName}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
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
