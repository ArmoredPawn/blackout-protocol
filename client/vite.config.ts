import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@bp/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)) },
  },
  server: { port: 5173, host: true },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"], r3f: ["@react-three/fiber", "@react-three/drei"] },
      },
    },
  },
});
