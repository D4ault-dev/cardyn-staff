import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      // Proxy all API calls through Vite — avoids CORS entirely in dev
      '/tuka': {
        target: 'https://api.cardyn.net',
        changeOrigin: true,
        secure: true,
      },
      '/getInfo': {
        target: 'https://api.cardyn.net',
        changeOrigin: true,
        secure: true,
      },
      '/login': {
        target: 'https://api.cardyn.net',
        changeOrigin: true,
        secure: true,
      },
      '/logout': {
        target: 'https://api.cardyn.net',
        changeOrigin: true,
        secure: true,
      },
      '/common': {
        target: 'https://api.cardyn.net',
        changeOrigin: true,
        secure: true,
      },
      '/files': {
        target: 'https://api.cardyn.net',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: { outDir: 'dist' },
})
