import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "src/renderer-settings"),
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, "dist/renderer-settings"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        settings: path.resolve(__dirname, "src/renderer-settings/settings.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        format: "iife",
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer-settings"),
    },
  },
});
