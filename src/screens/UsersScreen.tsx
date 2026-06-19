import React, { useEffect, useState, useCallback } from 'react'
import { getUsers, setUserStatus } from '../api/users'
import type { AppUser } from '../types'
import { useAuth } from '../context/AuthContext'
import { ROLES, isSuper } from '../utils/roles'
import DateRangePicker from '../components/DateRangePicker'
import './OrdersScreen.css'
import './UsersScreen.css'

function fmtNgn(n: number) { return '₦' + (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 }) }

// status: 1 = active (正常), 0 = banned (封禁)
function statusLabel(s: number) { return s === 1 ? '正常' : '封禁' }
function statusColor(s: number) { return s === 1 ? '#52c41a' : '#ff4d4f' }

export default function UsersScreen() {
  const { user } = useAuth()
  const canManage = isSuper(user?.roleType || '')

  const [rows,    setRows]    = useState<AppUser[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const pageSize = 10
  const [loading, setLoading] = useState(false)
  const [firstLoad, setFirstLoad] = useState(true)
  const [search,  setSearch]  = useState('')  // UID / phone / email / name
  const [detail,  setDetail]  = useState<AppUser | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime,   setEndTime]   = useState('')
  const [toggling,  setToggling]  = useState<number | null>(null)

  const load = useCallback((p: number) => {
    setLoading(true)
    const params = {
      pageNum: p, pageSize,
      userSearch: search    || undefined,
      startTime: startDate ? startDate + ' ' + (startTime || '00:00') + ':00' : undefined,
      endTime:   endDate   ? endDate   + ' ' + (endTime   || '23:59') + ':59' : undefined,
    }
    getUsers(params, {
      onFresh: r => { setRows(r.rows); setTotal(r.total) },
    })
      .then(r => { setRows(r.rows); setTotal(r.total) })
      .finally(() => { setLoading(false); setFirstLoad(false) })
  }, [pageSize, search, startDate, endDate, startTime, endTime])

  useEffect(() => { load(1); setPage(1) }, [search, startDate, endDate, startTime, endTime]) // eslint-disable-line

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
            onChange={e => setSearch(e.target.value)} style={{ width: 180 }} />
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
              <th>邀请码</th>
              <th>等级</th>
              <th>国家</th>
              <th>状态</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {(loading && firstLoad) && (
              <>
                {[1,2,3,4,5].map(k => (
                  <tr key={k} className="skeleton-row">
                    {[1,2,3,4,5,6,7,8,9,10,11].map(c => (
                      <td key={c}><div className="skeleton-cell" /></td>
                    ))}
                  </tr>
                ))}
              </>
            )}
            {!(loading && firstLoad) && rows.length === 0 && <tr><td colSpan={11} className="table-empty">暂无数据</td></tr>}
            {!(loading && firstLoad) && rows.map(r => (
              <tr key={r.userId}>
                <td><span className="mono" style={{ fontWeight: 700, color: '#1677ff' }}>{r.userId}</span></td>
                <td className="mono">{r.phone || '—'}</td>
                <td className="mono" style={{ fontSize: 11, color: '#888' }}>{r.email || '—'}</td>
                <td>{r.realName || '—'}</td>
                <td className="amount-green">{fmtNgn(r.balance)}</td>
                <td className="amount-green">{fmtNgn(r.totalSales)}</td>
                <td>{r.tradeCount}</td>
                <td><span className="mono" style={{ fontSize: 11 }}>{r.inviteCode || '—'}</span></td>
                <td>Lv {r.level}</td>
                <td>{r.country || '—'}</td>
                <td>
                  <span className="status-pill" style={{ background: statusColor(r.status) + '20', color: statusColor(r.status) }}>
                    ● {statusLabel(r.status)}
                  </span>
                </td>
                <td>{r.createTime?.slice(0, 10)}</td>
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
        <div className="modal-mask" onClick={() => setDetail(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><span>用户详情</span><button onClick={() => setDetail(null)}>✕</button></div>
            <div className="modal-body">
              {detail.avatar && (
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <img src={detail.avatar} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} alt="" />
                </div>
              )}
              <div className="user-detail-grid">
                <div className="udg-item"><span className="udg-label">用户ID</span><span className="udg-value" style={{ fontWeight: 700, color: '#1677ff' }}>{detail.userId}</span></div>
                <div className="udg-item"><span className="udg-label">Profile ID</span><span className="udg-value mono" style={{ color: '#999', fontSize: 11 }}>{detail.id}</span></div>
                <div className="udg-item"><span className="udg-label">手机号</span><span className="udg-value mono">{detail.phone || '—'}</span></div>
                <div className="udg-item"><span className="udg-label">邮箱</span><span className="udg-value">{detail.email || '—'}</span></div>
                <div className="udg-item"><span className="udg-label">真实姓名</span><span className="udg-value">{detail.realName || '—'}</span></div>
                <div className="udg-item"><span className="udg-label">邀请码</span><span className="udg-value mono">{detail.inviteCode || '—'}</span></div>
                <div className="udg-item"><span className="udg-label">余额</span><span className="udg-value amount-green">{fmtNgn(detail.balance)}</span></div>
                <div className="udg-item"><span className="udg-label">总销售额</span><span className="udg-value amount-green">{fmtNgn(detail.totalSales)}</span></div>
                <div className="udg-item"><span className="udg-label">总提现</span><span className="udg-value">{fmtNgn(detail.totalWithdrawn)}</span></div>
                <div className="udg-item"><span className="udg-label">交易次数</span><span className="udg-value">{detail.tradeCount}</span></div>
                <div className="udg-item"><span className="udg-label">等级</span><span className="udg-value">Lv {detail.level}</span></div>
                <div className="udg-item"><span className="udg-label">国家</span><span className="udg-value">{detail.country || '—'}</span></div>
                <div className="udg-item"><span className="udg-label">状态</span>
                  <span className="status-pill" style={{ background: statusColor(detail.status) + '20', color: statusColor(detail.status) }}>
                    ● {statusLabel(detail.status)}
                  </span>
                </div>
                <div className="udg-item"><span className="udg-label">注册时间</span><span className="udg-value">{detail.createTime?.slice(0, 10)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
