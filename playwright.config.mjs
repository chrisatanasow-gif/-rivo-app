import { defineConfig, devices } from "@playwright/test";

const remoteBase = process.env.RIVO_E2E_BASE_URL;
if (remoteBase && !process.env.RIVO_PILOT_CODE) throw new Error("RIVO_PILOT_CODE is required when testing an explicitly configured pilot server.");

export default defineConfig({
  testDir: "./tests/browser", fullyParallel: false, workers: 1,
  timeout: 45000, expect: { timeout: 12000 },
  use: { baseURL: remoteBase || "http://127.0.0.1:4178", ...devices["iPhone 13"], browserName: "chromium", trace: "off" },
  webServer: remoteBase ? undefined : { command: "node scripts/pilot-test-server.mjs", url: "http://127.0.0.1:4178/pilot", reuseExistingServer: false, timeout: 30000 }
});
