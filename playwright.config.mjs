import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser", fullyParallel: false, workers: 1,
  timeout: 45000, expect: { timeout: 12000 },
  use: { baseURL: "http://127.0.0.1:4178", ...devices["iPhone 13"], browserName: "chromium", trace: "off" },
  webServer: { command: "node scripts/pilot-test-server.mjs", url: "http://127.0.0.1:4178/pilot", reuseExistingServer: false, timeout: 30000 }
});
