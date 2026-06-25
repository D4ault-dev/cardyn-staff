export function fmt(n: number): string {
  return (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })
}

export function fmtNgn(n: number): string { return '₦' + fmt(n) }

const CS: Record<string, string> = {
  USD:'$', GBP:'£', EUR:'€', CAD:'C$', AUD:'A$', JPY:'¥',
  US:'$', GB:'£', EU:'€', CA:'C$', AU:'A$',
}
export function currSym(c: string): string { return CS[c] || '' }

export function statusTag(s: string): string {
  const map: Record<string,string> = {
    pending:'tag-pending', processing:'tag-processing',
    paid:'tag-paid', rejected:'tag-rejected', completed:'tag-paid',
    open:'tag-open', claimed:'tag-claimed', closed:'tag-closed',
  }
  const labels: Record<string,string> = {
    pending:'待处理', processing:'处理中', paid:'已完成',
    rejected:'已拒绝', completed:'已完成', open:'待接入',
    claimed:'进行中', closed:'已关闭',
  }
  return `<span class="tag ${map[s]||''}">${labels[s]||s}</span>`
}

export function timeAgo(ts: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = Date.now()
  const diff = now - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  return ts.slice(5, 16)
}

export function fmtTime(ts: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return `${d.getMonth()+1}/${d.getDate()}`
}

const COLORS = ['#1677ff','#52c41a','#fa8c16','#722ed1','#eb2f96','#13c2c2']
export function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < (name||'').length; i++) h = (name.charCodeAt(i) + ((h << 5) - h))
  return COLORS[Math.abs(h) % COLORS.length]
}

export function toast(msg: string, type: 'success'|'error'|'warning' = 'success') {
  if ((window as any).UI?.toast) {
    (window as any).UI.toast[type]?.(msg) || (window as any).UI.toast(msg)
  } else {
    console.log(`[${type}]`, msg)
  }
}

export function copyText(text: string) {
  navigator.clipboard.writeText(text)
    .then(() => toast('已复制'))
    .catch(() => toast('复制失败', 'error'))
}

export function el(id: string): HTMLElement | null { return document.getElementById(id) }
export function qs(sel: string, parent: Element | Document = document): HTMLElement | null {
  return parent.querySelector(sel) as HTMLElement | null
}
export function on(el: HTMLElement | null, ev: string, fn: EventListener) {
  el?.addEventListener(ev, fn)
}
