import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

const TUNNEL_HOSTS = [".trycloudflare.com"];

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    allowedHosts: TUNNEL_HOSTS,
    proxy: {
      "/api": "http://127.0.0.1:7071",
      "/events": { target: "http://127.0.0.1:8080", changeOrigin: true },
      "/blob": {
        target: "http://127.0.0.1:10000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/blob/, ""),
      },
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
    allowedHosts: TUNNEL_HOSTS,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: [...configDefaults.exclude, "e2e/**"],
    testTimeout: 15000,
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
