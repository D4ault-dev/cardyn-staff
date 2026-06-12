import React, { useEffect, useState, useCallback, useRef } from 'react'
import { getOrders, auditOrder } from '../api/orders'
import type { Order } from '../types'
import client, { clearClientCacheByUrl } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { canVerifyOrders, isSuper } from '../utils/roles'
import { playSuccess, playError } from '../utils/sound'
import DateRangePicker from '../components/DateRangePicker'
import Img from '../components/Img'
import { resolveUrl } from '../utils/resolveUrl'
import './OrdersScreen.css'

/** Copy an image URL to the system clipboard as an image (paste into WeChat/WhatsApp etc.) */
async function copyImageToClipboard(url: string): Promise<void> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    // Normalise to PNG — ClipboardItem only accepts image/png in most browsers/Electron
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width  = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas toBlob failed')), 'image/png')
      }
      img.onerror = reject
      img.src = URL.createObjectURL(blob)
    })
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob })
    ])
    return Promise.resolve()
  } catch (e) {
    console.error('[copyImage]', e)
    return Promise.reject(e)
  }
}

// Currency/country code → display label (handles both "US" and "USD" formats)
const CURRENCY_COUNTRY: Record<string, string> = {
  // Short codes (actual DB values)
  US:  'US【美国】',   GB:  'UK【英国】',   EU:  'EUR【欧盟】',
  CA:  'CA【加拿大】', AU:  'AU【澳大利亚】', JP:  'Japan【日本】',
  CN:  'CN【中国】',   PH:  'PH【菲律宾】',  SG:  'SG【新加坡】',
  MY:  'MY【马来西亚】', HK: 'HK【香港】',   KR:  'KR【韩国】',
  NG:  'NG【尼日利亚】', GH: 'GH【加纳】',
  // Full currency codes
  USD: 'US【美国】',   GBP: 'UK【英国】',   EUR: 'EUR【欧盟】',
  CAD: 'CA【加拿大】', AUD: 'AU【澳大利亚】', JPY: 'Japan【日本】',
  CNY: 'CN【中国】',   PHP: 'PH【菲律宾】',  SGD: 'SG【新加坡】',
  MYR: 'MY【马来西亚】', HKD: 'HK【香港】',  KRW: 'KR【韩国】',
  NGN: 'NG【尼日利亚】', GHS: 'GH【加纳】',
}
function countryLabel(cur: string) { return CURRENCY_COUNTRY[cur] || (cur ? cur : '—') }

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', GBP: '£', EUR: '€', CAD: 'C$', AUD: 'A$',
  JPY: '¥', CNY: '¥', PHP: '₱', SGD: 'S$', NGN: '₦',
  // Short codes
  US: '$', GB: '£', EU: '€', CA: 'C$', AU: 'A$',
  JP: '¥', CN: '¥', PH: '₱', SG: 'S$', NG: '₦',
}
function currSym(code: string) { return CURRENCY_SYMBOL[code] || '' }
function fmtNgn(n: number) { return '₦' + (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 }) }

// Code row with copy button
function CodeRow({ index, code }: { index: number; code: string }) {
  const [copied, setCopied] = React.useState(false)
  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="code-row-item">
      <span className="code-row-num">{index}</span>
      <span className="code-row-val">{code}</span>
      <button className={'copy-btn' + (copied ? ' copied' : '')} onClick={copy}>
        {copied ? '✓ 已复制' : '复制'}
      </button>
    </div>
  )
}

