import client, { clearClientCacheByUrl } from './client'
import type { Withdrawal } from '../types'
import { swrFetch, invalidatePrefix } from './cache'

export type { Withdrawal }

function withdrawalsKey(params: Record<string, any>) {
  return 'withdrawals:' + JSON.stringify(params)
}

export const getWithdrawals = (
  params: Record<string, any> = {},
  options: { onFresh?: (r: { rows: Withdrawal[]; total: number }) => void } = {},
) => {
  const key = withdrawalsKey(params)
  return swrFetch(
    key,
    () =>
      client
        .get('/tuka/withdrawal/list', { params })
        .then(r => ({ rows: (r.data.rows || []) as Withdrawal[], total: r.data.total as number })),
    { onFresh: options.onFresh },
  )
}

export const approveWithdrawal = (id: number, remark = '') => {
  invalidatePrefix('withdrawals:')
  clearClientCacheByUrl('/tuka/withdrawal/list')
  return client.put('/tuka/withdrawal/audit', { id, status: 'completed', remark })
}

export const rejectWithdrawal = (id: number, remark: string) => {
  invalidatePrefix('withdrawals:')
  clearClientCacheByUrl('/tuka/withdrawal/list')
  return client.put('/tuka/withdrawal/audit', { id, status: 'rejected', remark })
}
