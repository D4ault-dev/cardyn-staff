import { createApp } from 'vue'
import { createPinia } from 'pinia'
// Element Plus — on-demand import via auto-import (configured in vite.config)
// Only import the CSS globally; components are tree-shaken at build time
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import './styles/index.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
