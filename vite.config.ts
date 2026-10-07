import { defineConfig } from "vite";

// GitHub Pages serves the site from /<repo>/, so every asset path must be relative.
// `base: "./"` makes the build work from any sub-path (and from a local file server).
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
  },
  server: {
    host: true,
  },
});
