import { api, canActChat, getNickName, getUserId } from '../api'
import { avatarColor, fmtTime, statusTag, toast } from '../utils'

let sessions: any[] = []
let active: any = null
let messages: any[] = []
let lastId = 0
let pollTimer: ReturnType<typeof setInterval> | null = null
let sessTimer: ReturnType<typeof setInterval> | null = null
let filter = ''
let search = ''
let container: HTMLElement

export function renderChat(c: HTMLElement) {
  container = c
  stopTimers()
  container.innerHTML = chatHTML()
  bindEvents()
  loadSessions()
  sessTimer = setInterval(() => loadSessions(), 30_000)
}

function stopTimers() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  if (sessTimer) { clearInterval(sessTimer); sessTimer = null }
}

function chatHTML(): string {
  return `
    <div style="display:flex;height:100%;overflow:hidden;background:var(--bg-main)">
      <!-- Session list -->
      <div style="width:260px;flex-shrink:0;background:var(--bg-card);border-right:1px solid var(--border-color);display:flex;flex-direction:column">
        <div style="padding:10px 10px 6px">
          <input id="chat-search" class="filter-input" placeholder="搜索会话" style="width:100%" />
        </div>
        <div style="display:flex;gap:4px;padding:0 8px 8px">
          ${['全部','open','claimed','closed'].map((v,i) => {
            const labels = ['全部','待接入','进行中','已关闭']
            return `<button class="btn btn-sm chat-filter-btn${filter===v?' btn-primary':''}" data-filter="${v}" style="flex:1;font-size:11px">${labels[i]}</button>`
          }).join('')}
        </div>
        <div id="sess-list" style="flex:1;overflow-y:auto"></div>
      </div>
      <!-- Chat window -->
      <div id="chat-window" style="flex:1;display:flex;flex-direction:column;overflow:hidden">
        <div id="chat-empty-state" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--text-subtle)">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span style="font-size:13px">选择一个会话开始</span>
        </div>
      </div>
    </div>
  `
}

function bindEvents() {
  document.getElementById('chat-search')?.addEventListener('input', (e) => {
    search = (e.target as HTMLInputElement).value.trim()
    renderSessions()
  })
  document.querySelectorAll('.chat-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filter = (btn as HTMLElement).dataset.filter || ''
      document.querySelectorAll('.chat-filter-btn').forEach(b => {
        b.classList.toggle('btn-primary', (b as HTMLElement).dataset.filter === filter)
        b.classList.remove('btn-sm') // keep sm
        b.classList.add('btn-sm')
      })
      renderSessions()
    })
  })
}

async function loadSessions() {
  try {
    const res = await api.getChatSessions()
    sessions = res?.rows || []
    renderSessions()
    if (active) {
      const updated = sessions.find(s => s.id === active.id)
      if (updated) { active = { ...active, ...updated }; updateChatHeader() }
    }
  } catch {}
}

function renderSessions() {
  const list = document.getElementById('sess-list')
  if (!list) return
  let filtered = sessions
  if (filter && filter !== '全部') filtered = filtered.filter(s => s.status === filter)
  if (search) filtered = filtered.filter(s =>
    (s.userName||'').toLowerCase().includes(search.toLowerCase()) ||
    String(s.userId).includes(search)
  )
  if (!filtered.length) { list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-subtle);font-size:13px">暂无会话</div>`; return }

  list.innerHTML = filtered.map(s => {
    const isActive = active?.id === s.id
    const col = avatarColor(s.userName || String(s.userId))
    const init = (s.userName || 'U')[0].toUpperCase()
    const dotColor = s.status === 'open' ? 'var(--warning)' : s.status === 'claimed' ? 'var(--success)' : 'var(--border-color)'
    return `
      <div class="sess-item${isActive ? ' sess-active' : ''}" data-sess-id="${s.id}"
        style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border-color);transition:background .1s;position:relative;background:${isActive ? 'var(--bg-hover)' : 'var(--bg-card)'}">
        <div style="width:36px;height:36px;border-radius:50%;background:${col};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;position:relative">
          ${init}
          ${s.unreadCount > 0 && s.status !== 'closed' ? `<span style="position:absolute;top:-4px;right:-4px;background:var(--danger);color:#fff;border-radius:8px;padding:0 4px;font-size:10px;font-weight:700;min-width:14px;text-align:center">${s.unreadCount > 99 ? '99+' : s.unreadCount}</span>` : ''}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
            <span style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px">${s.userName || 'User#'+s.userId}</span>
            <span style="font-size:10px;color:var(--text-subtle)">${fmtTime(s.updateTime||'')}</span>
          </div>
          <div style="font-size:11px;color:var(--text-subtle);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.lastMessage || '—'}</div>
        </div>
        <div style="width:7px;height:7px;border-radius:50%;background:${dotColor};flex-shrink:0"></div>
      </div>
    `
  }).join('')

  list.querySelectorAll('.sess-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt((el as HTMLElement).dataset.sessId!)
      const sess = sessions.find(s => s.id === id)
      if (sess) openSession(sess)
    })
  })
}

