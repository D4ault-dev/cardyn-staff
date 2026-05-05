import client from './client'
import type { OnlineStaff } from '../types'

export type { OnlineStaff }

export const sendHeartbeat = () =>
  client.post('/tuka/staff/heartbeat').catch(() => {})

export const getOnlineStaff = () =>
  client.get('/tuka/staff/online')
    .then(r => (r.data.data || []) as OnlineStaff[])
