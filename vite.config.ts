import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 12000,
    allowedHosts: true,
    proxy: {
      // Forward API calls to the backend so cookies stay first-party.
      '/api': {
        target: 'http://127.0.0.1:12001',
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 12000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:12001',
        changeOrigin: false,
      },
    },
  },
})
