import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import './styles/index.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
// Set preview-teleported globally so el-image previews are never clipped by parent containers
app.use(ElementPlus, {
  components: {
    ElImage: { previewTeleported: true }
  }
})
app.mount('#app')
