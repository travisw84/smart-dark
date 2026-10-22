import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.mjs",
  workers: 1,
  webServer: {
    command: "node scripts/preview.mjs",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: !process.env.CI,
  },
  timeout: 30000,
  reporter: "list",
  use: { trace: "retain-on-failure" },
});
