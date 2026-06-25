<template>
  <div class="app-container" style="height:100%;display:flex;flex-direction:column;overflow:hidden">
    <!-- 工具栏 -->
    <div class="tuka-toolbar">
      <el-input v-model="q.userSearch" placeholder="UID/手机/邮箱/姓名" size="small"
        style="width:200px;flex-shrink:0" clearable @keyup.enter="search" />
      <el-date-picker v-model="dateRange" type="datetimerange" size="small"
        range-separator="→" start-placeholder="开始时间" end-placeholder="结束时间"
        value-format="YYYY-MM-DD HH:mm:ss"
        style="flex:1;min-width:260px;max-width:420px"
        @change="onDateChange" />
      <el-button size="small" :icon="Refresh" circle @click="search" style="flex-shrink:0" />
      <el-button size="small" @click="reset" style="flex-shrink:0">重置</el-button>
      <span style="margin-left:auto;font-size:13px;color:#666;flex-shrink:0">共 {{ total }} 个用户</span>
    </div>

    <!-- 表格 -->
    <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0">
      <el-table v-loading="loading" :data="list" border size="small"
        style="width:100%" height="100%">
        <el-table-column label="用户ID"   prop="userId"    width="80"  align="center" fixed />
        <el-table-column label="手机号"   prop="phone"     width="140" />
        <el-table-column label="真实姓名" prop="realName"  width="120" />
        <el-table-column label="余额" width="120" align="right">
          <template #default="{ row }">
            <span style="color:#52c41a;font-weight:700">₦{{ fmt(row.balance) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="总销售额" width="130" align="right">
          <template #default="{ row }">
            <span style="color:#52c41a">₦{{ fmt(row.totalSales) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="交易次数" prop="tradeCount" width="80" align="center" />
        <el-table-column label="等级" width="70" align="center">
          <template #default="{ row }">Lv {{ row.level }}</template>
        </el-table-column>
        <el-table-column label="国家" prop="country" width="90" />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.status === 1 ? '正常' : '封禁' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" prop="createTime" width="110" align="center">
          <template #default="{ row }">{{ row.createTime?.slice(0,10) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="center" fixed="right">
          <template #default="{ row }">
            <div style="display:flex;gap:4px;justify-content:center;flex-wrap:nowrap">
              <el-button size="small" @click="viewRow(row)">查看</el-button>
              <el-button size="small" type="primary" plain @click="startChat(row.userId)">发起聊天</el-button>
              <el-button size="small"
                :type="row.status === 1 ? 'danger' : 'success'"
                @click="toggleStatus(row)">
                {{ row.status === 1 ? '封禁' : '解封' }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页 -->
    <div class="page-footer">
      <el-pagination
        v-model:current-page="q.pageNum"
        v-model:page-size="q.pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @change="getList"
      />
    </div>

    <!-- 用户详情 dialog — tabs: 基本信息 / 核销订单 / 提现记录 -->
    <el-dialog v-model="viewOpen" title="用户详情" width="820px" append-to-body
      @open="onDialogOpen" @close="activeTab='info'">
      <el-tabs v-model="activeTab" @tab-change="onTabChange">

        <!-- ── Tab 1: 基本信息 ── -->
        <el-tab-pane label="基本信息" name="info">
          <div v-if="cur.avatar" style="text-align:center;margin-bottom:16px">
            <el-avatar :src="cur.avatar" :size="64" />
          </div>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="用户ID">{{ cur.userId }}</el-descriptions-item>
            <el-descriptions-item label="手机号">{{ cur.phone }}</el-descriptions-item>
            <el-descriptions-item label="真实姓名">{{ cur.realName }}</el-descriptions-item>
            <el-descriptions-item label="邮箱">{{ cur.email || '—' }}</el-descriptions-item>
            <el-descriptions-item label="余额">
              <span style="color:#52c41a;font-weight:700">₦{{ fmt(cur.balance) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="总销售额">
              <span style="color:#52c41a">₦{{ fmt(cur.totalSales) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="总提现">₦{{ fmt(cur.totalWithdrawn) }}</el-descriptions-item>
            <el-descriptions-item label="交易次数">{{ cur.tradeCount }}</el-descriptions-item>
            <el-descriptions-item label="等级">Lv {{ cur.level }}</el-descriptions-item>
            <el-descriptions-item label="国家">{{ cur.country || '—' }}</el-descriptions-item>
            <el-descriptions-item label="邀请码">{{ cur.inviteCode || '—' }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="cur.status === 1 ? 'success' : 'danger'" size="small">
                {{ cur.status === 1 ? '正常' : '封禁' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="注册时间" :span="2">{{ cur.createTime?.slice(0,10) }}</el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>

        <!-- ── Tab 2: 核销订单 ── -->
        <el-tab-pane label="核销订单" name="orders">
          <div v-loading="ordersLoading">
            <div v-if="!ordersLoading && userOrders.length === 0"
              style="text-align:center;padding:32px;color:#bbb">暂无核销订单</div>
            <el-table v-else :data="userOrders" border size="small" max-height="420">
              <el-table-column label="订单号" width="160">
                <template #default="{ row }">
                  <span style="font-family:monospace;font-size:11px">{{ row.orderNo }}</span>
                </template>
              </el-table-column>
              <el-table-column label="卡种" prop="categoryName" width="100" />
              <el-table-column label="面值" width="80" align="center">
                <template #default="{ row }">
                  <span style="color:#52c41a;font-weight:600">{{ row.cardAmount }}</span>
                </template>
              </el-table-column>
              <el-table-column label="结算金额" width="110" align="right">
                <template #default="{ row }">
                  <span style="color:#ff4d4f;font-weight:700">₦{{ fmt(row.ngnAmount) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="90" align="center">
                <template #default="{ row }">
                  <el-tag :type="orderStatusType[row.status]" size="small">
                    {{ orderStatusLabel[row.status] || row.status }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="时间" width="130" align="center">
                <template #default="{ row }">
                  <span style="font-size:11px">{{ row.createTime?.slice(0,16) }}</span>
                </template>
              </el-table-column>
            </el-table>
            <!-- Load more -->
            <div v-if="ordersHasMore" style="text-align:center;margin-top:10px">
              <el-button size="small" :loading="ordersLoading" @click="loadMoreOrders">加载更多</el-button>
            </div>
          </div>
        </el-tab-pane>

        <!-- ── Tab 3: 提现记录 ── -->
        <el-tab-pane label="提现记录" name="withdrawals">
          <div v-loading="wdLoading">
            <div v-if="!wdLoading && userWithdrawals.length === 0"
              style="text-align:center;padding:32px;color:#bbb">暂无提现记录</div>
            <el-table v-else :data="userWithdrawals" border size="small" max-height="420">
              <el-table-column label="提现编号" width="160">
                <template #default="{ row }">
                  <span style="font-family:monospace;font-size:11px">{{ row.withdrawNo }}</span>
                </template>
              </el-table-column>
              <el-table-column label="银行" prop="bankName" width="110" show-overflow-tooltip />
              <el-table-column label="账号" width="130">
                <template #default="{ row }">
                  <span style="font-family:monospace;font-size:11px">{{ row.accountNo }}</span>
                </template>
              </el-table-column>
              <el-table-column label="金额" width="110" align="right">
                <template #default="{ row }">
                  <span style="color:#ff4d4f;font-weight:700">₦{{ fmt(row.amount) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="90" align="center">
                <template #default="{ row }">
                  <el-tag :type="wdStatusType[row.status]" size="small">
                    {{ wdStatusLabel[row.status] || row.status }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="时间" width="130" align="center">
                <template #default="{ row }">
                  <span style="font-size:11px">{{ row.createTime?.slice(0,16) }}</span>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="wdHasMore" style="text-align:center;margin-top:10px">
              <el-button size="small" :loading="wdLoading" @click="loadMoreWithdrawals">加载更多</el-button>
            </div>
          </div>
        </el-tab-pane>

      </el-tabs>

      <template #footer>
        <el-button @click="viewOpen = false">关 闭</el-button>
        <el-button type="primary" plain @click="startChat(cur.userId)">发起聊天</el-button>
        <el-button :type="cur.status === 1 ? 'danger' : 'success'"
          @click="toggleStatus(cur); viewOpen = false">
          {{ cur.status === 1 ? '封禁用户' : '解封用户' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import request from '@/utils/request'
const router = useRouter()

// ── Status maps ───────────────────────────────────────────────────────────────
const orderStatusType  = { pending:'warning', processing:'primary', paid:'success', rejected:'danger' }
const orderStatusLabel = { pending:'待处理', processing:'处理中', paid:'已完成', rejected:'已拒绝' }
const wdStatusType     = { pending:'warning', completed:'success', rejected:'danger' }
const wdStatusLabel    = { pending:'待处理', completed:'已完成', rejected:'已拒绝' }

function fmt(n) { return Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 }) }

// ── Users list ────────────────────────────────────────────────────────────────
const list      = ref([])
const total     = ref(0)
const loading   = ref(false)
const dateRange = ref([])
const q = ref({ pageNum: 1, pageSize: 20, userSearch: '', startTime: '', endTime: '' })

async function getList() {
  loading.value = true
  try {
    const res = await request({ url: '/tuka/user/list', params: q.value })
    list.value  = res.rows || []
    total.value = res.total || 0
  } finally { loading.value = false }
}

function search() { q.value.pageNum = 1; getList() }
function reset() {
  q.value = { pageNum: 1, pageSize: 10, userSearch: '', startTime: '', endTime: '' }
  dateRange.value = []
  getList()
}
function onDateChange(val) {
  q.value.startTime = val?.[0] || ''
  q.value.endTime   = val?.[1] || ''
  search()
}

// ── User detail dialog ────────────────────────────────────────────────────────
const viewOpen  = ref(false)
const cur       = ref({})
const activeTab = ref('info')

// Orders tab state
const userOrders   = ref([])
const ordersLoading = ref(false)
const ordersPage    = ref(1)
const ordersHasMore = ref(false)

// Withdrawals tab state
const userWithdrawals = ref([])
const wdLoading       = ref(false)
const wdPage          = ref(1)
const wdHasMore       = ref(false)

function viewRow(row) {
  cur.value      = { ...row }
  activeTab.value = 'info'
  userOrders.value = []
  userWithdrawals.value = []
  ordersPage.value = 1
  wdPage.value = 1
  viewOpen.value = true
}

// Called when dialog opens — nothing to load yet (lazy load on tab click)
function onDialogOpen() {}

async function onTabChange(tab) {
  if (tab === 'orders' && userOrders.value.length === 0) {
    await loadOrders(1)
  }
  if (tab === 'withdrawals' && userWithdrawals.value.length === 0) {
    await loadWithdrawals(1)
  }
}

async function loadOrders(page) {
  if (!cur.value.userId) return
  ordersLoading.value = true
  try {
    const res = await request({
      url: '/tuka/order/list',
      params: { userId: cur.value.userId, pageNum: page, pageSize: 20 }
    })
    const rows = res.rows || []
    if (page === 1) userOrders.value = rows
    else userOrders.value = [...userOrders.value, ...rows]
    ordersPage.value = page
    ordersHasMore.value = userOrders.value.length < (res.total || 0)
  } catch(e) { ElMessage.error(e.message) }
  finally { ordersLoading.value = false }
}

async function loadMoreOrders() {
  await loadOrders(ordersPage.value + 1)
}

async function loadWithdrawals(page) {
  if (!cur.value.userId) return
  wdLoading.value = true
  try {
    const res = await request({
      url: '/tuka/withdrawal/list',
      params: { userId: cur.value.userId, pageNum: page, pageSize: 20 }
    })
    const rows = res.rows || []
    if (page === 1) userWithdrawals.value = rows
    else userWithdrawals.value = [...userWithdrawals.value, ...rows]
    wdPage.value = page
    wdHasMore.value = userWithdrawals.value.length < (res.total || 0)
  } catch(e) { ElMessage.error(e.message) }
  finally { wdLoading.value = false }
}

async function loadMoreWithdrawals() {
  await loadWithdrawals(wdPage.value + 1)
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function startChat(userId) {
  try {
    await request({ url: '/tuka/chat/admin/initiate', method: 'post', data: { userId } })
    router.push('/chat')
  } catch (e) {
    ElMessage.error(e.message || '发起聊天失败')
  }
}

function toggleStatus(row) {
  const newStatus = row.status === 1 ? 0 : 1
  const action = newStatus === 0 ? '封禁' : '解封'
  ElMessageBox.confirm(`确定要${action}用户 ${row.phone} 吗？`, '确认', { type: 'warning' })
    .then(async () => {
      await request({ url: '/tuka/user/status', method: 'put', data: { userId: row.userId || row.id, status: newStatus } })
      ElMessage.success('操作成功')
      row.status = newStatus
      if (cur.value.userId === row.userId) cur.value.status = newStatus
    })
    .catch(e => { if (e !== 'cancel') ElMessage.error(e.message) })
}

onMounted(getList)
</script>
