import React, { useEffect, useState, useCallback, useRef } from 'react'
import { getOrders, auditOrder } from '../api/orders'
import { invalidatePrefix } from '../api/cache'
import type { Order } from '../types'
import client, { clearClientCacheByUrl } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { canVerifyOrders, isSuper } from '../utils/roles'
import { playSuccess, playError } from '../utils/sound'
import DateRangePicker from '../components/DateRangePicker'
import Img from '../components/Img'
import { resolveUrl, fmtUid } from '../utils/resolveUrl'
import { useDebounce } from '../hooks/useDebounce'
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

export default function OrdersScreen({
  globalPendingCount = 0,
  newOrderAlert = false,
  onAlertDismissed,
  onPendingCountChange,
}: {
  globalPendingCount?: number
  newOrderAlert?: boolean
  onAlertDismissed?: () => void
  onPendingCountChange?: (n: number) => void
}) {
  const { user } = useAuth()
  const canVerify = canVerifyOrders(user?.roleType || '')
  // A staff can edit an order only if they claimed it (staffId matches) or they're super admin
  const canEditOrder = (order: Order | null) => {
    if (!order) return false
    if (isSuper(user?.roleType || '')) return true         // super admin can always edit
    if (!order.staffId) return false                        // unclaimed order — no one can edit yet
    return order.staffId === user?.userId                   // only the claimer can edit
  }

  const [rows,         setRows]         = useState<Order[]>([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading,      setLoading]      = useState(false)
  const [firstLoad,    setFirstLoad]    = useState(true)
  const [countries,    setCountries]    = useState<string[]>([])
  const [country,      setCountry]      = useState('')
  const [status,       setStatus]       = useState('')  // default all
  const [orderNo,      setOrderNo]      = useState('')
  const [userSearch,   setUserSearch]   = useState('')  // NEW: UID / phone / email / name

  // Debounced versions — only fire API call after user stops typing for 400ms
  const debouncedOrderNo    = useDebounce(orderNo,    400)
  const debouncedUserSearch = useDebounce(userSearch, 400)
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
  // Inline amount edit in 查看数据 modal
  const [editingNewAmount, setEditingNewAmount] = useState<string>('')
  const [savingNewAmount,  setSavingNewAmount]  = useState(false)

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

  // Load countries
  useEffect(() => {
    client.get('/tuka/country/list', { params: { pageSize: 100 } })
      .then(r => setCountries((r.data.rows || []).map((c: any) => c.name)))
      .catch(() => {})
  }, [])

  // Show pending popup on mount and keep it open whenever there are pending orders
  useEffect(() => {
    loadPendingPopup()
    setPendingPopup(true)
  }, []) // eslint-disable-line

  // Auto-open popup when a new order alert fires from global polling
  useEffect(() => {
    if (newOrderAlert) {
      loadPendingPopup()
      setPendingPopup(true)
      onAlertDismissed?.()
    }
  }, [newOrderAlert]) // eslint-disable-line

  // Auto-refresh pending popup every 8s — always running so staff see new orders immediately
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) loadPendingPopup()
    }, 8_000)
    return () => clearInterval(t)
  }, []) // eslint-disable-line

  // Auto-show popup when pending/processing orders arrive — never auto-hide
  useEffect(() => {
    if (pendingRows.length > 0) setPendingPopup(true)
    // NOTE: deliberately NOT closing when pendingRows.length === 0
    // Staff must manually close with X — so they always see the current state
  }, [pendingRows.length])

  // Silent background auto-refresh every 15s — only when tab is visible
  useEffect(() => {
    const silentLoad = () => {
      if (document.hidden) return  // don't waste requests when tab is not visible
      invalidatePrefix('orders:')
      getOrders({
        pageNum: page, pageSize,
        status:      status                || undefined,
        orderNo:     debouncedOrderNo      || undefined,
        userSearch:  debouncedUserSearch   || undefined,
        country:     country               || undefined,
        startTime: startDate ? startDate + ' ' + (startTime || '00:00') + ':00' : undefined,
        endTime:   endDate   ? endDate   + ' ' + (endTime   || '23:59') + ':59' : undefined,
      }).then(r => { setRows(r.rows); setTotal(r.total) }).catch(() => {})
    }
    const t = setInterval(silentLoad, 15_000)  // reduced from 8s to 15s
    return () => clearInterval(t)
  }, [page, pageSize, status, debouncedOrderNo, debouncedUserSearch, country, startDate, endDate, startTime, endTime]) // eslint-disable-line

  // Ctrl+V paste image into audit dialog OR 查看数据 modal when open
  useEffect(() => {
    if (!auditRow && !verifyData) return
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
  }, [auditRow, verifyData])

  const load = useCallback((p: number) => {
    setLoading(true)
    getOrders({
      pageNum: p, pageSize,
      status:      status                || undefined,
      orderNo:     debouncedOrderNo      || undefined,
      userSearch:  debouncedUserSearch   || undefined,
      country:     country               || undefined,
      startTime: startDate ? startDate + ' ' + (startTime || '00:00') + ':00' : undefined,
      endTime:   endDate   ? endDate   + ' ' + (endTime   || '23:59') + ':59' : undefined,
    }, {
      // onFresh: silently update rows when background revalidation completes
      onFresh: r => { setRows(r.rows); setTotal(r.total) },
    })
      .then(r => { setRows(r.rows); setTotal(r.total) })
      .finally(() => { setLoading(false); setFirstLoad(false) })
  }, [pageSize, status, debouncedOrderNo, debouncedUserSearch, country, startDate, endDate, startTime, endTime])

  useEffect(() => { load(1); setPage(1) }, [status, country, debouncedOrderNo, debouncedUserSearch, startDate, endDate, startTime, endTime]) // eslint-disable-line

  function reset() {
    setStatus(''); setCountry(''); setOrderNo(''); setUserSearch('')
    setStartDate(''); setEndDate(''); setStartTime(''); setEndTime('')
    setPage(1)
  }

  // Load pending orders for popup:
  // - All unclaimed (pending) orders — any staff can claim
  // - Processing orders claimed by THIS staff — only they see their own
  function loadPendingPopup() {
    setPendingLoading(true)
    clearClientCacheByUrl('/tuka/order/list')
    client.get('/tuka/order/list', { params: { status: 'pending', pageSize: 50 } })
      .then(r => {
        const pendingRows = r.data.rows || []
        // Also fetch processing orders claimed by THIS staff only
        client.get('/tuka/order/list', { params: { status: 'processing', pageSize: 50, staffId: user?.userId } })
          .then(r2 => {
            const myProcessing = (r2.data.rows || []).filter(
              (o: any) => o.staffId === user?.userId
            )
            setPendingRows([...pendingRows, ...myProcessing])
          })
          .catch(() => setPendingRows(pendingRows))
      })
      .catch(() => {})
      .finally(() => setPendingLoading(false))
  }

  // Claim/accept a pending order (mark as processing)
  // Uses atomic backend claim — if another staff got it first, shows a clear message.
  async function claimOrder(orderId: number) {
    setClaiming(orderId)
    try {
      await client.put('/tuka/order/audit', { id: orderId, status: 'processing', verifyRemark: '' })
      loadPendingPopup()
      load(page)
      // Refresh global pending count
      client.get('/tuka/order/list', { params: { status: 'pending', pageSize: 1 } })
        .then(r => { onPendingCountChange?.(r.data.total || 0) })
    } catch (e: any) {
      const msg: string = e.message || ''
      if (msg.includes('already claimed') || msg.includes('409')) {
        // Another staff grabbed it — refresh the list silently so it shows as processing
        loadPendingPopup()
        load(page)
        // Show a non-blocking notification instead of a blocking alert
        const toast = document.createElement('div')
        toast.textContent = msg.replace('409: ', '') || 'Order already claimed by another staff'
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#ff4d4f;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2)'
        document.body.appendChild(toast)
        setTimeout(() => toast.remove(), 3000)
      } else {
        alert(msg)
      }
    } finally { setClaiming(null) }
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
      // If a custom settlement amount is entered, use it directly
      const acceptedCount = parseInt(adjustedAmount)
      const totalQty = auditRow.quantity ?? 1
      let newAmount: number | undefined
      // Direct NGN amount input — use as-is if it's a valid positive number
      const directAmount = parseFloat(adjustedAmount)
      if (adjustedAmount.trim() && !isNaN(directAmount) && directAmount > 0 && directAmount < auditRow.ngnAmount) {
        newAmount = Math.round(directAmount * 100) / 100
      }
      // Pass newAmount directly to the audit call
      await client.put('/tuka/order/audit', {
        id: auditRow.id,
        status: auditResult,
        verifyRemark: auditRemark,
        verifyImage: imageUrl,
        ...(newAmount !== undefined ? { newAmount } : {}),
      })
      playSuccess()
      setAuditRow(null); setAuditRemark(''); setAuditImage(''); setAuditImgFile(null); setAdjustedAmount('')
      load(page)
      client.get('/tuka/order/list', { params: { status: 'pending', pageSize: 1 } })
        .then(r => { onPendingCountChange?.(r.data.total || 0) })
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

          {/* User search */}
          <input className="filter-input-sm" placeholder="UID/手机/邮箱/姓名" value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            style={{ width: 160 }} />

          {/* Date range picker */}
          <DateRangePicker
            startDate={startDate} endDate={endDate}
            startTime={startTime} endTime={endTime}
            onChange={(s, e, st, et) => { setStartDate(s); setEndDate(e); setStartTime(st); setEndTime(et) }}
            onClear={() => { setStartDate(''); setEndDate(''); setStartTime(''); setEndTime('') }}
          />

          {/* Reset only — refresh happens automatically every 5s */}
          <button className="icon-btn-sm" onClick={reset} title="重置">✕</button>
        </div>

        {/* Right: pending orders badge button → opens popup */}
        <div className="toolbar-right">
          <button
            className="pending-btn"
            onClick={() => { loadPendingPopup(); setPendingPopup(true) }}
          >
            待受理订单
            {globalPendingCount > 0 && (
              <span className="pending-badge">{globalPendingCount}</span>
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
              <tr key={r.id}>
                <td>{r.id}</td>
                <td><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmtUid(r.userId)}</span></td>
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
                    <button className="act-btn blue" onClick={() => { setVerifyData(r); setEditingNewAmount(String(r.newAmount ?? r.ngnAmount ?? '')); setAuditRemark(''); setAuditImgFile(null); setAdjustedAmount('') }}>查看数据</button>
                    <button className="act-btn green" onClick={() => setCardData(r)}>查看</button>
                    {/* Status badge only — audit actions moved inside 查看数据 modal */}
                    {r.status === 'paid' && <span className="status-badge paid">核销完成</span>}
                    {r.status === 'rejected' && <span className="status-badge rejected" title={r.rejectReason || 'bad card'}>失败</span>}
                    {r.status === 'pending' && <span className="status-badge pending">待处理</span>}
                    {r.status === 'processing' && <span className="status-badge processing">处理中</span>}
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
        <select
          className="pg-size-select"
          value={pageSize}
          onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
        >
          {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {/* ── 查看数据 modal: title = '核销' for active, '核销数据' for paid/rejected ── */}
      {verifyData && (() => {
        const canEdit = canEditOrder(verifyData)
        const isActive = verifyData.status === 'pending' || verifyData.status === 'processing'
        return (
        <div className="modal-mask" onClick={() => { setVerifyData(null); setAuditRemark(''); setAuditImgFile(null) }}>
          <div className="modal-box wide" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span>{(verifyData.status === 'pending' || verifyData.status === 'processing') ? '核销' : '核销数据'}</span>
              <button onClick={() => { setVerifyData(null); setAuditRemark(''); setAuditImgFile(null) }}>✕</button>
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
                <input className="form-input short" readOnly value={fmtUid(verifyData.userId)} />
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

              {/* 结算金额 row — active: editable + red button; paid: readonly, no button */}
              <div className="form-row">
                <label className="form-label">结算金额：</label>
                <span className="form-inline-label">结算金额</span>
                <input className="form-input medium" readOnly
                  value={fmtNgn(verifyData.ngnAmount)}
                  style={{ color: '#888', background: '#fafafa' }} />
                <span className="form-inline-label" style={{ marginLeft: 10 }}>结算数量</span>
                <input className="form-input" readOnly
                  value={verifyData.quantity ?? 1}
                  style={{ width: 50, color: '#888', background: '#fafafa' }} />
                <span className="form-inline-label" style={{ marginLeft: 10 }}>变更结算金额</span>
                <input
                  className="form-input"
                  type="number"
                  readOnly={!canEdit || verifyData.status === 'paid' || verifyData.status === 'rejected'}
                  value={editingNewAmount}
                  onChange={e => setEditingNewAmount(e.target.value)}
                  style={{ width: 120,
                    background: (!canEdit || verifyData.status === 'paid' || verifyData.status === 'rejected') ? '#fafafa' : undefined,
                    color: (!canEdit || verifyData.status === 'paid' || verifyData.status === 'rejected') ? '#888' : undefined }}
                />
                {/* Red button only for active orders AND only if this staff claimed it */}
                {isActive && canEdit && (
                  <button
                    className="act-btn danger"
                    style={{ marginLeft: 8, whiteSpace: 'nowrap' }}
                    disabled={savingNewAmount}
                    onClick={async () => {
                      const amt = parseFloat(editingNewAmount)
                      if (isNaN(amt) || amt <= 0) { alert('请输入有效金额'); return }
                      setSavingNewAmount(true)
                      try {
                        await client.put('/tuka/order/audit', { id: verifyData.id, status: verifyData.status, verifyRemark: verifyData.verifyRemark || '', newAmount: amt, amountUpdateOnly: true })
                        setVerifyData((prev: any) => prev ? { ...prev, newAmount: amt } : prev)
                        load(page)
                      } catch (e: any) { alert(e.message) }
                      finally { setSavingNewAmount(false) }
                    }}>
                    {savingNewAmount ? '保存中…' : '变更结算金额'}
                  </button>
                )}
              </div>
              {verifyData.newAmount && verifyData.newAmount !== verifyData.ngnAmount && (
                <div className="form-row" style={{ marginTop: -8 }}>
                  <label className="form-label" />
                  <span style={{ fontSize: 12, color: '#f59e0b' }}>
                    已调整：用户实收 {fmtNgn(verifyData.newAmount)}（原 {fmtNgn(verifyData.ngnAmount)}，差额 {fmtNgn(verifyData.ngnAmount - verifyData.newAmount)}）
                  </span>
                </div>
              )}

              {/* 卡片代码 — Code type orders */}
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

              {/* 卡片图片 — Physical type orders */}
              {verifyData.cardImage && (
                <div className="form-row align-top">
                  <label className="form-label">卡片图片：</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {verifyData.cardImage.split(',').map((u: string, i: number) => u.trim() && (
                      <img
                        key={i}
                        src={resolveUrl(u.trim())}
                        style={{
                          width: 64, height: 64, flexShrink: 0,
                          objectFit: 'cover', borderRadius: 4,
                          cursor: 'pointer', border: '1px solid #e8e8e8',
                          display: 'block',
                        }}
                        onClick={() => setLightbox(resolveUrl(u.trim()))}
                        alt={`card-${i + 1}`}
                        title="点击查看大图"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Show message if neither code nor image */}
              {!verifyData.cardCode && !verifyData.cardImage && (
                <div className="form-row">
                  <label className="form-label">卡片内容：</label>
                  <span style={{ color: '#bbb', fontSize: 13 }}>暂无卡片代码或图片</span>
                </div>
              )}

              {/* 备注信息 — editable only for active orders claimed by this staff */}
              <div className="form-row align-top">
                <label className="form-label">备注信息：</label>
                {(isActive && canEdit) ? (
                  <textarea className="form-textarea" rows={3} style={{ flex: 1 }}
                    placeholder="备注（如：bad card / used card）"
                    value={auditRemark}
                    onChange={e => setAuditRemark(e.target.value)} />
                ) : (
                  <textarea className="form-textarea" readOnly rows={3} style={{ flex: 1 }}
                    value={verifyData.verifyRemark || ''} />
                )}
              </div>

              {/* 核销凭证 — upload only for active orders claimed by this staff */}
              <div className="form-row align-top">
                <label className="form-label">核销凭证：</label>
                {(isActive && canEdit) ? (
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <label style={{ width: 120, height: 90, border: '1px dashed #d9d9d9', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#fafafa', position: 'relative' }}>
                      {auditImgFile ? (
                        <>
                          <img src={URL.createObjectURL(auditImgFile)} style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 6 }} alt="" />
                          <button style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={e => { e.preventDefault(); setAuditImgFile(null) }}>✕</button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 13, color: '#999' }}>点击上传</span>
                          <span style={{ fontSize: 11, color: '#bbb', marginTop: 4, textAlign: 'center' }}>或 Ctrl+V 粘贴</span>
                        </>
                      )}
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) setAuditImgFile(f); e.target.value = '' }} />
                    </label>
                    <button
                      style={{ padding: '6px 14px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', color: '#333', fontSize: 13, cursor: 'pointer' }}
                      onClick={async () => {
                        try {
                          const items = await navigator.clipboard.read()
                          for (const item of items) {
                            const imgType = item.types.find(t => t.startsWith('image/'))
                            if (imgType) { const blob = await item.getType(imgType); setAuditImgFile(new File([blob], 'pasted.png', { type: imgType })); return }
                          }
                          alert('剪贴板中没有图片')
                        } catch { alert('请先复制图片，再点击此按钮或使用 Ctrl+V') }
                      }}>
                      点击粘贴图片
                    </button>
                  </div>
                ) : (
                  verifyData.verifyImage
                    ? <Img src={resolveUrl(verifyData.verifyImage)} className="verify-thumb" onClick={() => setLightbox(resolveUrl(verifyData.verifyImage))} alt="凭证" style={{ width: 80, height: 80 }} />
                    : <span className="no-img">暂无凭证</span>
                )}
              </div>

              {/* 核销完成 / 核销失败 — only for active orders claimed by THIS staff */}
              {canVerify && isActive && canEdit && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                  <button className="act-btn primary" style={{ padding: '9px 32px', fontSize: 14, minWidth: 120 }}
                    disabled={submitting}
                    onClick={async () => {
                      if (!confirm('确认核销完成？')) return
                      setSubmitting(true)
                      try {
                        let imageUrl = ''
                        if (auditImgFile) {
                          const fd = new FormData(); fd.append('file', auditImgFile)
                          const res = await client.post('/common/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                          imageUrl = res.data.url || ''
                        }
                        const amt = parseFloat(editingNewAmount)
                        const payload: any = { id: verifyData.id, status: 'paid', verifyRemark: auditRemark, verifyImage: imageUrl }
                        if (!isNaN(amt) && amt > 0 && amt !== verifyData.ngnAmount) payload.newAmount = amt
                        await client.put('/tuka/order/audit', payload)
                        playSuccess()
                        setVerifyData(null); setAuditRemark(''); setAuditImgFile(null)
                        load(page)
                        client.get('/tuka/order/list', { params: { status: 'pending', pageSize: 1 } }).then(r => { onPendingCountChange?.(r.data.total || 0) })
                      } catch (e: any) { alert(e.message) }
                      finally { setSubmitting(false) }
                    }}>
                    {submitting ? '提交中…' : '核销完成'}
                  </button>
                  <button className="act-btn danger" style={{ padding: '9px 32px', fontSize: 14, minWidth: 120 }}
                    disabled={submitting}
                    onClick={async () => {
                      if (!confirm('确认标记为核销失败？')) return
                      setSubmitting(true)
                      try {
                        let imageUrl = ''
                        if (auditImgFile) {
                          const fd = new FormData(); fd.append('file', auditImgFile)
                          const res = await client.post('/common/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                          imageUrl = res.data.url || ''
                        }
                        await client.put('/tuka/order/audit', { id: verifyData.id, status: 'rejected', verifyRemark: auditRemark, verifyImage: imageUrl })
                        setVerifyData(null); setAuditRemark(''); setAuditImgFile(null)
                        load(page)
                        client.get('/tuka/order/list', { params: { status: 'pending', pageSize: 1 } }).then(r => { onPendingCountChange?.(r.data.total || 0) })
                      } catch (e: any) { alert(e.message) }
                      finally { setSubmitting(false) }
                    }}>
                    {submitting ? '提交中…' : '核销失败'}
                  </button>
                </div>
              )}
            </div>
              {/* Notice for staff viewing an order they didn't claim */}
              {isActive && !canEdit && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <span style={{ fontSize: 13, color: '#d46b08' }}>
                    This order is being processed by <strong>{(verifyData as any).staffName || 'another staff'}</strong>. You can view but not edit.
                  </span>
                </div>
              )}

            </div>
          </div>
        )
      })()}

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
                <input className="form-input short" readOnly value={fmtUid(cardData.userId)} />
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

              {/* 核销代码 — full width input matching screenshot */}
              <div className="form-row">
                <label className="form-label">核销代码：</label>
                <input
                  className="form-input"
                  readOnly
                  value={cardData.cardCode ? cardData.cardCode.split('\n').filter((c: string) => c.trim()).join(' / ') : ''}
                  placeholder="—"
                  style={{ fontFamily: 'monospace', letterSpacing: 1 }}
                />
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

      {/* ── 待受理订单 Popup ── */}
      {pendingPopup && (
        <div className="modal-mask" onClick={() => setPendingPopup(false)}>
          <div className="pp-list-popup" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="pp-list-header">
              <span className="pp-list-title">待受理订单</span>
              {pendingRows.length > 0 && (
                <span className="pp-list-count">
                  {pendingRows.filter(r => r.status === 'pending').length > 0 && `${pendingRows.filter(r => r.status === 'pending').length} 待接单`}
                  {pendingRows.filter(r => r.status === 'pending').length > 0 && pendingRows.filter(r => r.status === 'processing').length > 0 && ' · '}
                  {pendingRows.filter(r => r.status === 'processing').length > 0 && `${pendingRows.filter(r => r.status === 'processing').length} 我的处理中`}
                </span>
              )}
              <button className="pp-list-close" onClick={() => setPendingPopup(false)}>✕</button>
            </div>

            {/* List body */}
            <div className="pp-list-body">
              {pendingRows.length === 0 ? (
                <div className="pp-list-empty">暂无待受理订单</div>
              ) : (                <table className="pp-list-table">
                  <thead>
                    <tr>
                      <th>卡种</th>
                      <th>面值</th>
                      <th>结算金额</th>
                      <th>数量</th>
                      <th>类型</th>
                      <th>国家</th>
                      <th>时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRows.map(r => (
                      <tr key={r.id} style={{ background: r.status === 'processing' ? '#f0f9ff' : undefined }}>
                        <td>{r.categoryName}</td>
                        <td>{currSym(r.cardCurrency)}{r.cardAmount}</td>
                        <td>{fmtNgn(r.ngnAmount)}</td>
                        <td>{r.quantity ?? 1}</td>
                        <td>{r.inputType || '—'}</td>
                        <td>{countryLabel(r.cardCurrency)}</td>
                        <td className="pp-list-time">{r.createTime?.slice(0, 16)}</td>
                        <td>
                          {r.status === 'processing' ? (
                            // Already claimed — show who claimed it and a View button
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, color: '#1677ff', fontWeight: 600 }}>
                                {(r as any).staffName || '处理中'}
                              </span>
                              <button
                                className="pp-list-claim"
                                style={{ background: '#fff', color: '#1677ff', border: '1px solid #1677ff' }}
                                onClick={() => {
                                  setPendingPopup(false)
                                  setVerifyData(r)
                                  setEditingNewAmount(String(r.newAmount ?? r.ngnAmount ?? ''))
                                  setAuditRemark('')
                                  setAuditImgFile(null)
                                  setAdjustedAmount('')
                                }}
                              >
                                查看
                              </button>
                            </div>
                          ) : (
                            canVerify && (
                              <button
                                className={'pp-list-claim' + (claiming === r.id ? ' loading' : '')}
                                disabled={!!claiming}
                                onClick={() => claimOrder(r.id)}
                              >
                                {claiming === r.id ? '接单中…' : '接单'}
                              </button>
                            )
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
