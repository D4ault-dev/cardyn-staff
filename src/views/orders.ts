import { api, canActOrders } from '../api'
import { fmt, fmtNgn, currSym, statusTag, copyText, toast } from '../utils'

let page = 1
let total = 0
const PAGE_SIZE = 15
let filters = { status: '', country: '', orderNo: '', userSearch: '', startTime: '', endTime: '' }
let rows: any[] = []
let pendingRows: any[] = []
let container: HTMLElement

export function renderOrders(c: HTMLElement) {
  container = c
  container.innerHTML = ordersHTML()
  bindEvents()
  loadOrders()
}

function ordersHTML(): string {
  return `
    <div class="page-container">
      <!-- Toolbar -->
      <div class="page-toolbar" id="orders-toolbar">
        <select class="filter-select" id="o-status">
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="processing">处理中</option>
          <option value="paid">已完成</option>
          <option value="rejected">已拒绝</option>
        </select>
        <input class="filter-input" id="o-order-no" placeholder="订单编号" style="width:130px" />
        <input class="filter-input" id="o-user-search" placeholder="UID/手机/邮箱/姓名" style="width:150px" />
        <input class="filter-input" id="o-start" type="datetime-local" style="width:160px" />
        <input class="filter-input" id="o-end"   type="datetime-local" style="width:160px" />
        <button class="btn btn-primary" id="o-search-btn">搜索</button>
        <button class="btn" id="o-reset-btn">重置</button>
        <button class="btn btn-warning" id="o-pending-btn" style="margin-left:auto">
          待受理 <span id="o-pending-count" style="display:none;background:rgba(255,255,255,.3);border-radius:8px;padding:0 6px;font-size:11px;font-weight:700;margin-left:4px">0</span>
        </button>
      </div>
      <!-- Table -->
      <div class="page-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th><th>用户ID</th><th>订单号</th><th>卡种</th>
              <th>面值</th><th>数量</th><th>结算金额</th>
              <th>类型</th><th>状态</th><th>创建时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody id="orders-tbody"><tr class="empty"><td colspan="11"><div class="loading-row"><div class="spinner"></div>加载中…</div></td></tr></tbody>
        </table>
      </div>
      <!-- Footer -->
      <div class="page-footer">
        <span id="o-total-text" style="font-size:12px;color:var(--text-muted);margin-right:12px">共 0 条</span>
        <button class="btn btn-sm" id="o-prev">‹</button>
        <span id="o-page-info" style="font-size:12px;margin:0 8px;color:var(--text)">1</span>
        <button class="btn btn-sm" id="o-next">›</button>
      </div>
    </div>
    <!-- Data modal -->
    <div id="o-data-modal" style="display:none">
      <div class="modal-mask">
        <div class="modal-box wide">
          <div class="modal-head">核销数据 <button class="modal-head-close" id="o-data-close">×</button></div>
          <div class="modal-body" id="o-data-body"></div>
          <div class="modal-footer" id="o-data-footer"></div>
        </div>
      </div>
    </div>
    <!-- Pending popup -->
    <div id="o-pending-modal" style="display:none">
      <div class="pending-popup-wrap">
        <div class="pending-popup">
          <div class="pp-head">待受理订单 <button class="modal-head-close" id="o-pp-close">×</button></div>
          <div class="pp-body" id="o-pp-body"><div class="loading-row"><div class="spinner"></div>加载中…</div></div>
          <div class="pp-foot">
            <button class="btn" id="o-pp-refresh">刷新</button>
            <button class="btn" id="o-pp-close2">关闭</button>
          </div>
        </div>
      </div>
    </div>
  `
}

