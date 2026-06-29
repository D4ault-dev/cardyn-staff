<template>
  <router-view :key="userStore.userId || 'guest'" />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { getToken } from '@/utils/request'

const router    = useRouter()
const userStore = useUserStore()

async function onAuthLogout() {
  await userStore.Logout()
  router.push('/login')
}

onMounted(() => {
  window.addEventListener('auth:logout', onAuthLogout)

  // Eagerly preload user info if token exists but store is empty.
  // This runs in parallel with the first route render so data is
  // ready the moment the layout mounts — no extra round-trip.
  const token = getToken()
  if (token && !userStore.username) {
    userStore.GetInfo().catch(() => {})
  }
})

onUnmounted(() => window.removeEventListener('auth:logout', onAuthLogout))
</script>
