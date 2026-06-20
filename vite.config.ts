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
      '/profile': proxyTarget,
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          // Core React — always loaded first
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('react-router')) return 'vendor'
          // Each screen in its own chunk — only downloaded when navigated to
          if (id.includes('src/screens/ChatScreen'))        return 'screen-chat'
          if (id.includes('src/screens/OrdersScreen'))      return 'screen-orders'
          if (id.includes('src/screens/WithdrawalsScreen')) return 'screen-withdrawals'
          if (id.includes('src/screens/UsersScreen'))       return 'screen-users'
          // Axios and other heavy libs
          if (id.includes('node_modules/axios'))            return 'axios'
        }
      }
    }
  },
})