function bindEvents() {
  document.getElementById('o-search-btn')?.addEventListener('click', () => { page = 1; collectFilters(); loadOrders() })
  document.getElementById('o-reset-btn')?.addEventListener('click', resetFilters)
  document.getElementById('o-prev')?.addEventListener('click', () => { if (page > 1) { page--; loadOrders() } })
  document.getElementById('o-next')?.addEventListener('click', () => { if (page < Math.ceil(total / PAGE_SIZE)) { page++; loadOrders() } })
  document.getElementById('o-pending-btn')?.addEventListener('click', openPendingPopup)
  document.getElementById('o-data-close')?.addEventListener('click', closeDataModal)
  document.getElementById('o-pp-close')?.addEventListener('click', closePendingPopup)
  document.getElementById('o-pp-close2')?.addEventListener('click', closePendingPopup)
  document.getElementById('o-pp-refresh')?.addEventListener('click', loadPending)
}

function collectFilters() {
  filters.status      = (document.getElementById('o-status')      as HTMLSelectElement)?.value || ''
  filters.orderNo     = (document.getElementById('o-order-no')    as HTMLInputElement)?.value.trim() || ''
  filters.userSearch  = (document.getElementById('o-user-search') as HTMLInputElement)?.value.trim() || ''
  filters.startTime   = (document.getElementById('o-start')       as HTMLInputElement)?.value || ''
  filters.endTime     = (document.getElementById('o-end')         as HTMLInputElement)?.value || ''
}

function resetFilters() {
  filters = { status:'', country:'', orderNo:'', userSearch:'', startTime:'', endTime:'' };
  ['o-status','o-order-no','o-user-search','o-start','o-end'].forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement
    if (el) el.value = ''
  })
  page = 1; loadOrders()
}

async function loadOrders() {
  const tbody = document.getElementById('orders-tbody')
  if (!tbody) return
  tbody.innerHTML = `<tr class="empty"><td colspan="11"><div class="loading-row"><div class="spinner"></div>加载中…</div></td></tr>`
  try {
    const params: any = { pageNum: page, pageSize: PAGE_SIZE, ...filters }
    const res = await api.getOrders(params)
    rows = res?.rows || []
    total = res?.total || 0
    renderTable(tbody)
    updatePagination()
    loadPendingCount()
  } catch (e: any) {
    tbody.innerHTML = `<tr class="empty"><td colspan="11" style="color:var(--danger)">${e.message}</td></tr>`
  }
}

