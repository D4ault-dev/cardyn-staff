// Frontend API layer — calls Rust backend via Tauri invoke
const invoke = (window as any).__TAURI__?.core?.invoke

export function getToken(): string { return localStorage.getItem('cardyn_token') || '' }
export function setToken(t: string) { localStorage.setItem('cardyn_token', t) }
export function clearToken() { localStorage.removeItem('cardyn_token') }
export function getRole(): string { return localStorage.getItem('cardyn_role') || '' }
export function setRole(r: string) { localStorage.setItem('cardyn_role', r) }
export function getNickName(): string { return localStorage.getItem('cardyn_nick') || '' }
export function setNickName(n: string) { localStorage.setItem('cardyn_nick', n) }
export function getUserId(): string { return localStorage.getItem('cardyn_uid') || '' }
export function setUserId(id: string | number) { localStorage.setItem('cardyn_uid', String(id)) }

/** Translate raw network error strings into clean Chinese messages */
function cleanError(msg: string): string {
  if (!msg) return '请求失败，请重试'
  if (msg.includes('timeout') || msg.includes('服务器响应超时'))
    return '服务器响应超时，请稍后重试'
  if (msg.includes('connect') || msg.includes('无法连接'))
    return '无法连接到服务器，请检查网络'
  if (msg.includes('ECONNREFUSED') || msg.includes('Connection refused'))
    return '服务器暂时不可用，请稍后重试'
  return msg
}

async function call(cmd: string, args: Record<string, unknown> = {}): Promise<any> {
  if (!invoke) throw new Error('Tauri not available')
  try {
    const result = await invoke(cmd, args)
    if (result?.code !== undefined && result.code !== 200) {
      throw new Error(result.msg || 'Request failed')
    }
    return result
  } catch (e: any) {
    throw new Error(cleanError(e?.message || String(e)))
  }
}

/** Read-only call with one silent retry on timeout — avoids spurious errors during server restarts */
async function callWithRetry(cmd: string, args: Record<string, unknown> = {}): Promise<any> {
  try {
    return await call(cmd, args)
  } catch (e: any) {
    const msg = e?.message || ''
    if (msg.includes('超时') || msg.includes('timeout') || msg.includes('服务器')) {
      // Wait 2 seconds and retry once silently
      await new Promise(r => setTimeout(r, 2000))
      return await call(cmd, args)
    }
    throw e
  }
}

export const api = {
  login:              (username: string, password: string) => call('staff_login', { username, password }),
  getInfo:            () => callWithRetry('get_info', { token: getToken() }),
  getOrders:          (params: Record<string,any>) => callWithRetry('get_orders', { token: getToken(), params }),
  auditOrder:         (payload: Record<string,any>) => call('audit_order', { token: getToken(), payload }),
  getWithdrawals:     (params: Record<string,any>) => callWithRetry('get_withdrawals', { token: getToken(), params }),
  auditWithdrawal:    (payload: Record<string,any>) => call('audit_withdrawal', { token: getToken(), payload }),
  getUsers:           (params: Record<string,any>) => callWithRetry('get_users', { token: getToken(), params }),
  getChatSessions:    (status?: string) => callWithRetry('get_chat_sessions', { token: getToken(), status: status || null }),
  getChatMessages:    (sessionId: number) => callWithRetry('get_chat_messages', { token: getToken(), sessionId }),
  pollChatSession:    (sessionId: number, lastId: number) => call('poll_chat_session', { token: getToken(), sessionId, lastId }),
  sendChatReply:      (sessionId: number, content: string) => call('send_chat_reply', { token: getToken(), sessionId, content }),
  claimChatSession:   (sessionId: number) => call('claim_chat_session', { token: getToken(), sessionId }),
  closeChatSession:   (sessionId: number) => call('close_chat_session', { token: getToken(), sessionId }),
  getDashboardPoll:   (since: number) => call('get_dashboard_poll', { token: getToken(), since }),
}

export function canActOrders(): boolean {
  const r = getRole()
  return r.includes('超级管理员') || r.includes('核销人员')
}
export function canActWithdrawals(): boolean {
  const r = getRole()
  return r.includes('超级管理员') || r.includes('提现人员')
}
export function canActChat(): boolean {
  const r = getRole()
  return r.includes('超级管理员') || r.includes('客服人员')
}
export function isSuper(): boolean { return getRole().includes('超级管理员') }
