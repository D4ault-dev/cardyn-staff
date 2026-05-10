import client, { setAuthToken } from './client'
import type { StaffUser } from '../types'

export type { StaffUser }

export async function login(username: string, password: string): Promise<StaffUser> {
  // Use dedicated staff login endpoint — no captcha required
  const res = await client.post('/tuka/staffAuth/login', { username, password })
  // Response: { code: 200, msg: '...', data: { token, userId, username, roleType } }
  const data = res.data?.data || res.data

  const token    = data.token
  const userId   = data.userId
  const uname    = data.username
  const roleType = data.roleType || 'staff'

  setAuthToken(token)

  return {
    userId,
    username: uname,
    nickName: uname,
    roleType,
    token,
  }
}
