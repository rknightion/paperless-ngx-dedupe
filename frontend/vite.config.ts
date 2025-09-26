import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import faroUploader from '@grafana/faro-rollup-plugin';

const apiKey = process.env.FARO_SOURCEMAP_TOKEN;
const isCI = process.env.CI === 'true' || process.env.CI === '1';
if (isCI && !apiKey) {
  throw new Error(
    'FARO_SOURCEMAP_TOKEN is required for Faro sourcemap upload in CI'
  );
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(apiKey
      ? [
          faroUploader({
            appName: 'paperless-dedupe',
            endpoint:
              'https://faro-api-prod-gb-south-1.grafana.net/faro/api/v1',
            appId: '231',
            stackId: '1217581',
            // instructions on how to obtain your API key are in the documentation
            // https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/sourcemap-upload-plugins/#obtain-an-api-key
            apiKey,
            gzipContents: true,
            skipUpload: false,
          }),
        ]
      : []),
  ],
  build: {
    // Required to produce .map files for the Faro uploader
    sourcemap: true,
    // Increase warning threshold; Faro supports up to ~30MB sourcemaps
    chunkSizeWarningLimit: 2000, // in kB
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:30001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:30001',
        ws: true,
      },
      '/health': {
        target: 'http://localhost:30001',
        changeOrigin: true,
      },
      '/docs': {
        target: 'http://localhost:30001',
        changeOrigin: true,
      },
    },
  },
});
