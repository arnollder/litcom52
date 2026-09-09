import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import moyskladApiPlugin from './vite-plugin-moysklad-api.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), moyskladApiPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router')) {
              return 'vendor-vue'
            }
          }
          if (id.includes('/src/views/AdminView.vue') || id.includes('/src/components/Admin')) {
            return 'admin'
          }
        },
      },
    },
  },
})