async function openSession(sess: any) {
  if (active?.id === sess.id) return
  stopPoll()
  active = sess
  messages = []; lastId = 0
  renderSessions()
  renderChatWindow()
  try {
    const res = await api.getChatMessages(sess.id)
    messages = res?.data || []
    lastId = messages.length ? messages[messages.length - 1].id : 0
    renderMessages()
    scrollBottom()
  } catch {}
  startPoll()
}

function renderChatWindow() {
  const win = document.getElementById('chat-window')
  if (!win || !active) return
  const myName = getNickName()
  const isAssigned = String(active.agentId) === getUserId()
  const canReply = canActChat() && active.status === 'claimed' && isAssigned

  win.innerHTML = `
    <!-- Header -->
    <div id="chat-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-card);border-bottom:1px solid var(--border-color);flex-shrink:0">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:34px;height:34px;border-radius:50%;background:${avatarColor(active.userName||'')};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff">
          ${(active.userName||'U')[0].toUpperCase()}
        </div>
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--text)">${active.userName||'User#'+active.userId}</div>
          <div id="chat-status-lbl" style="font-size:11px;color:${active.status==='claimed'?'var(--success)':active.status==='open'?'var(--warning)':'var(--text-subtle)'}">
            ${active.status==='claimed'?`进行中 · ${active.agentName||''}`:active.status==='open'?'等待接入':'已关闭'}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:6px">
        ${canActChat() && active.status === 'open' ? `<button class="btn btn-primary" id="chat-claim-btn" style="font-size:12px;padding:4px 12px">接入</button>` : ''}
        ${canActChat() && isAssigned && active.status === 'claimed' ? `<button class="btn btn-danger" id="chat-close-btn" style="font-size:12px;padding:4px 12px">关闭</button>` : ''}
      </div>
    </div>
    <!-- Messages -->
    <div id="chat-msgs" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--bg-main)">
      <div style="text-align:center;color:var(--text-subtle);font-size:13px">加载中…</div>
    </div>
    <!-- Input -->
    <div id="chat-input-bar" style="background:var(--bg-card);border-top:1px solid var(--border-color);padding:8px 12px">
      ${canReply ? `
        <div style="display:flex;gap:8px;align-items:flex-end">
          <textarea id="chat-input" rows="3" placeholder="输入消息… (Enter 发送)"
            style="flex:1;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-main);color:var(--text);font-size:13px;resize:none;outline:none;font-family:inherit"></textarea>
          <button class="btn btn-primary" id="chat-send-btn" style="height:72px;width:68px;font-size:13px">发送</button>
        </div>` : `
        <div style="text-align:center;color:var(--text-subtle);font-size:12px;padding:10px">
          ${active.status==='closed'?'对话已关闭':active.status==='open'&&canActChat()?'点击「接入」开始回复':'只读模式'}
        </div>`}
    </div>
  `

  document.getElementById('chat-claim-btn')?.addEventListener('click', async () => {
    try { await api.claimChatSession(active.id); loadSessions() } catch (e: any) { toast(e.message, 'error') }
  })
  document.getElementById('chat-close-btn')?.addEventListener('click', async () => {
    if (!confirm('确认关闭此会话？')) return
    try { await api.closeChatSession(active.id); stopPoll(); loadSessions() } catch (e: any) { toast(e.message, 'error') }
  })

  const input = document.getElementById('chat-input') as HTMLTextAreaElement
  document.getElementById('chat-send-btn')?.addEventListener('click', () => sendMsg(input))
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(input) } })
}

