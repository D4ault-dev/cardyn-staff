import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Shared proxy options
const proxyTarget = {
  target:       'https://api.cardyn.net',
  changeOrigin: true,
  secure:       false,
  proxyTimeout: 20000,
  timeout:      20000,
  configure: (proxy: any) => {
    proxy.on('error', (err: any) => {
      // Suppress noisy TLS disconnect errors in dev — they're network blips, not bugs
      if (err.code === 'ECONNRESET' || err.message?.includes('EPIPE') ||
          err.message?.includes('TLS') || err.message?.includes('socket')) return
      console.error('[proxy error]', err.message)
    })
  },
}

const wsProxyTarget = {
  target:       'https://api.cardyn.net',
  changeOrigin: true,
  secure:       false,
  ws:           true,
  proxyTimeout: 3600000,
  timeout:      3600000,
  configure: (proxy: any) => {
    proxy.on('error', () => {}) // suppress WS errors — reconnects automatically
  },
}

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/ws':      wsProxyTarget,
      '/tuka':    proxyTarget,
      '/getInfo': proxyTarget,
      '/login':   proxyTarget,
      '/logout':  proxyTarget,
      '/common':  proxyTarget,
      '/files':   proxyTarget,
    },
  },
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        }
      }
    }
  },
})
