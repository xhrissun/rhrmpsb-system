import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/rhrmpsb-system/', // Replace 'rater-system' with your GitHub repository name
  build: {
    outDir: 'dist',
    sourcemap: false,
    assetsDir: 'assets'
  },
  server: {
    port: 5173,
    host: true
  }
})