import React, { createContext, useContext, useState, useEffect } from 'react'
import { restoreToken, clearAuthToken } from '../api/client'
import client from '../api/client'
import type { StaffUser } from '../types'

type AuthCtxType = {
  user: StaffUser | null
  setUser: (u: StaffUser | null) => void
  logout: () => void
  loading: boolean
}

// Export the context so useAuth.ts can import it
export const AuthCtx = createContext<AuthCtxType>({} as AuthCtxType)

// Keep useAuth here as well for backwards compat — but the canonical import
// should be from './useAuth' to satisfy Fast Refresh rules
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<StaffUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = restoreToken()
    if (!token) { setLoading(false); return }

    client.get('/getInfo')
      .then(async res => {
        const u = res.data.user
        let roleType = 'staff'
        try {
          const roleRes = await client.get('/tuka/staffAuth/myRole')
          roleType = roleRes.data?.data?.roleType || 'staff'
        } catch {}
        setUser({
          userId:   u.userId,
          username: u.userName,
          nickName: u.nickName || u.userName,
          roleType,
          token,
        })
      })
      .catch(() => clearAuthToken())
      .finally(() => setLoading(false))
  }, [])

  function logout() { clearAuthToken(); setUser(null) }

  return <AuthCtx.Provider value={{ user, setUser, logout, loading }}>{children}</AuthCtx.Provider>
}
