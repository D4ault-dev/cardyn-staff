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
      </div>

      <div class="topnav-right" style="-webkit-app-region:no-drag">
        <!-- Theme toggle -->
        <button class="topnav-icon-btn" @click="toggleTheme" :title="isDark ? 'Light mode' : 'Dark mode'">
          <svg v-if="isDark" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>
        </button>

        <!-- 待受理订单 button -->
        <button class="topnav-alert-btn orange" @click="openOrdersPopup">
          待受理订单
          <span v-if="orderBadge > 0" class="topnav-alert-badge">{{ orderBadge }}</span>
        </button>

        <!-- 待处理提现 button -->
        <button class="topnav-alert-btn purple" @click="openWithdrawalsPopup">
          待处理提现
          <span v-if="wdBadge > 0" class="topnav-alert-badge">{{ wdBadge }}</span>
        </button>

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
            <!-- Restore icon when maximized, maximize icon otherwise -->
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
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useNotifications } from '@/composables/useNotifications'
import ToastCard from '@/components/ToastCard.vue'
import PendingOrdersPopup from '@/components/PendingOrdersPopup.vue'
import PendingWithdrawalsPopup from '@/components/PendingWithdrawalsPopup.vue'
import { playNewOrder, playNewWithdrawal, playNewChat, initAudio } from '@/utils/sound'

const route     = useRoute()
const router    = useRouter()
const userStore = useUserStore()

const isDark = ref(document.documentElement.classList.contains('dark'))
const isMaximized = ref(false)
const unread      = ref(0)
const orderBadge  = ref(0)
const wdBadge     = ref(0)
const toasts      = ref([])
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

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('ui-theme', isDark.value ? 'dark' : 'light')
}

// Tauri window controls
async function winMinimize() {
  try { await window.__TAURI__.window.getCurrentWindow().minimize() } catch {}
}
async function winMaximize() {
  try {
    const win = window.__TAURI__.window.getCurrentWindow()
    const maximized = await win.isMaximized()
    if (maximized) { await win.unmaximize() } else { await win.maximize() }
    isMaximized.value = !maximized
  } catch {}
}
async function winClose() {
  try { await window.__TAURI__.window.getCurrentWindow().close() } catch {}
}

const navItems = [
  { path: '/chat',        label: '客服中心' },
  { path: '/orders',      label: '核销中心' },
  { path: '/withdrawals', label: '提现中心' },
  { path: '/users',       label: '用户管理' },
]

function isActive(path) { return route.path.startsWith(path) }

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
onUnmounted(stop)

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
  transition: background .12s;
}
.topnav-icon-btn:hover { background: #f0f2f5; color: #f59e0b; }

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
</style>
