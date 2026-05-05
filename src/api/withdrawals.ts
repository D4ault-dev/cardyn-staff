import client from './client'
import type { Withdrawal } from '../types'

export type { Withdrawal }

export const getWithdrawals = (params: Record<string, any> = {}) =>
  client.get('/tuka/withdrawal/list', { params: { pageSize: 20, ...params } })
    .then(r => ({ rows: (r.data.rows || []) as Withdrawal[], total: r.data.total as number }))

export const approveWithdrawal = (id: number, remark = '') =>
  client.put('/tuka/withdrawal/audit', { id, status: 'completed', remark })

export const rejectWithdrawal = (id: number, remark: string) =>
  client.put('/tuka/withdrawal/audit', { id, status: 'rejected', remark })
