import { defineConfig, devices } from "@playwright/test";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://feedme_test:feedme_test_only@127.0.0.1:5433/feedme_test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node --import tsx server/index.ts",
      url: "http://127.0.0.1:3002/api/health",
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        NODE_ENV: "test",
        PORT: "3002",
        JWT_SECRET: "test-only-secret",
        WEB_ORIGIN: "http://127.0.0.1:5174",
        APP_URL: "http://127.0.0.1:5174",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5174",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...process.env,
        VITE_API_PROXY_TARGET: "http://127.0.0.1:3002",
      },
    },
  ],
});
