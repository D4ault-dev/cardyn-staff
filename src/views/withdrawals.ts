import { api, canActWithdrawals } from '../api'
import { fmt, fmtNgn, statusTag, copyText, toast } from '../utils'

let page = 1, total = 0
const PS = 15
let filters = { status: '', startTime: '', endTime: '' }
let rows: any[] = []

export function renderWithdrawals(c: HTMLElement) {
  c.innerHTML = `
    <div class="page-container">
      <div class="page-toolbar">
        <button class="btn" id="wd-all">全部</button>
        <button class="btn btn-warning" id="wd-pending">待处理</button>
        <button class="btn btn-success" id="wd-done">已完成</button>
        <button class="btn btn-danger"  id="wd-rej">已拒绝</button>
        <input class="filter-input" id="wd-start" type="datetime-local" style="width:160px" />
        <input class="filter-input" id="wd-end"   type="datetime-local" style="width:160px" />
        <button class="btn btn-primary" id="wd-search">搜索</button>
        <button class="btn" id="wd-reset">重置</button>
      </div>
      <div class="page-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>ID</th><th>提现编号</th><th>用户ID</th><th>银行</th>
            <th>账户名</th><th>账号</th><th>金额</th><th>手续费</th>
            <th>状态</th><th>创建时间</th><th>操作</th>
          </tr></thead>
          <tbody id="wd-tbody"><tr class="empty"><td colspan="11"><div class="loading-row"><div class="spinner"></div></div></td></tr></tbody>
        </table>
      </div>
      <div class="page-footer">
        <span id="wd-total-text" style="font-size:12px;color:var(--text-muted);margin-right:12px">共 0 条</span>
        <button class="btn btn-sm" id="wd-prev">‹</button>
        <span id="wd-page-info" style="font-size:12px;margin:0 8px;color:var(--text)">1</span>
        <button class="btn btn-sm" id="wd-next">›</button>
      </div>
    </div>
    <!-- View modal -->
    <div id="wd-view-modal" style="display:none">
      <div class="modal-mask"><div class="modal-box" id="wd-view-box"></div></div>
    </div>
    <!-- Pay modal -->
    <div id="wd-pay-modal" style="display:none">
      <div class="modal-mask"><div class="modal-box" id="wd-pay-box"></div></div>
    </div>
    <!-- Reject modal -->
    <div id="wd-rej-modal" style="display:none">
      <div class="modal-mask"><div class="modal-box" id="wd-rej-box"></div></div>
    </div>
  `

  const setStatus = (s: string) => { filters.status = s; page = 1; loadList() }
  document.getElementById('wd-all')?.addEventListener('click', () => setStatus(''))
  document.getElementById('wd-pending')?.addEventListener('click', () => setStatus('pending'))
  document.getElementById('wd-done')?.addEventListener('click', () => setStatus('completed'))
  document.getElementById('wd-rej')?.addEventListener('click', () => setStatus('rejected'))
  document.getElementById('wd-search')?.addEventListener('click', () => {
    filters.startTime = (document.getElementById('wd-start') as HTMLInputElement)?.value || ''
    filters.endTime   = (document.getElementById('wd-end')   as HTMLInputElement)?.value || ''
    page = 1; loadList()
  })
  document.getElementById('wd-reset')?.addEventListener('click', () => {
    filters = { status:'', startTime:'', endTime:'' };
    ['wd-start','wd-end'].forEach(id => { const el = document.getElementById(id) as HTMLInputElement; if (el) el.value = '' })
    page = 1; loadList()
  })
  document.getElementById('wd-prev')?.addEventListener('click', () => { if (page > 1) { page--; loadList() } })
  document.getElementById('wd-next')?.addEventListener('click', () => { if (page < Math.ceil(total/PS)) { page++; loadList() } })
  loadList()
}

