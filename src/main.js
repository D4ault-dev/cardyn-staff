import { createApp } from 'vue'
import { createPinia } from 'pinia'
// Do NOT import all of ElementPlus here — tree-shaking via unplugin-vue-components
// handles auto-importing only the components actually used. Full import adds ~600KB.
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router/index.js'
import './styles/index.css'
import { registerServiceWorker } from './utils/sw-register'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// Register service worker for offline support
registerServiceWorker()
