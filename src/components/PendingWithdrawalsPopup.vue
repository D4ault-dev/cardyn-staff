<template>
  <!-- Full overlay popup -->
  <teleport to="body">
    <div v-if="visible" class="pw-overlay" @click="closePopup">
      <div class="pw-popup" @click.stop>
        <!-- Header -->
        <div class="pw-header">
          <span class="pw-title">待处理提现</span>
          <div style="display:flex;align-items:center;gap:10px">
            <span v-if="rows.length > 0" class="pw-count">
              {{ unclaimedRows.length }} 待接单
              <template v-if="myRows.length > 0"> · {{ myRows.length }} 我的处理中</template>
            </span>
            <button class="pw-close" @click="closePopup">✕</button>
          </div>
        </div>

        <!-- Body -->
        <div class="pw-body">
          <div v-if="loading && rows.length === 0" class="pw-empty">加载中...</div>
          <div v-else-if="rows.length === 0" class="pw-empty">暂无待处理提现</div>
          <table v-else class="pw-table">
            <thead>
              <tr>
                <th>用户</th>
                <th>银行</th>
                <th>账号</th>
                <th>提现金额</th>
                <th>手续费</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.id"
                :style="{ background: r.staffId && Number(r.staffId) === Number(userStore.userId) ? '#f0f9ff' : undefined }">
                <td style="font-family:monospace">#{{ r.userId }}<br><span style="font-size:11px;color:#999">{{ r.username }}</span></td>
                <td>{{ r.bankName }}</td>
                <td style="font-family:monospace;font-size:12px">{{ r.accountNo }}</td>
                <td style="color:#ff4d4f;font-weight:700">₦{{ fmt(r.amount) }}</td>
                <td style="color:#888;font-size:12px">₦{{ fmt(r.fee) }}</td>
                <td style="font-size:11px;color:#888">{{ r.createTime?.slice(0, 16) }}</td>
                <td>
                  <!-- Already claimed by THIS staff -->
                  <span v-if="r.staffId && Number(r.staffId) === Number(userStore.userId)"
                    style="font-size:11px;color:#1677ff;font-weight:600">我的处理中</span>
                  <!-- Claimed by another staff -->
                  <span v-else-if="r.staffId && Number(r.staffId) !== 0"
                    style="font-size:11px;color:#999">{{ r.staffName }} 处理中</span>
                  <!-- Unclaimed — show 接单 button -->
                  <button v-else
                    class="pw-claim-btn"
                    :class="{ loading: claiming === r.id }"
                    :disabled="claiming !== null"
                    @click="claimWithdrawal(r)">
                    {{ claiming === r.id ? '接单中…' : '接单' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div class="pw-footer">
          <button class="pw-refresh-btn" @click="load()">刷 新</button>
          <button class="pw-close-btn" @click="closePopup">关 闭</button>
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
  newWithdrawalAlert: { type: Boolean, default: false },
})
const emit = defineEmits(['alert-dismissed', 'withdrawal-claimed', 'pending-count'])

const { canActWithdrawals } = usePermissions()
const userStore = useUserStore()

function fmt(n) { return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 }) }

const visible  = ref(false)
const rows     = ref([])
const loading  = ref(false)
const claiming = ref(null)

const suppressAutoOpen = ref(false)
const lastPendingCount = ref(0)

const unclaimedRows = computed(() => rows.value.filter(r => !r.staffId || Number(r.staffId) === 0))
const myRows        = computed(() => rows.value.filter(r => Number(r.staffId) === Number(userStore.userId)))
const pendingCount  = computed(() => unclaimedRows.value.length)

watch(pendingCount, n => emit('pending-count', n), { immediate: true })

