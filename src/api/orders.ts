import client from './client'
import type { Order } from '../types'

export type { Order }

export const getOrders = (params: Record<string, any> = {}) =>
  client.get('/tuka/order/list', { params: { pageSize: 20, ...params } })
    .then(r => ({ rows: (r.data.rows || []) as Order[], total: r.data.total as number }))

export const auditOrder = (id: number, status: 'paid' | 'rejected', verifyRemark = '', verifyImage = '') =>
  client.put('/tuka/order/audit', { id, status, verifyRemark, verifyImage })
