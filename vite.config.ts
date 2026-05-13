import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Shared proxy options — secure:false avoids hard TLS failures on flaky connections
const proxyTarget = {
  target:      'https://api.cardyn.net',
  changeOrigin: true,
  secure:       false,   // don't reject on TLS cert issues in dev
  proxyTimeout: 15000,   // 15s before giving up (default is 60s, too long)
  timeout:      15000,
}

// WebSocket proxy — needs ws:true and long timeout
const wsProxyTarget = {
  target:      'https://api.cardyn.net',
  changeOrigin: true,
  secure:       false,
  ws:           true,    // enable WebSocket proxying
  proxyTimeout: 3600000, // 1 hour — keep WS alive
  timeout:      3600000,
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
  build: { outDir: 'dist' },
})
