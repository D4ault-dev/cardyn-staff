<template>
  <div class="chat-shell">

    <!-- ── Left: Session list ── -->
    <div class="chat-sidebar">
      <div class="sidebar-search">
        <el-input
          v-model="search"
          placeholder="搜索会话或输入用户ID发起聊天"
          size="small"
          clearable
          @keyup.enter="onSearchEnter"
        >
          <template #append>
            <el-button
              size="small"
              :loading="initiating"
              :disabled="!/^\d+$/.test(search.trim())"
              @click="doInitiate"
              title="输入用户ID后点击发起聊天"
            >发起</el-button>
          </template>
        </el-input>
        <div v-if="initiateError" style="font-size:11px;color:#ff4d4f;padding:2px 2px 0">{{ initiateError }}</div>
        <div class="keyboard-hints">
          <span title="切换会话">↑↓</span>
          <span title="快速搜索">⌘K</span>
          <span title="关闭会话">Esc</span>
        </div>
      </div>
      <!-- No filter tabs — show all sessions -->

      <div class="session-list">
        <div v-if="!filteredSessions.length" class="session-empty">暂无会话</div>
        <div v-for="s in filteredSessions" :key="s.id"
          :class="['session-row', active?.id === s.id && 'session-row-active']"
          @click="openSession(s)">
          <div class="sess-avatar" :style="{ background: avatarColor(s.userName) }">
            <LazyImg v-if="s.userAvatar" :src="s.userAvatar"
              :width="38" :height="38"
              fit="cover" style="border-radius:50%;position:absolute;inset:0"
              root-margin="500px" />
            <span v-else>{{ (s.userName || 'U')[0].toUpperCase() }}</span>
            <span v-if="s.unreadCount > 0 && s.status !== 'closed'" class="sess-badge">
              {{ s.unreadCount > 99 ? '99+' : s.unreadCount }}
            </span>
          </div>
          <div class="sess-info">
            <div class="sess-top">
              <span class="sess-name">{{ s.userName || ('User#' + s.userId) }}</span>
              <span class="sess-time">{{ fmtTime(s.lastMessageTime || s.updateTime) }}</span>
            </div>
            <div style="font-size:11px;color:#1677ff;font-family:monospace;margin-bottom:2px">
              ID: {{ s.userId }}
            </div>
            <div class="sess-preview">{{ s.lastMessage || '—' }}</div>
          </div>
          <span class="sess-dot" :class="'sess-dot-' + s.status" />
        </div>
      </div>
    </div>

    <!-- ── Right: Chat window ── -->
    <div class="chat-main">

      <!-- Empty state -->
      <div v-if="!active" class="chat-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="56" height="56">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p>选择一个会话开始</p>
      </div>

      <template v-else>
        <!-- Header -->
        <div class="chat-header">
          <div class="chat-header-left">
            <div class="hdr-avatar" :style="{ background: avatarColor(active.userName) }">
              <LazyImg v-if="active.userAvatar" :src="active.userAvatar"
                :width="34" :height="34" fit="cover"
                style="border-radius:50%;position:absolute;inset:0" root-margin="800px" />
              <span v-else>{{ (active.userName || 'U')[0].toUpperCase() }}</span>
            </div>
            <div>
              <div class="hdr-name">{{ active.userName || 'User#' + active.userId }}</div>
              <div class="hdr-status" :class="'hdr-status-' + active.status">
                {{ active.status === 'claimed' ? `进行中 · ${active.agentName}` : active.status === 'open' ? '等待接入' : '已关闭' }}
              </div>
            </div>
          </div>
          <div class="chat-header-right">
            <el-button size="small" plain @click="showProfile = !showProfile">
              {{ showProfile ? '隐藏资料' : '用户资料' }}
            </el-button>
            <el-button v-if="canActChat && active.status === 'open'" size="small" type="primary" @click="handleClaim">
              接入
            </el-button>
            <el-button v-if="canActChat && isAssigned && active.status !== 'closed'" size="small" type="danger" plain @click="handleClose">
              关闭
            </el-button>
          </div>
        </div>

        <div class="chat-body">
          <!-- Messages -->
          <div class="msg-area">
            <div ref="msgList" class="msg-scroll">
              <div v-if="loadingMsg" class="msg-loading">加载中…</div>
              <template v-for="(m, idx) in messages" :key="m.id">
                <div v-if="showDate(m, messages[idx-1])" class="msg-date">
                  {{ m.createTime?.slice(0,10) }}
                </div>
                <div v-if="m.senderType === 'system'" class="msg-system">{{ m.content }}</div>
                <div v-else :class="['msg-row', m.senderType === 'agent' && 'msg-row-me']">
                  <div class="msg-avatar" :style="{ background: m.senderType === 'agent' ? '#1677ff' : avatarColor(m.senderName) }">
                    {{ (m.senderName || 'U')[0].toUpperCase() }}
                  </div>
                  <div class="msg-content">
                    <div v-if="m.senderType !== 'agent'" class="msg-sender">{{ m.senderName }}</div>
                    <div v-if="m.msgType === 'image'" style="position:relative;display:inline-block">
                      <LazyImg :src="authImg(m.content)"
                        :width="200" height="auto"
                        fit="cover" :preview="true"
                        style="border-radius:8px;cursor:pointer;display:block"
                        root-margin="400px" />
                      <el-button size="mini" type="primary" plain
                        style="position:absolute;bottom:4px;right:4px;padding:2px 6px;font-size:10px;opacity:0.9"
                        @click.stop="copyImg(m.content)">复制</el-button>
                    </div>
                    <div v-else :class="['msg-bubble', m.senderType === 'agent' ? 'bubble-me' : 'bubble-user']">
                      {{ m.content }}
                    </div>
                    <div :class="['msg-time', m.senderType === 'agent' && 'msg-time-right']">
                      {{ m.createTime?.slice(11,16) }}
                    </div>
                  </div>
                </div>
              </template>
              <div v-if="!messages.length && !loadingMsg" class="msg-empty">暂无消息</div>
            </div>

            <!-- Input bar -->
            <div class="input-bar">
              <div v-if="!canReply" class="input-readonly">
                <span v-if="active.status === 'closed'">对话已关闭</span>
                <span v-else-if="active.status === 'open' && canActChat">点击「接入」开始回复</span>
                <span v-else>只读模式</span>
              </div>
              <template v-else>
                <div class="input-toolbar">
                  <el-upload action="#" :auto-upload="false" :on-change="sendImage" :show-file-list="false" accept="image/*">
                    <el-button size="small" text title="发送图片（或 Ctrl+V 粘贴）">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                    </el-button>
                  </el-upload>
                  <span style="font-size:11px;color:#bbb;margin-left:4px">Ctrl+V 粘贴图片</span>
                </div>
                <div class="input-row">
                  <el-input v-model="inputText" type="textarea" :rows="3"
                    placeholder="输入消息…"
                    resize="none" class="input-textarea"
                    @keydown="onMsgKeydown" />
                  <el-button type="primary" size="default" :loading="sending"
                    class="send-btn" @click="sendMsg">发送</el-button>
                </div>
              </template>
            </div>
          </div>

          <!-- Profile panel -->
          <transition name="slide-profile">
            <div v-if="showProfile && profile" class="profile-panel">
              <div class="profile-avatar" :style="{ background: avatarColor(profile.realName || profile.phone) }">
                {{ (profile.realName || profile.phone || 'U')[0].toUpperCase() }}
              </div>
              <div class="profile-name">{{ profile.realName || '—' }}</div>
              <div class="profile-phone">{{ profile.phone }}</div>
              <div class="profile-stats">
                <div class="pstat"><div class="pstat-val">Lv{{ profile.level }}</div><div class="pstat-lbl">等级</div></div>
                <div class="pstat-div" />
                <div class="pstat"><div class="pstat-val">{{ profile.tradeCount }}</div><div class="pstat-lbl">交易</div></div>
              </div>
              <div class="profile-rows">
                <div v-for="item in profileItems" :key="item.label" class="profile-row">
                  <span class="pr-label">{{ item.label }}</span>
                  <span class="pr-value" :style="{ color: item.color }">{{ item.value }}</span>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request'
import { useAuthImg } from '@/composables/useAuthImg'
import { useUserStore } from '@/stores/user'
import { usePermissions } from '@/composables/usePermissions'
import { playNewMessage } from '@/utils/sound'
import LazyImg from '@/components/LazyImg.vue'

const { authImg } = useAuthImg()
const userStore = useUserStore()
const { canActChat } = usePermissions()
const myUserId = computed(() => userStore.userId)

async function copyImg(url) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const pngBlob = await new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
        canvas.getContext('2d').drawImage(img, 0, 0)
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('fail')), 'image/png')
      }
      img.onerror = reject
      img.src = URL.createObjectURL(blob)
    })
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
    ElMessage.success('图片已复制')
  } catch {
    ElMessage.error('复制失败，请右键图片手动复制')
  }
}

const sessions    = ref([])
const active      = ref(null)
const messages    = ref([])
const profile     = ref(null)
const filter      = ref('')
const search      = ref('')
const inputText   = ref('')
const sending     = ref(false)

function onMsgKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    sendMsg()
  }
}

// ── Unified search + initiate ─────────────────────────────────────────────────
const initiating    = ref(false)
const initiateError = ref('')

// Enter key: if pure number → initiate chat, else just filter sessions
function onSearchEnter() {
  if (/^\d+$/.test(search.value.trim())) doInitiate()
}

async function doInitiate() {
  const uid = search.value.trim()
  if (!uid || !/^\d+$/.test(uid)) { initiateError.value = '请输入有效用户ID'; return }
  initiating.value = true; initiateError.value = ''
  try {
    const res = await request({ url: '/tuka/chat/admin/initiate', method: 'post', data: { userId: parseInt(uid) } })
    const sid = res?.data?.sessionId || res?.sessionId
    search.value = ''
    await loadSessions()
    const t = sessions.value.find(s => s.id === sid)
    if (t) openSession(t)
  } catch (e) { initiateError.value = e.message || '发起失败' }
  finally { initiating.value = false }
}
const loadingMsg  = ref(false)
const showProfile = ref(false)
const msgList     = ref(null)
const lastId      = ref(0)
const msgCache    = new Map()

// ── LocalStorage persistence for chat history ────────────────────────────────
const STORAGE_KEY = 'cardyn_chat_cache'
const STORAGE_TTL = 3600_000 // 1 hour

function loadChatFromStorage(sessionId) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const cache = JSON.parse(stored)
    const session = cache[sessionId]
    if (!session || Date.now() - session.ts > STORAGE_TTL) return null
    return { messages: session.messages, lastId: session.lastId }
  } catch { return null }
}

function saveChatToStorage(sessionId, messages, lastId) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const cache = stored ? JSON.parse(stored) : {}
    cache[sessionId] = { messages, lastId, ts: Date.now() }
    // Keep only last 10 sessions to avoid storage bloat
    const entries = Object.entries(cache).sort((a, b) => b[1].ts - a[1].ts).slice(0, 10)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {}
}

let sessTimer = null
let pollTimer = null
let sessInFlight = false
let _chatPasteHandler = null
let _chatKeyHandler = null

const tabs = [
  { l: '全部', v: '' },
  { l: '待接入', v: 'open' },
  { l: '进行中', v: 'claimed' },
  { l: '已关闭', v: 'closed' },
]

const openCount = computed(() => sessions.value.filter(s => s.status === 'open').length)

const filteredSessions = computed(() => {
  let list = sessions.value
  if (filter.value) list = list.filter(s => s.status === filter.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(s => (s.userName || '').toLowerCase().includes(q) || String(s.userId).includes(q))
  }
  return list
})

const isAssigned = computed(() => String(active.value?.agentId) === String(myUserId.value))
const canReply   = computed(() => active.value?.status === 'claimed' && isAssigned.value && canActChat.value)

const profileItems = computed(() => profile.value ? [
  { label: '余额',   value: '₦' + fmt(profile.value.balance),        color: '#52c41a' },
  { label: '总销售', value: '₦' + fmt(profile.value.totalSales),     color: '#52c41a' },
  { label: '总提现', value: '₦' + fmt(profile.value.totalWithdrawn), color: null },
  { label: '国家',   value: profile.value.country || '—',            color: null },
  { label: '注册',   value: profile.value.createTime?.slice(0,10),   color: null },
  { label: '状态',   value: profile.value.status === 0 ? '正常' : '封禁',
    color: profile.value.status === 0 ? '#52c41a' : '#ff4d4f' },
] : [])

