import { defineConfig } from "vite";

export default defineConfig({
  base: "./", // This ensures all assets use relative paths
  server: {
    port: 3000,
  },
  build: {
    outDir: "dist",
    base: "/unknown-pleasures/", // Match your desired path
  },
});
