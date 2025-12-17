import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    open: false,
  },
  preview: {
    open: false,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
