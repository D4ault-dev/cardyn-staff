import React, { useEffect, useState, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import client from '../api/client'
import DateRangePicker from '../components/DateRangePicker'
import './DashboardScreen.css'

// ── Types ─────────────────────────────────────────────────────────────────────
type Stats = {
  todayOrders: number
  todayRevenue: number
  pendingOrders: number
  totalUsers: number
  todayUsers: number
  totalRevenue: number
  pendingWithdrawals: number
  pendingWithdrawalAmount: number
}

type TrendRow   = { day: string; orderCount: number; revenue: number }
type StatusRow  = { status: string; count: number }
type CardRow    = { name: string; count: number; revenue: number }
type HourlyRow  = { hour: string; count: number }
type RecentTx   = {
  id: number
  orderNo: string
  userId: number
  categoryName: string
  cardCurrency: string
  cardAmount: number
  ngnAmount: number
  status: string
  createTime: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtNgn(n: number) {
  if (n >= 1_000_000) return '₦' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return '₦' + (n / 1_000).toFixed(1) + 'K'
  return '₦' + (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 })
}
function fmtFull(n: number) {
  return '₦' + (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })
}

// Today as yyyy-MM-dd
function today() {
  return new Date().toISOString().slice(0, 10)
}
// 30 days ago as yyyy-MM-dd
function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const STATUS_COLORS: Record<string, string> = {
  paid:       '#52c41a',
  pending:    '#fa8c16',
  processing: '#1677ff',
  rejected:   '#ff4d4f',
}
const STATUS_LABELS: Record<string, string> = {
  paid:       '已完成',
  pending:    '待处理',
  processing: '处理中',
  rejected:   '已拒绝',
}
const PIE_COLORS = ['#52c41a', '#fa8c16', '#1677ff', '#ff4d4f', '#722ed1', '#13c2c2']

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', GBP: '£', EUR: '€', CAD: 'C$', AUD: 'A$',
  JPY: '¥', CNY: '¥', PHP: '₱', SGD: 'S$', NGN: '₦',
  US: '$', GB: '£', EU: '€', CA: 'C$', AU: 'A$',
  JP: '¥', CN: '¥', PH: '₱', SG: 'S$', NG: '₦',
}
function currSym(code: string) { return CURRENCY_SYMBOL[code] || '' }

// ── KPI Icons (pure SVG — no emoji) ──────────────────────────────────────────
const ICONS: Record<string, React.ReactElement> = {
  orders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
    </svg>
  ),
  revenue: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v2m0 8v2M9 9h4a2 2 0 0 1 0 4H9m0 0h6"/>
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  withdraw: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
    </svg>
  ),
}

function KpiCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: keyof typeof ICONS
}) {
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="kpi-icon" style={{ background: color + '18', color }}>{ICONS[icon]}</div>
      <div className="kpi-body">
        <div className="kpi-value" style={{ color }}>{value}</div>
        <div className="kpi-label">{label}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="ct-label">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="ct-row" style={{ color: p.color }}>
          <span>{p.name}：</span>
          <span>{p.dataKey === 'revenue' ? fmtFull(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Quick date presets ────────────────────────────────────────────────────────
const PRESETS = [
  { label: '今日',   start: today(),      end: today() },
  { label: '近7天',  start: daysAgo(6),   end: today() },
  { label: '近30天', start: daysAgo(29),  end: today() },
  { label: '近90天', start: daysAgo(89),  end: today() },
]

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const [stats,    setStats]    = useState<Stats | null>(null)
  const [trend,    setTrend]    = useState<TrendRow[]>([])
  const [status,   setStatus]   = useState<StatusRow[]>([])
  const [topCards, setTopCards] = useState<CardRow[]>([])
  const [hourly,   setHourly]   = useState<HourlyRow[]>([])
  const [recentTx, setRecentTx] = useState<RecentTx[]>([])
  const [loading,  setLoading]  = useState(true)
  const [firstLoad, setFirstLoad] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Date range filter — default to last 30 days
  const [startDate, setStartDate] = useState(daysAgo(29))
  const [endDate,   setEndDate]   = useState(today())
  const [startTime, setStartTime] = useState('')
  const [endTime,   setEndTime]   = useState('')
  const [activePreset, setActivePreset] = useState(2) // "近30天" index

  const load = useCallback(async (sd: string, ed: string, st: string, et: string) => {
    setLoading(true)
    try {
      const startTime_ = sd ? sd + ' ' + (st || '00:00') + ':00' : undefined
      const endTime_   = ed ? ed + ' ' + (et || '23:59') + ':59' : undefined

      const [s, t, stBreak, tc, h, tx] = await Promise.all([
        client.get('/tuka/dashboard/stats'),
        client.get('/tuka/dashboard/trend'),
        client.get('/tuka/dashboard/status'),
        client.get('/tuka/dashboard/topCards', {
          params: {
            startDate: sd || undefined,
            endDate:   ed || undefined,
          },
        }),
        client.get('/tuka/dashboard/hourly'),
        client.get('/tuka/order/list', {
          params: {
            pageNum:   1,
            pageSize:  20,
            startTime: startTime_,
            endTime:   endTime_,
          },
        }),
      ])
      setStats(s.data.data)
      setTrend(t.data.data || [])
      setStatus(stBreak.data.data || [])
      setTopCards(tc.data.data || [])
      setHourly(h.data.data || [])
      setRecentTx(tx.data.rows || [])
      setLastRefresh(new Date())
    } catch { /* keep existing */ }
    finally { setLoading(false); setFirstLoad(false) }
  }, [])

  useEffect(() => {
    load(startDate, endDate, startTime, endTime)
    // Auto-refresh every 60s
    const t = setInterval(() => load(startDate, endDate, startTime, endTime), 60_000)
    return () => clearInterval(t)
  }, [load, startDate, endDate, startTime, endTime])

  function applyPreset(idx: number) {
    const p = PRESETS[idx]
    setActivePreset(idx)
    setStartDate(p.start)
    setEndDate(p.end)
    setStartTime('')
    setEndTime('')
  }

  function handleDateChange(s: string, e: string, st: string, et: string) {
    setActivePreset(-1) // custom
    setStartDate(s); setEndDate(e); setStartTime(st); setEndTime(et)
  }

  // Shorten trend day labels: "2026-05-12" → "05/12"
  const trendData = trend.map(r => ({ ...r, day: r.day.slice(5).replace('-', '/') }))

  // Only show hours up to current hour
  const nowHour = new Date().getHours()
  const hourlyData = hourly.filter((_, i) => i <= nowHour)

  return (
    <div className="dash-root">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h2 className="dash-title">数据概览</h2>
          <span className="dash-refresh">上次更新：{lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
        <div className="dash-header-right">
          {/* Quick presets */}
          <div className="dash-presets">
            {PRESETS.map((p, i) => (
              <button
                key={p.label}
                className={'dash-preset-btn' + (activePreset === i ? ' active' : '')}
                onClick={() => applyPreset(i)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Custom date range */}
          <DateRangePicker
            startDate={startDate} endDate={endDate}
            startTime={startTime} endTime={endTime}
            onChange={handleDateChange}
            onClear={() => { setActivePreset(2); setStartDate(daysAgo(29)); setEndDate(today()); setStartTime(''); setEndTime('') }}
          />
          <button className="dash-refresh-btn" onClick={() => load(startDate, endDate, startTime, endTime)} disabled={loading}>
            {loading ? '加载中…' : '↻ 刷新'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KpiCard label="今日订单"     value={String(stats?.todayOrders ?? '—')}    color="#1677ff" icon="orders"   sub={`待处理 ${stats?.pendingOrders ?? 0}`} />
        <KpiCard label="今日收入"     value={fmtNgn(stats?.todayRevenue ?? 0)}     color="#52c41a" icon="revenue"  sub={`总收入 ${fmtNgn(stats?.totalRevenue ?? 0)}`} />
        <KpiCard label="今日新用户"   value={String(stats?.todayUsers ?? '—')}     color="#722ed1" icon="users"    sub={`总用户 ${stats?.totalUsers ?? 0}`} />
        <KpiCard label="待处理提现"   value={String(stats?.pendingWithdrawals ?? '—')} color="#fa8c16" icon="withdraw" sub={fmtNgn(stats?.pendingWithdrawalAmount ?? 0)} />
      </div>

      {/* Charts row 1: Trend + Hourly */}
      <div className="dash-row">
        {/* 30-day trend */}
        <div className="dash-card wide">
          <div className="dash-card-head">
            <span className="dash-card-title">近30天趋势</span>
            <span className="dash-card-sub">订单量 & 收入</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
              <YAxis yAxisId="left"  tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }}
                tickFormatter={v => fmtNgn(v)} />
              <Tooltip content={<TrendTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="left"  type="monotone" dataKey="orderCount" name="订单量"
                stroke="#1677ff" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line yAxisId="right" type="monotone" dataKey="revenue"    name="收入(₦)"
                stroke="#52c41a" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Today hourly */}
        <div className="dash-card">
          <div className="dash-card-head">
            <span className="dash-card-title">今日订单分布</span>
            <span className="dash-card-sub">按小时</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourlyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v: any) => [v, '订单数']} />
              <Bar dataKey="count" name="订单数" fill="#1677ff" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2: Status pie + Top cards bar */}
      <div className="dash-row">
        {/* Order status pie */}
        <div className="dash-card">
          <div className="dash-card-head">
            <span className="dash-card-title">订单状态分布</span>
            <span className="dash-card-sub">全部时间</span>
          </div>
          <div className="pie-wrap">
            <ResponsiveContainer width="55%" height={200}>
              <PieChart>
                <Pie data={status} dataKey="count" nameKey="status"
                  cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {status.map((s, i) => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any, name: any) => [v, STATUS_LABELS[name] || name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pie-legend">
              {status.map((s, i) => (
                <div key={s.status} className="pie-legend-row">
                  <span className="pie-dot" style={{ background: STATUS_COLORS[s.status] || PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="pie-legend-label">{STATUS_LABELS[s.status] || s.status}</span>
                  <span className="pie-legend-val">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top card categories */}
        <div className="dash-card wide">
          <div className="dash-card-head">
            <span className="dash-card-title">热门卡种 Top 8</span>
            <span className="dash-card-sub">
              {startDate && endDate ? `${startDate} ~ ${endDate}` : '按订单量'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topCards} layout="vertical"
              margin={{ top: 4, right: 60, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(v: any, name: any) => [
                name === 'revenue' ? fmtFull(v) : v,
                name === 'revenue' ? '收入' : '订单量',
              ]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="count"   name="订单量" fill="#1677ff" radius={[0, 3, 3, 0]} />
              <Bar dataKey="revenue" name="收入"   fill="#52c41a" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="dash-card" style={{ marginBottom: 20 }}>
        <div className="dash-card-head" style={{ marginBottom: 14 }}>
          <span className="dash-card-title">最近交易记录</span>
          <span className="dash-card-sub">
            {startDate && endDate ? `${startDate} ~ ${endDate}` : '最新 20 条'}
          </span>
        </div>
        <div className="dash-tx-wrap">
          <table className="dash-tx-table">
            <thead>
              <tr>
                <th>订单号</th>
                <th>用户ID</th>
                <th>卡种</th>
                <th>面值</th>
                <th>结算金额</th>
                <th>状态</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {(loading && firstLoad) && [1,2,3,4,5].map(k => (
                <tr key={k} className="skeleton-row">
                  {[1,2,3,4,5,6,7].map(c => (
                    <td key={c}><div className="skeleton-cell" /></td>
                  ))}
                </tr>
              ))}
              {!(loading && firstLoad) && recentTx.length === 0 && (
                <tr><td colSpan={7} className="dash-tx-empty">暂无交易记录</td></tr>
              )}
              {!(loading && firstLoad) && recentTx.map(r => {
                const sc = STATUS_COLORS[r.status] || '#999'
                const sl = STATUS_LABELS[r.status] || r.status
                return (
                  <tr key={r.id}>
                    <td className="mono tx-orderno">{r.orderNo}</td>
                    <td>{r.userId}</td>
                    <td>{r.categoryName}</td>
                    <td className="amount-green">{currSym(r.cardCurrency)}{r.cardAmount}</td>
                    <td className="amount-red">{fmtNgn(r.ngnAmount)}</td>
                    <td>
                      <span className="tx-status-pill" style={{ background: sc + '20', color: sc }}>
                        ● {sl}
                      </span>
                    </td>
                    <td className="tx-time">{r.createTime?.slice(0, 16)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