async function sendMsg(input: HTMLTextAreaElement | null) {
  if (!input || !active) return
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  try {
    const res = await api.sendChatReply(active.id, text)
    const msg = res?.data || res
    messages.push(msg); lastId = msg.id
    renderMessages(); scrollBottom()
  } catch (e: any) { toast(e.message, 'error'); input.value = text }
}

function renderMessages() {
  const area = document.getElementById('chat-msgs')
  if (!area) return
  if (!messages.length) { area.innerHTML = `<div style="text-align:center;color:var(--text-subtle);font-size:13px;padding:24px">暂无消息</div>`; return }
  area.innerHTML = messages.map(m => {
    if (m.senderType === 'system') {
      return `<div style="text-align:center"><span style="font-size:11px;color:var(--text-subtle);background:var(--bg-hover);border-radius:10px;padding:2px 10px;display:inline-block">${m.content}</span></div>`
    }
    const isMe = m.senderType === 'agent'
    const col = isMe ? '#1677ff' : avatarColor(m.senderName || '')
    const init = (m.senderName || 'U')[0].toUpperCase()
    return `
      <div style="display:flex;align-items:flex-end;gap:8px;${isMe ? 'flex-direction:row-reverse' : ''}">
        <div style="width:28px;height:28px;border-radius:50%;background:${col};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${init}</div>
        <div style="max-width:60%;display:flex;flex-direction:column;${isMe?'align-items:flex-end':''}">
          ${!isMe ? `<div style="font-size:10px;color:var(--text-subtle);margin-bottom:3px">${m.senderName}</div>` : ''}
          ${m.msgType === 'image'
            ? `<img src="${m.content}" style="max-width:180px;border-radius:8px;cursor:pointer" onclick="window.open('${m.content}')" />`
            : `<div style="padding:9px 13px;border-radius:12px;font-size:13px;line-height:1.5;word-break:break-word;${isMe ? 'background:#52c41a;color:#fff;border-bottom-right-radius:3px' : 'background:var(--bg-card);color:var(--text);border-bottom-left-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.08)'}">${m.content}</div>`
          }
          <div style="font-size:10px;color:var(--text-subtle);margin-top:3px">${(m.createTime||'').slice(11,16)}</div>
        </div>
      </div>
    `
  }).join('')
}

function scrollBottom() {
  const area = document.getElementById('chat-msgs')
  if (area) setTimeout(() => { area.scrollTop = area.scrollHeight }, 50)
}

function updateChatHeader() {
  if (!active) return
  const lbl = document.getElementById('chat-status-lbl')
  if (lbl) {
    lbl.style.color = active.status === 'claimed' ? 'var(--success)' : active.status === 'open' ? 'var(--warning)' : 'var(--text-subtle)'
    lbl.textContent = active.status === 'claimed' ? `进行中 · ${active.agentName||''}` : active.status === 'open' ? '等待接入' : '已关闭'
  }
}

function startPoll() {
  if (!active) return
  pollTimer = setInterval(async () => {
    if (!active || document.hidden) return
    if (active.status === 'closed') { stopPoll(); return }
    try {
      const res = await api.pollChatSession(active.id, lastId)
      const data = res?.data || res
      const newMsgs: any[] = Array.isArray(data) ? data : (data?.messages || [])
      if (newMsgs.length) {
        const ids = new Set(messages.map((m: any) => m.id))
        const fresh = newMsgs.filter((m: any) => !ids.has(m.id))
        if (fresh.length) {
          messages.push(...fresh); lastId = fresh[fresh.length-1].id
          renderMessages(); scrollBottom()
        }
      }
      if (data?.status && active) {
        active = { ...active, status: data.status, agentId: data.agentId, agentName: data.agentName }
        updateChatHeader()
      }
    } catch {}
  }, 4000)
}

function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }
