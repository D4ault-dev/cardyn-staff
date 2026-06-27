<template>
  <div class="staff-shell">
    <!-- Top navigation bar — matches the screenshot exactly -->
    <div class="staff-topnav" data-tauri-drag-region>
      <div class="topnav-left" style="-webkit-app-region:no-drag">
        <!-- Nav tabs -->
        <router-link
          v-for="item in navItems" :key="item.path"
          :to="item.path"
          class="topnav-tab"
          :class="{ active: isActive(item.path) }"
          @click="item.path === '/orders' && (orderBadge = 0); item.path === '/withdrawals' && (wdBadge = 0)"
        >
          {{ item.label }}
          <span v-if="item.path === '/chat' && unread > 0" class="topnav-badge">{{ unread > 99 ? '99+' : unread }}</span>
          <span v-if="item.path === '/orders' && orderBadge > 0" class="topnav-badge orange">{{ orderBadge }}</span>
          <span v-if="item.path === '/withdrawals' && wdBadge > 0" class="topnav-badge orange">{{ wdBadge }}</span>
        </router-link>

        <!-- Separator -->
        <div style="width:1px;height:20px;background:#e4e7ed;margin:0 6px;flex-shrink:0"></div>

        <!-- 待受理订单 button — left side near nav tabs -->
        <button class="topnav-alert-btn orange" @click="openOrdersPopup">
          待受理订单
          <span v-if="orderBadge > 0" class="topnav-alert-badge">{{ orderBadge }}</span>
        </button>

        <!-- 待处理提现 button -->
        <button class="topnav-alert-btn purple" @click="openWithdrawalsPopup">
          待处理提现
          <span v-if="wdBadge > 0" class="topnav-alert-badge">{{ wdBadge }}</span>
        </button>
      </div>

      <div class="topnav-right" style="-webkit-app-region:no-drag">
        <!-- Online staff avatars — green dot = online, grey = recently offline -->
        <div class="topnav-online">
          <span v-for="s in onlineStaff.slice(0,8)" :key="s.id"
            class="topnav-avatar"
            :title="s.name + (s.isOnline ? ' (在线)' : ' (离线)')"
            :style="{ background: s.isOnline ? nameColor(s.name) : '#bbb', opacity: s.isOnline ? 1 : 0.5 }">
            {{ s.name[0]?.toUpperCase() }}
          </span>
        </div>

        <!-- User info (logged-in staff only) -->
        <div class="topnav-user">
          <div class="topnav-avatar-lg" :style="{ background: '#1677ff' }">{{ initials }}</div>
          <span class="topnav-username">{{ userStore.nickName || userStore.username }}</span>
        </div>
        <el-button size="small" type="danger" plain @click="handleLogout">退出</el-button>
        <!-- Window controls (Tauri frameless) -->
        <div class="win-controls" style="-webkit-app-region:no-drag;display:flex;align-items:center;gap:0;margin-left:8px">
          <button class="win-btn" @click="winMinimize" title="最小化">
            <svg width="10" height="2" viewBox="0 0 10 2"><rect width="10" height="1.5" rx="0.75" fill="currentColor"/></svg>
          </button>
          <button class="win-btn" @click="winMaximize" :title="isMaximized ? '还原' : '最大化'">
            <svg v-if="isMaximized" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2">
              <rect x="2.5" y="0.5" width="7" height="7"/><rect x="0.5" y="2.5" width="7" height="7" fill="var(--win-bg, #fff)"/><rect x="0.5" y="2.5" width="7" height="7"/>
            </svg>
            <svg v-else width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="0.5" y="0.5" width="9" height="9"/></svg>
          </button>
          <button class="win-btn win-close" @click="winClose" title="关闭">
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Page content — full width, fills remaining height -->
    <div class="staff-content">
      <router-view v-slot="{ Component }">
        <component :is="Component"
          @unread-change="unread = $event"
          @order-badge="orderBadge += $event"
          @wd-badge="wdBadge += $event" />
      </router-view>
    </div>

    <!-- Toast notifications -->
    <div class="toast-wrap">
      <ToastCard
        v-for="t in toasts" :key="t.id"
        :toast="t"
        @dismiss="dismissToast(t.id)"
        @open="openToast(t)"
      />
    </div>

    <!-- Global pending orders popup — visible on ALL screens -->
    <PendingOrdersPopup
      ref="ordersPopupRef"
      :new-order-alert="newOrderAlert"
      @alert-dismissed="newOrderAlert = false"
      @order-claimed="onOrderClaimed"
      @pending-count="orderBadge = $event"
    />

    <!-- Global pending withdrawals popup — visible on ALL screens -->
    <PendingWithdrawalsPopup
      ref="wdPopupRef"
      :new-withdrawal-alert="newWithdrawalAlert"
      @alert-dismissed="newWithdrawalAlert = false"
      @withdrawal-claimed="onWithdrawalClaimed"
      @pending-count="wdBadge = $event"
    />

    <!-- Update banner — bottom of screen, same as Staff Desktop -->
    <div v-if="updateState === 'ready'" class="update-banner-ready">
      <div>
        <div class="update-ready-title">新版本 {{ updateNewVer }} 已下载完成</div>
        <div class="update-ready-sub">点击立即重启安装，全程不超过30秒</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="update-install-btn" @click="installUpdate">立即重启安装</button>
        <button class="update-later-btn" @click="updateState='idle'">稍后</button>
      </div>
    </div>

    <div v-else-if="updateState === 'downloading'" class="update-banner-downloading">
      <div class="update-progress-track">
        <div class="update-progress-fill" :style="{ width: Math.max(updateProgress, 8) + '%' }"></div>
      </div>
      <span class="update-downloading-text">
        {{ updateProgress > 0 ? `下载中 ${updateProgress}%...` : '新版本下载中...' }}
      </span>
    </div>

    <div v-else class="update-version-bar">
      <span class="update-ver-text">v{{ appVersion }}</span>
      <span v-if="updateState === 'up-to-date'" class="update-up-to-date-tag">已是最新版本</span>
      <button v-else-if="updateState === 'error'"
        class="update-check-btn error"
        @click="triggerUpdateCheck">更新失败，重试</button>
      <button v-else
        class="update-check-btn"
        :disabled="updateState === 'checking'"
        @click="triggerUpdateCheck">
        {{ updateState === 'checking' ? '检查中...' : '检查更新' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useNotifications } from '@/composables/useNotifications'
import ToastCard from '@/components/ToastCard.vue'
import PendingOrdersPopup from '@/components/PendingOrdersPopup.vue'
import PendingWithdrawalsPopup from '@/components/PendingWithdrawalsPopup.vue'
import { playNewOrder, playNewWithdrawal, playNewChat } from '@/utils/sound'
import request from '@/utils/request'

const route     = useRoute()
const router    = useRouter()
const userStore = useUserStore()
const initials  = computed(() => (userStore.nickName || userStore.username || 'S')[0].toUpperCase())

const isMaximized   = ref(false)
// Read version from Tauri or fallback to package.json version
const appVersion    = ref('2.5.3')
// Update state machine — same as Staff Desktop UpdateBanner
const updateState    = ref('idle') // idle | checking | downloading | ready | up-to-date | error
const updateNewVer   = ref('')
const updateProgress = ref(0)
let   _pendingUpdate = null
const unread      = ref(0)
const orderBadge  = ref(0)
const wdBadge     = ref(0)
const toasts      = ref([])
const onlineStaff = ref([])
const newOrderAlert = ref(false)
const newWithdrawalAlert = ref(false)

// Refs to popup components — used by header buttons to open them
const ordersPopupRef = ref(null)
const wdPopupRef     = ref(null)

function openOrdersPopup()      { ordersPopupRef.value?.openPopup() }
function openWithdrawalsPopup() { wdPopupRef.value?.openPopup() }

function onOrderClaimed() {
  orderBadge.value = 0
  window.dispatchEvent(new CustomEvent('order:claimed'))
}

function onWithdrawalClaimed() {
  wdBadge.value = 0
}

// ── Auto updater — same state machine as Staff Desktop ───────────────────────
let _pendingCheckTimeout = null

async function triggerUpdateCheck() {
  updateState.value = 'checking'
  // Fallback: if no response in 20s go back to idle
  _pendingCheckTimeout = setTimeout(() => {
    if (updateState.value === 'checking') updateState.value = 'idle'
  }, 20_000)
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    clearTimeout(_pendingCheckTimeout)
    if (update?.available) {
      _pendingUpdate = update
      updateState.value = 'downloading'
      updateProgress.value = 0
      // Download with progress — Tauri v2 updater supports onChunk callback
      await update.download((event) => {
        if (event.event === 'Progress') {
          const pct = event.data.chunkLength && event.data.contentLength
            ? Math.round((event.data.chunkLength / event.data.contentLength) * 100)
            : updateProgress.value
          if (pct > updateProgress.value) updateProgress.value = pct
        }
        if (event.event === 'Finished') {
          updateProgress.value = 100
          updateNewVer.value = update.version || ''
          updateState.value = 'ready'
        }
      })
    } else {
      updateState.value = 'up-to-date'
      setTimeout(() => { if (updateState.value === 'up-to-date') updateState.value = 'idle' }, 3000)
    }
  } catch {
    clearTimeout(_pendingCheckTimeout)
    updateState.value = 'error'
  }
}

async function installUpdate() {
  try {
    if (_pendingUpdate) await _pendingUpdate.install()
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
  } catch {
    // Fallback — try restart
    try {
      const { restart } = await import('@tauri-apps/plugin-process')
      await restart()
    } catch {}
  }
}

// Silent startup check after 10s
setTimeout(async () => {
  if (updateState.value !== 'idle') return
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (update?.available) {
      _pendingUpdate = update
      updateState.value = 'downloading'
      updateProgress.value = 0
      await update.download((event) => {
        if (event.event === 'Progress') {
          const pct = event.data.chunkLength && event.data.contentLength
            ? Math.round((event.data.chunkLength / event.data.contentLength) * 100)
            : updateProgress.value
          if (pct > updateProgress.value) updateProgress.value = pct
        }
        if (event.event === 'Finished') {
          updateProgress.value = 100
          updateNewVer.value = update.version || ''
          updateState.value = 'ready'
        }
      })
    }
  } catch {}
}, 10_000)

// Tauri window controls — use @tauri-apps/api/window for proper capability support
async function winMinimize() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().minimize()
  } catch { try { await window.__TAURI__.window.getCurrentWindow().minimize() } catch {} }
}
async function winMaximize() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    const maximized = await win.isMaximized()
    if (maximized) { await win.unmaximize() } else { await win.maximize() }
    isMaximized.value = !maximized
  } catch {
    try {
      const win = window.__TAURI__.window.getCurrentWindow()
      const maximized = await win.isMaximized()
      if (maximized) { await win.unmaximize() } else { await win.maximize() }
      isMaximized.value = !maximized
    } catch {}
  }
}
async function winClose() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  } catch { try { await window.__TAURI__.window.getCurrentWindow().close() } catch {} }
}

const navItems = [
  { path: '/chat',        label: '客服中心' },
  { path: '/orders',      label: '核销中心' },
  { path: '/withdrawals', label: '提现中心' },
  { path: '/users',       label: '用户管理' },
]

function isActive(path) { return route.path.startsWith(path) }

// ── Online staff ───────────────────────────────────────────────────────────────
const colors = ['#16a34a','#2563eb','#9333ea','#ea580c','#0891b2','#be185d']
function nameColor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}
async function refreshOnline() {
  try {
    const res = await request({ url: '/tuka/staff/online' })
    const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : [])
    // Show all staff — online and recently offline — sorted by online first
    onlineStaff.value = list.sort((a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0))
  } catch {}
}
async function sendHeartbeat() {
  try { await request({ url: '/tuka/staff/heartbeat', method: 'post' }) } catch {}
}
let onlineTimer    = null
let heartbeatTimer = null
onMounted(() => {
  // Get app version from Tauri
  try { window.__TAURI__?.app?.getVersion?.().then(v => { if (v) appVersion.value = v }).catch(() => {}) } catch {}
  // Send heartbeat immediately so this staff shows as online right away
  sendHeartbeat()
  heartbeatTimer = setInterval(sendHeartbeat, 30_000)
  // Refresh online staff list — 2s delay so login token is ready
  setTimeout(() => {
    refreshOnline()
    onlineTimer = setInterval(refreshOnline, 10_000)
  }, 2000)
})

// Notifications
const { stop } = useNotifications({
  onChat: (chats) => {
    unread.value += chats.length
    playNewChat()
    chats.forEach(c => addToast({
      type: 'chat', title: '新客服请求',
      message: `${c.userName || '用户#' + c.userId} 发起了对话`,
      sessionId: c.id
    }))
  },
  onOrder: (count) => {
    orderBadge.value += count
    newOrderAlert.value = true
    playNewOrder()
    addToast({ type: 'order', title: '新订单', message: `${count} 个新订单等待核销` })
  },
  onWithdrawal: (count) => {
    wdBadge.value += count
    newWithdrawalAlert.value = true
    playNewWithdrawal()
    addToast({ type: 'withdrawal', title: '新提现申请', message: `${count} 笔新提现申请` })
  }
})
onUnmounted(() => {
  stop()
  if (onlineTimer) clearInterval(onlineTimer)
  if (heartbeatTimer) clearInterval(heartbeatTimer)
})

function addToast(t) {
  const id = Date.now() + Math.random()
  toasts.value.push({ ...t, id })
  setTimeout(() => dismissToast(id), 8000)
}
function dismissToast(id) { toasts.value = toasts.value.filter(t => t.id !== id) }
function openToast(t) {
  dismissToast(t.id)
  if (t.type === 'chat') router.push('/chat')
  else if (t.type === 'order') router.push('/orders')
  else router.push('/withdrawals')
}

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确认退出登录？', '退出', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
    await userStore.Logout()
    router.push('/login')
  } catch {
    // cancelled — do nothing
  }
}
</script>

<style scoped>
.staff-shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: #f0f2f5; }

/* Top nav bar */
.staff-topnav {
  height: 50px; background: #fff; flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  -webkit-app-region: drag;
  padding: 0 16px;
  box-shadow: 0 1px 4px rgba(0,21,41,.08);
}
.topnav-left { display: flex; align-items: center; gap: 2px; -webkit-app-region: no-drag; }
.topnav-right { display: flex; align-items: center; gap: 10px; -webkit-app-region: no-drag; }

/* Nav tabs */
.topnav-tab {
  padding: 6px 16px; border-radius: 4px;
  font-size: 14px; font-weight: 500; color: #606266;
  text-decoration: none; cursor: pointer; position: relative;
  transition: all .15s; white-space: nowrap;
}
.topnav-tab:hover { color: #1677ff; background: #f0f7ff; }
.topnav-tab.active { color: #1677ff; background: #e6f4ff; font-weight: 600; }
.topnav-badge {
  position: absolute; top: 2px; right: 2px;
  background: #ff4d4f; color: #fff; border-radius: 8px;
  padding: 0 5px; font-size: 10px; font-weight: 700; min-width: 16px; text-align: center;
}
.topnav-badge.orange { background: #fa8c16; }

/* Online avatars in top bar */
.topnav-online { display: flex; align-items: center; gap: 3px; }
.topnav-avatar {
  width: 26px; height: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0;
  border: 2px solid #fff; cursor: default; title: attr(title);
}

/* User info */
.topnav-user { display: flex; align-items: center; gap: 6px; }
.topnav-avatar-lg {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #fff;
}
.topnav-username { font-size: 13px; color: #303133; font-weight: 500; }

/* Window controls */
.win-controls { display: flex; align-items: center; }
.win-btn {
  width: 36px; height: 40px; display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #666; cursor: pointer;
  transition: background .12s; flex-shrink: 0;
}
.win-btn:hover { background: rgba(0,0,0,.07); color: #333; }
.win-close:hover { background: #e81123 !important; color: #fff !important; }
.topnav-icon-btn {
  width: 30px; height: 30px; border-radius: 6px; border: none;
  background: transparent; color: #606266; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .12s; position: relative;
}
.topnav-icon-btn:hover { background: #f0f2f5; color: #333; }

/* Content area */
.staff-content { flex: 1; overflow-y: auto; }

/* Alert buttons in topnav */
.topnav-alert-btn {
  display: flex; align-items: center; gap: 6px;
  border: none; border-radius: 5px; cursor: pointer;
  padding: 5px 12px; font-size: 12px; font-weight: 600;
  white-space: nowrap; transition: opacity .12s; flex-shrink: 0;
}
.topnav-alert-btn:hover { opacity: .85; }
.topnav-alert-btn.orange { background: #fff7e6; color: #d46b08; border: 1px solid #ffd591; }
.topnav-alert-btn.orange:hover { background: #ffe7ba; }
.topnav-alert-btn.purple { background: #f9f0ff; color: #531dab; border: 1px solid #d3adf7; }
.topnav-alert-btn.purple:hover { background: #efdbff; }
.topnav-alert-badge {
  background: #ff4d4f; color: #fff; border-radius: 9px;
  padding: 1px 6px; font-size: 10px; font-weight: 700; min-width: 16px; text-align: center;
}

/* Toast */
.toast-wrap {
  position: fixed; bottom: 24px; right: 24px;
  display: flex; flex-direction: column; gap: 10px;
  z-index: 9999; pointer-events: none;
}

/* Update banner — bottom of screen, same UX as Staff Desktop */
.update-banner-ready {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
  background: linear-gradient(135deg, #16a34a, #15803d); color: #fff;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 12px 24px;
  box-shadow: 0 -4px 16px rgba(22,163,74,.4);
}
.update-ready-title { font-weight: 700; font-size: 13px; }
.update-ready-sub   { font-size: 11px; opacity: .85; }
.update-install-btn {
  background: #fff; color: #16a34a; border: none; border-radius: 6px;
  padding: 6px 18px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.update-later-btn {
  background: rgba(255,255,255,.15); color: #fff;
  border: 1px solid rgba(255,255,255,.4); border-radius: 6px;
  padding: 6px 14px; font-size: 13px; cursor: pointer; white-space: nowrap;
}
.update-banner-downloading {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
  background: #fff; border-top: 1px solid #e8e8e8;
  display: flex; align-items: center; gap: 12px; padding: 8px 24px;
}
.update-progress-track {
  flex: 1; height: 4px; background: #e8e8e8; border-radius: 2px; overflow: hidden;
}
.update-progress-fill {
  height: 100%; background: #1677ff; border-radius: 2px; transition: width .3s ease;
}
.update-downloading-text { font-size: 11px; color: #1677ff; font-weight: 600; white-space: nowrap; }
.update-version-bar {
  position: fixed; bottom: 10px; left: 12px; z-index: 9999;
  display: flex; align-items: center; gap: 8px;
}
.update-ver-text   { font-size: 11px; color: #bbb; }
.update-check-btn  {
  background: #fff; color: #1677ff; border: 1px solid #1677ff;
  border-radius: 4px; padding: 3px 12px; font-size: 11px; cursor: pointer; font-weight: 600;
}
.update-check-btn:disabled { opacity: .6; cursor: default; }
.update-check-btn.error { border-color: #ff4d4f; color: #ff4d4f; }
.update-up-to-date-tag {
  font-size: 11px; color: #52c41a; font-weight: 600;
  background: #f6ffed; border: 1px solid #b7eb8f;
  border-radius: 4px; padding: 2px 8px;
}
</style>
