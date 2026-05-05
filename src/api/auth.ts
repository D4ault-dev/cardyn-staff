import client, { setAuthToken } from './client'
import type { StaffUser } from '../types'

export type { StaffUser }

export async function login(username: string, password: string): Promise<StaffUser> {
  const res = await client.post('/login', { username, password })
  const token = res.data.token
  setAuthToken(token)

  // Get user info
  const info = await client.get('/getInfo')
  const u = info.data.user

  // Get own role — works for any staff account, no admin permission needed
  let roleType = 'staff'
  try {
    const roleRes = await client.get('/tuka/staffAuth/myRole')
    roleType = roleRes.data?.data?.roleType || 'staff'
  } catch {}

  return {
    userId:   u.userId,
    username: u.userName,
    nickName: u.nickName || u.userName,
    roleType,
    token,
  }
}
