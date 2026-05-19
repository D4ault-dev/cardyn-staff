import React, { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import client, { clearClientCacheByUrl } from '../api/client'
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
type TrendRow  = { day: string; orderCount: number; revenue: number }
type StatusRow = { status: string; count: number }
type CardRow   = { name: string; count: number; revenue: number }
type HourlyRow = { hour: string; count: number }
type RecentTx  = {
  id: number; orderNo: string; userId: number; categoryName: string
  cardCurrency: string; cardAmount: number; ngnAmount: number
  status: string; createTime: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtNgn(n: number) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return '₦' + (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)     return '₦' + (v / 1_000).toFixed(1) + 'K'
  return '₦' + v.toLocaleString('en-NG', { minimumFractionDigits: 0 })
}
function fmtFull(n: number) {
  return '₦' + (Number(n) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })
}
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function daysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const STATUS_COLORS: Record<string, string> = {
  paid: '#52c41a', pending: '#fa8c16', processing: '#1677ff', rejected: '#ff4d4f',
}
const STATUS_LABELS: Record<string, string> = {
  paid: '已完成', pending: '待处理', processing: '处理中', rejected: '已拒绝',
}
const CURRENCY_SYMBOL: Record<string, string> = {
  USD:'$', GBP:'£', EUR:'€', CAD:'C$', AUD:'A$', JPY:'¥', CNY:'¥', PHP:'₱', SGD:'S$', NGN:'₦',
  US:'$',  GB:'£',  EU:'€',  CA:'C$', AU:'A$',  JP:'¥',  CN:'¥',  PH:'₱', SG:'S$',  NG:'₦',
}
function currSym(code: string) { return CURRENCY_SYMBOL[code] || '' }

