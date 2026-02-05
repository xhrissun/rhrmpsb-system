import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  base: '/rhrmpsb-system/',

  build: {
    outDir: 'dist',
    sourcemap: true,          // ← very important right now
    minify: false,            // ← disables minification → often bypasses the crash
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        // Optional: more granular chunks can sometimes break bad init order
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          utils: ['./src/utils/api', './src/utils/constants', './src/utils/helpers'],
        },
      },
    },
  },

  server: {
    port: 5173,
    host: true,
  },
})
