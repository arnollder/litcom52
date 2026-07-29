import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import moyskladApiPlugin from './vite-plugin-moysklad-api.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), moyskladApiPlugin()],
})
