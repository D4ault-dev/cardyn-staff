<template>
  <!-- Full overlay popup -->
  <teleport to="body">
    <div v-if="visible" class="pp-overlay" @click="closePopup">
      <div class="pp-popup" @click.stop>
        <!-- Header -->
        <div class="pp-header">
          <span class="pp-title">待受理订单</span>
          <div style="display:flex;align-items:center;gap:10px">
            <span v-if="rows.length > 0" class="pp-count">
              <template v-if="pendingRows.length > 0">{{ pendingRows.length }} 待接单</template>
              <template v-if="pendingRows.length > 0 && myProcessingRows.length > 0"> · </template>
              <template v-if="myProcessingRows.length > 0">{{ myProcessingRows.length }} 我的处理中</template>
            </span>
            <button class="pp-close" @click="closePopup">✕</button>
          </div>
        </div>

        <!-- Body -->
        <div class="pp-body">
          <div v-if="loading && rows.length === 0" class="pp-empty">加载中...</div>
          <div v-else-if="rows.length === 0" class="pp-empty">暂无待受理订单</div>
          <table v-else class="pp-table">
            <thead>
              <tr>
                <th>卡种</th>
                <th>面值</th>
                <th>结算金额</th>
                <th>数量</th>
                <th>类型</th>
                <th>用户</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.id"
                :style="{ background: r.status === 'processing' ? '#f0f9ff' : undefined }">
                <td style="font-weight:600">{{ r.categoryName }}</td>
                <td style="color:#52c41a;font-weight:600">{{ currSym(r.cardCurrency) }}{{ r.cardAmount }}</td>
                <td style="color:#ff4d4f;font-weight:700">₦{{ fmt(r.ngnAmount) }}</td>
                <td>{{ r.quantity ?? 1 }}</td>
                <td>{{ r.inputType || '—' }}</td>
                <td style="font-family:monospace">#{{ r.userId }}</td>
                <td style="font-size:11px;color:#888">{{ r.createTime?.slice(0, 16) }}</td>
                <td>
                  <span v-if="r.status === 'processing'"
                    style="font-size:11px;color:#1677ff;font-weight:600">
                    {{ r.staffName || '处理中' }}
                  </span>
                  <template v-else>
                    <button class="pp-claim-btn"
                      :class="{ loading: claiming === r.id }"
                      :disabled="claiming !== null"
                      @click="claimOrder(r)">
                      {{ claiming === r.id ? '接单中…' : '接单' }}
                    </button>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div class="pp-footer">
          <button class="pp-refresh-btn" @click="load()">刷 新</button>
          <button class="pp-close-btn" @click="closePopup">关 闭</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import request, { clearCache } from '@/utils/request'
import { usePermissions } from '@/composables/usePermissions'
import { useUserStore } from '@/stores/user'

const props = defineProps({
  // When parent detects a new order alert (from notification), pass true to force-open
  newOrderAlert: { type: Boolean, default: false },
})
const emit = defineEmits(['alert-dismissed', 'order-claimed', 'pending-count'])

const { canActOrders } = usePermissions()
const userStore = useUserStore()

const CS = {
  USD:'$',GBP:'£',EUR:'€',CAD:'C$',AUD:'A$',JPY:'¥',CNY:'¥',PHP:'₱',SGD:'S$',NGN:'₦',
  US:'$',GB:'£',EU:'€',CA:'C$',AU:'A$',JP:'¥',CN:'¥',PH:'₱',SG:'S$',NG:'₦',
}
function currSym(c) { return CS[c] || '' }
function fmt(n) { return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 }) }

const visible   = ref(false)
const rows      = ref([])
const loading   = ref(false)
const claiming  = ref(null)

// suppressAutoOpen — set true after staff manually closes, reset on new orders
const suppressAutoOpen = ref(false)
const lastPendingCount = ref(0)

const pendingRows    = computed(() => rows.value.filter(r => r.status === 'pending'))
const myProcessingRows = computed(() =>
  rows.value.filter(r => r.status === 'processing' && Number(r.staffId) === Number(userStore.userId))
)
const pendingCount = computed(() => pendingRows.value.length)

// Expose pendingCount to parent
watch(pendingCount, n => emit('pending-count', n), { immediate: true })

async function load(forceShow = false) {
  if (!canActOrders.value) return
  clearCache('/tuka/order/list')
  try {
    const [pendingRes, processingRes] = await Promise.all([
      request({ url: '/tuka/order/list', params: { status: 'pending', pageSize: 50 } }),
      request({ url: '/tuka/order/list', params: { status: 'processing', pageSize: 50 } }),
    ])
    const pending    = pendingRes.rows || []
    const processing = (processingRes.rows || []).filter(
      r => Number(r.staffId) === Number(userStore.userId)
    )
    rows.value = [...pending, ...processing]

    if (forceShow) {
      visible.value = true
      suppressAutoOpen.value = false
      lastPendingCount.value = pending.length
    } else if (!suppressAutoOpen.value && pending.length > lastPendingCount.value) {
      // New unclaimed orders arrived — auto-open
      visible.value = true
      lastPendingCount.value = pending.length
    } else {
      lastPendingCount.value = pending.length
    }
  } catch {}
}

