import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '@/utils/request'
import { useUserStore } from '@/stores/user'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

NProgress.configure({ showSpinner: false })

// Static routes always available
const routes = [
  {
    path: '/login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: 'Sign In', public: true }
  },
  {
    path: '/',
    component: () => import('@/layout/index.vue'),
    redirect: '/orders',
    children: [
      {
        path: 'orders',
        component: () => import('@/views/orders/index.vue'),
        meta: { title: 'Orders', icon: 'orders' }
      },
      {
        path: 'chat',
        component: () => import('@/views/chat/index.vue'),
        meta: { title: 'Live Chat', icon: 'chat' }
      },
      {
        path: 'withdrawals',
        component: () => import('@/views/withdrawals/index.vue'),
        meta: { title: 'Withdrawals', icon: 'withdraw' }
      },
      {
        path: 'users',
        component: () => import('@/views/users/index.vue'),
        meta: { title: 'Users', icon: 'users' }
      },
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/orders' }
]

const router = createRouter({
  history: createWebHistory('/'),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

// Navigation guard
router.beforeEach(async (to, from, next) => {
  NProgress.start()
  const token = getToken()

  if (to.meta.public) {
    if (token && to.path === '/login') { next('/'); NProgress.done(); return }
    next(); return
  }

  if (!token) {
    next(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
    NProgress.done(); return
  }

  const userStore = useUserStore()
  if (!userStore.username) {
    try {
      await userStore.GetInfo()
      next()
    } catch {
      await userStore.Logout()
      next('/login')
    }
  } else {
    next()
  }
})

router.afterEach(() => NProgress.done())

export default router
