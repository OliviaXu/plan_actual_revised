import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      preserveEntrySignatures: "strict",
      input: {
        index: path.resolve(__dirname, "index.html"),
        "background/service-worker": path.resolve(
          __dirname,
          "src/background/service-worker.ts",
        ),
        "background/register-service-worker": path.resolve(
          __dirname,
          "src/background/register-service-worker.ts",
        ),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
