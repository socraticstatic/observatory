import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../server/src/public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3099",
      "/sse": { target: "http://localhost:3099", changeOrigin: true },
    },
  },
});
