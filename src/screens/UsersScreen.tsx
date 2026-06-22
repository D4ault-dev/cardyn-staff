import React, { useEffect, useState, useCallback, useRef } from 'react'
import { getUsers, setUserStatus, getUserOrders, getUserTransactions } from '../api/users'
import type { AppUser } from '../types'
import { useAuth } from '../context/AuthContext'
import { isSuper } from '../utils/roles'
import { fmtUid } from '../utils/resolveUrl'
import DateRangePicker from '../components/DateRangePicker'
import { useDebounce } from '../hooks/useDebounce'
import './OrdersScreen.css'
import './UsersScreen.css'

function fmtNgn(n: number) {
  return '₦' + (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })
}
function statusLabel(s: number) { return s === 1 ? '正常' : '封禁' }
function statusColor(s: number) { return s === 1 ? '#52c41a' : '#ff4d4f' }

// ── UserDetailModal ──────────────────────────────────────────────────────────
type Tab = 'profile' | 'orders' | 'transactions'

function UserDetailModal({
  user: u,
  canManage,
  toggling,
  onToggle,
  onClose,
}: {
  user: AppUser
  canManage: boolean
  toggling: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('profile')

  // Orders state
  const [orders,       setOrders]       = useState<any[]>([])
  const [orderTotal,   setOrderTotal]   = useState(0)
  const [orderPage,    setOrderPage]    = useState(1)
  const [orderLoading, setOrderLoading] = useState(false)

  // Transactions state
  const [txns,       setTxns]       = useState<any[]>([])
  const [txnTotal,   setTxnTotal]   = useState(0)
  const [txnPage,    setTxnPage]    = useState(1)
  const [txnLoading, setTxnLoading] = useState(false)
  const ordersLoaded = useRef(false)
  const txnsLoaded   = useRef(false)

  function loadOrders(p = 1) {
    setOrderLoading(true)
    getUserOrders(u.userId, p)
      .then((r: { rows: any[]; total: number }) => { setOrders(r.rows); setOrderTotal(r.total); setOrderPage(p) })
      .finally(() => setOrderLoading(false))
  }

  function loadTxns(p = 1) {
    setTxnLoading(true)
    getUserTransactions(u.userId, p)
      .then((r: { rows: any[]; total: number }) => { setTxns(r.rows); setTxnTotal(r.total); setTxnPage(p) })
      .finally(() => setTxnLoading(false))
  }

  function switchTab(t: Tab) {
    setTab(t)
    if (t === 'orders' && !ordersLoaded.current) { ordersLoaded.current = true; loadOrders(1) }
    if (t === 'transactions' && !txnsLoaded.current) { txnsLoaded.current = true; loadTxns(1) }
  }

  const orderStatusColor = (s: string) => {
    if (s === 'paid')       return { bg: '#f6ffed', color: '#52c41a' }
    if (s === 'rejected')   return { bg: '#fff2f0', color: '#ff4d4f' }
    if (s === 'processing') return { bg: '#e6f4ff', color: '#1677ff' }
    return { bg: '#f5f5f5', color: '#999' }
  }

  const txnColor = (amt: number) => amt >= 0 ? '#52c41a' : '#ff4d4f'

  return (
    <div className="ud-mask" onClick={onClose}>
      <div className="ud-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header bar ── */}
        <div className="ud-header">
          <div className="ud-header-left">
            <div className="ud-avatar">
              {u.avatar
                ? <img src={u.avatar} alt="" />
                : <span>{(u.realName || u.phone || '?')[0].toUpperCase()}</span>
              }
            </div>
            <div>
              <div className="ud-name">{u.realName || u.phone || '—'}</div>
              <div className="ud-meta">
                <span className="ud-uid">ID {fmtUid(u.userId)}</span>
                {u.phone && <span className="ud-sep">·</span>}
                {u.phone && <span>{u.phone}</span>}
                {u.email && <span className="ud-sep">·</span>}
                {u.email && <span>{u.email}</span>}
              </div>
            </div>
          </div>
          <div className="ud-header-right">
            <span
              className="ud-status-badge"
              style={{ background: statusColor(u.status) + '18', color: statusColor(u.status) }}
            >
              <span className="ud-status-dot" style={{ background: statusColor(u.status) }} />
              {statusLabel(u.status)}
            </span>
            {canManage && (
              <button
                className={'ud-action-btn ' + (u.status === 1 ? 'danger' : 'success')}
                disabled={toggling}
                onClick={onToggle}
              >
                {toggling ? '...' : u.status === 1 ? '封禁' : '解封'}
              </button>
            )}
            <button className="ud-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="ud-stats">
          <div className="ud-stat">
            <div className="ud-stat-label">余额</div>
            <div className="ud-stat-value green">{fmtNgn(u.balance)}</div>
          </div>
          <div className="ud-stat">
            <div className="ud-stat-label">总销售额</div>
            <div className="ud-stat-value green">{fmtNgn(u.totalSales)}</div>
          </div>
          <div className="ud-stat">
            <div className="ud-stat-label">总提现</div>
            <div className="ud-stat-value">{fmtNgn(u.totalWithdrawn)}</div>
          </div>
          <div className="ud-stat">
            <div className="ud-stat-label">交易次数</div>
            <div className="ud-stat-value">{u.tradeCount}</div>
          </div>
          <div className="ud-stat">
            <div className="ud-stat-label">等级</div>
            <div className="ud-stat-value">Lv {u.level}</div>
          </div>
          <div className="ud-stat">
            <div className="ud-stat-label">国家</div>
            <div className="ud-stat-value">{u.country || '—'}</div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="ud-tabs">
          <button className={'ud-tab' + (tab === 'profile'      ? ' active' : '')} onClick={() => switchTab('profile')}>基本信息</button>
          <button className={'ud-tab' + (tab === 'orders'       ? ' active' : '')} onClick={() => switchTab('orders')}>
            订单 {orderTotal > 0 && <span className="ud-tab-count">{orderTotal}</span>}
          </button>
          <button className={'ud-tab' + (tab === 'transactions' ? ' active' : '')} onClick={() => switchTab('transactions')}>
            交易记录 {txnTotal > 0 && <span className="ud-tab-count">{txnTotal}</span>}
          </button>
        </div>

        {/* ── Tab content ── */}
        <div className="ud-body">

          {/* Profile tab */}
          {tab === 'profile' && (
            <div className="ud-profile-grid">
              <div className="ud-row"><span className="ud-lbl">用户ID</span><span className="ud-val mono blue">{fmtUid(u.userId)}</span></div>
              <div className="ud-row"><span className="ud-lbl">Profile ID</span><span className="ud-val mono muted">{u.id}</span></div>
              <div className="ud-row"><span className="ud-lbl">手机号</span><span className="ud-val mono">{u.phone || '—'}</span></div>
              <div className="ud-row"><span className="ud-lbl">邮箱</span><span className="ud-val">{u.email || '—'}</span></div>
              <div className="ud-row"><span className="ud-lbl">真实姓名</span><span className="ud-val">{u.realName || '—'}</span></div>
              <div className="ud-row"><span className="ud-lbl">邀请码</span><span className="ud-val mono">{u.inviteCode || '—'}</span></div>
              <div className="ud-row"><span className="ud-lbl">注册时间</span><span className="ud-val">{u.createTime?.slice(0, 10)}</span></div>
              <div className="ud-row"><span className="ud-lbl">国家</span><span className="ud-val">{u.country || '—'}</span></div>
            </div>
          )}

          {/* Orders tab */}
          {tab === 'orders' && (
            <div className="ud-table-wrap">
              {orderLoading && orders.length === 0 && <div className="ud-loading">加载中...</div>}
              {!orderLoading && orders.length === 0 && <div className="ud-empty">暂无订单</div>}
              {orders.length > 0 && (
                <table className="ud-table">
                  <thead>
                    <tr>
                      <th>订单号</th>
                      <th>品类</th>
                      <th>礼品卡</th>
                      <th>金额</th>
                      <th>状态</th>
                      <th>日期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o: any) => {
                      const sc = orderStatusColor(o.status)
                      return (
                        <tr key={o.id}>
                          <td><span className="mono" style={{ fontSize: 11 }}>{o.orderNo}</span></td>
                          <td>{o.categoryName || '—'}</td>
                          <td>{o.cardCurrency} {o.cardAmount}</td>
                          <td className="amount-green">{fmtNgn(o.ngnAmount)}</td>
                          <td>
                            <span className="ud-pill" style={{ background: sc.bg, color: sc.color }}>
                              {o.status}
                            </span>
                          </td>
                          <td style={{ fontSize: 11, color: '#999' }}>{o.createTime?.slice(0, 10)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              {orderTotal > 15 && (
                <div className="ud-pagination">
                  <button disabled={orderPage <= 1} onClick={() => loadOrders(orderPage - 1)}>‹</button>
                  <span>{orderPage} / {Math.ceil(orderTotal / 15)}</span>
                  <button disabled={orderPage >= Math.ceil(orderTotal / 15)} onClick={() => loadOrders(orderPage + 1)}>›</button>
                </div>
              )}
            </div>
          )}

          {/* Transactions tab */}
          {tab === 'transactions' && (
            <div className="ud-table-wrap">
              {txnLoading && txns.length === 0 && <div className="ud-loading">加载中...</div>}
              {!txnLoading && txns.length === 0 && <div className="ud-empty">暂无交易记录</div>}
              {txns.length > 0 && (
                <table className="ud-table">
                  <thead>
                    <tr>
                      <th>类型</th>
                      <th>金额</th>
                      <th>订单号</th>
                      <th>日期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((t: any) => (
                      <tr key={t.id}>
                        <td>
                          <span className="ud-type-badge">{t.type}</span>
                        </td>
                        <td style={{ fontWeight: 600, color: txnColor(t.amount), fontFamily: 'monospace' }}>
                          {t.amount >= 0 ? '+' : ''}{fmtNgn(t.amount)}
                        </td>
                        <td><span className="mono muted" style={{ fontSize: 11 }}>{t.orderNo || '—'}</span></td>
                        <td style={{ fontSize: 11, color: '#999' }}>{t.createTime?.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {txnTotal > 15 && (
                <div className="ud-pagination">
                  <button disabled={txnPage <= 1} onClick={() => loadTxns(txnPage - 1)}>‹</button>
                  <span>{txnPage} / {Math.ceil(txnTotal / 15)}</span>
                  <button disabled={txnPage >= Math.ceil(txnTotal / 15)} onClick={() => loadTxns(txnPage + 1)}>›</button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function UsersScreen() {
  const { user } = useAuth()
  const canManage = isSuper(user?.roleType || '')

  const [rows,    setRows]    = useState<AppUser[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const pageSize = 10
  const [loading, setLoading] = useState(false)
  const [search,  setSearch]  = useState('')
  const debouncedSearch = useDebounce(search, 400)
  const [detail,   setDetail]   = useState<AppUser | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime,   setEndTime]   = useState('')
  const [toggling,  setToggling]  = useState<number | null>(null)

  const load = useCallback((p: number) => {
    setLoading(true)
    const params = {
      pageNum: p, pageSize,
      userSearch: debouncedSearch || undefined,
      startTime: startDate ? startDate + ' ' + (startTime || '00:00') + ':00' : undefined,
      endTime:   endDate   ? endDate   + ' ' + (endTime   || '23:59') + ':59' : undefined,
    }
    getUsers(params, {
      onFresh: r => { setRows(r.rows); setTotal(r.total) },
    })
      .then(r => { setRows(r.rows); setTotal(r.total) })
      .finally(() => setLoading(false))
  }, [pageSize, debouncedSearch, startDate, endDate, startTime, endTime])

  useEffect(() => { load(1); setPage(1) }, [debouncedSearch, startDate, endDate, startTime, endTime]) // eslint-disable-line

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

  async function handleToggleStatus(r: AppUser) {
    const newStatus = r.status === 1 ? 0 : 1
    const action = newStatus === 0 ? '封禁' : '解封'
    if (!confirm(`确定${action}用户 ${r.phone || r.userId}？`)) return
    setToggling(r.userId)
    try {
      await setUserStatus(r.userId, newStatus as 0 | 1)
      setRows(prev => prev.map(u => u.userId === r.userId ? { ...u, status: newStatus } : u))
      if (detail?.userId === r.userId) setDetail(prev => prev ? { ...prev, status: newStatus } : prev)
    } catch (e: any) { alert(e.message) }
    finally { setToggling(null) }
  }

  return (
    <div className="orders-root">
      <div className="orders-toolbar">
        <div className="toolbar-left">
          <input className="filter-input-sm" placeholder="UID/手机/邮箱/姓名" value={search}
            onChange={e => setSearch(e.target.value)} style={{ width: 200 }} />
          <DateRangePicker
            startDate={startDate} endDate={endDate}
            startTime={startTime} endTime={endTime}
            onChange={(s, e, st, et) => { setStartDate(s); setEndDate(e); setStartTime(st); setEndTime(et) }}
            onClear={() => { setStartDate(''); setEndDate(''); setStartTime(''); setEndTime('') }}
          />
          <button className="icon-btn-sm" onClick={() => load(page)} title="刷新">↻</button>
          <button className="icon-btn-sm" onClick={() => { setSearch(''); setStartDate(''); setEndDate(''); setStartTime(''); setEndTime('') }} title="重置">✕</button>
        </div>
        <div className="toolbar-right">
          <span style={{ fontSize: 13, color: '#666' }}>共 {total} 个用户</span>
        </div>
      </div>

      <div className="orders-table-wrap">
        <table className="orders-table">
          <thead>
            <tr>
              <th>用户ID</th>
              <th>手机号</th>
              <th>邮箱</th>
              <th>真实姓名</th>
              <th>余额</th>
              <th>总销售额</th>
              <th>交易次数</th>
              <th>等级</th>
              <th>国家</th>
              <th>状态</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              [1,2,3,4,5].map(k => (
                <tr key={k} className="skeleton-row">
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(c => (
                    <td key={c}><div className="skeleton-cell" /></td>
                  ))}
                </tr>
              ))
            )}
            {!loading && rows.length === 0 && <tr><td colSpan={12} className="table-empty">暂无数据</td></tr>}
            {rows.map(r => (
              <tr key={r.userId}>
                <td><span className="mono" style={{ fontWeight: 700, color: '#1677ff' }}>{fmtUid(r.userId)}</span></td>
                <td className="mono">{r.phone || '—'}</td>
                <td className="mono" style={{ fontSize: 11, color: '#888' }}>{r.email || '—'}</td>
                <td>{r.realName || '—'}</td>
                <td className="amount-green">{fmtNgn(r.balance)}</td>
                <td className="amount-green">{fmtNgn(r.totalSales)}</td>
                <td>{r.tradeCount}</td>
                <td>Lv {r.level}</td>
                <td>{r.country || '—'}</td>
                <td>
                  <span className="status-pill" style={{ background: statusColor(r.status) + '20', color: statusColor(r.status) }}>
                    <span style={{ fontSize: 8 }}>●</span> {statusLabel(r.status)}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: '#888' }}>{r.createTime?.slice(0, 10)}</td>
                <td>
                  <button className="act-btn blue" onClick={() => setDetail(r)}>查看</button>
                  {canManage && (
                    <button
                      className={'act-btn ' + (r.status === 1 ? 'danger' : 'primary')}
                      disabled={toggling === r.userId}
                      onClick={() => handleToggleStatus(r)}
                      style={{ marginLeft: 4 }}
                    >
                      {toggling === r.userId ? '…' : r.status === 1 ? '封禁' : '解封'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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

      {/* Detail modal */}
      {detail && (
        <UserDetailModal
          user={detail}
          canManage={canManage}
          toggling={toggling === detail.userId}
          onToggle={() => handleToggleStatus(detail)}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
