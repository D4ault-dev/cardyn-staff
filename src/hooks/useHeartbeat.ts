import { useEffect } from 'react'
import { sendHeartbeat } from '../api/staff'
import { useAuth } from '../context/AuthContext'

// Pings every 45s while the app is open to mark this staff as online
export function useHeartbeat() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    sendHeartbeat() // immediate on login
    const t = setInterval(sendHeartbeat, 45_000)
    return () => clearInterval(t)
  }, [user])
}
