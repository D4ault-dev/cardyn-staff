import { api, isSuper } from '../api'
import { fmt, fmtNgn, statusTag, toast } from '../utils'

let page = 1, total = 0
const PS = 15
let filters = { userSearch: '', startTime: '', endTime: '' }
let rows: any[] = []

export function renderUsers(c: HTMLElement) {
  c.innerHTML = `
    <div class="page-container">
      <div class="page-toolbar">
        <input class="filter-input" id="u-search" placeholder="UID/手机/邮箱/姓名" style="width:180px" />
        <input class="filter-input" id="u-start" type="datetime-local" style="width:160px" />
        <input class="filter-input" id="u-end"   type="datetime-local" style="width:160px" />
        <button class="btn btn-primary" id="u-search-btn">搜索</button>
        <button class="btn" id="u-reset-btn">重置</button>
        <span id="u-total-text" style="margin-left:auto;font-size:12px;color:var(--text-muted)">共 0 个用户</span>
      </div>
      <div class="page-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>用户ID</th><th>手机号</th><th>真实姓名</th><th>余额</th>
            <th>总销售额</th><th>交易次数</th><th>等级</th>
            <th>国家</th><th>状态</th><th>注册时间</th><th>操作</th>
          </tr></thead>
          <tbody id="u-tbody"><tr class="empty"><td colspan="11"><div class="loading-row"><div class="spinner"></div></div></td></tr></tbody>
        </table>
      </div>
      <div class="page-footer">
        <button class="btn btn-sm" id="u-prev">‹</button>
        <span id="u-page-info" style="font-size:12px;margin:0 8px;color:var(--text)">1</span>
        <button class="btn btn-sm" id="u-next">›</button>
      </div>
    </div>
    <!-- View modal -->
    <div id="u-view-modal" style="display:none">
      <div class="modal-mask"><div class="modal-box" id="u-view-box" style="width:680px;max-width:96vw"></div></div>
    </div>
  `

  document.getElementById('u-search-btn')?.addEventListener('click', () => {
    filters.userSearch = (document.getElementById('u-search') as HTMLInputElement).value.trim()
    filters.startTime  = (document.getElementById('u-start') as HTMLInputElement).value
    filters.endTime    = (document.getElementById('u-end')   as HTMLInputElement).value
    page = 1; loadList()
  })
  document.getElementById('u-reset-btn')?.addEventListener('click', () => {
    filters = { userSearch:'', startTime:'', endTime:'' };
    ['u-search','u-start','u-end'].forEach(id => { const el = document.getElementById(id) as HTMLInputElement; if (el) el.value = '' })
    page = 1; loadList()
  })
  document.getElementById('u-prev')?.addEventListener('click', () => { if (page > 1) { page--; loadList() } })
  document.getElementById('u-next')?.addEventListener('click', () => { if (page < Math.ceil(total/PS)) { page++; loadList() } })
  loadList()
}

