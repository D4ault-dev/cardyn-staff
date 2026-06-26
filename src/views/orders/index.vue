<template>
  <div class="app-container" style="height:100%;display:flex;flex-direction:column;overflow:hidden">
    <!-- 工具栏 -->
    <div class="tuka-toolbar">
      <el-button :type="q.country===''?'primary':''" size="small" @click="q.country=''">全部</el-button>
      <el-button v-for="c in countries" :key="c" size="small"
        :type="q.country===c?'success':''" @click="q.country=c;search()">{{ c }}</el-button>
      <el-select v-model="q.status" placeholder="全部" clearable size="small"
        style="width:90px;flex-shrink:0" @change="search">
        <el-option label="全部"   value="" />
        <el-option label="待处理" value="pending" />
        <el-option label="处理中" value="processing" />
        <el-option label="已完成" value="paid" />
        <el-option label="已拒绝" value="rejected" />
      </el-select>
      <el-input v-model="q.orderNo" placeholder="订单编号" size="small"
        style="width:120px;flex-shrink:0" clearable @keyup.enter="search" />
      <el-input v-model="q.userSearch" placeholder="UID/手机/邮箱/姓名" size="small"
        style="width:150px;flex-shrink:0" clearable @keyup.enter="search" />
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
      <el-table-column label="id"         prop="id"     width="55"  align="center" fixed />
      <el-table-column label="用户id"     prop="userId" width="70"  align="center" />
      <el-table-column label="用户名" min-width="100" show-overflow-tooltip>
        <template #default="{ row }">
          <span style="font-size:13px">{{ row.userNameDisplay || row.username || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="核销订单号" width="170" fixed>
        <template #default="{ row }">
          <span style="font-family:monospace;font-size:12px">{{ row.orderNo }}</span>
        </template>
      </el-table-column>
      <el-table-column label="输入类型" width="80" align="center">
        <template #default="{ row }">{{ row.inputType || '—' }}</template>
      </el-table-column>
      <el-table-column label="面值" width="80" align="center">
        <template #default="{ row }">
          <span style="color:#52c41a;font-weight:600">{{ currSym(row.cardCurrency) }}{{ row.cardAmount }}</span>
        </template>
      </el-table-column>
      <el-table-column label="数量" width="60" align="center">
        <template #default="{ row }">{{ row.quantity ?? 0 }}</template>
      </el-table-column>
      <el-table-column label="结算金额" width="110" align="right">
        <template #default="{ row }">
          <span style="color:#ff4d4f;font-weight:700">₦{{ fmt(row.ngnAmount) }}</span>
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
      <el-table-column label="受理时间" width="140" align="center">
        <template #default="{ row }">
          <span style="font-size:12px">{{ row.finishTime?.slice(0,16) || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="140" align="center">
        <template #default="{ row }">
          <span style="font-size:12px">{{ row.createTime?.slice(0,16) || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" align="left" fixed="right">
        <template #default="{ row }">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:nowrap;padding-left:4px">
            <el-button size="small" type="primary" @click="viewData(row)">查看数据</el-button>
            <el-button size="small" type="success" @click="viewCard(row)">查看</el-button>
            <!-- status badge — read-only, no action buttons -->
            <span v-if="row.status==='paid'"
              style="font-size:11px;color:#52c41a;border:1px solid #b7eb8f;border-radius:3px;padding:1px 6px;background:#f6ffed;white-space:nowrap;font-weight:600">
              核销完成
            </span>
            <span v-if="row.status==='rejected'"
              style="font-size:11px;color:#ff4d4f;border:1px solid #ffccc7;border-radius:3px;padding:1px 5px;background:#fff1f0;white-space:nowrap"
              :title="row.rejectReason||'bad card'">失败</span>
            <span v-if="row.status==='pending'||row.status==='processing'"
              style="font-size:11px;color:#fa8c16;border:1px solid #ffd591;border-radius:3px;padding:1px 6px;background:#fff7e6;white-space:nowrap">
              {{ row.status==='pending'?'待处理':'处理中' }}
            </span>
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

    <!-- 核销数据 弹窗 -->
    <el-dialog v-model="dataOpen" :title="curIsActive ? '核销' : '核销数据'" width="960px" append-to-body>
      <div class="info-row-bar">
        <span class="info-bar-label">基础信息：</span>
        <span class="info-bar-item"><span class="ibl">卡种</span><span class="ibv">{{ cur.categoryName }}</span></span>
        <span class="info-bar-item"><span class="ibl">面值</span><span class="ibv" style="color:#52c41a">{{ currSym(cur.cardCurrency) }}{{ cur.cardAmount }}</span></span>
        <span class="info-bar-item"><span class="ibl">输入方式</span><span class="ibv">{{ cur.inputType||'—' }}</span></span>
        <span class="info-bar-item"><span class="ibl">国家</span><span class="ibv">{{ countryLabel(cur.cardCurrency) }}</span></span>
        <span class="info-bar-item"><span class="ibl">数量</span><span class="ibv">{{ cur.quantity??0 }}</span></span>
      </div>

      <div class="form-row"><label class="form-label">核销编号：</label><el-input readonly :model-value="cur.orderNo" /></div>

      <div class="form-row">
        <label class="form-label">用户信息：</label>
        <span class="form-inline-label">ID：</span>
        <el-input readonly :model-value="cur.userId" style="width:100px" />
        <span class="form-inline-label" style="margin-left:12px">备注：</span>
        <el-input readonly :model-value="cur.verifyRemark||''" style="width:160px" />
      </div>

      <div class="form-row">
        <label class="form-label">汇率数据：</label>
        <span class="form-inline-label">国家汇率</span><el-input readonly :model-value="cur.countryRate??''" style="width:90px" />
        <span class="form-inline-label" style="margin-left:10px">采购汇率</span><el-input readonly :model-value="cur.purchaseRate??''" style="width:90px" />
        <span class="form-inline-label" style="margin-left:10px">售出汇率</span><el-input readonly :model-value="cur.sellRate??''" style="width:90px" />
      </div>

      <!-- 结算金额 — active: editable; completed: readonly + show actual paid amount -->
      <div class="form-row">
        <label class="form-label">结算金额：</label>
        <span class="form-inline-label">结算金额</span>
        <el-input readonly :model-value="'₦'+fmt(cur.ngnAmount??0)" style="width:140px;color:#888;background:#fafafa" />
        <span class="form-inline-label" style="margin-left:10px">结算数量</span>
        <el-input readonly :model-value="cur.quantity??1" style="width:50px;color:#888;background:#fafafa" />
        <span class="form-inline-label" style="margin-left:10px">变更结算金额</span>
        <el-input
          v-model="newAmountEdit"
          type="number"
          :placeholder="String(cur.ngnAmount??0)"
          :readonly="!curIsActive || !curCanEdit"
          :style="{ width:'130px', background: (!curIsActive || !curCanEdit) ? '#fafafa' : undefined, color: (!curIsActive || !curCanEdit) ? '#888' : undefined }"
        />
        <el-button v-if="curIsActive && curCanEdit"
          type="warning" style="margin-left:8px;white-space:nowrap"
          :loading="savingAmount" @click="saveNewAmount">
          {{ savingAmount ? '保存中…' : '变更结算金额' }}
        </el-button>
      </div>
      <!-- adjusted amount note — shown for ALL statuses if amount was changed -->
      <div v-if="cur.newAmount && cur.newAmount !== cur.ngnAmount"
        class="form-row" style="margin-top:-8px">
        <label class="form-label" />
        <span style="font-size:12px;color:#f59e0b">
          已调整：用户实收 ₦{{ fmt(cur.newAmount) }}（原 ₦{{ fmt(cur.ngnAmount) }}，差额 ₦{{ fmt((cur.ngnAmount||0)-(cur.newAmount||0)) }}）
        </span>
      </div>

      <!-- 卡片图片 — user uploaded card images, shown in 核销数据 so staff can verify -->
      <div v-if="cur.cardImage" class="form-row" style="align-items:flex-start">
        <label class="form-label">卡片图片：</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
          <el-image v-for="(img,i) in cur.cardImage.split(',').filter(u=>u.trim())" :key="i"
            :src="authImg(img.trim())"
            style="width:100px;height:100px;border-radius:4px;cursor:pointer;border:1px solid #e8e8e8;flex-shrink:0"
            fit="cover" preview-teleported
            :preview-src-list="cur.cardImage.split(',').map(u=>authImg(u.trim()))" />
        </div>
      </div>

      <!-- 备注信息 — editable textarea when active & claimer, readonly otherwise -->
      <div class="form-row" style="align-items:flex-start">
        <label class="form-label">备注信息：</label>
        <el-input v-if="curIsActive && curCanEdit"
          v-model="auditRemark" type="textarea" :rows="3" style="flex:1"
          placeholder="备注（如：bad card / used card）" />
        <el-input v-else
          type="textarea" readonly :model-value="cur.verifyRemark||''" :rows="3" style="flex:1" />
      </div>

      <!-- 核销凭证 — upload+paste when active & claimer; show image when completed -->
      <div class="form-row" style="align-items:flex-start">
        <label class="form-label">核销凭证：</label>
        <template v-if="curIsActive && curCanEdit">
          <div style="display:flex;gap:16px;align-items:flex-start">
            <!-- Upload area — matches Staff Desktop exactly -->
            <el-upload action="#" :auto-upload="false" :show-file-list="false" accept="image/*" drag
              style="width:140px"
              :on-change="f => { auditImgFile = f.raw; auditImgPreview = URL.createObjectURL(f.raw) }">
              <div v-if="auditImgPreview" style="position:relative;width:140px;height:100px">
                <img :src="auditImgPreview" style="width:140px;height:100px;object-fit:cover;border-radius:4px" />
                <button
                  style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.5);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center"
                  @click.prevent="auditImgFile=null;auditImgPreview=''">✕</button>
              </div>
              <div v-else style="padding:16px;text-align:center">
                <el-icon style="font-size:28px;color:#1677ff;margin-bottom:4px"><Upload /></el-icon>
                <div style="font-size:12px;color:#606266;font-weight:500">上传凭证</div>
                <div style="font-size:11px;color:#bbb;margin-top:2px">支持拖拽</div>
              </div>
            </el-upload>
            <el-button size="small" @click="pasteImage">点击粘贴图片</el-button>
          </div>
        </template>
        <template v-else>
          <el-image v-if="cur.verifyImage" :src="authImg(cur.verifyImage)"
            style="width:80px;height:80px;border-radius:4px;cursor:pointer"
            fit="cover" :preview-src-list="[authImg(cur.verifyImage)]" />
          <span v-else style="color:#bbb;font-size:12px">暂无凭证</span>
        </template>
      </div>

      <!-- 核销完成 / 核销失败 — bottom row, space-between like Staff Desktop screenshot -->
      <div v-if="canActOrders && curIsActive && curCanEdit"
        style="display:flex;justify-content:space-between;margin-top:20px;padding-top:14px;border-top:1px solid #f0f0f0">
        <el-button type="primary" style="padding:9px 32px;font-size:14px;min-width:120px"
          :loading="submitting" @click="quickAudit(cur,'paid')">
          {{ submitting ? '提交中…' : '核销完成' }}
        </el-button>
        <el-button type="danger" style="padding:9px 32px;font-size:14px;min-width:120px"
          :loading="submitting" @click="quickAudit(cur,'rejected')">
          {{ submitting ? '提交中…' : '核销失败' }}
        </el-button>
      </div>

      <!-- Warning: active but this staff didn't claim it -->
      <div v-if="curIsActive && !curCanEdit"
        style="margin-top:12px;padding:10px 14px;background:#fff7e6;border:1px solid #ffd591;border-radius:6px;display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">⚠️</span>
        <span style="font-size:13px;color:#d46b08">
          此订单由 <strong>{{ cur.staffName || '其他客服' }}</strong> 处理中，您只能查看。
        </span>
      </div>

      <template #footer>
        <el-button @click="dataOpen=false;auditRemark='';auditImgFile=null;auditImgPreview=''">关 闭</el-button>
      </template>
    </el-dialog>

    <!-- 卡片数据 弹窗 -->
    <el-dialog v-model="cardOpen" title="卡片数据" width="960px" append-to-body>
      <div class="info-row-bar">
        <span class="info-bar-label">基础信息：</span>
        <span class="info-bar-item"><span class="ibl">卡种</span><span class="ibv">{{ cur.categoryName }}</span></span>
        <span class="info-bar-item"><span class="ibl">面值</span><span class="ibv" style="color:#52c41a">{{ currSym(cur.cardCurrency) }}{{ cur.cardAmount }}</span></span>
        <span class="info-bar-item"><span class="ibl">输入方式</span><span class="ibv">{{ cur.inputType||'—' }}</span></span>
        <span class="info-bar-item"><span class="ibl">国家</span><span class="ibv">{{ countryLabel(cur.cardCurrency) }}</span></span>
        <span class="info-bar-item"><span class="ibl">数量</span><span class="ibv">{{ cur.quantity??0 }}</span></span>
      </div>

      <div class="form-row"><label class="form-label">核销编号：</label><el-input readonly :model-value="cur.orderNo" /></div>

      <div class="form-row">
        <label class="form-label">用户信息：</label>
        <span class="form-inline-label">用户id</span><el-input readonly :model-value="cur.userId" style="width:100px" />
        <span class="form-inline-label" style="margin-left:12px">用户备注</span><el-input readonly :model-value="cur.verifyRemark||''" style="width:160px" />
      </div>

      <div class="form-row">
        <label class="form-label">汇率数据：</label>
        <span class="form-inline-label">国家汇率</span><el-input readonly :model-value="cur.countryRate??''" style="width:90px" />
        <span class="form-inline-label" style="margin-left:12px">采购汇率</span><el-input readonly :model-value="cur.purchaseRate??''" style="width:90px" />
      </div>

      <!-- 核销代码 — joined as single line like Staff Desktop -->
      <div class="form-row">
        <label class="form-label">核销代码：</label>
        <el-input readonly
          :model-value="cur.cardCode ? cur.cardCode.split('\n').filter(c=>c.trim()).join(' / ') : ''"
          placeholder="—" style="font-family:monospace;letter-spacing:1px" />
      </div>

      <div class="form-row"><label class="form-label">到期时间：</label><el-input readonly :model-value="cur.cardExpiry||''" placeholder="—" /></div>
      <div class="form-row"><label class="form-label">Cvv：</label><el-input readonly :model-value="cur.cardCvv||''" placeholder="—" /></div>

      <!-- 图片 — each image has a 复制图片 button underneath -->
      <div class="form-row" style="align-items:flex-start">
        <label class="form-label">图片：</label>
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start">
          <template v-if="cur.cardImage">
            <div v-for="(img,i) in cur.cardImage.split(',').filter(u=>u.trim())" :key="i"
              style="display:flex;flex-direction:column;align-items:center;gap:4px">
              <el-image :src="authImg(img.trim())"
                style="width:100px;height:100px;border-radius:4px;cursor:pointer"
                fit="cover"
                :preview-src-list="cur.cardImage.split(',').map(u=>authImg(u.trim()))" />
              <el-button size="small" type="primary" plain style="font-size:11px;padding:1px 8px"
                @click="copyImg(authImg(img.trim()))">复制图片</el-button>
            </div>
          </template>
          <span v-else style="color:#bbb;font-size:12px">暂无图片</span>
        </div>
      </div>

      <!-- 收据 — verifyImage, shown in 卡片数据 like Staff Desktop -->
      <div class="form-row" style="align-items:flex-start">
        <label class="form-label">收据：</label>
        <el-image v-if="cur.verifyImage" :src="authImg(cur.verifyImage)"
          style="width:100px;height:100px;border-radius:4px;cursor:pointer"
          fit="cover" :preview-src-list="[authImg(cur.verifyImage)]" />
        <span v-else style="color:#bbb;font-size:12px">暂无收据</span>
      </div>

      <template #footer><el-button @click="cardOpen=false">关 闭</el-button></template>
    </el-dialog>

    <!-- 核销 弹窗 — matches screenshot 2 layout exactly -->
    <el-dialog v-model="auditOpen" title="核销" width="780px" append-to-body>
      <div class="info-row-bar">
        <span class="info-bar-label">基础信息：</span>
        <span class="info-bar-item"><span class="ibl">卡种</span><span class="ibv">{{ auditForm.categoryName }}</span></span>
        <span class="info-bar-item"><span class="ibl">面值</span><span class="ibv" style="color:#52c41a">{{ currSym(auditForm.cardCurrency) }}{{ auditForm.cardAmount }}</span></span>
        <span class="info-bar-item"><span class="ibl">输入方式</span><span class="ibv">{{ auditForm.inputType||'—' }}</span></span>
        <span class="info-bar-item"><span class="ibl">国家</span><span class="ibv">{{ countryLabel(auditForm.cardCurrency) }}</span></span>
        <span class="info-bar-item"><span class="ibl">数量</span><span class="ibv">{{ auditForm.quantity??0 }}</span></span>
      </div>
      <div class="form-row"><label class="form-label">核销编号：</label><el-input readonly :model-value="auditForm.orderNo" /></div>
      <div class="form-row">
        <label class="form-label">用户信息：</label>
        <span class="form-inline-label">ID：</span><el-input readonly :model-value="auditForm.userId" style="width:100px" />
        <span class="form-inline-label" style="margin-left:12px">备注：</span><el-input v-model="auditForm.verifyRemark" style="width:200px" />
      </div>
      <div class="form-row">
        <label class="form-label">汇率数据：</label>
        <span class="form-inline-label">国家汇率</span><el-input readonly :model-value="auditForm.countryRate??''" style="width:90px" />
        <span class="form-inline-label" style="margin-left:10px">采购汇率</span><el-input readonly :model-value="auditForm.purchaseRate??''" style="width:90px" />
        <span class="form-inline-label" style="margin-left:10px">售出汇率</span><el-input readonly :model-value="auditForm.sellRate??''" style="width:90px" />
      </div>
      <div class="form-row">
        <label class="form-label">结算金额：</label>
        <span class="form-inline-label">结算金额</span>
        <el-input readonly :model-value="'₦'+fmt(auditForm.ngnAmount??0)" style="width:140px" />
        <span class="form-inline-label" style="margin-left:12px">结算数量</span>
        <el-input readonly :model-value="auditForm.quantity??1" style="width:60px" />
        <span class="form-inline-label" style="margin-left:12px">变更结算金额</span>
        <el-input v-model="auditForm.newAmountInput" type="number" placeholder="" style="width:120px" />
        <el-button type="danger" style="margin-left:8px" @click="applyAuditAmount">变更结算金额</el-button>
      </div>
      <div class="form-row" style="align-items:flex-start">
        <label class="form-label">备注信息：</label>
        <el-input v-model="auditForm.verifyRemark" type="textarea" :rows="3" style="flex:1"
          placeholder="备注（如：bad card / used card）" />
      </div>
      <div class="form-row" style="align-items:flex-start">
        <label class="form-label">核销凭证：</label>
        <div style="display:flex;gap:12px;align-items:flex-start">
          <el-upload action="#" :auto-upload="false" :on-change="onImgChange" :show-file-list="false"
            accept="image/*" drag style="width:140px">
            <div style="padding:16px;text-align:center">
              <div style="font-size:24px;color:#1677ff;margin-bottom:4px">📤</div>
              <div style="font-size:12px;color:#666">上传凭证<br>支持拖拽</div>
            </div>
          </el-upload>
          <div style="display:flex;flex-direction:column;gap:8px">
            <el-button size="small" @click="pasteImage">点击粘贴图片</el-button>
            <img v-if="auditImgPreview" :src="auditImgPreview"
              style="width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid #eee;cursor:pointer"
              @click="auditImgPreview=''" title="点击删除" />
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="auditOpen=false">取 消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitAuditWithStatus('paid')">核销完成</el-button>
        <el-button type="danger"  :loading="submitting" @click="submitAuditWithStatus('rejected')">核销失败</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Upload } from '@element-plus/icons-vue'
import request, { clearCache } from '@/utils/request'
import { usePermissions } from '@/composables/usePermissions'
import { useAuthImg } from '@/composables/useAuthImg'
import { useUserStore } from '@/stores/user'

const { canActOrders } = usePermissions()
const { authImg } = useAuthImg()
const userStore = useUserStore()

const CC = {
  US:'US【美国】',GB:'UK【英国】',EU:'EUR【欧盟】',CA:'CA【加拿大】',AU:'AU【澳大利亚】',
  JP:'Japan【日本】',CN:'CN【中国】',PH:'PH【菲律宾】',SG:'SG【新加坡】',MY:'MY【马来西亚】',
  HK:'HK【香港】',KR:'KR【韩国】',NG:'NG【尼日利亚】',GH:'GH【加纳】',
  USD:'US【美国】',GBP:'UK【英国】',EUR:'EUR【欧盟】',CAD:'CA【加拿大】',AUD:'AU【澳大利亚】',
  JPY:'Japan【日本】',CNY:'CN【中国】',PHP:'PH【菲律宾】',SGD:'SG【新加坡】',MYR:'MY【马来西亚】',
  HKD:'HK【香港】',KRW:'KR【韩国】',NGN:'NG【尼日利亚】',GHS:'GH【加纳】',
}
const CS = { USD:'$',GBP:'£',EUR:'€',CAD:'C$',AUD:'A$',JPY:'¥',CNY:'¥',PHP:'₱',SGD:'S$',NGN:'₦',
  US:'$',GB:'£',EU:'€',CA:'C$',AU:'A$',JP:'¥',CN:'¥',PH:'₱',SG:'S$',NG:'₦' }

function countryLabel(c) { return CC[c] || (c||'—') }
function currSym(c) { return CS[c] || '' }
function fmt(n) { return Number(n||0).toLocaleString('en-NG',{minimumFractionDigits:0}) }

const list       = ref([])
const total      = ref(0)
const loading    = ref(false)
const countries  = ref([])
const dateRange  = ref([])
const q = ref({ pageNum:1, pageSize:20, status:'', country:'', orderNo:'', userSearch:'', startTime:'', endTime:'' })

const dataOpen      = ref(false)
const cardOpen      = ref(false)
const cur           = ref({})
const auditImgFile  = ref(null)
const auditImgPreview = ref('')
const submitting    = ref(false)
const newAmountEdit = ref('')
const savingAmount  = ref(false)
const auditRemark   = ref('')   // editable remark in 核销数据 modal when active
const copyMsg       = ref('')   // feedback for copyImg button

// computed helpers for cur (查看数据 modal)
const curIsActive = computed(() => cur.value?.status === 'pending' || cur.value?.status === 'processing')
const curCanEdit  = computed(() => {
  if (!cur.value) return false
  const myId = Number(userStore.userId)
  const staffId = Number(cur.value.staffId)
  // unclaimed pending — anyone with permission can act
  if (cur.value.status === 'pending' && !staffId) return canActOrders.value
  // claimer matches
  return myId === staffId
})

const pendingCount   = ref(0)  // kept for backward compat — managed by PendingOrdersPopup
let   sessTimer      = null    // cleanup fn
let   listTimer      = null    // background auto-refresh for orders table

async function getList() {
  loading.value = true
  try {
    const res = await request({ url:'/tuka/order/list', params:q.value })
    list.value  = res.rows || []
    total.value = res.total || 0
  } finally { loading.value = false }
}

// Silent background refresh — updates data without showing the loading spinner
async function silentRefresh() {
  try {
    clearCache('/tuka/order/list')
    const res = await request({ url:'/tuka/order/list', params:q.value })
    list.value  = res.rows || []
    total.value = res.total || 0
  } catch {}
}

function search() { q.value.pageNum = 1; getList() }
function onDateChange(val) {
  q.value.startTime = val?.[0] || ''
  q.value.endTime   = val?.[1] || ''
  search()
}

function viewData(row) {
  cur.value = { ...row }
  newAmountEdit.value = String(row.newAmount || row.ngnAmount || '')
  auditRemark.value = ''
  auditImgFile.value = null
  auditImgPreview.value = ''
  dataOpen.value = true
}
function viewCard(row) { cur.value = { ...row }; cardOpen.value = true }

async function pasteImage() {
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type)
          auditImgFile.value = new File([blob], 'paste.png', { type })
          auditImgPreview.value = URL.createObjectURL(blob)
          ElMessage.success('图片已粘贴')
          return
        }
      }
    }
    ElMessage.warning('剪贴板中没有图片')
  } catch { ElMessage.warning('无法读取剪贴板，请使用上传按钮') }
}