export default function OrdersScreen() {
  const { user } = useAuth()
  const canVerify = canVerifyOrders(user?.roleType || '')

  const [rows,         setRows]         = useState<Order[]>([])
  const [total,        setTotal]        = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [page,         setPage]         = useState(1)
  const pageSize = 10
  const [loading,      setLoading]      = useState(false)
  const [firstLoad,    setFirstLoad]    = useState(true)
  const [countries,    setCountries]    = useState<string[]>([])
  const [country,      setCountry]      = useState('')
  const [status,       setStatus]       = useState('')  // default all
  const [orderNo,      setOrderNo]      = useState('')
  const [startDate,    setStartDate]    = useState('')  // date only: yyyy-MM-dd
  const [endDate,      setEndDate]      = useState('')
  const [startTime,    setStartTime]    = useState('')  // HH:mm
  const [endTime,      setEndTime]      = useState('')
  // Two separate modals matching the screenshots
  const [verifyData,   setVerifyData]   = useState<Order | null>(null)
  const [cardData,     setCardData]     = useState<Order | null>(null)
  const [auditRow,       setAuditRow]       = useState<Order | null>(null)
  const [auditResult,    setAuditResult]    = useState<'paid' | 'rejected'>('paid')
  const [auditRemark,    setAuditRemark]    = useState('')
  const [auditImage,     setAuditImage]     = useState<string>('')
  const [auditImgFile,   setAuditImgFile]   = useState<File | null>(null)
  const [adjustedAmount, setAdjustedAmount] = useState<string>('')
  const [submitting,     setSubmitting]     = useState(false)
  const [lightbox,       setLightbox]       = useState<string | null>(null)
  const [copyMsg,        setCopyMsg]        = useState<string | null>(null)

  function copyImg(url: string) {
    copyImageToClipboard(url)
      .then(() => { setCopyMsg('已复制！'); setTimeout(() => setCopyMsg(null), 2000) })
      .catch(() => { setCopyMsg('复制失败'); setTimeout(() => setCopyMsg(null), 2000) })
  }
  // Pending orders popup
  const [pendingPopup, setPendingPopup] = useState(false)
  const [pendingRows,  setPendingRows]  = useState<Order[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [claiming,     setClaiming]     = useState<number | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPending  = useRef(0)
  const [newOrderFlash, setNewOrderFlash] = useState(false)

  // Load countries
  useEffect(() => {
    client.get('/tuka/country/list', { params: { pageSize: 100 } })
      .then(r => setCountries((r.data.rows || []).map((c: any) => c.name)))
      .catch(() => {})
  }, [])

  // Poll pending count — handled globally by useChatNotifications in App.tsx
  // No local timer needed here — avoids duplicate list?status=pending requests
  useEffect(() => {
    // Just fetch once on mount to show the initial badge
    client.get('/tuka/order/list', { params: { status: 'pending', pageSize: 1 } })
      .then(r => {
        const n = r.data.total || 0
        setPendingCount(n)
        prevPending.current = n
      }).catch(() => {})
  }, [])

  // Ctrl+V paste image into audit dialog when it's open
  useEffect(() => {
    if (!auditRow) return
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) { setAuditImgFile(file); break }
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [auditRow])

  const load = useCallback((p: number) => {
    setLoading(true)
    getOrders({
      pageNum: p, pageSize,
      status:    status    || undefined,
      orderNo:   orderNo   || undefined,
      country:   country   || undefined,
      startTime: startDate ? startDate + ' ' + (startTime || '00:00') + ':00' : undefined,
      endTime:   endDate   ? endDate   + ' ' + (endTime   || '23:59') + ':59' : undefined,
    })
      .then(r => { setRows(r.rows); setTotal(r.total) })
      .finally(() => { setLoading(false); setFirstLoad(false) })
  }, [pageSize, status, orderNo, country, startDate, endDate, startTime, endTime])

  useEffect(() => { load(1); setPage(1) }, [status, country, orderNo, startDate, endDate, startTime, endTime]) // eslint-disable-line

  function reset() {
    setStatus(''); setCountry(''); setOrderNo('')
    setStartDate(''); setEndDate(''); setStartTime(''); setEndTime('')
    setPage(1)
  }

  // Load pending orders for popup — clear cache first so we always get fresh data
  function loadPendingPopup() {
    setPendingLoading(true)
    clearClientCacheByUrl('/tuka/order/list')
    client.get('/tuka/order/list', { params: { status: 'pending', pageSize: 50 } })
      .then(r => setPendingRows(r.data.rows || []))
      .catch(() => {})
      .finally(() => setPendingLoading(false))
  }

  // Claim/accept a pending order (mark as processing)
  async function claimOrder(orderId: number) {
    setClaiming(orderId)
    try {
      await client.put('/tuka/order/audit', { id: orderId, status: 'processing', verifyRemark: '' })
      loadPendingPopup()
      load(page)
      client.get('/tuka/order/list', { params: { status: 'pending', pageSize: 1 } })
        .then(r => { const n = r.data.total || 0; setPendingCount(n); prevPending.current = n })
    } catch (e: any) { alert(e.message) }
    finally { setClaiming(null) }
  }

  async function submitAudit() {
    if (!auditRow) return
    setSubmitting(true)
    try {
      let imageUrl = auditImage
      if (auditImgFile) {
        const formData = new FormData()
        formData.append('file', auditImgFile)
        const res = await client.post('/common/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        imageUrl = res.data.url || ''
      }
      // If adjusted amount is provided, update the order amount first
      const adj = parseFloat(adjustedAmount)
      if (adjustedAmount.trim() && !isNaN(adj) && adj !== auditRow.ngnAmount) {
        await client.put('/tuka/order/audit', {
          id: auditRow.id,
          status: auditRow.status, // keep current status, just update amount
          verifyRemark: '',
          newAmount: adj,
        })
      }
      await auditOrder(auditRow.id, auditResult, auditRemark, imageUrl)
      playSuccess()
      setAuditRow(null); setAuditRemark(''); setAuditImage(''); setAuditImgFile(null); setAdjustedAmount('')
      load(page)
      client.get('/tuka/order/list', { params: { status: 'pending', pageSize: 1 } })
        .then(r => { const n = r.data.total || 0; setPendingCount(n); prevPending.current = n })
    } catch (e: any) { alert(e.message) }
    finally { setSubmitting(false) }
  }

  // Pagination helpers
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
      {/* Toolbar — matches screenshot exactly */}
      <div className="orders-toolbar">
        <div className="toolbar-left">
          {/* Status pills */}
          <button className={'filter-pill' + (!status ? ' active' : '')} onClick={() => setStatus('')}>全部</button>

          {/* Country dropdown styled as pill */}
          <select className={'filter-pill-select' + (country ? ' active' : '')}
            value={country} onChange={e => setCountry(e.target.value)}>
            <option value="">全部国家</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Status dropdown */}
          <select className="filter-pill-select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">全部</option>
            <option value="pending">待处理</option>
            <option value="processing">处理中</option>
            <option value="paid">已完成</option>
            <option value="rejected">已拒绝</option>
          </select>

          {/* Order no */}
          <input className="filter-input-sm" placeholder="订单编号" value={orderNo}
            onChange={e => setOrderNo(e.target.value)} />

          {/* Date range picker */}
          <DateRangePicker
            startDate={startDate} endDate={endDate}
            startTime={startTime} endTime={endTime}
            onChange={(s, e, st, et) => { setStartDate(s); setEndDate(e); setStartTime(st); setEndTime(et) }}
            onClear={() => { setStartDate(''); setEndDate(''); setStartTime(''); setEndTime('') }}
          />

          {/* Refresh + Reset */}
          <button className="icon-btn-sm" onClick={() => load(page)} title="刷新">↻</button>
          <button className="icon-btn-sm" onClick={reset} title="重置">✕</button>
        </div>

        {/* Right: pending orders badge button → opens popup */}
        <div className="toolbar-right">
          <button
            className={'pending-btn' + (newOrderFlash ? ' flash' : '')}
            onClick={() => { loadPendingPopup(); setPendingPopup(true) }}
          >
            待受理订单
            {pendingCount > 0 && (
              <span className={'pending-badge' + (newOrderFlash ? ' flash' : '')}>{pendingCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="orders-table-wrap">
        <table className="orders-table">
          <thead>
            <tr>
              <th>id</th>
              <th>用户id</th>
              <th>核销订单号</th>
              <th>卡种</th>
              <th>国家</th>
              <th>输入类型</th>
              <th>面值</th>
              <th>数量</th>
              <th>结算金额</th>
              <th>处理人</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {(loading && firstLoad) && (
              <>
                {[1,2,3,4,5].map(k => (
                  <tr key={k} className="skeleton-row">
                    {[1,2,3,4,5,6,7,8,9,10].map(c => (
                      <td key={c}><div className="skeleton-cell" /></td>
                    ))}
                  </tr>
                ))}
              </>
            )}
            {!(loading && firstLoad) && rows.length === 0 && <tr><td colSpan={11} className="table-empty">暂无数据</td></tr>}
            {!(loading && firstLoad) && rows.map(r => (
              <tr key={r.id} className={r.status === 'pending' ? 'row-pending' : ''}>
                <td>{r.id}</td>
                <td>{r.userId}</td>
                <td className="mono">{r.orderNo}</td>
                <td>{r.categoryName}</td>
                <td className="country-cell">{countryLabel(r.cardCurrency)}</td>
                <td>{r.inputType || '—'}</td>
                <td className="amount-green">{currSym(r.cardCurrency)}{r.cardAmount}</td>
                <td>{r.quantity ?? 0}</td>
                <td className="amount-red">{fmtNgn(r.ngnAmount)}</td>
                <td style={{ fontSize: 11, color: (r as any).staffName ? '#1677ff' : '#bbb' }}>
                  {(r as any).staffName || '—'}
                </td>
                <td>
                  <div className="action-btns">
                    <button className="act-btn blue" onClick={() => setVerifyData(r)}>查看数据</button>
                    <button className="act-btn green" onClick={() => setCardData(r)}>查看</button>
                    {canVerify && r.status === 'pending' ? (
                      <>
                        <button className="act-btn primary"
                          onClick={() => { setAuditRow(r); setAuditResult('paid'); setAuditRemark(''); setAdjustedAmount('') }}>
                          核销完成
                        </button>
                        <button className="act-btn danger"
                          onClick={() => { setAuditRow(r); setAuditResult('rejected'); setAuditRemark(''); setAdjustedAmount('') }}>
                          失败
                        </button>
                      </>
                    ) : canVerify && r.status === 'processing' && (
                        isSuper(user?.roleType || '') ||
                        String((r as any).staffId) === String(user?.userId)
                      ) ? (
                      <>
                        <button className="act-btn primary"
                          onClick={() => { setAuditRow(r); setAuditResult('paid'); setAuditRemark(''); setAdjustedAmount('') }}>
                          核销完成
                        </button>
                        <button className="act-btn danger"
                          onClick={() => { setAuditRow(r); setAuditResult('rejected'); setAuditRemark(''); setAdjustedAmount('') }}>
                          失败
                        </button>
                      </>
                    ) : r.status === 'rejected' ? (
                      <span className="reject-tag">{r.rejectReason || 'bad card'}</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination — matches screenshot: 共133条 | 1 2 3 4 5 … 14 | 10/page */}
      <div className="orders-pagination">
        <span className="pg-total">共 {total} 条</span>
        <button className="pg-btn" disabled={page <= 1} onClick={() => goPage(page - 1)}>‹</button>
        {renderPagination().map((p, i) =>
          p === '...'
            ? <span key={`e${i}`} className="pg-ellipsis">···</span>
            : <button key={p} className={'pg-btn' + (p === page ? ' current' : '')} onClick={() => goPage(p as number)}>{p}</button>
        )}
        <button className="pg-btn" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>›</button>
        <span className="pg-size">10 / page</span>
      </div>

      {/* ── 核销数据 modal (查看数据 button) — matches screenshot 1 ── */}
      {verifyData && (
        <div className="modal-mask" onClick={() => setVerifyData(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span>核销数据</span>
              <button onClick={() => setVerifyData(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* 基础信息 row */}
              <div className="info-row-bar">
                <span className="info-bar-label">基础信息：</span>
                <span className="info-bar-item"><span className="ibl">卡种</span><span className="ibv">{verifyData.categoryName}</span></span>
                <span className="info-bar-item"><span className="ibl">面值</span><span className="ibv amount-green">{currSym(verifyData.cardCurrency)}{verifyData.cardAmount}</span></span>
                <span className="info-bar-item"><span className="ibl">输入方式</span><span className="ibv">{verifyData.inputType || '—'}</span></span>
                <span className="info-bar-item"><span className="ibl">国家</span><span className="ibv">{countryLabel(verifyData.cardCurrency)}</span></span>
                <span className="info-bar-item"><span className="ibl">数量</span><span className="ibv">{verifyData.quantity ?? 0}</span></span>
              </div>

              {/* 核销编号 */}
              <div className="form-row">
                <label className="form-label">核销编号：</label>
                <input className="form-input" readOnly value={verifyData.orderNo} />
              </div>

              {/* 用户信息 */}
              <div className="form-row">
                <label className="form-label">用户信息：</label>
                <span className="form-inline-label">ID：</span>
                <input className="form-input short" readOnly value={verifyData.userId} />
                <span className="form-inline-label" style={{ marginLeft: 12 }}>备注：</span>
                <input className="form-input short" readOnly value={verifyData.verifyRemark || ''} />
              </div>

              {/* 汇率数据 */}
              <div className="form-row">
                <label className="form-label">汇率数据：</label>
                <span className="form-inline-label">国家汇率</span>
                <input className="form-input short" readOnly value={verifyData.countryRate ?? ''} />
                <span className="form-inline-label" style={{ marginLeft: 12 }}>采购汇率</span>
                <input className="form-input short" readOnly value={verifyData.purchaseRate ?? ''} />
                <span className="form-inline-label" style={{ marginLeft: 12 }}>售出汇率</span>
                <input className="form-input short" readOnly value={verifyData.sellRate ?? ''} />
              </div>

              {/* 结算金额 */}
              <div className="form-row">
                <label className="form-label">结算金额：</label>
                <span className="form-inline-label">结算金额</span>
                <input className="form-input medium" readOnly value={verifyData.ngnAmount ?? ''} />
                <span className="form-inline-label" style={{ marginLeft: 12 }}>变更结算金额</span>
                <input className="form-input short" readOnly value={verifyData.newAmount ?? 0} />
              </div>

              {/* 卡片代码 — show all codes */}
              {verifyData.cardCode && (
                <div className="form-row align-top">
                  <label className="form-label">卡片代码：</label>
                  <div className="codes-list">
                    {verifyData.cardCode.split('\n').filter((c: string) => c.trim()).map((code: string, i: number) => (
                      <CodeRow key={i} index={i + 1} code={code.trim()} />
                    ))}
                  </div>
                </div>
              )}

              {/* 备注信息 */}
              <div className="form-row align-top">
                <label className="form-label">备注信息：</label>
                <textarea className="form-textarea" readOnly value={verifyData.verifyRemark || ''} rows={3} />
              </div>

              {/* 核销凭证 */}
              <div className="form-row align-top">
                <label className="form-label">核销凭证：</label>
                {verifyData.verifyImage ? (
                  <Img src={resolveUrl(verifyData.verifyImage)} className="verify-thumb"
                    onClick={() => setLightbox(resolveUrl(verifyData.verifyImage))} alt="凭证"
                    style={{ width: 80, height: 80 }} />
                ) : (
                  <div className="verify-thumb-empty">暂无凭证</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 卡片数据 modal (查看 button) — matches screenshot 2 ── */}
      {cardData && (
        <div className="modal-mask" onClick={() => setCardData(null)}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span>卡片数据</span>
              <button onClick={() => setCardData(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* 基础信息 row */}
              <div className="info-row-bar">
                <span className="info-bar-label">基础信息：</span>
                <span className="info-bar-item"><span className="ibl">卡种</span><span className="ibv">{cardData.categoryName}</span></span>
                <span className="info-bar-item"><span className="ibl">面值</span><span className="ibv amount-green">{currSym(cardData.cardCurrency)}{cardData.cardAmount}</span></span>
                <span className="info-bar-item"><span className="ibl">输入方式</span><span className="ibv">{cardData.inputType || '—'}</span></span>
                <span className="info-bar-item"><span className="ibl">国家</span><span className="ibv">{countryLabel(cardData.cardCurrency)}</span></span>
                <span className="info-bar-item"><span className="ibl">数量</span><span className="ibv">{cardData.quantity ?? 0}</span></span>
              </div>

              {/* 核销编号 */}
              <div className="form-row">
                <label className="form-label">核销编号：</label>
                <input className="form-input" readOnly value={cardData.orderNo} />
              </div>

              {/* 用户信息 */}
              <div className="form-row">
                <label className="form-label">用户信息：</label>
                <span className="form-inline-label">用户id</span>
                <input className="form-input short" readOnly value={cardData.userId} />
                <span className="form-inline-label" style={{ marginLeft: 12 }}>用户备注</span>
                <input className="form-input medium" readOnly value={cardData.verifyRemark || ''} />
              </div>

              {/* 汇率数据 */}
              <div className="form-row">
                <label className="form-label">汇率数据：</label>
                <span className="form-inline-label">国家汇率</span>
                <input className="form-input short" readOnly value={cardData.countryRate ?? ''} />
                <span className="form-inline-label" style={{ marginLeft: 12 }}>采购汇率</span>
                <input className="form-input short" readOnly value={cardData.purchaseRate ?? ''} />
              </div>

              {/* 核销代码 — split by newline for multiple codes */}
              <div className="form-row align-top">
                <label className="form-label">核销代码：</label>
                <div className="codes-list">
                  {cardData.cardCode
                    ? cardData.cardCode.split('\n').filter((c: string) => c.trim()).map((code: string, i: number) => (
                        <CodeRow key={i} index={i + 1} code={code.trim()} />
                      ))
                    : <span className="no-img">暂无代码</span>
                  }
                </div>
              </div>

              {/* 到期时间 */}
              <div className="form-row">
                <label className="form-label">到期时间：</label>
                <input className="form-input" readOnly value={cardData.cardExpiry || ''} placeholder="—" />
              </div>

              {/* CVV */}
              <div className="form-row">
                <label className="form-label">Cvv：</label>
                <input className="form-input" readOnly value={cardData.cardCvv || ''} placeholder="—" />
              </div>

              {/* 图片 */}
              <div className="form-row align-top">
                <label className="form-label">图片：</label>
                <div className="card-imgs-row">
                  {cardData.cardImage
                    ? cardData.cardImage.split(',').map((u, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <Img src={resolveUrl(u.trim())} className="card-thumb"
                            onClick={() => setLightbox(resolveUrl(u.trim()))} alt=""
                            style={{ width: 100, height: 100 }} />
                          <button
                            onClick={() => copyImg(resolveUrl(u.trim()))}
                            style={{ fontSize: 11, color: '#1677ff', background: 'none', border: '1px solid #1677ff', borderRadius: 4, padding: '1px 8px', cursor: 'pointer' }}>
                            复制图片
                          </button>
                        </div>
                      ))
                    : <span className="no-img">暂无图片</span>
                  }
                </div>
              </div>

              {/* 收据 */}
              <div className="form-row align-top">
                <label className="form-label">收据：</label>
                {cardData.verifyImage ? (
                  <Img src={resolveUrl(cardData.verifyImage)} className="card-thumb"
                    onClick={() => setLightbox(resolveUrl(cardData.verifyImage))} alt="收据"
                    style={{ width: 100, height: 100 }} />
                ) : (
                  <span className="no-img">暂无收据</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit modal */}
      {auditRow && (
        <div className="modal-mask" onClick={() => { setAuditRow(null); setAuditImgFile(null); setAuditImage(''); setAdjustedAmount('') }}>
          <div className="modal-box small" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span>{auditResult === 'paid' ? '核销完成' : '标记失败'}</span>
              <button onClick={() => { setAuditRow(null); setAuditImgFile(null); setAuditImage(''); setAdjustedAmount('') }}>✕</button>
            </div>
            <div className="modal-body">
              <DR label="订单编号" value={auditRow.orderNo} />
              <DR label="用户ID"   value={String(auditRow.userId)} />
              <DR label="卡种"     value={auditRow.categoryName} />
              <DR label="面值"     value={`${currSym(auditRow.cardCurrency)}${auditRow.cardAmount}`} />
              <DR label="结算金额" value={fmtNgn(auditRow.ngnAmount)} />

              {/* Editable settlement amount — for partial bad card adjustments */}
              <div className="form-row" style={{ marginBottom: 8 }}>
                <label className="form-label" style={{ color: '#f59e0b', fontWeight: 700 }}>调整金额</label>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input
                    className="form-input"
                    type="number"
                    placeholder={`留空则使用原金额 ${fmtNgn(auditRow.ngnAmount)}`}
                    value={adjustedAmount}
                    onChange={e => setAdjustedAmount(e.target.value)}
                    style={{ borderColor: adjustedAmount ? '#f59e0b' : undefined }}
                  />
                  {(auditRow.quantity ?? 0) > 1 && !adjustedAmount && (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      提示：如有坏卡，请输入实际应支付金额（例如 {auditRow.quantity} 张中 2 张有效 → 输入 {fmtNgn((auditRow.ngnAmount / (auditRow.quantity ?? 1)) * 2)}）
                    </div>
                  )}
                </div>
              </div>

              {/* Show individual codes with pass/fail for each */}
              {auditRow.cardCode && auditRow.cardCode.trim() && (
                <div className="audit-codes-section">
                  <div className="audit-codes-title">卡片代码 ({auditRow.cardCode.split('\n').filter((c: string) => c.trim()).length} 张)</div>
                  {auditRow.cardCode.split('\n').filter((c: string) => c.trim()).map((code: string, i: number) => (
                    <div key={i} className="audit-code-row">
                      <span className="audit-code-num">{i + 1}</span>
                      <span className="audit-code-val">{code.trim()}</span>
                      <button className="copy-btn" style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={() => navigator.clipboard.writeText(code.trim())}>复制</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Audit result radio */}
              <div className="audit-radios">
                <label className={'audit-opt' + (auditResult === 'paid' ? ' sel' : '')}
                  onClick={() => setAuditResult('paid')}>✓ 核销完成</label>
                <label className={'audit-opt danger' + (auditResult === 'rejected' ? ' sel' : '')}
                  onClick={() => setAuditResult('rejected')}>✕ 标记失败</label>
              </div>

              {/* Remark */}
              <textarea className="audit-remark" placeholder="备注（如：bad card / used card）" rows={2}
                value={auditRemark} onChange={e => setAuditRemark(e.target.value)} />

              {/* Verify image upload + clipboard paste */}
              <div className="audit-img-section">
                <div className="audit-img-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>凭证图片（可选）</span>
                  <button
                    style={{ fontSize: 11, color: '#1677ff', background: 'none', border: '1px solid #1677ff', borderRadius: 4, padding: '1px 8px', cursor: 'pointer' }}
                    onClick={async () => {
                      try {
                        const items = await navigator.clipboard.read()
                        for (const item of items) {
                          const imgType = item.types.find(t => t.startsWith('image/'))
                          if (imgType) {
                            const blob = await item.getType(imgType)
                            const file = new File([blob], 'pasted.png', { type: imgType })
                            setAuditImgFile(file)
                            break
                          }
                        }
                      } catch {
                        alert('请先复制图片，再点击此按钮粘贴')
                      }
                    }}>
                    粘贴图片
                  </button>
                </div>
                <label className="audit-img-upload">
                  {auditImgFile ? (
                    <div className="audit-img-preview-wrap">
                      <img src={URL.createObjectURL(auditImgFile)} className="audit-img-preview" alt="" />
                      <button className="audit-img-remove" onClick={e => { e.preventDefault(); setAuditImgFile(null) }}>✕</button>
                    </div>
                  ) : (
                    <div className="audit-img-placeholder">
                      <span className="audit-img-icon">[ IMG ]</span>
                      <span>点击上传 / Ctrl+V 粘贴 / 使用粘贴按钮</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) setAuditImgFile(f); e.target.value = '' }} />
                </label>
              </div>

              <button className={'audit-submit' + (auditResult === 'rejected' ? ' danger' : '')}
                onClick={submitAudit} disabled={submitting}>
                {submitting ? '提交中…' : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 待受理订单 Popup ── */}
      {pendingPopup && (
        <div className="modal-mask" onClick={() => setPendingPopup(false)}>
          <div className="pending-popup-large" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="pp-header">
              <div className="pp-header-left">
                <span className="pp-title">待受理订单</span>
                {!pendingLoading && (
                  <span className="pp-count-badge">{pendingRows.length}</span>
                )}
              </div>
              <div className="pp-header-actions">
                <button
                  className="pp-refresh-btn"
                  onClick={loadPendingPopup}
                  disabled={pendingLoading}
                  title="刷新"
                >
                  {pendingLoading ? '加载中…' : '↻ 刷新'}
                </button>
                <button className="pp-close" onClick={() => setPendingPopup(false)}>✕</button>
              </div>
            </div>

            {/* Cards grid */}
            <div className="pp-cards-wrap">
              {/* Loading skeleton */}
              {pendingLoading && (
                <div className="pp-cards-grid">
                  {[1,2,3,4,5,6].map(k => (
                    <div key={k} className="pp-order-card pp-skeleton-card">
                      <div className="pp-sk-line wide" />
                      <div className="pp-sk-amounts">
                        <div className="pp-sk-line medium" />
                        <div className="pp-sk-line medium" />
                      </div>
                      <div className="pp-sk-line narrow" />
                      <div className="pp-sk-line narrow" />
                    </div>
                  ))}
                </div>
              )}

              {!pendingLoading && pendingRows.length === 0 ? (
                <div className="pp-empty-card">
                  <div className="pp-empty-icon">—</div>
                  <div className="pp-empty-title">暂无待受理订单</div>
                  <div className="pp-empty-sub">所有订单已处理完毕</div>
                </div>
              ) : !pendingLoading && (
                <div className="pp-cards-grid">
                  {pendingRows.map(r => (
                    <div key={r.id} className="pp-order-card">
                      {/* Card top */}
                      <div className="pp-card-top">
                        <div className="pp-card-cat">{r.categoryName}</div>
                        <span className="pp-card-status">待接单</span>
                      </div>

                      {/* Main amounts */}
                      <div className="pp-card-amounts">
                        <div className="pp-card-face">
                          <span className="pp-card-face-val">{currSym(r.cardCurrency)}{r.cardAmount}</span>
                          <span className="pp-card-face-lbl">面值</span>
                        </div>
                        <div className="pp-card-arrow">→</div>
                        <div className="pp-card-ngn">
                          <span className="pp-card-ngn-val">{fmtNgn(r.ngnAmount)}</span>
                          <span className="pp-card-ngn-lbl">结算金额</span>
                        </div>
                      </div>

                      {/* Details row */}
                      <div className="pp-card-details">
                        <span className="pp-card-detail-item">
                          <span className="pp-dl">用户</span>
                          <span className="pp-dv">#{r.userId}</span>
                        </span>
                        <span className="pp-card-detail-item">
                          <span className="pp-dl">国家</span>
                          <span className="pp-dv">{countryLabel(r.cardCurrency)}</span>
                        </span>
                        <span className="pp-card-detail-item">
                          <span className="pp-dl">类型</span>
                          <span className="pp-dv">{r.inputType || '—'}</span>
                        </span>
                        {r.quantity && r.quantity > 1 && (
                          <span className="pp-card-detail-item">
                            <span className="pp-dl">数量</span>
                            <span className="pp-dv">{r.quantity}</span>
                          </span>
                        )}
                      </div>

                      {/* Time + claim */}
                      <div className="pp-card-footer">
                        <span className="pp-card-time">{r.createTime?.slice(0, 16)}</span>
                        {canVerify && (
                          <button
                            className={'pp-claim-btn' + (claiming === r.id ? ' loading' : '')}
                            disabled={claiming === r.id}
                            onClick={() => claimOrder(r.id)}
                          >
                            {claiming === r.id ? '接单中…' : '接单 →'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="lightbox-img" alt="" onClick={e => e.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setLightbox(null)}>✕</button>
          <button
            onClick={e => { e.stopPropagation(); copyImg(lightbox) }}
            style={{
              position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '7px 22px',
              borderRadius: 6, fontSize: 13, border: 'none', cursor: 'pointer', backdropFilter: 'blur(4px)',
            }}>
            {copyMsg || '复制图片'}
          </button>
        </div>
      )}
    </div>
  )
}

function DR({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  )
}
