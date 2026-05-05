// Role type constants
export const ROLES = {
  SUPER:   '超级管理员',
  VERIFY:  '核销人员',    // verifies gift card orders
  PAYMENT: '提现人员',    // processes withdrawal payments
  CS:      '客服人员',    // customer service
  FINANCE: '财务',
  RATE:    '改汇率人员',
} as const

// Can this role verify/audit orders?
export function canVerifyOrders(roleType: string) {
  return [ROLES.SUPER, ROLES.VERIFY, ROLES.CS].includes(roleType as any)
}

// Can this role process withdrawal payments?
export function canProcessPayments(roleType: string) {
  return [ROLES.SUPER, ROLES.PAYMENT, ROLES.FINANCE].includes(roleType as any)
}

// Can this role view withdrawal details (read-only)?
export function canViewWithdrawals(roleType: string) {
  return true // all roles can view
}
