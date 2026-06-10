/**
 * Role system — 4 roles, multi-role support.
 *
 * Stored in DB as slash-separated string: "核销人员/客服人员"
 * One staff can have multiple roles.
 *
 * Roles:
 *   超级管理员  — full access
 *   提现人员    — process withdrawals
 *   核销人员    — verify/audit orders
 *   客服人员    — customer service chat
 */

export const ROLES = {
  SUPER:   '超级管理员',
  PAYMENT: '提现人员',
  VERIFY:  '核销人员',
  CS:      '客服人员',
} as const

/** Parse "核销人员/客服人员" → ['核销人员', '客服人员'] */
export function parseRoles(roleType: string): string[] {
  if (!roleType) return []
  return roleType.split('/').map(r => r.trim()).filter(Boolean)
}

/** Check if the staff has a specific role */
export function hasRole(roleType: string, role: string): boolean {
  return parseRoles(roleType).includes(role)
}

/** Super admin — full access to everything */
export function isSuper(roleType: string): boolean {
  return hasRole(roleType, ROLES.SUPER)
}

/** Can verify/audit/approve orders */
export function canVerifyOrders(roleType: string): boolean {
  return isSuper(roleType) || hasRole(roleType, ROLES.VERIFY)
}

/** Can process withdrawal payments */
export function canProcessPayments(roleType: string): boolean {
  return isSuper(roleType) || hasRole(roleType, ROLES.PAYMENT)
}

/** Can claim/reply/close chat sessions */
export function canHandleChat(roleType: string): boolean {
  return isSuper(roleType) || hasRole(roleType, ROLES.CS)
}

/** Everyone can view — no restriction */
export function canViewWithdrawals(_roleType: string): boolean {
  return true
}

/** Display color for a single role tag */
export function roleColor(role: string): string {
  const map: Record<string, string> = {
    '超级管理员': '#f5222d',
    '提现人员':   '#fa8c16',
    '核销人员':   '#1677ff',
    '客服人员':   '#52c41a',
  }
  return map[role] || '#8c8c8c'
}

/** Display label for role (Chinese) */
export function roleLabel(role: string): string {
  return role || '—'
}
