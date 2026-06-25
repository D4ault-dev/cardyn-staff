<template>
  <div class="online-bar">
    <div class="ob-section">
      <span class="ob-label">
        <span class="ob-dot online" />
        Online ({{ online.length }})
      </span>
      <div class="ob-avatars">
        <el-tooltip v-for="s in online" :key="s.id" :content="`${s.name} · ${s.roleType}`" placement="bottom">
          <div class="ob-avatar" :style="{ background: nameColor(s.name) }">
            <img v-if="s.avatar" :src="s.avatar" />
            <span v-else>{{ s.name[0]?.toUpperCase() }}</span>
          </div>
        </el-tooltip>
        <span v-if="!online.length" style="font-size:12px;color:#bbb">No one online</span>
      </div>
    </div>
    <div v-if="offline.length" class="ob-divider" />
    <div v-if="offline.length" class="ob-section">
      <span class="ob-label">
        <span class="ob-dot offline" />
        Offline ({{ offline.length }})
      </span>
      <div class="ob-avatars">
        <el-tooltip v-for="s in offline.slice(0,5)" :key="s.id" :content="s.name" placement="bottom">
          <div class="ob-avatar offline" :style="{ background: '#334155' }">
            <span>{{ s.name[0]?.toUpperCase() }}</span>
          </div>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import request from '@/utils/request'

const staff = ref([])
const online  = computed(() => staff.value.filter(s => s.isOnline))
const offline = computed(() => staff.value.filter(s => !s.isOnline))

async function refresh() {
  try {
    const res = await request({ url: '/tuka/staff/online' })
    staff.value = res.data || []
  } catch {}
}

const colors = ['#16a34a','#2563eb','#9333ea','#ea580c','#0891b2','#be185d']
function nameColor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}

let timer
onMounted(() => { refresh(); timer = setInterval(refresh, 60_000) })
onUnmounted(() => clearInterval(timer))
</script>
