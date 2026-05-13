// Separate file for useAuth hook — required for Vite Fast Refresh compatibility.
// AuthContext.tsx cannot export both a component (AuthProvider) and a hook (useAuth)
// from the same file without breaking HMR.
import { useContext } from 'react'
import { AuthCtx } from './AuthContext'

export const useAuth = () => useContext(AuthCtx)
