/**
 * Role-based permissions — matches the actual roles in tuka_staff_auth.
 *
 * 4 Roles:
 *   超级管理员  — full access to everything
 *   客服人员    — chat (claim/reply/close)
 *   核销人员    — verify/approve orders
 *   提现人员    — process withdrawals
 *
 * One staff can have multiple roles stored as "核销人员/客服人员"
 * Everyone can VIEW all pages. Only actions are restricted by role.
 */

import { computed } from 'vue'
import { useUserStore } from '@/stores/user'

export function usePermissions() {
  const userStore = useUserStore()
  const role = computed(() => userStore.roleType || '')

  // Split "核销人员/客服人员" → ['核销人员', '客服人员']
  const roles = computed(() => role.value.split('/').map(r => r.trim()).filter(Boolean))
  const hasRole = (r) => roles.value.includes(r)

  const isSuper   = computed(() => hasRole('超级管理员'))
  const isCS      = computed(() => hasRole('客服人员'))
  const isVerify  = computed(() => hasRole('核销人员'))
  const isPayment = computed(() => hasRole('提现人员'))

  // Can approve/reject orders
  const canActOrders = computed(() => isSuper.value || isVerify.value)

  // Can pay/reject withdrawals
  const canActWithdrawals = computed(() => isSuper.value || isPayment.value)

  // Can claim/reply/close chat sessions
  const canActChat = computed(() => isSuper.value || isCS.value)

  // Can ban/unban users
  const canManageUsers = computed(() => isSuper.value)

  return {
    role,
    isSuper,
    isCS,
    isVerify,
    isPayment,
    canActOrders,
    canActWithdrawals,
    canActChat,
    canManageUsers,
  }
}
