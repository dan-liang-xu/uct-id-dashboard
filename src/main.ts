import 'maplibre-gl/dist/maplibre-gl.css'
import './assets/tailwind.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