async function load(forceShow = false) {
  if (!canActWithdrawals.value) return
  clearCache('/tuka/withdrawal/list')
  try {
    const res = await request({ url: '/tuka/withdrawal/list', params: { status: 'pending', pageSize: 50 } })
    const pending = res.rows || []
    rows.value = pending

    if (forceShow) {
      visible.value = true
      suppressAutoOpen.value = false
      lastPendingCount.value = pending.length
    } else if (!suppressAutoOpen.value && pending.length > lastPendingCount.value) {
      visible.value = true
      lastPendingCount.value = pending.length
    } else {
      lastPendingCount.value = pending.length
    }
  } catch {}
}

function openPopup()  { suppressAutoOpen.value = false; load(true) }
function closePopup() { suppressAutoOpen.value = true; visible.value = false }

async function claimWithdrawal(row) {
  claiming.value = row.id
  try {
    await request({ url: '/tuka/withdrawal/claim', method: 'put', data: { id: row.id } })
    // After claim — reload to show updated state, keep popup open so staff can see their row
    await load()
    emit('withdrawal-claimed')
  } catch (e) {
    const msg = e.message || ''
    if (msg.includes('409') || msg.toLowerCase().includes('claimed')) {
      // Check if WE already own it
      await load()
      const mine = rows.value.find(r => r.id === row.id && Number(r.staffId) === Number(userStore.userId))
      if (!mine) {
        const toast = document.createElement('div')
        toast.textContent = '该提现已被其他客服接单'
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

// React to parent-driven new withdrawal alert (from notifications)
watch(() => props.newWithdrawalAlert, (val) => {
  if (val) { load(true); emit('alert-dismissed') }
})

defineExpose({ openPopup })

let timer = null
onMounted(() => {
  setTimeout(() => load(), 1500)
  timer = setInterval(() => { if (!document.hidden) load() }, 6_000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.pw-overlay {
  position: fixed; inset: 0; z-index: 3000;
  background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center;
}

.pw-popup {
  background: #fff; border-radius: 10px;
  width: 900px; max-width: 95vw; max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: 0 16px 48px rgba(0,0,0,.18);
  overflow: hidden;
}

.pw-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid #f0f0f0;
  background: #fafafa; flex-shrink: 0;
}
.pw-title { font-size: 16px; font-weight: 700; color: #1a1a1a; }
.pw-count { font-size: 12px; color: #888; }
.pw-close {
  width: 28px; height: 28px; border: none; background: transparent;
  color: #999; cursor: pointer; font-size: 14px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
}
.pw-close:hover { background: #f5f5f5; color: #333; }

.pw-body { flex: 1; overflow-y: auto; }
.pw-empty { padding: 48px; text-align: center; color: #bbb; font-size: 14px; }

.pw-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pw-table thead tr { background: #f5f7fa; position: sticky; top: 0; z-index: 1; }
.pw-table th {
  padding: 10px 14px; text-align: left; font-weight: 600;
  color: #606266; font-size: 12px; border-bottom: 1px solid #e8e8e8;
  white-space: nowrap;
}
.pw-table td {
  padding: 10px 14px; border-bottom: 1px solid #f0f0f0;
  color: #303133; white-space: nowrap;
}
.pw-table tbody tr:hover { background: #fafafa; }
.pw-table tbody tr:last-child td { border-bottom: none; }

.pw-claim-btn {
  background: #722ed1; color: #fff; border: none;
  border-radius: 4px; padding: 4px 12px; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: background .12s;
}
.pw-claim-btn:hover { background: #531dab; }
.pw-claim-btn:disabled { opacity: .6; cursor: not-allowed; }
.pw-claim-btn.loading { background: #b37feb; }

.pw-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 12px 20px; border-top: 1px solid #f0f0f0;
  background: #fafafa; flex-shrink: 0;
}
.pw-refresh-btn, .pw-close-btn {
  padding: 6px 18px; border-radius: 5px; font-size: 13px;
  cursor: pointer; border: 1px solid #d9d9d9; background: #fff;
  color: #303133; transition: background .12s;
}
.pw-refresh-btn:hover, .pw-close-btn:hover { background: #f5f5f5; }
</style>
