import client from './client'
import type { AppUser } from '../types'
import { swrFetch } from './cache'

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
