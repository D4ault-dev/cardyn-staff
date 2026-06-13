import { useEffect } from 'react'
import { sendHeartbeat } from '../api/staff'
import { useAuth } from '../context/AuthContext'

// Pings every 45s while the app is open to mark this staff as online
export function useHeartbeat() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    sendHeartbeat() // immediate on login
    const t = setInterval(sendHeartbeat, 30_000)  // every 30s — appears online within 90s window
    return () => clearInterval(t)
  }, [user])
}