function renderTable(tbody: HTMLElement) {
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty"><td colspan="11">暂无数据</td></tr>`
    return
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${r.userId}</td>
      <td class="mono">${r.orderNo?.slice(-8) || '—'}</td>
      <td>${r.categoryName}</td>
      <td><span class="amount-green">${currSym(r.cardCurrency)}${r.cardAmount}</span></td>
      <td>${r.quantity ?? 1}</td>
      <td><span class="amount-red">${fmtNgn(r.ngnAmount)}</span></td>
      <td>${r.inputType || '—'}</td>
      <td>${statusTag(r.status)}</td>
      <td style="font-size:11px;color:var(--text-subtle)">${(r.createTime||'').slice(0,16)}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:nowrap">
          <button class="btn btn-sm btn-primary" data-action="data" data-idx="${rows.indexOf(r)}">查看数据</button>
          ${canActOrders() && (r.status==='pending'||r.status==='processing')
            ? `<button class="btn btn-sm btn-success" data-action="paid"     data-idx="${rows.indexOf(r)}">核销完成</button>
               <button class="btn btn-sm btn-danger"  data-action="rejected" data-idx="${rows.indexOf(r)}">核销失败</button>`
            : ''}
        </div>
      </td>
    </tr>
  `).join('')

  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLElement
      const idx = parseInt(el.dataset.idx || '0')
      const action = el.dataset.action!
      const row = rows[idx]
      if (action === 'data') openDataModal(row)
      else quickAudit(row, action as 'paid' | 'rejected')
    })
  })
}

function updatePagination() {
  const pages = Math.ceil(total / PAGE_SIZE) || 1
  const info = document.getElementById('o-page-info')
  const totalText = document.getElementById('o-total-text')
  const prev = document.getElementById('o-prev') as HTMLButtonElement
  const next = document.getElementById('o-next') as HTMLButtonElement
  if (info) info.textContent = `${page} / ${pages}`
  if (totalText) totalText.textContent = `共 ${total} 条`
  if (prev) prev.disabled = page <= 1
  if (next) next.disabled = page >= pages
}

async function loadPendingCount() {
  try {
    const res = await api.getOrders({ status: 'pending', pageSize: 1 })
    const count = res?.total || 0
    const badge = document.getElementById('o-pending-count')
    if (badge) { badge.textContent = String(count); badge.style.display = count > 0 ? '' : 'none' }
  } catch {}
}

// ── Data modal ────────────────────────────────────────────────────────────────
let curRow: any = null

function openDataModal(row: any) {
  curRow = row
  const modal = document.getElementById('o-data-modal')
  const body  = document.getElementById('o-data-body')
  const foot  = document.getElementById('o-data-footer')
  if (!modal || !body || !foot) return

  body.innerHTML = `
    <div class="info-bar">
      <span class="info-bar-lbl">基础信息：</span>
      <span class="info-chip"><span class="ic-lbl">卡种</span><span class="ic-val">${row.categoryName}</span></span>
      <span class="info-chip"><span class="ic-lbl">面值</span><span class="ic-val amount-green">${currSym(row.cardCurrency)}${row.cardAmount}</span></span>
      <span class="info-chip"><span class="ic-lbl">类型</span><span class="ic-val">${row.inputType||'—'}</span></span>
      <span class="info-chip"><span class="ic-lbl">数量</span><span class="ic-val">${row.quantity??1}</span></span>
    </div>
    <div class="form-row"><span class="form-label">订单号：</span><input class="form-input-ro" value="${row.orderNo}" readonly /></div>
    <div class="form-row">
      <span class="form-label">用户ID：</span><input class="form-input-ro w120" value="${row.userId}" readonly />
      <span class="form-lbl-inline" style="margin-left:12px">国家汇率</span><input class="form-input-ro w80" value="${row.countryRate??''}" readonly />
      <span class="form-lbl-inline" style="margin-left:8px">采购汇率</span><input class="form-input-ro w80" value="${row.purchaseRate??''}" readonly />
    </div>
    <div class="form-row">
      <span class="form-label">结算金额：</span><input class="form-input-ro w120" value="${fmtNgn(row.ngnAmount)}" readonly />
      <span class="form-lbl-inline" style="margin-left:12px">变更金额</span>
      <input class="form-input-rw w120" id="o-new-amount" type="number" placeholder="${row.ngnAmount}" value="${row.newAmount && row.newAmount !== row.ngnAmount ? row.newAmount : ''}" />
    </div>
    ${row.cardCode ? `
    <div class="form-row top"><span class="form-label">卡片代码：</span>
      <div style="flex:1;display:flex;flex-direction:column;gap:4px">
        ${row.cardCode.split('\n').filter((c:string)=>c.trim()).map((code:string, i:number) => `
          <div style="display:flex;align-items:center;gap:8px;background:var(--bg-hover);border:1px solid var(--border-color);border-radius:4px;padding:5px 10px">
            <span style="width:18px;height:18px;border-radius:50%;background:var(--primary);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</span>
            <span style="flex:1;font-family:monospace;font-size:13px;font-weight:600">${code.trim()}</span>
            <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${code.trim()}')">复制</button>
          </div>`).join('')}
      </div>
    </div>` : ''}
    ${row.verifyImage ? `
    <div class="form-row"><span class="form-label">核销凭证：</span>
      <img src="${row.verifyImage}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid var(--border-color);cursor:zoom-in" onclick="window.open('${row.verifyImage}')" />
    </div>` : ''}
  `

  foot.innerHTML = `
    <button class="btn" id="o-modal-close-btn">关闭</button>
    ${canActOrders() && (row.status==='pending'||row.status==='processing') ? `
      <button class="btn btn-success" id="o-modal-paid">核销完成</button>
      <button class="btn btn-danger"  id="o-modal-reject">核销失败</button>` : ''}
  `

  document.getElementById('o-modal-close-btn')?.addEventListener('click', closeDataModal)
  document.getElementById('o-modal-paid')?.addEventListener('click', () => quickAudit(row, 'paid', true))
  document.getElementById('o-modal-reject')?.addEventListener('click', () => quickAudit(row, 'rejected', true))

  modal.style.display = ''
}

function closeDataModal() {
  const modal = document.getElementById('o-data-modal')
  if (modal) modal.style.display = 'none'
}

async function quickAudit(row: any, status: 'paid' | 'rejected', fromModal = false) {
  const label = status === 'paid' ? '核销完成' : '核销失败'
  if (!confirm(`确认${label}？订单：${row.orderNo}`)) return
  try {
    const newAmtInput = document.getElementById('o-new-amount') as HTMLInputElement
    const newAmt = newAmtInput ? parseFloat(newAmtInput.value) : NaN
    const payload: any = { id: row.id, status, verifyRemark: '' }
    if (!isNaN(newAmt) && newAmt > 0 && newAmt !== row.ngnAmount) payload.newAmount = newAmt
    await api.auditOrder(payload)
    toast(`${label}成功`)
    if (fromModal) closeDataModal()
    loadOrders()
  } catch (e: any) { toast(e.message, 'error') }
}

// ── Pending popup ─────────────────────────────────────────────────────────────
function openPendingPopup() {
  const modal = document.getElementById('o-pending-modal')
  if (modal) modal.style.display = ''
  loadPending()
}
function closePendingPopup() {
  const modal = document.getElementById('o-pending-modal')
  if (modal) modal.style.display = 'none'
}

async function loadPending() {
  const body = document.getElementById('o-pp-body')
  if (!body) return
  body.innerHTML = '<div class="loading-row"><div class="spinner"></div>加载中…</div>'
  try {
    const res = await api.getOrders({ status: 'pending', pageSize: 50 })
    pendingRows = res?.rows || []
    if (!pendingRows.length) { body.innerHTML = '<div class="loading-row">暂无待受理订单</div>'; return }
    body.innerHTML = pendingRows.map((r, i) => `
      <div class="pp-card">
        <div class="pp-card-bar"></div>
        <div class="pp-card-name">${r.categoryName}</div>
        <div class="pp-card-amounts">
          <div class="pp-card-face"><div class="pp-card-face-val">${currSym(r.cardCurrency)}${r.cardAmount}</div><div class="pp-card-face-lbl">面值</div></div>
          <div style="color:var(--border-color)">→</div>
          <div class="pp-card-face"><div class="pp-card-settle-val">${fmtNgn(r.ngnAmount)}</div><div class="pp-card-face-lbl">结算</div></div>
        </div>
        <div class="pp-card-meta">用户#${r.userId} · ${r.inputType||'—'} · ${(r.createTime||'').slice(0,16)}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" data-pp-data="${i}">查看数据</button>
          ${canActOrders() ? `<button class="btn btn-sm btn-primary" data-pp-claim="${i}" style="flex:1">接单 →</button>` : ''}
        </div>
      </div>
    `).join('')

    body.querySelectorAll('[data-pp-data]').forEach(btn => {
      btn.addEventListener('click', () => { const r = pendingRows[parseInt((btn as HTMLElement).dataset.ppData!)]; closePendingPopup(); openDataModal(r) })
    })
    body.querySelectorAll('[data-pp-claim]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const r = pendingRows[parseInt((btn as HTMLElement).dataset.ppClaim!)]
        try {
          await api.auditOrder({ id: r.id, status: 'processing', verifyRemark: '' })
          toast('接单成功'); closePendingPopup(); loadOrders()
        } catch (e: any) { toast(e.message, 'error') }
      })
    })
  } catch (e: any) { body.innerHTML = `<div class="loading-row" style="color:var(--danger)">${e.message}</div>` }
}
