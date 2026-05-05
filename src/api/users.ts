import client from './client'
import type { AppUser } from '../types'

export type { AppUser }

export const getUsers = (params: Record<string, any> = {}) =>
  client.get('/tuka/user/list', { params: { pageSize: 20, ...params } })
    .then(r => ({ rows: (r.data.rows || []) as AppUser[], total: r.data.total as number }))
