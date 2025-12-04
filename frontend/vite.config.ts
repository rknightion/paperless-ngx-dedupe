import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import faroUploader from '@grafana/faro-rollup-plugin';

const apiKey = process.env.FARO_SOURCEMAP_TOKEN;
const faroSourcemapEndpoint = process.env.FARO_SOURCEMAP_ENDPOINT;
const faroSourcemapAppName =
  process.env.FARO_SOURCEMAP_APP_NAME || 'paperless-dedupe';
const faroSourcemapAppId = process.env.FARO_SOURCEMAP_APP_ID;
const faroSourcemapStackId = process.env.FARO_SOURCEMAP_STACK_ID;
const sourcemapUploadEnabled =
  (process.env.FARO_SOURCEMAP_UPLOAD || '').toLowerCase() === 'true';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(apiKey &&
    sourcemapUploadEnabled &&
    faroSourcemapEndpoint &&
    faroSourcemapAppId &&
    faroSourcemapStackId
      ? [
          faroUploader({
            appName: faroSourcemapAppName,
            endpoint: faroSourcemapEndpoint,
            appId: faroSourcemapAppId,
            stackId: faroSourcemapStackId,
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
