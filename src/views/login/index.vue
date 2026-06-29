<template>
  <div class="login-page">
    <!-- Frameless title bar with window controls -->
    <div class="login-titlebar" data-tauri-drag-region>
      <div style="display:flex;align-items:center;gap:8px;-webkit-app-region:no-drag">
        <div style="width:18px;height:18px;border-radius:5px;background:linear-gradient(135deg,#1677ff,#00C2B4);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#fff">C</div>
        <span style="font-size:12px;font-weight:600;color:#606266">Cardyn Staff</span>
      </div>
      <div style="-webkit-app-region:no-drag;display:flex;gap:0;margin-left:auto">
        <button class="win-btn-sm" @click="winMinimize">─</button>
        <button class="win-btn-sm" @click="winMaximize">□</button>
        <button class="win-btn-sm win-close-sm" @click="winClose">✕</button>
      </div>
    </div>
    <div class="login-body">
    <div class="login-card">
      <div class="login-logo">
        <div class="login-logo-icon">C</div>
        <span class="login-logo-name">Cardyn 员工系统</span>
      </div>
      <p class="login-sub">登录员工账号</p>

      <el-form class="login-form" @submit.prevent="handleLogin">
        <el-input
          v-model="form.username"
          placeholder="用户名"
          size="large"
          :prefix-icon="User"
          autofocus
          @keyup.enter="handleLogin"
        />
        <el-input
          v-model="form.password"
          type="password"
          placeholder="密码"
          size="large"
          :prefix-icon="Lock"
          show-password
          @keyup.enter="handleLogin"
        />
        <div v-if="error" class="login-error">{{ error }}</div>
        <el-button
          class="login-btn"
          type="primary"
          size="large"
          :loading="loading"
          @click="handleLogin"
        >
          登录
        </el-button>
      </el-form>
    </div>  <!-- login-card -->
    </div>  <!-- login-body -->
  </div>   <!-- login-page -->
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { User, Lock } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'

const router    = useRouter()
const route     = useRoute()
const userStore = useUserStore()

const form    = ref({ username: '', password: '' })
const loading = ref(false)
const error   = ref('')

async function handleLogin() {
  if (!form.value.username || !form.value.password) {
    error.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  error.value   = ''
  try {
    await userStore.Login(form.value.username, form.value.password)
    // Fetch user info immediately after login to populate nickName/username
    await userStore.GetInfo()
    const redirect = route.query.redirect || '/'
    router.push(redirect)
  } catch (e) {
    error.value = e.message || '登录失败，请检查您的凭据。'
  } finally {
    loading.value = false
  }
}

function winMinimize() { window.__TAURI__?.window?.getCurrentWindow?.()?.minimize?.() }
function winMaximize() { window.__TAURI__?.window?.getCurrentWindow?.()?.toggleMaximize?.() }
function winClose()    { window.__TAURI__?.window?.getCurrentWindow?.()?.close?.() }
</script>

<style scoped>
.login-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f0f2f5;
}
.login-titlebar {
  height: 38px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  padding: 0 12px;
  -webkit-app-region: drag;
  flex-shrink: 0;
}
.win-btn-sm {
  width: 36px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #909399;
  cursor: pointer;
  font-size: 13px;
  transition: background .12s;
  -webkit-app-region: no-drag;
}
.win-btn-sm:hover { background: rgba(0,0,0,.07); color: #303133; }
.win-close-sm:hover { background: #e81123 !important; color: #fff !important; }

/* Center the login card in remaining space */
.login-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

:deep(.login-card) {
  width: 400px;
  background: #fff;
  border-radius: 12px;
  padding: 40px 36px;
  box-shadow: 0 4px 24px rgba(0,0,0,.08);
  border: 1px solid #e4e7ed;
}
:deep(.login-logo) {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
:deep(.login-logo-icon) {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #1677ff, #00C2B4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 900;
  color: #fff;
}
:deep(.login-logo-name) {
  font-size: 18px;
  font-weight: 800;
  color: #303133;
}
:deep(.login-sub) {
  font-size: 12px;
  color: #909399;
  margin-bottom: 24px;
}
:deep(.login-form) { display: flex; flex-direction: column; gap: 12px; }
:deep(.login-btn)  { width: 100%; }
:deep(.login-error) { color: #f56c6c; font-size: 12px; text-align: center; }
</style>
