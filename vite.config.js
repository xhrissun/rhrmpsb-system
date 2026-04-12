import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/rhrmpsb-system/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    assetsDir: 'assets',
    rollupOptions: {
      external: [],
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor';
          }
          if (id.includes('pdfjs-dist')) {
            return 'pdfjs';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'lucide';
          }
          if (id.includes('node_modules/jspdf')) {
            return 'jspdf';
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  server: {
    port: 5173,
    host: true,
  },
})
