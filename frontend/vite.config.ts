import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:30001",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:30001",
        ws: true,
      },
      "/health": {
        target: "http://localhost:30001",
        changeOrigin: true,
      },
      "/docs": {
        target: "http://localhost:30001",
        changeOrigin: true,
      },
    },
  },
});
