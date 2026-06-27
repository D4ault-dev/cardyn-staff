<template>
  <!-- Skeleton shown until image loads or enters viewport -->
  <div class="lazy-img-wrap" :style="wrapStyle" ref="root">
    <!-- Skeleton pulse -->
    <div v-if="state === 'idle' || state === 'loading'" class="lazy-img-skeleton" />

    <!-- Actual image — only rendered once element is near viewport -->
    <el-image
      v-if="state !== 'idle'"
      :src="src"
      :fit="fit"
      :style="imgStyle"
      :preview-src-list="previewList"
      :preview-teleported="true"
      lazy
      @load="state = 'loaded'"
      @error="state = 'error'"
    >
      <template #error>
        <div class="lazy-img-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </div>
      </template>
    </el-image>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  src:     { type: String, default: '' },
  width:   { type: [String, Number], default: '100%' },
  height:  { type: [String, Number], default: 'auto' },
  fit:     { type: String, default: 'cover' },
  preview: { type: Boolean, default: false },
  // Extra margin around viewport — start loading N px before entering view
  rootMargin: { type: String, default: '200px' },
})

// 'idle' → not yet in viewport, 'loading' → in viewport img request started, 'loaded' / 'error'
const state = ref('idle')
const root  = ref(null)

const wrapStyle = computed(() => ({
  width:    typeof props.width  === 'number' ? props.width  + 'px' : props.width,
  height:   typeof props.height === 'number' ? props.height + 'px' : props.height,
  position: 'relative',
  overflow: 'hidden',
  display:  'inline-block',
  flexShrink: 0,
}))

const imgStyle = computed(() => ({
  width:  '100%',
  height: '100%',
  display: state.value === 'loaded' ? 'block' : 'none',
}))

const previewList = computed(() => props.preview && props.src ? [props.src] : [])

let observer = null

onMounted(() => {
  if (!props.src) { state.value = 'error'; return }

  // IntersectionObserver — triggers load only when image is near viewport
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        state.value = 'loading'
        observer?.disconnect()
        observer = null
      }
    },
    { rootMargin: props.rootMargin }
  )
  if (root.value) observer.observe(root.value)
})

onUnmounted(() => { observer?.disconnect(); observer = null })
</script>

<style scoped>
.lazy-img-wrap { background: #f5f5f5; border-radius: inherit; }

.lazy-img-skeleton {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: inherit;
}
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.lazy-img-error {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  color: #ccc; background: #f5f5f5;
}
</style>
