import React, { useEffect, useState, useCallback } from 'react'
import { getWithdrawals, approveWithdrawal, rejectWithdrawal } from '../api/withdrawals'
import { invalidatePrefix } from '../api/cache'
import type { Withdrawal } from '../types'
import { useAuth } from '../context/AuthContext'
import { canProcessPayments, isSuper } from '../utils/roles'
import { getWithdrawalFee } from '../api/config'
import client from '../api/client'
import DateRangePicker from '../components/DateRangePicker'
import Img from '../components/Img'
import { resolveUrl, fmtUid } from '../utils/resolveUrl'
import { useDebounce } from '../hooks/useDebounce'
import './OrdersScreen.css'
import './WithdrawalsScreen.css'

function fmtNgn(n: number) { return '₦' + (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 }) }

// Copy-to-clipboard row component
function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="copy-row">
      <span className="copy-label">{label}</span>
      <span className={'copy-value' + (mono ? ' mono' : '')}>{value}</span>
      <button className={'copy-btn' + (copied ? ' copied' : '')} onClick={copy}>
        {copied ? '✓ 已复制' : '复制'}
      </button>
    </div>
  )
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:   { label: '待处理', color: '#fa8c16' },
  completed: { label: '已完成', color: '#52c41a' },
  approved:  { label: '已批准', color: '#52c41a' },
  rejected:  { label: '已拒绝', color: '#ff4d4f' },
  processing:{ label: '处理中', color: '#1677ff' },
}

