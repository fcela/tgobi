import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";

function inlineFontsPlugin(): Plugin {
  return {
    name: "inline-fonts",
    async writeBundle({ dir }) {
      const cssPath = path.resolve(dir, "tgobi.css");
      if (!fs.existsSync(cssPath)) return;
      let css = fs.readFileSync(cssPath, "utf-8");
      const fontUrlRegex = /url\((\/fonts\/[^")\s]+)\)/g;
      let changed = false;
      css = css.replace(fontUrlRegex, (_match, fontPath) => {
        const fullPath = path.resolve(__dirname, "public", fontPath);
        if (fs.existsSync(fullPath)) {
          changed = true;
          const data = fs.readFileSync(fullPath);
          const base64 = data.toString("base64");
          const ext = path.extname(fullPath).slice(1);
          const mime = ext === "woff2" ? "font/woff2" : ext === "woff" ? "font/woff" : "application/octet-stream";
          return `url("data:${mime};base64,${base64}")`;
        }
        return _match;
      });
      if (changed) {
        fs.writeFileSync(cssPath, css);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), inlineFontsPlugin()],
  publicDir: false,
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "src/index.tsx"),
      name: "Tgobi",
      formats: ["es", "umd"],
      fileName: (format) => (format === "es" ? "tgobi.js" : "tgobi.umd.cjs"),
      cssFileName: "tgobi",
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
        },
      },
    },
  },
});
