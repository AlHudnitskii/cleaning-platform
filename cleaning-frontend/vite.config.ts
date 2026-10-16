import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    proxy: {
      "/api": "http://127.0.0.1:7071",
      "/events": { target: "http://127.0.0.1:8080", changeOrigin: true },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "vendor", test: /node_modules/, priority: 20 },
            { name: "shared", minShareCount: 2, priority: 10 },
          ],
        },
      },
    },
  },
  preview: {
    port: 3000,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 15000,
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
