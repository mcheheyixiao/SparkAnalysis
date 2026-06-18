import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    // NOTE: Vite's http-proxy may mangle Content-Length for large request bodies
    // (e.g. prompt template updates with Chinese text), causing FST_ERR_CTP_INVALID_CONTENT_LENGTH.
    // Workaround: set VITE_API_BASE_URL=http://localhost:3001/api to bypass the proxy.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Allow larger body sizes for prompt templates
        ws: false,
      },
    },
  },
})
