import { defineStore } from 'pinia'
import { login, getInfo, logout } from '@/api/auth'
import { setToken, removeToken, getToken, clearCache } from '@/utils/request'
import Cookies from 'js-cookie'

const ROLE_KEY = 'staff_role'

export const useUserStore = defineStore('user', {
  state: () => ({
    token:    getToken() || '',
    userId:   '',
    username: '',
    nickName: '',
    avatar:   '',
    // Restore roleType from cookie on page refresh — avoids losing it
    roleType: Cookies.get(ROLE_KEY) || '',
    roles:    [],
    permissions: [],
  }),
  actions: {
    async Login(username, password) {
      const res = await login(username, password)
      // staffAuth/login returns { code:200, data: { token, userId, username, roleType } }
      const data = res.data || res
      const token = data.token
      if (!token) throw new Error('Login failed — no token returned')
      setToken(token)
      this.token    = token
      // Save roleType immediately from login response + persist in cookie
      if (data.roleType) {
        this.roleType = data.roleType
        Cookies.set(ROLE_KEY, data.roleType, { expires: 7 })
      }
    },

    async GetInfo() {
      const res = await getInfo()
      const user = res.user || res
      this.userId   = user.userId
      this.username = user.userName
      this.nickName = user.nickName || user.userName
      this.avatar   = user.avatar || ''
      this.roles    = res.roles || []
      this.permissions = res.permissions || []
      // roleType comes from getInfo now (we added it to the backend)
      // Fall back to cookie if backend doesn't return it yet
      const roleType = res.roleType || user.roleType || Cookies.get(ROLE_KEY) || ''
      this.roleType = roleType
      if (roleType) Cookies.set(ROLE_KEY, roleType, { expires: 7 })
      return res
    },

    async Logout() {
      try { await logout() } catch {}
      removeToken()
      Cookies.remove(ROLE_KEY)
      // Clear ALL cached API responses to prevent stale data on next login
      clearCache()
      // Reset ALL state — must clear username/nickName/avatar/userId so the
      // router guard's `if (!userStore.username)` triggers GetInfo() on next login
      this.token       = ''
      this.userId      = ''
      this.username    = ''
      this.nickName    = ''
      this.avatar      = ''
      this.roleType    = ''
      this.roles       = []
      this.permissions = []
    }
  }
})
