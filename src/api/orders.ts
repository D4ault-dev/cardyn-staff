import client, { clearClientCacheByUrl } from './client'
import type { Order } from '../types'
import { swrFetch, invalidatePrefix } from './cache'

export type { Order }

function ordersKey(params: Record<string, any>) {
  return 'orders:' + JSON.stringify(params)
}

export const getOrders = (
  params: Record<string, any> = {},
  options: { onFresh?: (r: { rows: Order[]; total: number }) => void } = {},
) => {
  const key = ordersKey(params)
  return swrFetch(
    key,
    () =>
      client
        .get('/tuka/order/list', { params })
        .then(r => ({ rows: (r.data.rows || []) as Order[], total: r.data.total as number })),
    { onFresh: options.onFresh },
  )
}

export const auditOrder = (id: number, status: 'paid' | 'rejected', verifyRemark = '', verifyImage = '') => {
  invalidatePrefix('orders:')
  clearClientCacheByUrl('/tuka/order/list')
  return client.put('/tuka/order/audit', { id, status, verifyRemark, verifyImage })
}