export default function WithdrawalsScreen({
  globalPendingCount = 0,
  newWdAlert = false,
  onAlertDismissed,
  onPendingCountChange,
  autoOpenWithdrawal = null,
  onAutoOpenDone,
}: {
  globalPendingCount?: number
  newWdAlert?: boolean
  onAlertDismissed?: () => void
  onPendingCountChange?: (n: number) => void
  autoOpenWithdrawal?: any
  onAutoOpenDone?: () => void
}) {
  const { user } = useAuth()
  const isPayer = canProcessPayments(user?.roleType || '')

  const [rows,       setRows]       = useState<Withdrawal[]>([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading,    setLoading]    = useState(false)
  const [firstLoad,  setFirstLoad]  = useState(false)  // no skeleton
  const [status,     setStatus]     = useState('')  // default all
  const [userSearch, setUserSearch] = useState('')  // NEW: UID / phone / name
  const debouncedUserSearch = useDebounce(userSearch, 400)
  const [startDate,  setStartDate]  = useState('')
  const [endDate,    setEndDate]    = useState('')
  const [startTime,  setStartTime]  = useState('')
  const [endTime,    setEndTime]    = useState('')
  const [detail,     setDetail]     = useState<Withdrawal | null>(null)
  const [payModal,   setPayModal]   = useState<Withdrawal | null>(null)
  const [rejectModal,setRejectModal]= useState<Withdrawal | null>(null)
  const [remark,     setRemark]     = useState('')
  const [receiptFile,setReceiptFile]= useState<File | null>(null)
  const [rejectFile, setRejectFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [lightbox,   setLightbox]   = useState<string | null>(null)
  const [configFee,  setConfigFee]  = useState(50)  // fetched from system config

  // Ctrl+V paste receipt image when pay modal is open
  useEffect(() => {
    if (!payModal) return
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) { setReceiptFile(file); break }
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [payModal])

  // Ctrl+V paste image when reject modal is open
  useEffect(() => {
    if (!rejectModal) return
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) { setRejectFile(file); break }
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [rejectModal])

  // Fetch withdrawal fee from system config on mount
  useEffect(() => {
    getWithdrawalFee().then(setConfigFee).catch(() => {})
  }, [])

  const load = useCallback((p: number) => {
    setLoading(true)
    const params = {
      pageNum: p, pageSize,
      status:    status    || undefined,
      username:  debouncedUserSearch || undefined,
      startTime: startDate ? startDate + ' ' + (startTime || '00:00') + ':00' : undefined,
      endTime:   endDate   ? endDate   + ' ' + (endTime   || '23:59') + ':59' : undefined,
    }
    getWithdrawals(params, {
      onFresh: r => { setRows(r.rows); setTotal(r.total) },
    })
      .then(r => { setRows(r.rows); setTotal(r.total) })
      .finally(() => { setLoading(false); setFirstLoad(false) })
  }, [pageSize, status, debouncedUserSearch, startDate, endDate, startTime, endTime])

  useEffect(() => { load(1); setPage(1) }, [status, debouncedUserSearch, startDate, endDate, startTime, endTime]) // eslint-disable-line

  // Auto-open pay modal when staff clicks 处理 from the global popup
  useEffect(() => {
    if (autoOpenWithdrawal) {
      setPayModal(autoOpenWithdrawal)
      setRemark('')
      setReceiptFile(null)
      onAutoOpenDone?.()
    }
  }, [autoOpenWithdrawal]) // eslint-disable-line

  // Auto-jump to pending tab when a new withdrawal alert arrives
  useEffect(() => {
    if (newWdAlert) {
      setStatus('pending')
      onAlertDismissed?.()
    }
  }, [newWdAlert]) // eslint-disable-line

  // Silent background auto-refresh every 15s — skip when tab hidden
  useEffect(() => {
    const silentLoad = () => {
      if (document.hidden) return
      invalidatePrefix('withdrawals:')
      getWithdrawals({ pageNum: page, pageSize, status: status || undefined,
        username:  debouncedUserSearch || undefined,
        startTime: startDate ? startDate + ' ' + (startTime || '00:00') + ':00' : undefined,
        endTime:   endDate   ? endDate   + ' ' + (endTime   || '23:59') + ':59' : undefined,
      }).then(r => { setRows(r.rows); setTotal(r.total) }).catch(() => {})
    }
    const t = setInterval(silentLoad, 15_000)
    return () => clearInterval(t)
  }, [page, pageSize, status, debouncedUserSearch, startDate, endDate, startTime, endTime]) // eslint-disable-line

  async function submitPay() {
    if (!payModal) return
    setSubmitting(true)
    try {
      let receiptUrl = ''
      if (receiptFile) {
        const fd = new FormData(); fd.append('file', receiptFile)
        const res = await client.post('/common/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        receiptUrl = res.data.url || ''
      }
      await approveWithdrawal(payModal.id, remark)
      // Update receipt image if uploaded
      if (receiptUrl) {
        await client.put('/tuka/withdrawal/audit', { id: payModal.id, status: 'completed', remark, receiptImage: receiptUrl })
      }
      setPayModal(null); setRemark(''); setReceiptFile(null)
      load(page)
      client.get('/tuka/withdrawal/list', { params: { status: 'pending', pageSize: 1 } })
        .then(r => { onPendingCountChange?.(r.data.total || 0) })
    } catch (e: any) { alert(e.message) }
    finally { setSubmitting(false) }
  }

  async function submitReject() {
    if (!rejectModal) return
    setSubmitting(true)
    try {
      let rejectImageUrl = ''
      if (rejectFile) {
        const fd = new FormData(); fd.append('file', rejectFile)
        const res = await client.post('/common/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        rejectImageUrl = res.data.url || ''
      }
      await rejectWithdrawal(rejectModal.id, remark)
      if (rejectImageUrl) {
        await client.put('/tuka/withdrawal/audit', { id: rejectModal.id, status: 'rejected', remark, receiptImage: rejectImageUrl })
      }
      setRejectModal(null); setRemark(''); setRejectFile(null)
      load(page)
    } catch (e: any) { alert(e.message) }
    finally { setSubmitting(false) }
  }

  const totalPages = Math.ceil(total / pageSize)
  function goPage(p: number) { if (p < 1 || p > totalPages) return; setPage(p); load(p) }

  function renderPagination() {
    const pages: (number | '...')[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1, 2, 3, 4, 5)
      if (page > 6) pages.push('...')
      if (page > 5 && page < totalPages - 1) pages.push(page)
      pages.push('...')
      pages.push(totalPages)
    }
    return pages
  }

  return (
    <div className="orders-root">
      <div className="orders-toolbar">
        <div className="toolbar-left">
          <button className={'filter-pill' + (!status ? ' active' : '')} onClick={() => setStatus('')}>全部</button>
          <button className={'filter-pill' + (status === 'pending' ? ' active-orange' : '')} onClick={() => setStatus('pending')}>待处理</button>
          <button className={'filter-pill' + (status === 'completed' ? ' active' : '')} onClick={() => setStatus('completed')}>已完成</button>
          <button className={'filter-pill' + (status === 'rejected' ? ' active' : '')} onClick={() => setStatus('rejected')}>已拒绝</button>
          <input className="filter-input-sm" placeholder="UID/手机/姓名" value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            style={{ width: 150 }} />
          <DateRangePicker
            startDate={startDate} endDate={endDate}
            startTime={startTime} endTime={endTime}
            onChange={(s, e, st, et) => { setStartDate(s); setEndDate(e); setStartTime(st); setEndTime(et) }}
            onClear={() => { setStartDate(''); setEndDate(''); setStartTime(''); setEndTime('') }}
          />
          <button className="icon-btn-sm" onClick={() => { setStatus(''); setUserSearch(''); setStartDate(''); setEndDate(''); setStartTime(''); setEndTime('') }} title="重置">✕</button>
        </div>
        <div className="toolbar-right">
          {isPayer && (
            <button className="pending-btn" onClick={() => setStatus('pending')}>
              待付款申请
              {globalPendingCount > 0 && <span className="pending-badge">{globalPendingCount}</span>}
            </button>
          )}
          {!isPayer && (
            <span className="role-badge">只读模式 — 核销人员不可操作提现</span>
          )}
        </div>
      </div>

      <div className="orders-table-wrap">
        <table className="orders-table">
          <thead>
            <tr>
              <th>id</th><th>用户</th><th>提现单号</th><th>银行</th>
              <th>账户名</th><th>账号</th><th>金额</th><th>手续费</th>
              <th>状态</th><th>处理人</th><th>收据</th><th>创建时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {(loading && firstLoad) && (
              <>
                {[1,2,3,4,5].map(k => (
                  <tr key={k} className="skeleton-row">
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(c => (
                      <td key={c}><div className="skeleton-cell" /></td>
                    ))}
                  </tr>
                ))}
              </>
            )}
            {!(loading && firstLoad) && rows.length === 0 && <tr><td colSpan={13} className="table-empty">暂无数据</td></tr>}
            {!(loading && firstLoad) && rows.map(r => {
              const st = STATUS_MAP[r.status] || { label: r.status, color: '#999' }
              return (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmtUid(r.userId)}</span></td>
                  <td className="mono">{r.withdrawNo}</td>
                  <td>{r.bankName}</td>
                  <td>{r.accountName}</td>
                  <td className="mono">{r.accountNo}</td>
                  <td className="amount-red">{fmtNgn(r.amount)}</td>
                  <td>{fmtNgn(r.fee)}</td>
                  <td><span style={{ color: st.color, fontWeight: 600 }}>● {st.label}</span></td>
                  <td style={{ fontSize: 11, color: (r as any).staffName ? '#1677ff' : '#bbb' }}>
                    {(r as any).staffName || '—'}
                  </td>
                  <td>
                    {r.receiptImage
                      ? <Img src={resolveUrl(r.receiptImage)} className="receipt-thumb" alt="收据"
                          onClick={() => setLightbox(resolveUrl(r.receiptImage))}
                          style={{ width: 40, height: 40 }} />
                      : <span className="no-img">—</span>
                    }
                  </td>
                  <td>{r.createTime?.slice(0, 16)}</td>
                  <td>
                    <div className="action-btns">
                      <button className="act-btn blue" onClick={() => setDetail(r)}>查看</button>
                      {isPayer && r.status === 'pending' && (
                        <>
                          {/* Only show pay/reject to the staff who claimed it OR super admin */}
                          {(!(r as any).staffId || Number((r as any).staffId) === 0 || isSuper(user?.roleType || '') || Number((r as any).staffId) === Number(user?.userId)) ? (
                            <>
                              <button className="act-btn primary" onClick={() => { setPayModal(r); setRemark(''); setReceiptFile(null) }}>付款</button>
                              <button className="act-btn danger"  onClick={() => { setRejectModal(r); setRemark('') }}>拒绝</button>
                            </>
                          ) : (
                            <span style={{ fontSize: 11, color: '#999' }}>{(r as any).staffName || '处理中'}</span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="orders-pagination">
        <span className="pg-total">共 {total} 条</span>
        <button className="pg-btn" disabled={page <= 1} onClick={() => goPage(page - 1)}>‹</button>
        {renderPagination().map((p, i) =>
          p === '...'
            ? <span key={`e${i}`} className="pg-ellipsis">···</span>
            : <button key={p} className={'pg-btn' + (p === page ? ' current' : '')} onClick={() => goPage(p as number)}>{p}</button>
        )}
        <button className="pg-btn" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>›</button>
        <select
          className="pg-size-select"
          value={pageSize}
          onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
        >
          {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {/* Detail modal — all roles can view */}
      {detail && (
        <div className="modal-mask" onClick={() => setDetail(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><span>提现详情</span><button onClick={() => setDetail(null)}>✕</button></div>
            <div className="modal-body">
              <div className="form-row"><label className="form-label">提现单号：</label><input className="form-input" readOnly value={detail.withdrawNo} /></div>
              <div className="form-row"><label className="form-label">用户ID：</label><input className="form-input short" readOnly value={fmtUid(detail.userId)} style={{ fontFamily: 'monospace', fontWeight: 700 }} /></div>
              <div className="form-row"><label className="form-label">用户名：</label><input className="form-input" readOnly value={String(detail.username || '')} /></div>
              <div className="form-row"><label className="form-label">银行：</label><input className="form-input" readOnly value={detail.bankName} /></div>
              <div className="form-row"><label className="form-label">账户名：</label><input className="form-input" readOnly value={detail.accountName} /></div>
              <div className="form-row"><label className="form-label">账号：</label><input className="form-input" readOnly value={detail.accountNo} /></div>
              <div className="form-row"><label className="form-label">金额：</label><input className="form-input" readOnly value={fmtNgn(detail.amount)} /></div>
              <div className="form-row"><label className="form-label">手续费：</label><input className="form-input" readOnly value={fmtNgn(detail.fee)} /></div>
              <div className="form-row"><label className="form-label">状态：</label><input className="form-input" readOnly value={STATUS_MAP[detail.status]?.label || detail.status} /></div>
              {detail.remark && <div className="form-row"><label className="form-label">备注：</label><input className="form-input" readOnly value={detail.remark} /></div>}
              <div className="form-row align-top">
                <label className="form-label">付款收据：</label>
                {detail.receiptImage
                  ? <Img src={resolveUrl(detail.receiptImage)} className="card-thumb"
                      onClick={() => setLightbox(resolveUrl(detail.receiptImage))} alt="收据"
                      style={{ width: 100, height: 100 }} />
                  : <span className="no-img">暂无收据</span>
                }
              </div>
              <div className="form-row"><label className="form-label">创建时间：</label><input className="form-input" readOnly value={detail.createTime} /></div>
            </div>
          </div>
        </div>
      )}

      {payModal && isPayer && (
        <div className="modal-mask" onClick={() => { setPayModal(null); setReceiptFile(null) }}>
          <div className="modal-box small" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><span>确认付款</span><button onClick={() => { setPayModal(null); setReceiptFile(null) }}>✕</button></div>
            <div className="modal-body">

              {/* Payment summary card */}
              <div className="pay-summary">
                <div className="pay-summary-row">
                  <span>提现金额</span>
                  <span className="amount-red">₦{payModal.amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="pay-summary-row">
                  <span>手续费（系统配置）</span>
                  <span style={{ color: '#ff4d4f' }}>- ₦{configFee.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="pay-summary-divider" />
                <div className="pay-summary-row total">
                  <span>实际打款金额</span>
                  <span className="pay-actual">₦{(payModal.amount - configFee).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Bank details with copy buttons */}
              <div className="pay-bank-card">
                <div className="pay-bank-title">收款信息</div>
                <CopyRow label="银行名称" value={payModal.bankName} />
                <CopyRow label="账户名"   value={payModal.accountName} />
                <CopyRow label="账号"     value={payModal.accountNo} mono />
              </div>

              {/* Receipt upload */}
              <div className="form-row align-top" style={{ marginTop: 12 }}>
                <label className="form-label">付款收据：</label>
                <label className="receipt-upload">
                  {receiptFile ? (
                    <div className="receipt-preview-wrap">
                      <img src={URL.createObjectURL(receiptFile)} className="receipt-preview" alt="" />
                      <button className="audit-img-remove" onClick={e => { e.preventDefault(); setReceiptFile(null) }}>✕</button>
                    </div>
                  ) : (
                    <div className="audit-img-placeholder">
                      <span className="audit-img-icon">[ RCP ]</span>
                      <span>点击上传 或 Ctrl+V 粘贴</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) setReceiptFile(f); e.target.value = '' }} />
                </label>
              </div>

              <textarea className="audit-remark" placeholder="备注（可选）" rows={2}
                value={remark} onChange={e => setRemark(e.target.value)} />
              <button className="audit-submit" onClick={submitPay} disabled={submitting}>
                {submitting ? '提交中…' : `确认已付款 ₦${(payModal.amount - configFee).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && isPayer && (
        <div className="modal-mask" onClick={() => { setRejectModal(null); setRejectFile(null) }}>
          <div className="modal-box small" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><span>拒绝提现</span><button onClick={() => { setRejectModal(null); setRejectFile(null) }}>✕</button></div>
            <div className="modal-body">
              <div className="form-row"><label className="form-label">用户ID：</label><input className="form-input short" readOnly value={fmtUid(rejectModal.userId)} style={{ fontFamily: 'monospace', fontWeight: 700 }} /></div>
              <div className="form-row"><label className="form-label">金额：</label><span className="amount-red" style={{ fontSize: 15, fontWeight: 700 }}>{fmtNgn(rejectModal.amount)}</span></div>
              <textarea className="audit-remark" placeholder="拒绝原因（必填）" rows={3}
                value={remark} onChange={e => setRemark(e.target.value)} />
              {/* Reject evidence image */}
              <div className="form-row align-top" style={{ marginTop: 10 }}>
                <label className="form-label">凭证图片：</label>
                <label className="receipt-upload">
                  {rejectFile ? (
                    <div className="receipt-preview-wrap">
                      <img src={URL.createObjectURL(rejectFile)} className="receipt-preview" alt="" />
                      <button className="audit-img-remove" onClick={e => { e.preventDefault(); setRejectFile(null) }}>✕</button>
                    </div>
                  ) : (
                    <div className="audit-img-placeholder">
                      <span className="audit-img-icon">图片</span>
                      <span>点击上传 或 Ctrl+V 粘贴</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) setRejectFile(f); e.target.value = '' }} />
                </label>
              </div>
              <button className="audit-submit danger" onClick={submitReject} disabled={submitting || !remark.trim()}>
                {submitting ? '提交中…' : '确认拒绝'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="lightbox-img" alt="" onClick={e => e.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}
    </div>
  )
}