// ── KPI Icons ─────────────────────────────────────────────────────────────────
const ICONS: Record<string, React.ReactElement> = {
  orders: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
  revenue: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><circle cx="12" cy="12" r="10"/><path d="M12 6v2m0 8v2M9 9h4a2 2 0 0 1 0 4H9m0 0h6"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  withdraw: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
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

// ── ECharts hook — init + resize + dispose ────────────────────────────────────
function useChart(ref: React.RefObject<HTMLDivElement | null>) {
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' })
    chartRef.current = chart

    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      chart.dispose()
      chartRef.current = null
    }
  }, [ref])

  return chartRef
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const [stats,    setStats]    = useState<Stats | null>(null)
  const [recentTx, setRecentTx] = useState<RecentTx[]>([])
  const [loading,  setLoading]  = useState(true)
  const [firstLoad, setFirstLoad] = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const [startDate, setStartDate] = useState(() => daysAgoStr(29))
  const [endDate,   setEndDate]   = useState(() => todayStr())
  const [startTime, setStartTime] = useState('')
  const [endTime,   setEndTime]   = useState('')
  const [activePreset, setActivePreset] = useState(2)

  // Chart DOM refs
  const trendDom   = useRef<HTMLDivElement>(null)
  const hourlyDom  = useRef<HTMLDivElement>(null)
  const statusDom  = useRef<HTMLDivElement>(null)
  const topDom     = useRef<HTMLDivElement>(null)

  // ECharts instances
  const trendChart  = useChart(trendDom)
  const hourlyChart = useChart(hourlyDom)
  const statusChart = useChart(statusDom)
  const topChart    = useChart(topDom)

  // ── Chart renderers ──────────────────────────────────────────────────────
  function renderTrend(data: TrendRow[]) {
    const c = trendChart.current; if (!c) return
    const days    = data.map(r => r.day.length >= 7 ? r.day.slice(5).replace('-', '/') : r.day)
    const orders  = data.map(r => Number(r.orderCount) || 0)
    const revenue = data.map(r => Number(r.revenue)    || 0)
    c.setOption({
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const p0 = params[0], p1 = params[1]
          return `${p0.axisValue}<br/>
            <span style="color:#1677ff">● 订单量：${p0.value}</span><br/>
            <span style="color:#52c41a">● 收入：${fmtFull(p1.value)}</span>`
        },
      },
      legend: { data: ['订单量', '收入(₦)'], bottom: 0, itemWidth: 10, textStyle: { fontSize: 12 } },
      grid: { left: 50, right: 60, top: 12, bottom: 36 },
      xAxis: { type: 'category', data: days, boundaryGap: false, axisLabel: { fontSize: 11, interval: Math.max(0, Math.floor(days.length / 8)) } },
      yAxis: [
        { type: 'value', name: '订单量', axisLabel: { fontSize: 11 } },
        { type: 'value', name: '收入', axisLabel: { fontSize: 11, formatter: (v: number) => fmtNgn(v) } },
      ],
      series: [
        {
          name: '订单量', type: 'line', data: orders, yAxisIndex: 0,
          smooth: true, symbol: 'none', lineStyle: { color: '#1677ff', width: 2.5 },
          areaStyle: { color: 'rgba(22,119,255,0.08)' },
        },
        {
          name: '收入(₦)', type: 'line', data: revenue, yAxisIndex: 1,
          smooth: true, symbol: 'none', lineStyle: { color: '#52c41a', width: 2.5 },
          areaStyle: { color: 'rgba(82,196,26,0.08)' },
        },
      ],
    }, true)
  }

  function renderHourly(data: HourlyRow[]) {
    const c = hourlyChart.current; if (!c) return
    const nowHour = new Date().getHours()
    const filtered = data.filter((_, i) => i <= nowHour)
    const hours  = filtered.map(r => r.hour)
    const counts = filtered.map(r => Number(r.count) || 0)
    const maxVal = Math.max(...counts, 1)
    c.setOption({
      tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].axisValue}<br/>订单数：${p[0].value}` },
      grid: { left: 36, right: 12, top: 12, bottom: 40 },
      xAxis: { type: 'category', data: hours, axisLabel: { fontSize: 9, interval: 2, rotate: 30 } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 11 } },
      series: [{
        type: 'bar', data: counts, barMaxWidth: 18,
        itemStyle: {
          borderRadius: [3, 3, 0, 0],
          color: (p: any) => {
            const ratio = p.value / maxVal
            return ratio > 0.7 ? '#1677ff' : ratio > 0.3 ? '#69b1ff' : '#bae0ff'
          },
        },
      }],
    }, true)
  }

  function renderStatus(data: StatusRow[]) {
    const c = statusChart.current; if (!c) return
    const pieData = data.map(r => ({
      name:  STATUS_LABELS[r.status] || r.status,
      value: Number(r.count) || 0,
      itemStyle: { color: STATUS_COLORS[r.status] || '#999' },
    }))
    c.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 12 } },
      series: [{
        type: 'pie', radius: ['38%', '65%'], center: ['50%', '44%'],
        data: pieData,
        label: { show: true, formatter: '{b}\n{d}%', fontSize: 11 },
        labelLine: { length: 8, length2: 6 },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' } },
      }],
    }, true)
  }

  function renderTopCards(data: CardRow[]) {
    const c = topChart.current; if (!c) return
    const sorted = [...data].reverse()
    const names   = sorted.map(r => r.name || '未知')
    const counts  = sorted.map(r => Number(r.count)   || 0)
    const revenue = sorted.map(r => Number(r.revenue) || 0)
    c.setOption({
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (params: any) =>
          `${params[0].axisValue}<br/>
           <span style="color:#1677ff">● 订单量：${params[0].value}</span><br/>
           <span style="color:#52c41a">● 收入：${fmtFull(params[1]?.value || 0)}</span>`,
      },
      legend: { data: ['订单量', '收入'], bottom: 0, itemWidth: 10, textStyle: { fontSize: 12 } },
      grid: { left: 100, right: 60, top: 12, bottom: 36 },
      xAxis: { type: 'value', axisLabel: { fontSize: 11 } },
      yAxis: { type: 'category', data: names, axisLabel: { fontSize: 11, width: 90, overflow: 'truncate' } },
      series: [
        {
          name: '订单量', type: 'bar', data: counts, barMaxWidth: 16,
          itemStyle: { color: '#1677ff', borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', fontSize: 11, formatter: (p: any) => p.value },
        },
        {
          name: '收入', type: 'bar', data: revenue, barMaxWidth: 16,
          itemStyle: { color: '#52c41a', borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', fontSize: 11, formatter: (p: any) => fmtNgn(p.value) },
        },
      ],
    }, true)
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  async function load(sd: string, ed: string, st: string, et: string) {
    setLoading(true)
    setError(null)
    clearClientCacheByUrl('/tuka/dashboard/')
    clearClientCacheByUrl('/tuka/order/list')

    const startTime_ = sd ? `${sd} ${st || '00:00'}:00` : undefined
    const endTime_   = ed ? `${ed} ${et || '23:59'}:59` : undefined

    const results = await Promise.allSettled([
      client.get('/tuka/dashboard/stats'),
      client.get('/tuka/dashboard/trend'),
      client.get('/tuka/dashboard/status'),
      client.get('/tuka/dashboard/topCards', { params: { startDate: sd || undefined, endDate: ed || undefined } }),
      client.get('/tuka/dashboard/hourly'),
      client.get('/tuka/order/list', { params: { pageNum: 1, pageSize: 20, startTime: startTime_, endTime: endTime_ } }),
    ])

    const [sRes, tRes, stRes, tcRes, hRes, txRes] = results

    if (sRes.status  === 'fulfilled') setStats(sRes.value.data.data || null)
    if (txRes.status === 'fulfilled') setRecentTx(txRes.value.data.rows || [])

    // Render charts — use setTimeout to ensure DOM refs are mounted
    setTimeout(() => {
      if (tRes.status  === 'fulfilled') {
        const raw: TrendRow[] = (tRes.value.data.data || []).map((r: any) => ({
          day:        String(r.day || '').slice(0, 10),
          orderCount: Number(r.orderCount) || 0,
          revenue:    Number(r.revenue)    || 0,
        }))
        renderTrend(raw)
      }
      if (stRes.status === 'fulfilled') {
        const raw: StatusRow[] = (stRes.value.data.data || []).map((r: any) => ({
          status: String(r.status),
          count:  Number(r.count) || 0,
        }))
        renderStatus(raw)
      }
      if (tcRes.status === 'fulfilled') {
        const raw: CardRow[] = (tcRes.value.data.data || []).map((r: any) => ({
          name:    String(r.name || ''),
          count:   Number(r.count)   || 0,
          revenue: Number(r.revenue) || 0,
        }))
        renderTopCards(raw)
      }
      if (hRes.status  === 'fulfilled') {
        const raw: HourlyRow[] = (hRes.value.data.data || []).map((r: any) => ({
          hour:  String(r.hour),
          count: Number(r.count) || 0,
        }))
        renderHourly(raw)
      }
    }, 50)

    const allFailed = results.every(r => r.status === 'rejected')
    if (allFailed) {
      const firstErr = results.find(r => r.status === 'rejected') as PromiseRejectedResult
      setError('数据加载失败：' + (firstErr?.reason?.message || '请检查网络连接或重新登录'))
    }

    setLastRefresh(new Date())
    setLoading(false)
    setFirstLoad(false)
  }

  // Initial load + auto-refresh
  useEffect(() => {
    load(startDate, endDate, startTime, endTime)
    const t = setInterval(() => load(startDate, endDate, startTime, endTime), 60_000)
    return () => clearInterval(t)
  }, [startDate, endDate, startTime, endTime]) // eslint-disable-line

  // Re-render charts on window resize (ECharts handles this via useChart hook)
  // but also re-render when data changes and charts are already mounted
  function applyPreset(idx: number) {
    const presets = [
      { start: todayStr(),     end: todayStr() },
      { start: daysAgoStr(6),  end: todayStr() },
      { start: daysAgoStr(29), end: todayStr() },
      { start: daysAgoStr(89), end: todayStr() },
    ]
    const p = presets[idx]
    setActivePreset(idx)
    setStartDate(p.start); setEndDate(p.end); setStartTime(''); setEndTime('')
  }

  function handleDateChange(s: string, e: string, st: string, et: string) {
    setActivePreset(-1)
    setStartDate(s); setEndDate(e); setStartTime(st); setEndTime(et)
  }

  const PRESET_LABELS = ['今日', '近7天', '近30天', '近90天']

  return (
    <div className="dash-root">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h2 className="dash-title">数据概览</h2>
          <span className="dash-refresh">
            上次更新：{lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        <div className="dash-header-right">
          <div className="dash-presets">
            {PRESET_LABELS.map((label, i) => (
              <button key={label} className={'dash-preset-btn' + (activePreset === i ? ' active' : '')} onClick={() => applyPreset(i)}>
                {label}
              </button>
            ))}
          </div>
          <DateRangePicker
            startDate={startDate} endDate={endDate}
            startTime={startTime} endTime={endTime}
            onChange={handleDateChange}
            onClear={() => { setActivePreset(2); setStartDate(daysAgoStr(29)); setEndDate(todayStr()); setStartTime(''); setEndTime('') }}
          />
          <button className="dash-refresh-btn" onClick={() => load(startDate, endDate, startTime, endTime)} disabled={loading}>
            {loading ? '加载中…' : '↻ 刷新'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="dash-error-banner">
          {error}
          <button onClick={() => load(startDate, endDate, startTime, endTime)}>重试</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KpiCard label="今日订单"   value={String(stats?.todayOrders ?? '—')}       color="#1677ff" icon="orders"   sub={`待处理 ${stats?.pendingOrders ?? 0}`} />
        <KpiCard label="今日收入"   value={fmtNgn(stats?.todayRevenue ?? 0)}         color="#52c41a" icon="revenue"  sub={`总收入 ${fmtNgn(stats?.totalRevenue ?? 0)}`} />
        <KpiCard label="今日新用户" value={String(stats?.todayUsers ?? '—')}         color="#722ed1" icon="users"    sub={`总用户 ${stats?.totalUsers ?? 0}`} />
        <KpiCard label="待处理提现" value={String(stats?.pendingWithdrawals ?? '—')} color="#fa8c16" icon="withdraw" sub={fmtNgn(stats?.pendingWithdrawalAmount ?? 0)} />
      </div>

      {/* Charts row 1: Trend + Hourly */}
      <div className="dash-row">
        <div className="dash-card wide">
          <div className="dash-card-head">
            <span className="dash-card-title">近30天趋势</span>
            <span className="dash-card-sub">订单量 & 收入</span>
          </div>
          <div ref={trendDom} className="dash-echart" />
        </div>
        <div className="dash-card">
          <div className="dash-card-head">
            <span className="dash-card-title">今日订单分布</span>
            <span className="dash-card-sub">按小时</span>
          </div>
          <div ref={hourlyDom} className="dash-echart" />
        </div>
      </div>

      {/* Charts row 2: Status pie + Top cards */}
      <div className="dash-row">
        <div className="dash-card">
          <div className="dash-card-head">
            <span className="dash-card-title">订单状态分布</span>
            <span className="dash-card-sub">全部时间</span>
          </div>
          <div ref={statusDom} className="dash-echart" />
        </div>
        <div className="dash-card wide">
          <div className="dash-card-head">
            <span className="dash-card-title">热门卡种 Top 8</span>
            <span className="dash-card-sub">{startDate && endDate ? `${startDate} ~ ${endDate}` : '按订单量'}</span>
          </div>
          <div ref={topDom} className="dash-echart" />
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="dash-card" style={{ marginBottom: 20 }}>
        <div className="dash-card-head" style={{ marginBottom: 14 }}>
          <span className="dash-card-title">最近交易记录</span>
          <span className="dash-card-sub">{startDate && endDate ? `${startDate} ~ ${endDate}` : '最新 20 条'}</span>
        </div>
        <div className="dash-tx-wrap">
          <table className="dash-tx-table">
            <thead>
              <tr>
                <th>订单号</th><th>用户ID</th><th>卡种</th>
                <th>面值</th><th>结算金额</th><th>状态</th><th>时间</th>
              </tr>
            </thead>
            <tbody>
              {loading && firstLoad && [1,2,3,4,5].map(k => (
                <tr key={k} className="skeleton-row">
                  {[1,2,3,4,5,6,7].map(c => <td key={c}><div className="skeleton-cell" /></td>)}
                </tr>
              ))}
              {!loading && recentTx.length === 0 && (
                <tr><td colSpan={7} className="dash-tx-empty">暂无交易记录</td></tr>
              )}
              {recentTx.map(r => {
                const sc = STATUS_COLORS[r.status] || '#999'
                const sl = STATUS_LABELS[r.status] || r.status
                return (
                  <tr key={r.id}>
                    <td className="mono tx-orderno">{r.orderNo}</td>
                    <td>{r.userId}</td>
                    <td>{r.categoryName}</td>
                    <td className="amount-green">{currSym(r.cardCurrency)}{r.cardAmount}</td>
                    <td className="amount-red">{fmtNgn(r.ngnAmount)}</td>
                    <td><span className="tx-status-pill" style={{ background: sc + '20', color: sc }}>● {sl}</span></td>
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
