import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import router from './router'
import App from './App.vue'
import './styles/global.css'
import '@/plugins/gsap'              // GSAP + ScrollTrigger one-time registration
import '@/styles/animations.css'     // Animation CSS variables + initial states

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(naive)

app.mount('#app')