async function loadList() {
  const tbody = document.getElementById('wd-tbody')
  if (!tbody) return
  tbody.innerHTML = `<tr class="empty"><td colspan="11"><div class="loading-row"><div class="spinner"></div></div></td></tr>`
  try {
    const res = await api.getWithdrawals({ pageNum: page, pageSize: PS, ...filters })
    rows = res?.rows || []
    total = res?.total || 0
    renderTable(tbody)
    const pages = Math.ceil(total/PS)||1
    const info = document.getElementById('wd-page-info')
    const totalText = document.getElementById('wd-total-text')
    const prev = document.getElementById('wd-prev') as HTMLButtonElement
    const next = document.getElementById('wd-next') as HTMLButtonElement
    if (info) info.textContent = `${page} / ${pages}`
    if (totalText) totalText.textContent = `共 ${total} 条`
    if (prev) prev.disabled = page <= 1
    if (next) next.disabled = page >= pages
  } catch (e: any) {
    tbody.innerHTML = `<tr class="empty"><td colspan="11" style="color:var(--danger)">${e.message}</td></tr>`
  }
}

function renderTable(tbody: HTMLElement) {
  if (!rows.length) { tbody.innerHTML = `<tr class="empty"><td colspan="11">暂无数据</td></tr>`; return }
  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td>${r.id}</td>
      <td class="mono" style="font-size:11px">${(r.withdrawNo||'').slice(-10)}</td>
      <td>${r.userId}</td>
      <td style="font-size:12px">${r.bankName}</td>
      <td style="font-size:12px">${r.accountName}</td>
      <td class="mono" style="font-size:11px">${r.accountNo}</td>
      <td><span class="amount-red">${fmtNgn(r.amount)}</span></td>
      <td style="font-size:12px;color:var(--text-muted)">${fmtNgn(r.fee)}</td>
      <td>${statusTag(r.status)}</td>
      <td style="font-size:11px;color:var(--text-subtle)">${(r.createTime||'').slice(0,16)}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:nowrap">
          <button class="btn btn-sm" data-wd-view="${i}">查看</button>
          ${canActWithdrawals() && r.status==='pending' ? `
            <button class="btn btn-sm btn-primary" data-wd-pay="${i}">付款</button>
            <button class="btn btn-sm btn-danger"  data-wd-rej="${i}">拒绝</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('')

  tbody.querySelectorAll('[data-wd-view]').forEach(b => b.addEventListener('click', () => openViewModal(rows[parseInt((b as HTMLElement).dataset.wdView!)])))
  tbody.querySelectorAll('[data-wd-pay]').forEach(b => b.addEventListener('click',  () => openPayModal(rows[parseInt((b as HTMLElement).dataset.wdPay!)])))
  tbody.querySelectorAll('[data-wd-rej]').forEach(b => b.addEventListener('click',  () => openRejectModal(rows[parseInt((b as HTMLElement).dataset.wdRej!)])))
}

function openViewModal(r: any) {
  const box = document.getElementById('wd-view-box')
  const modal = document.getElementById('wd-view-modal')
  if (!box || !modal) return
  box.innerHTML = `
    <div class="modal-head">提现详情 <button class="modal-head-close" id="wv-close">×</button></div>
    <div class="modal-body">
      ${[['提现编号', r.withdrawNo],['用户ID', r.userId],['银行', r.bankName],['账户名', r.accountName],
         ['账号', r.accountNo],['金额', fmtNgn(r.amount)],['手续费', fmtNgn(r.fee)],
         ['状态', r.status],['备注', r.remark||'—'],['创建时间', r.createTime]].map(([l,v]) => `
        <div class="form-row"><span class="form-label">${l}：</span><input class="form-input-ro" value="${v}" readonly /></div>`).join('')}
      ${r.receiptImage ? `<div class="form-row"><span class="form-label">收据：</span><img src="${r.receiptImage}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;cursor:zoom-in" onclick="window.open('${r.receiptImage}')" /></div>` : ''}
    </div>
    <div class="modal-footer"><button class="btn" id="wv-close2">关 闭</button></div>
  `
  const close = () => { modal.style.display = 'none' }
  document.getElementById('wv-close')?.addEventListener('click', close)
  document.getElementById('wv-close2')?.addEventListener('click', close)
  modal.style.display = ''
}

function openPayModal(r: any) {
  const box = document.getElementById('wd-pay-box')
  const modal = document.getElementById('wd-pay-modal')
  if (!box || !modal) return
  const actualAmt = (r.amount||0) - (r.fee||0)
  box.innerHTML = `
    <div class="modal-head">确认付款 <button class="modal-head-close" id="wp-close">×</button></div>
    <div class="modal-body">
      <div style="background:var(--bg-hover);border:1px solid var(--border-color);border-radius:8px;padding:12px 16px;margin-bottom:14px">
        ${[['提现金额', fmtNgn(r.amount)],['手续费', `- ${fmtNgn(r.fee)}`]].map(([l,v])=>`
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0"><span>${l}</span><span style="color:var(--danger)">${v}</span></div>`).join('')}
        <div style="border-top:1px dashed var(--border-color);margin:8px 0"></div>
        <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700">
          <span>实际打款</span><span style="color:var(--danger);font-size:18px">${fmtNgn(actualAmt)}</span>
        </div>
      </div>
      <div style="border:1px solid var(--border-color);border-radius:6px;overflow:hidden;margin-bottom:14px">
        ${[['银行', r.bankName],['账户名', r.accountName],['账号', r.accountNo]].map(([l,v]) => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border-color)">
            <span style="font-size:12px;color:var(--text-subtle);min-width:60px">${l}</span>
            <span style="flex:1;font-size:13px;font-weight:600;color:var(--text)">${v}</span>
            <button class="btn btn-sm" onclick="navigator.clipboard.writeText('${v}').then(()=>{})">复制</button>
          </div>`).join('')}
      </div>
      <div class="form-row"><span class="form-label">备注：</span><input class="form-input-rw" id="wp-remark" placeholder="可选" /></div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="wp-cancel">取消</button>
      <button class="btn btn-primary" id="wp-submit">确认已付款 ${fmtNgn(actualAmt)}</button>
    </div>
  `
  const close = () => { modal.style.display = 'none' }
  document.getElementById('wp-close')?.addEventListener('click', close)
  document.getElementById('wp-cancel')?.addEventListener('click', close)
  document.getElementById('wp-submit')?.addEventListener('click', async () => {
    const btn = document.getElementById('wp-submit') as HTMLButtonElement
    btn.disabled = true; btn.textContent = '处理中…'
    try {
      const remark = (document.getElementById('wp-remark') as HTMLInputElement).value
      await api.auditWithdrawal({ id: r.id, status: 'completed', remark })
      toast('付款成功'); close(); loadList()
    } catch (e: any) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = `确认已付款 ${fmtNgn(actualAmt)}` }
  })
  modal.style.display = ''
}

function openRejectModal(r: any) {
  const box = document.getElementById('wd-rej-box')
  const modal = document.getElementById('wd-rej-modal')
  if (!box || !modal) return
  box.innerHTML = `
    <div class="modal-head">拒绝提现 <button class="modal-head-close" id="wr-close">×</button></div>
    <div class="modal-body">
      <div style="margin-bottom:12px;font-size:13px;color:var(--text-muted)">用户ID: ${r.userId} · ${fmtNgn(r.amount)}</div>
      <textarea class="form-input-rw" id="wr-reason" placeholder="拒绝原因（必填）" rows="3" style="width:100%"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn" id="wr-cancel">取消</button>
      <button class="btn btn-danger" id="wr-submit">确认拒绝</button>
    </div>
  `
  const close = () => { modal.style.display = 'none' }
  document.getElementById('wr-close')?.addEventListener('click', close)
  document.getElementById('wr-cancel')?.addEventListener('click', close)
  document.getElementById('wr-submit')?.addEventListener('click', async () => {
    const reason = (document.getElementById('wr-reason') as HTMLTextAreaElement).value.trim()
    if (!reason) { toast('请填写拒绝原因', 'error'); return }
    const btn = document.getElementById('wr-submit') as HTMLButtonElement
    btn.disabled = true
    try {
      await api.auditWithdrawal({ id: r.id, status: 'rejected', remark: reason })
      toast('已拒绝'); close(); loadList()
    } catch (e: any) { toast(e.message, 'error'); btn.disabled = false }
  })
  modal.style.display = ''
}
