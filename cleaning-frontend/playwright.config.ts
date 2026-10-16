import { defineConfig } from "@playwright/test";

const PORT = 3100;
const EXTERNAL_URL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: EXTERNAL_URL ?? `http://localhost:${String(PORT)}`,
    channel: "chrome",
    locale: "en-GB",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  webServer: EXTERNAL_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${String(PORT)} --strictPort`,
        url: `http://localhost:${String(PORT)}`,
        reuseExistingServer: true,
      },
});
