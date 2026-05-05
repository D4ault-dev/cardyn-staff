import React, { useEffect, useState, useCallback } from 'react'
import { getUsers } from '../api/users'
import type { AppUser } from '../types'
import './OrdersScreen.css'
import './UsersScreen.css'

function fmtNgn(n: number) { return '₦' + (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 }) }

// status: 1 = active (正常), 0 = banned (封禁)
function statusLabel(s: number) { return s === 1 ? '正常' : '封禁' }
function statusColor(s: number) { return s === 1 ? '#52c41a' : '#ff4d4f' }

export default function UsersScreen() {
  const [rows,    setRows]    = useState<AppUser[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const pageSize = 10
  const [loading, setLoading] = useState(false)
  const [search,  setSearch]  = useState('')
  const [detail,  setDetail]  = useState<AppUser | null>(null)

  const load = useCallback((p: number) => {
    setLoading(true)
    getUsers({ pageNum: p, pageSize, phone: search || undefined })
      .then(r => { setRows(r.rows); setTotal(r.total) })
      .finally(() => setLoading(false))
  }, [pageSize, search])

  useEffect(() => { load(1); setPage(1) }, [search]) // eslint-disable-line

  const totalPages = Math.ceil(total / pageSize)
  function goPage(p: number) { if (p < 1 || p > totalPages) return; setPage(p); load(p) }

  return (
    <div className="orders-root">
      <div className="orders-toolbar">
        <div className="toolbar-left">
          <input className="filter-input-sm" placeholder="手机号搜索" value={search}
            onChange={e => setSearch(e.target.value)} style={{ width: 180 }} />
          <button className="icon-btn-sm" onClick={() => load(page)} title="刷新">↻</button>
          <button className="icon-btn-sm" onClick={() => setSearch('')} title="重置">✕</button>
        </div>
        <div className="toolbar-right">
          <span style={{ fontSize: 13, color: '#666' }}>共 {total} 个用户</span>
        </div>
      </div>

      <div className="orders-table-wrap">
        <table className="orders-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>手机号</th>
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
            {loading && <tr><td colSpan={11} className="table-loading">加载中…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={11} className="table-empty">暂无数据</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td className="mono">{r.phone}</td>
                <td>{r.realName || r.phone}</td>
                <td className="amount-green">{fmtNgn(r.balance)}</td>
                <td className="amount-green">{fmtNgn(r.totalSales)}</td>
                <td>{r.tradeCount}</td>
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
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
          <button key={p} className={'pg-btn' + (p === page ? ' current' : '')} onClick={() => goPage(p)}>{p}</button>
        ))}
        {totalPages > 7 && <span className="pg-ellipsis">···</span>}
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
                <div className="udg-item"><span className="udg-label">ID</span><span className="udg-value">{detail.id}</span></div>
                <div className="udg-item"><span className="udg-label">手机号</span><span className="udg-value mono">{detail.phone}</span></div>
                <div className="udg-item"><span className="udg-label">邮箱</span><span className="udg-value">{detail.email || '—'}</span></div>
                <div className="udg-item"><span className="udg-label">真实姓名</span><span className="udg-value">{detail.realName || '—'}</span></div>
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