const COLORS = ['#1677ff','#52c41a','#fa8c16','#722ed1','#eb2f96','#13c2c2']
function last4(phone) {
  if (!phone) return '——'
  const digits = String(phone).replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : (digits || '——')
}
function avatarColor(name) {
  if (!name) return '#1677ff'
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}
function fmt(n) { return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 }) }
function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${d.getMonth()+1}/${d.getDate()}`
}
function showDate(m, prev) {
  if (!prev) return !!m.createTime
  return m.createTime?.slice(0,10) !== prev.createTime?.slice(0,10)
}
function scrollBottom() {
  nextTick(() => { if (msgList.value) msgList.value.scrollTop = msgList.value.scrollHeight })
}

async function loadSessions() {
  if (sessInFlight) return  // skip if previous request still pending
  sessInFlight = true
  try {
    const res = await request({ url: '/tuka/chat/admin/sessions', params: { pageSize: 100 } })
    sessions.value = res.rows || res.data?.rows || []
    if (active.value) {
      const updated = sessions.value.find(s => s.id === active.value.id)
      if (updated) active.value = { ...active.value, ...updated }
    }
  } catch {}
  finally { sessInFlight = false }
}

async function openSession(s) {
  if (active.value?.id === s.id) return
  stopPoll()
  active.value = { ...s }  // plain copy — ensures Vue reactivity triggers
  await nextTick()  // force DOM update before loading messages
  showProfile.value = false

  // Try localStorage first for instant loading
  const stored = loadChatFromStorage(s.id)
  if (stored) {
    messages.value = stored.messages
    lastId.value = stored.lastId
    msgCache.set(s.id, { messages: stored.messages, lastId: stored.lastId })
    scrollBottom()
    request({ url: `/tuka/chat/admin/mark-read/${s.id}`, method: 'post' }).catch(() => {})
    startPoll(s.id)
    // Load fresh data in background
    loadMessagesInBackground(s.id)
    return
  }

  // Try memory cache
  const cached = msgCache.get(s.id)
  if (cached) {
    messages.value = cached.messages
    lastId.value   = cached.lastId
    profile.value  = cached.profile || null
    scrollBottom()
    request({ url: `/tuka/chat/admin/mark-read/${s.id}`, method: 'post' }).catch(() => {})
    startPoll(s.id)
    return
  }

  // Fresh load
  messages.value = []; profile.value = null; lastId.value = 0; loadingMsg.value = true
  try {
    request({ url: `/tuka/chat/admin/mark-read/${s.id}`, method: 'post' }).catch(() => {})
    const res = await request({ url: `/tuka/chat/messages/${s.id}`, params: { pageSize: 100 } })
    const msgList = Array.isArray(res) ? res
      : Array.isArray(res?.data) ? res.data
      : Array.isArray(res?.rows) ? res.rows
      : []
    messages.value = msgList
    lastId.value = messages.value.length ? messages.value[messages.value.length - 1].id : 0
    msgCache.set(s.id, { messages: messages.value, lastId: lastId.value })
    saveChatToStorage(s.id, messages.value, lastId.value)
    scrollBottom()
  } catch (e) {
    console.error('[chat] load messages failed', e)
  } finally { loadingMsg.value = false }
  request({ url: `/tuka/chat/admin/user-profile/${s.id}` })
    .then(r => { if (r.data) { profile.value = r.data; const c = msgCache.get(s.id); if (c) c.profile = r.data } })
    .catch(() => {})
  startPoll(s.id)
}

async function loadMessagesInBackground(sessionId) {
  try {
    const res = await request({ url: `/tuka/chat/messages/${sessionId}`, params: { pageSize: 100 } })
    const msgList = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : Array.isArray(res?.rows) ? res.rows : []
    if (active.value?.id === sessionId && msgList.length > messages.value.length) {
      messages.value = msgList
      lastId.value = msgList.length ? msgList[msgList.length - 1].id : lastId.value
      msgCache.set(sessionId, { messages: messages.value, lastId: lastId.value, profile: profile.value })
      saveChatToStorage(sessionId, messages.value, lastId.value)
    }
  } catch {}
}

function startPoll(sessionId) {
  pollTimer = setInterval(async () => {
    if (document.hidden || !active.value || active.value.id !== sessionId) return
    if (active.value.status === 'closed') { stopPoll(); return }
    try {
      const res = await request({ url: `/tuka/chat/poll/${sessionId}`, params: { lastId: lastId.value } })
      const data = res.data
      const newMsgs = Array.isArray(data) ? data : (data?.messages || [])
      if (newMsgs.length) {
        const ids = new Set(messages.value.map(m => m.id))
        const fresh = newMsgs.filter(m => !ids.has(m.id))
        if (fresh.length) {
          messages.value.push(...fresh)
          lastId.value = fresh[fresh.length - 1].id
          const c = msgCache.get(sessionId)
          if (c) { c.messages = messages.value; c.lastId = lastId.value }
          // Save to localStorage for persistence
          saveChatToStorage(sessionId, messages.value, lastId.value)
          // Play sound only for user messages, not our own replies
          const hasUserMsg = fresh.some(m => m.senderType !== 'staff' && m.senderType !== 'agent')
          if (hasUserMsg) playNewMessage()
          scrollBottom()
        }
      }
      if (data?.status && active.value)
        active.value = { ...active.value, status: data.status, agentId: data.agentId, agentName: data.agentName }
    } catch {}
  }, 8000)  // 8s polling - balanced for professional platform
}
function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }

async function sendMsg() {
  if (!inputText.value.trim() || !active.value || sending.value) return
  const text = inputText.value.trim(); inputText.value = ''; sending.value = true
  try {
    const res = await request({ url: '/tuka/chat/admin/reply', method: 'post', data: { sessionId: active.value.id, content: text } })
    messages.value.push(res.data); lastId.value = res.data.id
    const c = msgCache.get(active.value.id); if (c) { c.messages = messages.value; c.lastId = lastId.value }
    scrollBottom()
  } catch (e) { inputText.value = text; ElMessage.error(e.message) }
  finally { sending.value = false }
}

async function sendImage(fileOrEvent) {
  if (!active.value || !canReply.value) return
  // Accept el-upload file object OR raw File
  const rawFile = fileOrEvent?.raw || fileOrEvent
  if (!rawFile || !(rawFile instanceof File)) return
  const fd = new FormData()
  fd.append('sessionId', String(active.value.id))
  fd.append('file', rawFile)
  try {
    const res = await request({ url: '/tuka/chat/admin/replyImage', method: 'post', data: fd })
    messages.value.push(res.data); lastId.value = res.data.id; scrollBottom()
  } catch (e) { ElMessage.error(e.message) }
}

async function handleClaim() {
  if (!active.value) return
  try {
    await request({ url: `/tuka/chat/admin/claim/${active.value.id}`, method: 'post' })
    active.value = { ...active.value, status: 'claimed', agentId: myUserId.value, agentName: userStore.nickName }
    loadSessions()
  } catch (e) { ElMessage.error(e.message) }
}

async function handleClose() {
  if (!active.value) return
  try {
    await request({ url: `/tuka/chat/admin/close/${active.value.id}`, method: 'post' })
    active.value = { ...active.value, status: 'closed' }; stopPoll(); loadSessions()
  } catch (e) { ElMessage.error(e.message) }
}

onMounted(() => {
  loadSessions()
  sessTimer = setInterval(loadSessions, 15_000)

  // Ctrl+V paste image directly into chat
  function handleChatPaste(e) {
    if (!active.value || !canReply.value) return
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) {
          e.preventDefault()
          sendImage(file)
          ElMessage.success('图片已发送')
        }
        break
      }
    }
  }
  window.addEventListener('paste', handleChatPaste)
  _chatPasteHandler = handleChatPaste

  // ── Keyboard shortcuts for professional UX ──────────────────────────────────
  function handleChatKeys(e) {
    // Esc: Close active chat
    if (e.key === 'Escape' && active.value) {
      active.value = null
      stopPoll()
      return
    }

    // ↑/↓: Navigate sessions
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.target.matches('input, textarea')) {
      e.preventDefault()
      const list = filteredSessions.value
      if (!list.length) return
      const idx = active.value ? list.findIndex(s => s.id === active.value.id) : -1
      let next = idx
      if (e.key === 'ArrowUp') next = idx <= 0 ? list.length - 1 : idx - 1
      else next = idx >= list.length - 1 ? 0 : idx + 1
      openSession(list[next])
      return
    }

    // Ctrl+K or Cmd+K: Focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      document.querySelector('.sidebar-search input')?.focus()
    }
  }
  window.addEventListener('keydown', handleChatKeys)
  _chatKeyHandler = handleChatKeys
})
onUnmounted(() => {
  stopPoll()
  if (sessTimer) clearInterval(sessTimer)
  if (_chatPasteHandler) window.removeEventListener('paste', _chatPasteHandler)
  if (_chatKeyHandler) window.removeEventListener('keydown', _chatKeyHandler)
})
</script>

<style scoped>
/* ── Shell ── */
.chat-shell {
  display: flex;
  height: calc(100vh - 50px);
  background: #f0f2f5;
  overflow: hidden;
}

/* ── Sidebar ── */
.chat-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
}
.sidebar-search { padding: 10px 10px 6px; }
.sidebar-tabs {
  display: flex;
  gap: 4px;
  padding: 0 10px 8px;
  border-bottom: 1px solid #f0f0f0;
}
.stab {
  position: relative;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  color: #606266;
  cursor: pointer;
  user-select: none;
  transition: all .15s;
  border: 1px solid transparent;
}
.stab:hover { background: #f5f7fa; }
.stab-active {
  background: #e6f4ff;
  color: #1677ff;
  font-weight: 600;
  border-color: #91caff;
}
.stab-badge {
  position: absolute;
  top: -4px; right: -4px;
  background: #ff4d4f;
  color: #fff;
  font-size: 10px;
  font-style: normal;
  border-radius: 8px;
  padding: 0 4px;
  min-width: 14px;
  text-align: center;
  line-height: 14px;
}
.session-list { flex: 1; overflow-y: auto; }
.session-empty { text-align: center; padding: 32px 16px; color: #bbb; font-size: 13px; }

.session-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f5f5f5;
  transition: background .1s;
  position: relative;
}
.session-row:hover { background: #f5f7fa; }
.session-row-active { background: #e6f4ff !important; }

.sess-avatar {
  width: 38px; height: 38px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: #fff;
  flex-shrink: 0; position: relative; overflow: visible;
}
.sess-avatar-img { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; }
.sess-badge {
  position: absolute; top: -4px; right: -4px;
  background: #ff4d4f; color: #fff;
  font-size: 10px; border-radius: 8px;
  padding: 0 4px; min-width: 14px;
  text-align: center; line-height: 14px;
}
.sess-info { flex: 1; min-width: 0; }
.sess-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
.sess-name { font-size: 13px; font-weight: 700; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; }
.sess-time { font-size: 11px; color: #bbb; flex-shrink: 0; }
.sess-preview { font-size: 12px; color: #606266; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.sess-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.sess-dot-open    { background: #fa8c16; }
.sess-dot-claimed { background: #52c41a; }
.sess-dot-closed  { background: #d9d9d9; }

/* ── Main ── */
.chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #f0f2f5; }
.chat-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; color: #bbb;
}
.chat-empty p { font-size: 13px; margin: 0; }

/* Header */
.chat-header {
  height: 52px; background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex; align-items: center;
  justify-content: space-between;
  padding: 0 14px; flex-shrink: 0;
}
.chat-header-left { display: flex; align-items: center; gap: 10px; }
.hdr-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0; overflow: hidden;
}
.hdr-avatar-img { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; }
.hdr-name { font-size: 14px; font-weight: 600; color: #303133; }
.hdr-status { font-size: 11px; }
.hdr-status-open    { color: #fa8c16; }
.hdr-status-claimed { color: #52c41a; }
.hdr-status-closed  { color: #bbb; }
.chat-header-right { display: flex; gap: 6px; }

/* Body */
.chat-body { flex: 1; display: flex; overflow: hidden; }

/* Messages */
.msg-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.msg-scroll {
  flex: 1; overflow-y: auto; padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
  background: #f0f2f5;
}
.msg-loading { text-align: center; color: #bbb; font-size: 13px; padding: 20px; }
.msg-empty   { text-align: center; color: #bbb; font-size: 13px; padding: 40px; }
.msg-date    { text-align: center; font-size: 11px; color: #bbb; }
.msg-system  {
  text-align: center; font-size: 12px; color: #999;
  background: rgba(0,0,0,0.04); border-radius: 10px;
  padding: 3px 12px; align-self: center;
}
.msg-row { display: flex; align-items: flex-end; gap: 8px; }
.msg-row-me { flex-direction: row-reverse; }
.msg-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0;
}
.msg-content { max-width: 60%; display: flex; flex-direction: column; }
.msg-sender { font-size: 11px; color: #999; margin-bottom: 3px; }
.msg-img { max-width: 200px; border-radius: 8px; cursor: pointer; display: block; }
.msg-bubble {
  padding: 9px 13px; border-radius: 12px;
  font-size: 13px; line-height: 1.55; word-break: break-word;
}
.bubble-me   { background: #52c41a; color: #fff; border-bottom-right-radius: 3px; }
.bubble-user { background: #fff; color: #303133; border-bottom-left-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.msg-time { font-size: 10px; color: #bbb; margin-top: 3px; }
.msg-time-right { text-align: right; }

/* Input */
.input-bar { background: #fff; border-top: 1px solid #e4e7ed; flex-shrink: 0; }
.input-readonly { padding: 14px; text-align: center; color: #999; font-size: 12px; }
.input-toolbar { padding: 6px 10px 0; border-bottom: 1px solid #f0f0f0; }
.input-row { display: flex; gap: 8px; padding: 8px 10px 10px; align-items: flex-end; }
.input-textarea { flex: 1; }
.send-btn { height: 72px; width: 72px; }

/* Profile panel */
.profile-panel {
  width: 220px; flex-shrink: 0;
  background: #fff; border-left: 1px solid #e4e7ed;
  overflow-y: auto; padding: 16px 14px;
}
.profile-avatar {
  width: 52px; height: 52px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 700; color: #fff;
  margin: 0 auto 8px;
}
.profile-name  { text-align: center; font-size: 14px; font-weight: 600; color: #303133; }
.profile-phone { text-align: center; font-size: 12px; color: #909399; margin-bottom: 12px; }
.profile-stats {
  display: flex; align-items: center; justify-content: space-around;
  background: #f5f7fa; border-radius: 8px; padding: 10px; margin-bottom: 12px;
}
.pstat { text-align: center; }
.pstat-val { font-size: 16px; font-weight: 700; color: #303133; }
.pstat-lbl { font-size: 11px; color: #909399; margin-top: 2px; }
.pstat-div { width: 1px; height: 32px; background: #e4e7ed; }
.profile-rows { display: flex; flex-direction: column; gap: 0; }
.profile-row {
  display: flex; justify-content: space-between;
  padding: 6px 0; border-bottom: 1px solid #f5f5f5;
  font-size: 12px;
}
.pr-label { color: #909399; }
.pr-value { font-weight: 500; color: #303133; }

/* Transition */
.slide-profile-enter-active, .slide-profile-leave-active { transition: width .2s ease, opacity .2s ease; overflow: hidden; }
.slide-profile-enter-from, .slide-profile-leave-to { width: 0; opacity: 0; }
.slide-profile-enter-to, .slide-profile-leave-from { width: 220px; opacity: 1; }

/* Keyboard shortcuts hint */
.keyboard-hints {
  display: flex; gap: 6px; padding: 4px 0 0; justify-content: flex-end;
}
.keyboard-hints span {
  font-size: 9px; color: #bbb; background: #f5f5f5;
  padding: 2px 5px; border-radius: 3px; font-family: monospace;
  cursor: help; transition: all .15s;
}
.keyboard-hints span:hover { background: #e8e8e8; color: #666; }
</style>