async function loadList() {
  const tbody = document.getElementById('u-tbody')
  if (!tbody) return
  tbody.innerHTML = `<tr class="empty"><td colspan="11"><div class="loading-row"><div class="spinner"></div></div></td></tr>`
  try {
    const res = await api.getUsers({ pageNum: page, pageSize: PS, ...filters })
    rows = res?.rows || []
    total = res?.total || 0
    renderTable(tbody)
    const pages = Math.ceil(total/PS)||1
    const info = document.getElementById('u-page-info')
    const totalText = document.getElementById('u-total-text')
    const prev = document.getElementById('u-prev') as HTMLButtonElement
    const next = document.getElementById('u-next') as HTMLButtonElement
    if (info) info.textContent = `${page} / ${pages}`
    if (totalText) totalText.textContent = `共 ${total} 个用户`
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
      <td style="font-weight:700;color:var(--primary);font-family:monospace">${String(r.userId||r.id).padStart(4,'0')}</td>
      <td class="mono" style="font-size:11px">${r.phone||'—'}</td>
      <td>${r.realName||'—'}</td>
      <td><span class="amount-green">${fmtNgn(r.balance)}</span></td>
      <td><span class="amount-green">${fmtNgn(r.totalSales)}</span></td>
      <td style="text-align:center">${r.tradeCount||0}</td>
      <td style="text-align:center">Lv ${r.level||1}</td>
      <td style="font-size:11px">${r.country||'—'}</td>
      <td>${r.status===1 ? '<span class="tag tag-paid">正常</span>' : '<span class="tag tag-rejected">封禁</span>'}</td>
      <td style="font-size:11px;color:var(--text-subtle)">${(r.createTime||'').slice(0,10)}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:nowrap">
          <button class="btn btn-sm btn-primary" data-u-view="${i}">查看</button>
          ${isSuper() ? `<button class="btn btn-sm ${r.status===1?'btn-danger':'btn-success'}" data-u-toggle="${i}">${r.status===1?'封禁':'解封'}</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('')

  tbody.querySelectorAll('[data-u-view]').forEach(b => {
    b.addEventListener('click', () => openViewModal(rows[parseInt((b as HTMLElement).dataset.uView!)]))
  })
  tbody.querySelectorAll('[data-u-toggle]').forEach(b => {
    b.addEventListener('click', async () => {
      const r = rows[parseInt((b as HTMLElement).dataset.uToggle!)]
      const newStatus = r.status === 1 ? 0 : 1
      if (!confirm(`确定${newStatus===0?'封禁':'解封'}用户 ${r.phone||r.userId}？`)) return
      try {
        await api.getUsers({ _action: 'toggle', userId: r.userId||r.id, status: newStatus })
        r.status = newStatus; loadList()
      } catch (e: any) { toast(e.message, 'error') }
    })
  })
}

function openViewModal(r: any) {
  const box   = document.getElementById('u-view-box')
  const modal = document.getElementById('u-view-modal')
  if (!box || !modal) return

  box.innerHTML = `
    <div class="modal-head">用户详情 <button class="modal-head-close" id="uv-close">×</button></div>
    <div class="modal-body">
      <!-- Stats row -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;margin-bottom:16px">
        ${[
          ['余额', fmtNgn(r.balance), 'var(--primary)'],
          ['总销售额', fmtNgn(r.totalSales), 'var(--success)'],
          ['总提现额', fmtNgn(r.totalWithdrawn||0), 'var(--danger)'],
          ['交易次数', r.tradeCount||0, 'var(--text)'],
        ].map(([l,v,c], i) => `
          <div style="padding:12px 14px;text-align:center;${i<3?'border-right:1px solid var(--border-color)':''}">
            <div style="font-size:11px;color:var(--text-subtle);text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px">${l}</div>
            <div style="font-size:14px;font-weight:700;color:${c}">${v}</div>
          </div>`).join('')}
      </div>
      <!-- Details grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
        ${[
          ['用户ID', String(r.userId||r.id).padStart(4,'0')],
          ['手机号', r.phone||'—'],
          ['邮箱', r.email||'—'],
          ['真实姓名', r.realName||'—'],
          ['邀请码', r.inviteCode||'—'],
          ['国家', r.country||'—'],
          ['等级', `Lv ${r.level||1}`],
          ['注册时间', (r.createTime||'').slice(0,10)],
          ['状态', r.status===1?'正常':'封禁'],
          ['平台', r.platform||'—'],
        ].map(([l,v]) => `
          <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border-color)">
            <span style="font-size:12px;color:var(--text-subtle)">${l}</span>
            <span style="font-size:12px;font-weight:500;color:var(--text)">${v}</span>
          </div>`).join('')}
      </div>
    </div>
    <div class="modal-footer"><button class="btn" id="uv-close2">关 闭</button></div>
  `
  const close = () => { modal.style.display = 'none' }
  document.getElementById('uv-close')?.addEventListener('click', close)
  document.getElementById('uv-close2')?.addEventListener('click', close)
  modal.style.display = ''
}
