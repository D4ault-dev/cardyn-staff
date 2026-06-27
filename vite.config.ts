import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST

// All API proxy entries — forwarded with admin.cardyn.net as Origin to satisfy nginx CORS
const proxyTarget = 'https://api.cardyn.net'
const proxyHeaders = {
  'Origin':  'https://admin.cardyn.net',
  'Referer': 'https://admin.cardyn.net/',
}

function makeProxy(headers = true) {
  return {
    target: proxyTarget,
    changeOrigin: true,
    secure: true,
    ...(headers ? { headers: proxyHeaders } : {}),
  }
}

export default defineConfig(async () => {
  const { default: AutoImport }  = await import('unplugin-auto-import/vite')
  const { default: Components }  = await import('unplugin-vue-components/vite')
  const { ElementPlusResolver }  = await import('unplugin-vue-components/resolvers')

  return {
    plugins: [
      vue(),
      // Auto-import Vue/Pinia composables — no manual imports needed
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia'],
        resolvers: [ElementPlusResolver()],
        dts: false,
      }),
      // Auto-import ElementPlus components on-demand — tree-shakes unused components
      Components({
        resolvers: [ElementPlusResolver({ importStyle: 'css' })],
        dts: false,
      }),
    ],
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
    clearScreen: false,
    base: './',
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
      watch: { ignored: ['**/src-tauri/**'] },
      proxy: {
        '/tuka':    makeProxy(),
        '/getInfo': makeProxy(),
        '/common':  makeProxy(),
        '/logout':  makeProxy(),
        '/profile': makeProxy(true),
        '/files':   makeProxy(true),
        '/upload':  makeProxy(true),
      },
    },
    build: {
      outDir: 'dist',
      // Tauri apps run on localhost — can use modern targets safely
      target: ['es2021', 'chrome100', 'safari15'],
      minify: 'esbuild',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        external: [],
        output: {
          // Split chunks so the browser (WebView2/WebKit) can cache each piece independently.
          // Vue core, Element Plus, and app code load in parallel and are cached separately.
          manualChunks(id) {
            // Element Plus — large, changes rarely
            if (id.includes('element-plus')) return 'element-plus'
            // Vue ecosystem — vue, vue-router, pinia
            if (id.includes('node_modules/vue') || id.includes('node_modules/@vue') ||
                id.includes('node_modules/vue-router') || id.includes('node_modules/pinia')) {
              return 'vue-vendor'
            }
            // Other node_modules
            if (id.includes('node_modules')) return 'vendor'
          },
        },
      },
    },
    // Optimise deps so Vite pre-bundles them — faster cold start in dev
    optimizeDeps: {
      include: ['vue', 'vue-router', 'pinia', 'axios', 'element-plus', 'js-cookie', 'nprogress'],
    },
  }
})