async function saveNewAmount() {
  const amt = parseFloat(newAmountEdit.value)
  if (isNaN(amt) || amt <= 0) { ElMessage.warning('请输入有效金额'); return }
  savingAmount.value = true
  try {
    await request({
      url: '/tuka/order/audit', method: 'put',
      data: { id: cur.value.id, status: cur.value.status, verifyRemark: cur.value.verifyRemark||'', newAmount: amt, amountUpdateOnly: true }
    })
    cur.value = { ...cur.value, newAmount: amt }
    silentRefresh()
    ElMessage.success('已保存：实付 ₦' + fmt(amt))
  } catch(e) { ElMessage.error(e.message) }
  finally { savingAmount.value = false }
}

// Quick audit from 查看数据 dialog — uploads image, passes remark, same as Staff Desktop
async function quickAudit(row, status) {
  const label = status === 'paid' ? '核销完成' : '核销失败'
  const confirmed = window.confirm(`确认${label}？`)
  if (!confirmed) return
  submitting.value = true
  try {
    // Upload verify image if one was selected/pasted
    let verifyImage = ''
    if (auditImgFile.value) {
      const fd = new FormData()
      fd.append('file', auditImgFile.value)
      const up = await request({ url: '/common/upload', method: 'post', data: fd })
      verifyImage = up?.url || ''
    }
    const amt = parseFloat(newAmountEdit.value)
    const payload = {
      id: row.id,
      status,
      verifyRemark: auditRemark.value || '',
      verifyImage,
    }
    if (!isNaN(amt) && amt > 0 && amt !== row.ngnAmount) payload.newAmount = amt
    await request({ url: '/tuka/order/audit', method: 'put', data: payload })
    clearCache('/tuka/order/list')
    ElMessage.success(label + '成功')
    // Reset modal state
    dataOpen.value = false
    auditRemark.value = ''
    auditImgFile.value = null
    auditImgPreview.value = ''
    silentRefresh()
    fetchPendingCount()
  } catch(e) { ElMessage.error(e.message) }
  finally { submitting.value = false }
}

async function fetchPendingCount() {
  // No-op — pending count is now managed by global PendingOrdersPopup component
}

function copy(text) { navigator.clipboard.writeText(text).then(() => ElMessage.success('已复制')) }

// Copy image to clipboard as PNG — same as Staff Desktop copyImageToClipboard
async function copyImg(url) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const pngBlob = await new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d').drawImage(img, 0, 0)
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
      }
      img.onerror = reject
      img.src = URL.createObjectURL(blob)
    })
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
    copyMsg.value = '已复制！'
    setTimeout(() => copyMsg.value = '', 2000)
    ElMessage.success('图片已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请右键图片手动复制')
  }
}

onMounted(async () => {
  getList()
  // Refresh table silently when a claim happens from the global popup (any screen)
  function onOrderClaimed() { silentRefresh() }
  window.addEventListener('order:claimed', onOrderClaimed)

  // Ctrl+V paste image into 核销数据 modal when it's open
  function handlePaste(e) {
    if (!dataOpen.value || !curIsActive.value || !curCanEdit.value) return
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) {
          auditImgFile.value = file
          auditImgPreview.value = URL.createObjectURL(file)
          ElMessage.success('图片已粘贴')
        }
        break
      }
    }
  }
  window.addEventListener('paste', handlePaste)
  // Store cleanup functions
  sessTimer = () => {
    window.removeEventListener('paste', handlePaste)
    window.removeEventListener('order:claimed', onOrderClaimed)
  }

  // Background auto-refresh every 10s — silent, no spinner
  listTimer = setInterval(() => { if (!document.hidden) silentRefresh() }, 10_000)

  setTimeout(async () => {
    try {
      const res = await request({ url:'/tuka/country/list', params:{ pageSize:100 } })
      const rows = (res.rows||[]).map(c => c.name).filter(Boolean)
      countries.value = rows.length > 0 ? rows : ['Nigeria', 'Ghana']
    } catch { countries.value = ['Nigeria', 'Ghana'] }
  }, 2000)
})
onUnmounted(() => {
  if (typeof sessTimer === 'function') sessTimer()
  if (listTimer) clearInterval(listTimer)
})
</script>

<style scoped>
/* Page-specific only — globals in src/styles/index.css */
</style>
