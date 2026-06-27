<template>
  <div class="lazy-img-wrap" :style="wrapStyle" ref="root">
    <!-- Shimmer skeleton while waiting for viewport or while loading -->
    <div v-if="state !== 'loaded' && state !== 'error'" class="lazy-img-skeleton" />

    <!-- Rendered as soon as element is near viewport (state = loading | loaded | error) -->
    <el-image
      v-if="state !== 'idle'"
      :src="src"
      :fit="fit"
      :class="['lazy-inner', state === 'loaded' ? 'lazy-visible' : 'lazy-hidden']"
      :preview-src-list="previewList"
      :preview-teleported="true"
      @load="state = 'loaded'"
      @error="state = 'error'"
    >
      <template #error>
        <div class="lazy-img-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16">
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
  src:        { type: String,           default: '' },
  width:      { type: [String, Number], default: '100%' },
  height:     { type: [String, Number], default: 'auto' },
  fit:        { type: String,           default: 'cover' },
  preview:    { type: Boolean,          default: false },
  // rootMargin — how far outside the viewport to start loading.
  // Use a large value (e.g. '600px') so images start fetching well before scroll.
  rootMargin: { type: String,           default: '300px' },
})

// idle → not yet in/near viewport | loading → fetch started | loaded | error
const state = ref('idle')
const root  = ref(null)

const wrapStyle = computed(() => ({
  width:      typeof props.width  === 'number' ? props.width  + 'px' : props.width,
  height:     typeof props.height === 'number' ? props.height + 'px' : props.height,
  position:   'relative',
  overflow:   'hidden',
  display:    'inline-flex',
  flexShrink: 0,
}))

const previewList = computed(() => props.preview && props.src ? [props.src] : [])

let observer = null

onMounted(() => {
  if (!props.src) { state.value = 'error'; return }

  // If already in viewport on mount (e.g. table cell), start immediately
  const el = root.value
  if (!el) { state.value = 'loading'; return }

  const rect = el.getBoundingClientRect()
  const inView = rect.top < window.innerHeight + 600 && rect.bottom > -600
  if (inView) { state.value = 'loading'; return }

  // Otherwise watch with IntersectionObserver
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
  observer.observe(el)
})

onUnmounted(() => { observer?.disconnect(); observer = null })
</script>

<style scoped>
.lazy-img-wrap  { background: #f0f0f0; border-radius: inherit; }

.lazy-inner     { width: 100%; height: 100%; }
.lazy-visible   { opacity: 1; transition: opacity .2s ease; }
.lazy-hidden    { opacity: 0; }

.lazy-img-skeleton {
  position: absolute; inset: 0; z-index: 1;
  background: linear-gradient(90deg, #f0f0f0 25%, #e4e4e4 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite linear;
  border-radius: inherit;
  pointer-events: none;
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
