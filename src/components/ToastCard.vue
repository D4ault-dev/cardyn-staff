<template>
  <transition name="toast-slide">
    <div :class="['toast-card', toast.type]" v-if="visible">
      <div class="toast-body">
        <div class="toast-title">{{ toast.title }}</div>
        <div class="toast-msg">{{ toast.message }}</div>
      </div>
      <div class="toast-actions">
        <button class="toast-btn" @click="$emit('open', toast)">查看</button>
        <button class="toast-close" @click="handleDismiss">×</button>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({ toast: Object })
const emit  = defineEmits(['dismiss', 'open'])
const visible = ref(false)

onMounted(() => { setTimeout(() => { visible.value = true }, 20) })

function handleDismiss() { visible.value = false; setTimeout(() => emit('dismiss', props.toast.id), 300) }
</script>

<style scoped>
.toast-card {
  display: flex; align-items: flex-start; gap: 12px;
  background: #fff; border-radius: 8px; padding: 12px 14px;
  box-shadow: 0 4px 20px rgba(0,0,0,.15);
  border-left: 4px solid #1677ff;
  min-width: 280px; max-width: 360px;
  pointer-events: all;
}
.toast-card.chat       { border-left-color: #52c41a; }
.toast-card.order      { border-left-color: #1677ff; }
.toast-card.withdrawal { border-left-color: #fa8c16; }
.toast-body  { flex: 1; min-width: 0; }
.toast-title { font-size: 13px; font-weight: 700; color: #303133; margin-bottom: 2px; }
.toast-msg   { font-size: 12px; color: #606266; line-height: 1.4; }
.toast-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
.toast-btn   { padding: 3px 10px; border-radius: 4px; background: #1677ff; color: #fff; border: none; font-size: 11px; cursor: pointer; font-weight: 600; }
.toast-close { background: none; border: none; color: #bbb; cursor: pointer; font-size: 18px; line-height: 1; padding: 0; }
.toast-close:hover { color: #666; }
.toast-slide-enter-active, .toast-slide-leave-active { transition: all .3s ease; }
.toast-slide-enter-from, .toast-slide-leave-to { opacity: 0; transform: translateX(20px); }
</style>
