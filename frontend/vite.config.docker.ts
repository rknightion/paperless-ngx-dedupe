import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Docker development configuration
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Listen on all interfaces
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://paperless-dedupe:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: (
          process.env.VITE_API_URL || 'http://paperless-dedupe:8000'
        ).replace('http', 'ws'),
        ws: true,
      },
      '/health': {
        target: process.env.VITE_API_URL || 'http://paperless-dedupe:8000',
        changeOrigin: true,
      },
      '/docs': {
        target: process.env.VITE_API_URL || 'http://paperless-dedupe:8000',
        changeOrigin: true,
      },
    },
  },
});
