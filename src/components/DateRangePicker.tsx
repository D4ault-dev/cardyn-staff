import React, { useState, useRef, useEffect } from 'react'
import './DateRangePicker.css'

export type DateRange = { start: string; end: string } // 'yyyy-MM-dd HH:mm:ss' or ''

interface Props {
  startDate: string   // 'yyyy-MM-dd'
  endDate:   string
  startTime: string   // 'HH:mm'
  endTime:   string
  onChange:  (s: string, e: string, st: string, et: string) => void
  onClear:   () => void
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function pad(n: number) { return String(n).padStart(2, '0') }
function toDateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`
}

export default function DateRangePicker({
  startDate, endDate, startTime, endTime, onChange, onClear
}: Props) {
  const today = new Date()
  const [open, setOpen] = useState(false)
  const [leftYear,  setLeftYear]  = useState(today.getFullYear())
  const [leftMonth, setLeftMonth] = useState(today.getMonth())
  // Right calendar is always left + 1 month
  const rightYear  = leftMonth === 11 ? leftYear + 1 : leftYear
  const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1

  // Temp state while picker is open
  const [tmpStart, setTmpStart] = useState(startDate)
  const [tmpEnd,   setTmpEnd]   = useState(endDate)
  const [tmpST,    setTmpST]    = useState(startTime || '00:00')
  const [tmpET,    setTmpET]    = useState(endTime   || '23:59')
  const [hovered,  setHovered]  = useState<string | null>(null)

  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function openPicker() {
    setTmpStart(startDate); setTmpEnd(endDate)
    setTmpST(startTime || '00:00'); setTmpET(endTime || '23:59')
    setOpen(true)
  }

  function selectDay(dateStr: string) {
    if (!tmpStart || (tmpStart && tmpEnd)) {
      // Start fresh selection
      setTmpStart(dateStr); setTmpEnd('')
    } else {
      // Second click — set end (ensure start <= end)
      if (dateStr < tmpStart) { setTmpEnd(tmpStart); setTmpStart(dateStr) }
      else setTmpEnd(dateStr)
    }
  }

  function inRange(dateStr: string) {
    const end = tmpEnd || hovered || ''
    if (!tmpStart || !end) return false
    const [s, e] = tmpStart <= end ? [tmpStart, end] : [end, tmpStart]
    return dateStr > s && dateStr < e
  }
  function isStart(d: string) { return d === tmpStart }
  function isEnd(d: string)   { return d === tmpEnd }
  function isToday(d: string) {
    return d === toDateStr(today.getFullYear(), today.getMonth(), today.getDate())
  }

  function confirm() {
    if (tmpStart && tmpEnd) {
      onChange(tmpStart, tmpEnd, tmpST, tmpET)
      setOpen(false)
    }
  }

  function clear() {
    setTmpStart(''); setTmpEnd(''); setTmpST('00:00'); setTmpET('23:59')
    onClear(); setOpen(false)
  }

  // Navigate left calendar
  function prevMonth() {
    if (leftMonth === 0) { setLeftMonth(11); setLeftYear(y => y - 1) }
    else setLeftMonth(m => m - 1)
  }
  function nextMonth() {
    if (leftMonth === 11) { setLeftMonth(0); setLeftYear(y => y + 1) }
    else setLeftMonth(m => m + 1)
  }
  function prevYear() { setLeftYear(y => y - 1) }
  function nextYear() { setLeftYear(y => y + 1) }

  // Display label
  const label = startDate && endDate
    ? `${startDate} ${startTime || '00:00'} → ${endDate} ${endTime || '23:59'}`
    : '开始时间  至  结束时间'

  return (
    <div className="drp-root" ref={ref}>
      {/* Trigger button */}
      <button className={'drp-trigger' + (open ? ' active' : '') + (startDate ? ' has-value' : '')}
        onClick={openPicker}>
        <span className="drp-clock">🕐</span>
        <span className="drp-label">{label}</span>
        {startDate && (
          <span className="drp-clear-x" onClick={e => { e.stopPropagation(); clear() }}>✕</span>
        )}
      </button>

      {open && (
        <div className="drp-popup">
          {/* Top inputs */}
          <div className="drp-inputs">
            <input className="drp-input" placeholder="Start Date" value={tmpStart}
              onChange={e => setTmpStart(e.target.value)} />
            <input className="drp-input time" placeholder="Start Time" value={tmpST}
              onChange={e => setTmpST(e.target.value)} type="time" />
            <span className="drp-arrow">›</span>
            <input className="drp-input" placeholder="End Date" value={tmpEnd}
              onChange={e => setTmpEnd(e.target.value)} />
            <input className="drp-input time" placeholder="End Time" value={tmpET}
              onChange={e => setTmpET(e.target.value)} type="time" />
          </div>

          {/* Dual calendars */}
          <div className="drp-calendars">
            <Calendar
              year={leftYear} month={leftMonth}
              tmpStart={tmpStart} tmpEnd={tmpEnd} hovered={hovered}
              onSelect={selectDay} onHover={setHovered}
              isStart={isStart} isEnd={isEnd} inRange={inRange} isToday={isToday}
              onPrevYear={prevYear} onPrevMonth={prevMonth}
              onNextYear={undefined} onNextMonth={undefined}
            />
            <div className="drp-cal-divider" />
            <Calendar
              year={rightYear} month={rightMonth}
              tmpStart={tmpStart} tmpEnd={tmpEnd} hovered={hovered}
              onSelect={selectDay} onHover={setHovered}
              isStart={isStart} isEnd={isEnd} inRange={inRange} isToday={isToday}
              onPrevYear={undefined} onPrevMonth={undefined}
              onNextYear={nextYear} onNextMonth={nextMonth}
            />
          </div>

          {/* Footer */}
          <div className="drp-footer">
            <button className="drp-btn-clear" onClick={clear}>Clear</button>
            <button className="drp-btn-ok" onClick={confirm}
              disabled={!tmpStart || !tmpEnd}>OK</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Single month calendar ─────────────────────────────────────────────────────
function Calendar({ year, month, tmpStart, tmpEnd, hovered, onSelect, onHover,
  isStart, isEnd, inRange, isToday,
  onPrevYear, onPrevMonth, onNextYear, onNextMonth
}: {
  year: number; month: number
  tmpStart: string; tmpEnd: string; hovered: string | null
  onSelect: (d: string) => void; onHover: (d: string | null) => void
  isStart: (d: string) => boolean; isEnd: (d: string) => boolean
  inRange: (d: string) => boolean; isToday: (d: string) => boolean
  onPrevYear?: () => void; onPrevMonth?: () => void
  onNextYear?: () => void; onNextMonth?: () => void
}) {
  const firstDay = new Date(year, month, 1).getDay()
  const total    = daysInMonth(year, month)
  const prevTotal = daysInMonth(year, month - 1 < 0 ? 11 : month - 1)

  const cells: { dateStr: string; day: number; type: 'prev'|'cur'|'next' }[] = []

  // Prev month overflow
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevTotal - i
    const m = month === 0 ? 11 : month - 1
    const y = month === 0 ? year - 1 : year
    cells.push({ dateStr: toDateStr(y, m, d), day: d, type: 'prev' })
  }
  // Current month
  for (let d = 1; d <= total; d++) {
    cells.push({ dateStr: toDateStr(year, month, d), day: d, type: 'cur' })
  }
  // Next month overflow
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const m = month === 11 ? 0 : month + 1
    const y = month === 11 ? year + 1 : year
    cells.push({ dateStr: toDateStr(y, m, d), day: d, type: 'next' })
  }

  return (
    <div className="drp-cal">
      <div className="drp-cal-header">
        <button className="drp-nav" onClick={onPrevYear}  disabled={!onPrevYear}>«</button>
        <button className="drp-nav" onClick={onPrevMonth} disabled={!onPrevMonth}>‹</button>
        <span className="drp-cal-title">{year} {MONTHS[month]}</span>
        <button className="drp-nav" onClick={onNextMonth} disabled={!onNextMonth}>›</button>
        <button className="drp-nav" onClick={onNextYear}  disabled={!onNextYear}>»</button>
      </div>

      <div className="drp-cal-grid">
        {DAYS.map(d => <div key={d} className="drp-day-label">{d}</div>)}
        {cells.map(({ dateStr, day, type }) => {
          const start   = isStart(dateStr)
          const end     = isEnd(dateStr)
          const range   = inRange(dateStr)
          const today   = isToday(dateStr)
          const faded   = type !== 'cur'
          return (
            <div
              key={dateStr}
              className={[
                'drp-day',
                faded   ? 'faded'   : '',
                start   ? 'start'   : '',
                end     ? 'end'     : '',
                range   ? 'in-range': '',
                today   ? 'today'   : '',
              ].filter(Boolean).join(' ')}
              onClick={() => !faded && onSelect(dateStr)}
              onMouseEnter={() => onHover(dateStr)}
              onMouseLeave={() => onHover(null)}
            >
              {day}
            </div>
          )
        })}
      </div>
    </div>
  )
}
