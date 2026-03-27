import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import faroUploader from '@grafana/faro-rollup-plugin';
import { defineConfig } from 'vite';

const faroApiKey = process.env.FARO_SOURCEMAP_API_KEY;

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    ...(faroApiKey
      ? [
          faroUploader({
            appName: 'paperless-dedupe',
            endpoint: 'https://faro-api-prod-gb-south-1.grafana.net/faro/api/v1',
            appId: '623',
            stackId: '1217581',
            verbose: true,
            apiKey: faroApiKey,
            gzipContents: true,
          }),
        ]
      : []),
  ],
  build: {
    sourcemap: !!faroApiKey,
  },
});
