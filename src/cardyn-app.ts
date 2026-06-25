import { api, getToken, clearToken, getNickName, setNickName, setToken, setRole, setUserId } from './api'
import { avatarColor, toast } from './utils'
import { renderLogin } from './views/login'
import { renderOrders } from './views/orders'
import { renderWithdrawals } from './views/withdrawals'
import { renderChat } from './views/chat'
import { renderUsers } from './views/users'

type View = 'orders' | 'withdrawals' | 'chat' | 'users'

export class CardynApp {
  private container: HTMLElement
  private currentView: View = 'orders'
  private orderBadge  = 0
  private wdBadge     = 0
  private chatBadge   = 0
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private pollSince   = Date.now()
  private prevOrders  = -1
  private prevWd      = -1
  private isLoggedIn  = false

  constructor(container: HTMLElement) { this.container = container }

  async init() {
    const skeleton = document.getElementById('app-skeleton')
    if (getToken()) {
      try {
        const res = await api.getInfo()
        const user = res?.user || res
        if (user?.userId) {
          setNickName(user.nickName || user.userName || '')
          setUserId(user.userId)
          this.isLoggedIn = true
          this.renderShell()
          this.switchView('orders')
          this.startPoll()
          skeleton?.remove()
          return
        }
      } catch { clearToken() }
    }
    skeleton?.remove()
    this.renderLoginPage()
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  private renderLoginPage() {
    this.container.innerHTML = renderLogin()
    const form = this.container.querySelector('#login-form') as HTMLFormElement
    form?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const btn = this.container.querySelector('#login-btn') as HTMLButtonElement
      const err = this.container.querySelector('#login-err') as HTMLElement
      const username = (this.container.querySelector('#login-user') as HTMLInputElement).value.trim()
      const password = (this.container.querySelector('#login-pass') as HTMLInputElement).value
      if (!username || !password) { err.textContent = '请输入用户名和密码'; return }
      btn.disabled = true; btn.textContent = '登录中…'; err.textContent = ''
      try {
        const res = await api.login(username, password)
        const data = res?.data || res
        if (!data?.token) throw new Error(res?.msg || '登录失败')
        setToken(data.token)
        setRole(data.roleType || '')
        setNickName(data.nickName || data.username || username)
        if (data.userId) setUserId(data.userId)
        this.isLoggedIn = true
        this.renderShell()
        this.switchView('orders')
        this.startPoll()
      } catch (e: any) {
        err.textContent = e.message || '登录失败'
        btn.disabled = false; btn.textContent = '登录'
      }
    })
  }

  // ── Main shell ─────────────────────────────────────────────────────────────
  renderShell() {
    const nick = getNickName()
    const initial = (nick || 'S')[0].toUpperCase()
    const isDark = document.documentElement.classList.contains('dark')

    this.container.innerHTML = `
      <div class="app-shell">
        <!-- Title bar -->
        <div class="titlebar" data-tauri-drag-region>
          <div class="titlebar-left">
            <div class="titlebar-logo">C</div>
            <span class="titlebar-name">Cardyn Staff</span>
          </div>
          <div class="titlebar-right">
            <button class="tb-btn tb-theme-btn" id="theme-toggle" title="切换主题">
              ${isDark ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>'}
            </button>
            <div class="tb-sep"></div>
            <button class="tb-btn" id="tb-min" title="最小化">
              <svg width="12" height="2" viewBox="0 0 12 2"><rect width="12" height="2" rx="1" fill="currentColor"/></svg>
            </button>
            <button class="tb-btn" id="tb-max" title="最大化">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="0.5" y="0.5" width="10" height="10"/></svg>
            </button>
            <button class="tb-btn close-btn" id="tb-close" title="关闭">
              <svg width="11" height="11" viewBox="0 0 11 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="1" y1="1" x2="10" y2="10"/><line x1="10" y1="1" x2="1" y2="10"/></svg>
            </button>
          </div>
        </div>
        <!-- Body -->
        <div class="app-body">
          <!-- Sidebar -->
          <div class="sidebar">
            <div class="sidebar-header">
              <div class="sidebar-title">Cardyn Staff</div>
            </div>
            <nav class="sidebar-nav" id="sidebar-nav">
              ${this.navItem('orders',      '核销中心', orderIcon())}
              ${this.navItem('chat',        '客服中心', chatIcon())}
              ${this.navItem('withdrawals', '提现中心', wdIcon())}
              ${this.navItem('users',       '用户管理', userIcon())}
            </nav>
            <div class="sidebar-footer">
              <div class="sidebar-user">
                <div class="sidebar-avatar" style="background:${avatarColor(nick)}">${initial}</div>
                <div style="flex:1;min-width:0">
                  <div class="sidebar-username">${nick}</div>
                </div>
                <button class="sidebar-theme-btn" id="sidebar-logout" title="退出登录">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
              </div>
            </div>
          </div>
          <!-- Main content -->
          <div class="main-content">
            <div id="content-area"></div>
          </div>
        </div>
        <!-- Toast container -->
        <div class="toast-wrap" id="toast-wrap"></div>
      </div>
    `
    this.bindShellEvents()
  }

  private navItem(view: View, label: string, icon: string): string {
    const active = this.currentView === view ? ' active' : ''
    const badgeHtml = view === 'orders' && this.orderBadge > 0
      ? `<span class="sidebar-badge">${this.orderBadge}</span>`
      : view === 'withdrawals' && this.wdBadge > 0
      ? `<span class="sidebar-badge orange">${this.wdBadge}</span>`
      : view === 'chat' && this.chatBadge > 0
      ? `<span class="sidebar-badge">${this.chatBadge}</span>`
      : ''
    return `<button class="sidebar-link${active}" data-view="${view}">
      ${icon}${label}${badgeHtml}
    </button>`
  }

  private bindShellEvents() {
    // Sidebar nav
    const nav = document.getElementById('sidebar-nav')
    nav?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-view]') as HTMLElement
      if (btn) {
        const view = btn.dataset.view as View
        if (view === 'orders') this.orderBadge = 0
        if (view === 'withdrawals') this.wdBadge = 0
        if (view === 'chat') this.chatBadge = 0
        this.switchView(view)
      }
    })
    // Window controls
    const win = (window as any).__TAURI__?.window?.getCurrentWindow?.()
    document.getElementById('tb-min')?.addEventListener('click', () => win?.minimize())
    document.getElementById('tb-max')?.addEventListener('click', () => win?.toggleMaximize?.())
    document.getElementById('tb-close')?.addEventListener('click', () => win?.close())
    // Theme toggle
    document.getElementById('theme-toggle')?.addEventListener('click', () => this.toggleTheme())
    // Logout
    document.getElementById('sidebar-logout')?.addEventListener('click', () => this.logout())
  }

  switchView(view: View) {
    this.currentView = view
    // Update nav active state
    document.querySelectorAll('.sidebar-link').forEach(b => {
      b.classList.toggle('active', (b as HTMLElement).dataset.view === view)
    })
    // Update badges in nav
    this.updateNavBadges()
    // Render view
    const content = document.getElementById('content-area')
    if (!content) return
    if (view === 'orders')      renderOrders(content)
    if (view === 'chat')        renderChat(content)
    if (view === 'withdrawals') renderWithdrawals(content)
    if (view === 'users')       renderUsers(content)
  }

  private updateNavBadges() {
    document.querySelectorAll('.sidebar-link').forEach(btn => {
      const v = (btn as HTMLElement).dataset.view as View
      const existing = btn.querySelector('.sidebar-badge')
      existing?.remove()
      let badge = 0; let orange = false
      if (v === 'orders' && this.orderBadge > 0) badge = this.orderBadge
      if (v === 'withdrawals' && this.wdBadge > 0) { badge = this.wdBadge; orange = true }
      if (v === 'chat' && this.chatBadge > 0) badge = this.chatBadge
      if (badge > 0) {
        const span = document.createElement('span')
        span.className = 'sidebar-badge' + (orange ? ' orange' : '')
        span.textContent = String(badge > 99 ? '99+' : badge)
        btn.appendChild(span)
      }
    })
  }

  // ── Background poll ────────────────────────────────────────────────────────
  private startPoll() {
    this.pollTimer = setInterval(async () => {
      if (document.hidden) return
      try {
        const res = await api.getDashboardPoll(this.pollSince)
        const d = res?.data || {}
        const orders = d.pendingOrders ?? 0
        const wd     = d.pendingWithdrawals ?? 0
        const chats  = d.newSessions || []
        if (this.prevOrders >= 0 && orders > this.prevOrders) {
          this.orderBadge += orders - this.prevOrders
          this.addToast({ type: 'order', title: '新订单', msg: `${orders - this.prevOrders} 个新订单等待核销` })
        }
        this.prevOrders = orders
        if (this.prevWd >= 0 && wd > this.prevWd) {
          this.wdBadge += wd - this.prevWd
          this.addToast({ type: 'withdrawal', title: '新提现申请', msg: `${wd - this.prevWd} 笔新提现申请` })
        }
        this.prevWd = wd
        if (chats.length > 0) {
          this.chatBadge += chats.length
          this.pollSince = Math.max(...chats.map((c: any) => c.createTs || Date.now()))
          chats.forEach((c: any) => this.addToast({ type: 'chat', title: '新客服请求', msg: `${c.userName || '用户#' + c.userId} 发起对话` }))
        }
        this.updateNavBadges()
      } catch {}
    }, 30_000)
  }

  private addToast(t: { type: string; title: string; msg: string }) {
    const wrap = document.getElementById('toast-wrap')
    if (!wrap) return
    const id = 'toast-' + Date.now()
    const div = document.createElement('div')
    div.id = id
    div.className = `toast-card ${t.type}`
    div.innerHTML = `
      <div class="toast-body">
        <div class="toast-title">${t.title}</div>
        <div class="toast-msg">${t.msg}</div>
      </div>
      <div class="toast-actions">
        <button class="toast-open-btn" data-view="${t.type === 'chat' ? 'chat' : t.type === 'order' ? 'orders' : 'withdrawals'}">查看</button>
        <button class="toast-close-btn" data-id="${id}">×</button>
      </div>
    `
    div.querySelector('.toast-open-btn')?.addEventListener('click', (e) => {
      const view = (e.target as HTMLElement).dataset.view as View
      this.switchView(view); div.remove()
    })
    div.querySelector('.toast-close-btn')?.addEventListener('click', () => div.remove())
    wrap.appendChild(div)
    setTimeout(() => div.remove(), 8000)
  }

  private toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark')
    localStorage.setItem('ui-theme', isDark ? 'dark' : 'light')
    // Re-render shell to update theme button icon
    this.renderShell()
    this.switchView(this.currentView)
  }

  private logout() {
    clearToken()
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.isLoggedIn = false
    this.renderLoginPage()
  }
}

// ── SVG icons for sidebar ─────────────────────────────────────────────────────
function orderIcon()  { return '<svg class="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>' }
function chatIcon()   { return '<svg class="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>' }
function wdIcon()     { return '<svg class="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>' }
function userIcon()   { return '<svg class="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' }
