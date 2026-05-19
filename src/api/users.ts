import client from './client'
import type { AppUser } from '../types'
import { swrFetch, invalidatePrefix } from './cache'
import { clearClientCacheByUrl } from './client'

export type { AppUser }

function usersKey(params: Record<string, any>) {
  return 'users:' + JSON.stringify(params)
}

export const getUsers = (
  params: Record<string, any> = {},
  options: { onFresh?: (r: { rows: AppUser[]; total: number }) => void } = {},
) => {
  const key = usersKey(params)
  return swrFetch(
    key,
    () =>
      client
        .get('/tuka/user/list', { params: { pageSize: 20, ...params } })
        .then(r => ({ rows: (r.data.rows || []) as AppUser[], total: r.data.total as number })),
    { onFresh: options.onFresh },
  )
}

/** Toggle user ban status: status 1 = active, 0 = banned */
export const setUserStatus = (userId: number, status: 0 | 1) => {
  invalidatePrefix('users:')
  clearClientCacheByUrl('/tuka/user/list')
  return client.put('/tuka/user/status', { userId, status })
}
