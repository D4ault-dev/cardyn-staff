<template>
  <div class="app-container" style="height:100%;display:flex;flex-direction:column;overflow:hidden">
    <!-- 工具栏 -->
    <div class="tuka-toolbar">
      <el-button :type="q.status===''?'primary':''" size="small" @click="q.status='';search()">全部</el-button>
      <el-button :type="q.status==='pending'?'warning':''" size="small" @click="q.status='pending';search()">
        待处理
        <el-badge v-if="pendingCount>0" :value="pendingCount" style="margin-left:4px" />
      </el-button>
      <el-button :type="q.status==='completed'?'success':''" size="small" @click="q.status='completed';search()">已完成</el-button>
      <el-button :type="q.status==='rejected'?'danger':''" size="small" @click="q.status='rejected';search()">已拒绝</el-button>
      <el-input v-model="q.username" placeholder="UID/手机/姓名" size="small"
        style="width:160px;flex-shrink:0" clearable @keyup.enter="search" />
      <el-date-picker v-model="dateRange" type="datetimerange" size="small"
        range-separator="→" start-placeholder="开始时间" end-placeholder="结束时间"
        value-format="YYYY-MM-DD HH:mm:ss"
        style="flex:1;min-width:260px;max-width:420px;flex-shrink:1"
        @change="onDateChange" />
      <el-button size="small" :icon="Refresh" circle @click="search" style="flex-shrink:0" />
    </div>

    <!-- 表格 -->
    <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0">
    <el-table v-loading="loading" :data="list" border
      style="width:100%" height="100%">
      <el-table-column label="ID"      prop="id"         width="55"  align="center" fixed />
      <el-table-column label="用户ID"  prop="userId"     width="70"  align="center" />
      <el-table-column label="用户名"  prop="username"   min-width="90" show-overflow-tooltip />
      <el-table-column label="提现编号" width="160" fixed>
        <template #default="{ row }">
          <span style="font-family:monospace;font-size:12px">{{ row.withdrawNo }}</span>
        </template>
      </el-table-column>
      <el-table-column label="银行"    prop="bankName"   width="120" show-overflow-tooltip />
      <el-table-column label="账户名"  prop="accountName" width="120" show-overflow-tooltip />
      <el-table-column label="账号"    width="140">
        <template #default="{ row }">
          <span style="font-family:monospace;font-size:12px">{{ row.accountNo }}</span>
        </template>
      </el-table-column>
      <el-table-column label="金额"    width="110" align="right">
        <template #default="{ row }">
          <span style="color:#ff4d4f;font-weight:700">₦{{ fmt(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="手续费"  width="90" align="right">
        <template #default="{ row }">₦{{ fmt(row.fee) }}</template>
      </el-table-column>
      <el-table-column label="状态"    width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="statusType[row.status]" size="small">{{ statusLabel[row.status]||row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="收据"    width="70" align="center">
        <template #default="{ row }">
          <el-image v-if="row.receiptImage"
            :src="authImg(row.receiptImage)"
            style="width:32px;height:32px;border-radius:3px;cursor:pointer;display:block"
            fit="cover"
            :preview-src-list="[authImg(row.receiptImage)]"
            preview-teleported />
          <span v-else style="color:#bbb">—</span>
        </template>
      </el-table-column>
      <el-table-column label="处理人" min-width="90" align="center">
        <template #default="{ row }">
          <span v-if="row.staffName"
            :style="{ fontSize:'12px', fontWeight:600, color: Number(row.staffId)===Number(userStore.userId) ? '#1677ff' : '#606266' }">
            {{ row.staffName }}
          </span>
          <span v-else style="color:#bbb;font-size:11px">—</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" prop="createTime" width="140" align="center">
        <template #default="{ row }">{{ row.createTime?.slice(0,16) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" align="center" fixed="right">
        <template #default="{ row }">
          <div style="display:flex;gap:3px;justify-content:center;flex-wrap:nowrap">
            <el-button size="small" @click="viewRow(row)">查看</el-button>
            <template v-if="canActWithdrawals && row.status==='pending'">
              <!-- Not yet claimed by anyone — show 接单 -->
              <template v-if="!row.staffId || Number(row.staffId) === 0">
                <el-button size="small" type="warning"
                  :loading="claiming === row.id"
                  @click="claimWithdrawal(row)">接单</el-button>
              </template>
              <!-- Claimed by THIS staff — show 付款 + 拒绝 -->
              <template v-else-if="Number(row.staffId) === Number(userStore.userId)">
                <el-button size="small" type="primary" @click="openPay(row)">付款</el-button>
                <el-button size="small" type="danger"  @click="openReject(row)">拒绝</el-button>
              </template>
              <!-- Claimed by ANOTHER staff — show who has it -->
              <template v-else>
                <span style="font-size:11px;color:#999;padding:0 4px">{{ row.staffName }} 处理中</span>
              </template>
            </template>
          </div>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <!-- 分页 -->
    <div class="page-footer">
      <el-pagination v-model:current-page="q.pageNum" v-model:page-size="q.pageSize"
        :total="total" :page-sizes="[20,50,100]"
        layout="total, sizes, prev, pager, next" @change="getList" />
    </div>

    <!-- 查看详情 -->
    <el-dialog v-model="viewOpen" title="提现详情" width="520px" append-to-body>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="提现编号" :span="2">
          <span style="font-family:monospace">{{ cur.withdrawNo }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="用户">{{ cur.username||cur.userId }}</el-descriptions-item>
        <el-descriptions-item label="银行">{{ cur.bankName }}</el-descriptions-item>
        <el-descriptions-item label="账户名">{{ cur.accountName }}</el-descriptions-item>
        <el-descriptions-item label="账号"><span style="font-family:monospace">{{ cur.accountNo }}</span></el-descriptions-item>
        <el-descriptions-item label="金额"><span style="color:#ff4d4f;font-weight:700">₦{{ fmt(cur.amount) }}</span></el-descriptions-item>
        <el-descriptions-item label="手续费">₦{{ fmt(cur.fee) }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="statusType[cur.status]" size="small">{{ statusLabel[cur.status] }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="备注">{{ cur.remark||'—' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ cur.createTime }}</el-descriptions-item>
      </el-descriptions>
      <div v-if="cur.receiptImage" style="margin-top:14px">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px">付款收据</div>
        <el-image :src="authImg(cur.receiptImage)" style="max-width:200px;border-radius:6px"
          fit="contain" :preview-src-list="[authImg(cur.receiptImage)]" preview-teleported />
      </div>
      <template #footer><el-button @click="viewOpen=false">关 闭</el-button></template>
    </el-dialog>

    <!-- 付款弹窗 -->
    <el-dialog v-model="payOpen" title="确认付款" width="460px" append-to-body>
      <div style="background:#fafafa;border:1px solid #e8e8e8;border-radius:6px;padding:12px 16px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0">
          <span>提现金额</span><span style="color:#ff4d4f;font-weight:700">₦{{ fmt(payForm.amount) }}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0">
          <span>手续费</span><span style="color:#ff4d4f">- ₦{{ fmt(payForm.fee) }}</span>
        </div>
        <div style="border-top:1px dashed #e8e8e8;margin:6px 0" />
        <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;padding:4px 0">
          <span>实际打款金额</span>
          <span style="color:#ff4d4f;font-size:18px">₦{{ fmt((payForm.amount||0)-(payForm.fee||0)) }}</span>
        </div>
      </div>
      <div style="background:#fff;border:1px solid #e8e8e8;border-radius:6px;padding:10px 14px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:#999;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">收款信息</div>
        <div v-for="item in bankDetails" :key="item.label"
          style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f5f5f5">
          <span style="font-size:12px;color:#999;min-width:70px">{{ item.label }}</span>
          <span style="flex:1;font-size:13px;font-weight:500">{{ item.value }}</span>
          <el-button size="small" @click="copy(item.value)">复制</el-button>
        </div>
      </div>
      <el-form label-width="70px">
        <el-form-item label="付款收据">
          <div style="display:flex;gap:12px;align-items:flex-start">
            <!-- Upload area — click or drag, same as orders page -->
            <el-upload action="#" :auto-upload="false" :show-file-list="false"
              accept="image/*" drag style="width:140px"
              :on-change="f => { receiptFile = f.raw; receiptPreview = URL.createObjectURL(f.raw) }">
              <div v-if="receiptPreview" style="position:relative;width:140px;height:100px">
                <img :src="receiptPreview" style="width:140px;height:100px;object-fit:cover;border-radius:4px" />
                <button
                  style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center"
                  @click.prevent="receiptFile=null;receiptPreview=''">✕</button>
              </div>
              <div v-else style="padding:16px;text-align:center">
                <div style="font-size:22px;color:#1677ff;margin-bottom:4px">📤</div>
                <div style="font-size:12px;color:#606266;font-weight:500">上传收据</div>
                <div style="font-size:11px;color:#bbb;margin-top:2px">支持拖拽</div>
              </div>
            </el-upload>
            <el-button size="small" @click="pasteReceipt">点击粘贴图片</el-button>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="payForm.remark" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payOpen=false">取 消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitPay">
          确认已付款 ₦{{ fmt((payForm.amount||0)-(payForm.fee||0)) }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 拒绝弹窗 -->
    <el-dialog v-model="rejectOpen" title="拒绝提现" width="400px" append-to-body>
      <el-descriptions :column="1" border size="small" style="margin-bottom:14px">
        <el-descriptions-item label="用户">{{ rejectForm.username }}</el-descriptions-item>
        <el-descriptions-item label="金额"><span style="color:#ff4d4f;font-weight:700">₦{{ fmt(rejectForm.amount) }}</span></el-descriptions-item>
      </el-descriptions>
      <el-input v-model="rejectForm.remark" type="textarea" :rows="3" placeholder="拒绝原因（必填）" />
      <template #footer>
        <el-button @click="rejectOpen=false">取 消</el-button>
        <el-button type="danger" :loading="submitting" :disabled="!rejectForm.remark?.trim()" @click="submitReject">
          确认拒绝
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import request, { clearCache } from '@/utils/request'
import { usePermissions } from '@/composables/usePermissions'
import { useAuthImg } from '@/composables/useAuthImg'
import { useUserStore } from '@/stores/user'
import LazyImg from '@/components/LazyImg.vue'

const { canActWithdrawals } = usePermissions()
const { authImg } = useAuthImg()
const userStore = useUserStore()

const list    = ref([])
const total   = ref(0)
const loading = ref(false)
const dateRange = ref([])
const pendingCount = ref(0)

const q = ref({ pageNum:1, pageSize:20, status:'', username:'', startTime:'', endTime:'' })

const statusType  = { pending:'warning', completed:'success', approved:'success', rejected:'danger', processing:'primary' }
const statusLabel = { pending:'待处理', completed:'已完成', approved:'已批准', rejected:'已拒绝', processing:'处理中' }

const viewOpen   = ref(false)
const payOpen    = ref(false)
const rejectOpen = ref(false)
const cur        = ref({})
const payForm    = ref({})
const rejectForm = ref({})
const receiptFile    = ref(null)
const receiptPreview = ref('')
const submitting  = ref(false)
const claiming    = ref(null)   // id of withdrawal being claimed

// A staff can pay/reject only if they claimed it (staffId matches) or are super admin
function canEdit(row) {
  if (!canActWithdrawals.value) return false
  const myId = Number(userStore.userId)
  const staffId = Number(row.staffId)
  // unclaimed — anyone can claim
  if (!staffId) return true
  return myId === staffId
}

const bankDetails = computed(() => payForm.value.id ? [
  { label:'银行名称', value: payForm.value.bankName },
  { label:'账户名',   value: payForm.value.accountName },
  { label:'账号',     value: payForm.value.accountNo },
] : [])

function fmt(n) { return Number(n||0).toLocaleString('en-NG',{minimumFractionDigits:2}) }

async function getList() {
  loading.value = true
  try {
    const res = await request({ url:'/tuka/withdrawal/list', params:q.value })
    list.value  = res.rows || []
    total.value = res.total || 0
  } finally { loading.value = false }
}

// Silent background refresh — no spinner flicker
async function silentRefresh() {
  try {
    clearCache('/tuka/withdrawal/list')
    const res = await request({ url:'/tuka/withdrawal/list', params:q.value })
    list.value  = res.rows || []
    total.value = res.total || 0
  } catch {}
}

function search() { q.value.pageNum = 1; getList() }
function onDateChange(val) { q.value.startTime = val?.[0]||''; q.value.endTime = val?.[1]||''; search() }
function viewRow(row) { cur.value = { ...row }; viewOpen.value = true }
function openPay(row) { payForm.value = { ...row, remark:'' }; receiptFile.value = null; receiptPreview.value = ''; payOpen.value = true }
function openReject(row) { rejectForm.value = { id:row.id, username:row.username||row.userId, amount:row.amount, remark:'' }; rejectOpen.value = true }

function onReceiptChange(file) { receiptFile.value = file.raw; receiptPreview.value = URL.createObjectURL(file.raw) }

async function pasteReceipt() {
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type)
          receiptFile.value = new File([blob], 'paste.png', { type })
          receiptPreview.value = URL.createObjectURL(blob)
          ElMessage.success('图片已粘贴')
          return
        }
      }
    }
    ElMessage.warning('剪贴板中没有图片')
  } catch { ElMessage.warning('无法读取剪贴板，请使用上传按钮') }
}

// Claim a pending withdrawal — atomic, same pattern as orders
async function claimWithdrawal(row) {
  try {
    await ElMessageBox.confirm(
      `确认接单处理用户 ${row.username || row.userId} 的 ₦${fmt(row.amount)} 提现申请吗？`,
      '确认接单',
      {
        confirmButtonText: '确认接单',
        cancelButtonText: '取消',
        type: 'info',
      }
    )
  } catch {
    return // User cancelled
  }

  claiming.value = row.id
  try {
    await request({ url:'/tuka/withdrawal/claim', method:'put', data:{ id: row.id } })
    silentRefresh()
    ElMessage.success('接单成功')
  } catch(e) {
    const msg = e.message || ''
    if (msg.includes('409') || msg.toLowerCase().includes('claimed')) {
      // Reload to check if WE already own it
      await silentRefresh()
      const mine = list.value.find(r => r.id === row.id && Number(r.staffId) === Number(userStore.userId))
      if (mine) {
        // We already own it — no error needed
      } else {
        ElMessage.warning('该提现已被其他客服接单')
      }
    } else {
      ElMessage.error(msg)
    }
  } finally {
    claiming.value = null
  }
}

async function submitPay() {
  if (!receiptFile.value) {
    ElMessage.warning('请上传付款收据')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确认已向用户 ${payForm.value.username || payForm.value.userId} 付款 ₦${fmt((payForm.value.amount||0)-(payForm.value.fee||0))} 吗？此操作不可撤销。`,
      '确认付款',
      {
        confirmButtonText: '确认已付款',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    )
  } catch {
    return // User cancelled
  }

  submitting.value = true
  try {
    let receiptImage = ''
    if (receiptFile.value) {
      const fd = new FormData()
      fd.append('file', receiptFile.value)
      const up = await request({ url: '/common/upload', method: 'post', data: fd })
      receiptImage = up?.url || ''
      if (!receiptImage) {
        ElMessage.error('收据上传失败，请重试')
        submitting.value = false
        return
      }
    }
    await request({ url: '/tuka/withdrawal/audit', method: 'put', data: { id: payForm.value.id, status: 'completed', remark: payForm.value.remark, receiptImage } })
    clearCache('/tuka/withdrawal/list')
    ElMessage.success('付款成功')
    payOpen.value = false
    silentRefresh(); fetchPendingCount()
  } catch(e) { ElMessage.error(e.message) }
  finally { submitting.value = false }
}

async function submitReject() {
  if (!rejectForm.value.remark?.trim()) {
    ElMessage.warning('请输入拒绝原因')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确认拒绝用户 ${rejectForm.value.username} 的 ₦${fmt(rejectForm.value.amount)} 提现申请吗？`,
      '确认拒绝',
      {
        confirmButtonText: '确认拒绝',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    )
  } catch {
    return // User cancelled
  }

  submitting.value = true
  try {
    await request({ url:'/tuka/withdrawal/audit', method:'put', data:{ id:rejectForm.value.id, status:'rejected', remark:rejectForm.value.remark } })
    clearCache('/tuka/withdrawal/list')
    ElMessage.success('已拒绝')
    rejectOpen.value = false
    silentRefresh(); fetchPendingCount()
  } catch(e) { ElMessage.error(e.message) }
  finally { submitting.value = false }
}

async function fetchPendingCount() {
  try {
    const res = await request({ url:'/tuka/withdrawal/list', params:{ status:'pending', pageSize:1 } })
    pendingCount.value = res.total || 0
  } catch {}
}

function copy(text) { navigator.clipboard.writeText(text).then(() => ElMessage.success('已复制')) }

let listTimer = null
let _cleanup  = null
onMounted(() => {
  getList(); fetchPendingCount()
  // Ctrl+V paste when pay dialog is open
  function handlePaste(e) {
    if (!payOpen.value) return
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) {
          receiptFile.value = file
          receiptPreview.value = URL.createObjectURL(file)
          ElMessage.success('图片已粘贴')
        }
        break
      }
    }
  }
  window.addEventListener('paste', handlePaste)
  listTimer = setInterval(() => { if (!document.hidden) silentRefresh() }, 10_000)
  _cleanup = () => {
    window.removeEventListener('paste', handlePaste)
    if (listTimer) clearInterval(listTimer)
  }
})
onUnmounted(() => { if (_cleanup) _cleanup() })
</script>

<style scoped>
/* Page-specific only — globals in src/styles/index.css */
</style>
