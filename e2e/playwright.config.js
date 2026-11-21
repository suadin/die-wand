import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "../test-report/e2e", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:8098",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "python3 -m http.server 8098 --directory site",
    cwd: new URL("..", import.meta.url).pathname,
    url: "http://127.0.0.1:8098/",
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
