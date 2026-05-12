import React, { useEffect, useState, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import client from '../api/client'
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtNgn(n: number) {
  if (n >= 1_000_000) return '₦' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return '₦' + (n / 1_000).toFixed(1) + 'K'
  return '₦' + (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 })
}
function fmtFull(n: number) {
  return '₦' + (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })
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

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: string
}) {
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="kpi-icon" style={{ background: color + '18', color }}>{icon}</div>
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

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const [stats,    setStats]    = useState<Stats | null>(null)
  const [trend,    setTrend]    = useState<TrendRow[]>([])
  const [status,   setStatus]   = useState<StatusRow[]>([])
  const [topCards, setTopCards] = useState<CardRow[]>([])
  const [hourly,   setHourly]   = useState<HourlyRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, t, st, tc, h] = await Promise.all([
        client.get('/tuka/dashboard/stats'),
        client.get('/tuka/dashboard/trend'),
        client.get('/tuka/dashboard/status'),
        client.get('/tuka/dashboard/topCards'),
        client.get('/tuka/dashboard/hourly'),
      ])
      setStats(s.data.data)
      setTrend(t.data.data || [])
      setStatus(st.data.data || [])
      setTopCards(tc.data.data || [])
      setHourly(h.data.data || [])
      setLastRefresh(new Date())
    } catch { /* keep existing */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    // Auto-refresh every 60s
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  // Shorten trend day labels: "2026-05-12" → "05/12"
  const trendData = trend.map(r => ({ ...r, day: r.day.slice(5).replace('-', '/') }))

  // Only show hours up to current hour
  const now = new Date().getHours()
  const hourlyData = hourly.filter((_, i) => i <= now)

  return (
    <div className="dash-root">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h2 className="dash-title">数据概览</h2>
          <span className="dash-refresh">上次更新：{lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
        <button className="dash-refresh-btn" onClick={load} disabled={loading}>
          {loading ? '加载中…' : '↻ 刷新'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KpiCard label="今日订单"     value={String(stats?.todayOrders ?? '—')}    color="#1677ff" icon="📦" sub={`待处理 ${stats?.pendingOrders ?? 0}`} />
        <KpiCard label="今日收入"     value={fmtNgn(stats?.todayRevenue ?? 0)}     color="#52c41a" icon="💰" sub={`总收入 ${fmtNgn(stats?.totalRevenue ?? 0)}`} />
        <KpiCard label="今日新用户"   value={String(stats?.todayUsers ?? '—')}     color="#722ed1" icon="👤" sub={`总用户 ${stats?.totalUsers ?? 0}`} />
        <KpiCard label="待处理提现"   value={String(stats?.pendingWithdrawals ?? '—')} color="#fa8c16" icon="🏦" sub={fmtNgn(stats?.pendingWithdrawalAmount ?? 0)} />
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
            <span className="dash-card-sub">按订单量</span>
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
    </div>
  )
}
