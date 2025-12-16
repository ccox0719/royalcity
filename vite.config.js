import { defineConfig } from "vite";

export default defineConfig({
  root: "royal-city-v2",
  server: {
    open: false,
  },
  preview: {
    open: false,
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
