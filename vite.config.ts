import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("regl")) return "vendor-regl";
            if (id.includes("react-dom")) return "vendor-react";
            if (id.includes("ml-") || id.includes("density-clustering") || id.includes("random-js"))
              return "vendor-ml";
          }
        },
      },
    },
  },
});