function openPopup() {
  suppressAutoOpen.value = false
  load(true)
}

function closePopup() {
  suppressAutoOpen.value = true
  visible.value = false
}

async function claimOrder(row) {
  claiming.value = row.id
  try {
    await request({ url: '/tuka/order/audit', method: 'put', data: { id: row.id, status: 'processing', verifyRemark: '' } })
    suppressAutoOpen.value = true
    visible.value = false
    load()
    emit('order-claimed', row.id)
  } catch (e) {
    const msg = e.message || ''
    // 409 = already claimed by someone else, OR already claimed by THIS staff (second click)
    // Check if this staff already owns it before showing error
    if (msg.includes('409') || msg.toLowerCase().includes('claimed')) {
      // Reload to get current state — if WE own it, treat as success
      await load()
      const ours = rows.value.find(r => r.id === row.id && Number(r.staffId) === Number(userStore.userId))
      if (ours) {
        // We already own this order — treat as success, just close
        suppressAutoOpen.value = true
        visible.value = false
        emit('order-claimed', row.id)
      } else {
        const toast = document.createElement('div')
        toast.textContent = '该订单已被其他客服接单'
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#ff4d4f;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;z-index:99999;pointer-events:none'
        document.body.appendChild(toast)
        setTimeout(() => toast.remove(), 3000)
      }
    } else {
      alert(msg)
    }
  } finally {
    claiming.value = null
  }
}

// React to parent-driven new order alert
watch(() => props.newOrderAlert, (val) => {
  if (val) { load(true); emit('alert-dismissed') }
})

defineExpose({ openPopup })

let timer = null
onMounted(() => {
  // Initial load after short delay
  setTimeout(() => load(), 1200)
  // Poll every 6s — same as Staff Desktop
  timer = setInterval(() => { if (!document.hidden) load() }, 6_000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
/* Overlay */
.pp-overlay {
  position: fixed; inset: 0; z-index: 3000;
  background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center;
}

/* Popup box */
.pp-popup {
  background: #fff; border-radius: 10px;
  width: 860px; max-width: 95vw;
  max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: 0 16px 48px rgba(0,0,0,.18);
  overflow: hidden;
}

/* Header */
.pp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid #f0f0f0;
  background: #fafafa; flex-shrink: 0;
}
.pp-title { font-size: 16px; font-weight: 700; color: #1a1a1a; }
.pp-count { font-size: 12px; color: #888; }
.pp-close {
  width: 28px; height: 28px; border: none; background: transparent;
  color: #999; cursor: pointer; font-size: 14px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  transition: background .12s;
}
.pp-close:hover { background: #f5f5f5; color: #333; }

/* Body */
.pp-body { flex: 1; overflow-y: auto; padding: 0; }
.pp-empty { padding: 48px; text-align: center; color: #bbb; font-size: 14px; }

/* Table */
.pp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pp-table thead tr { background: #f5f7fa; position: sticky; top: 0; z-index: 1; }
.pp-table th {
  padding: 10px 14px; text-align: left; font-weight: 600;
  color: #606266; font-size: 12px; border-bottom: 1px solid #e8e8e8;
  white-space: nowrap;
}
.pp-table td {
  padding: 10px 14px; border-bottom: 1px solid #f0f0f0;
  color: #303133; white-space: nowrap;
}
.pp-table tbody tr:hover { background: #fafafa; }
.pp-table tbody tr:last-child td { border-bottom: none; }

/* Claim button */
.pp-claim-btn {
  background: #1677ff; color: #fff; border: none;
  border-radius: 4px; padding: 4px 12px; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: background .12s;
}
.pp-claim-btn:hover { background: #0958d9; }
.pp-claim-btn:disabled { opacity: .6; cursor: not-allowed; }
.pp-claim-btn.loading { background: #91caff; }

/* Footer */
.pp-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 12px 20px; border-top: 1px solid #f0f0f0;
  background: #fafafa; flex-shrink: 0;
}
.pp-refresh-btn, .pp-close-btn {
  padding: 6px 18px; border-radius: 5px; font-size: 13px;
  cursor: pointer; border: 1px solid #d9d9d9; background: #fff;
  color: #303133; transition: background .12s;
}
.pp-refresh-btn:hover, .pp-close-btn:hover { background: #f5f5f5; }
</style>
