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
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia'],
        resolvers: [ElementPlusResolver()],
        dts: false,
      }),
      Components({
        resolvers: [ElementPlusResolver({ importStyle: false })],
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
        // API endpoints — need Origin header to pass nginx CORS check
        '/tuka':    makeProxy(),
        '/getInfo': makeProxy(),
        '/common':  makeProxy(),
        '/logout':  makeProxy(),
        // Static file endpoints — images, uploads
        // /profile/** is permitAll on backend — no auth token needed.
        // Just set Origin header to pass nginx CORS check.
        '/profile': makeProxy(true),
        '/files':   makeProxy(true),
        '/upload':  makeProxy(true),
      },
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1500,
    },
  }
})
