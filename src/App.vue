<template>
  <router-view />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router    = useRouter()
const userStore = useUserStore()

async function onAuthLogout() {
  await userStore.Logout()
  router.push('/login')
}

onMounted(()  => window.addEventListener('auth:logout', onAuthLogout))
onUnmounted(() => window.removeEventListener('auth:logout', onAuthLogout))
</script>
