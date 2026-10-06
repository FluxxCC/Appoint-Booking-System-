import { defineConfig, devices } from "@playwright/test";

// Dedicated ports ensure Playwright never reuses or writes through the normal
// development app and never talks to the linked development Supabase project.
const baseURL = "http://127.0.0.1:3100";
const supabaseURL = "http://127.0.0.1:54322";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? "test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "node scripts/e2e-supabase-stub.mjs", url: `${supabaseURL}/health`, reuseExistingServer: false, timeout: 15_000, env: { E2E_SUPABASE_PORT: "54322", E2E_TRACE_HTTP: process.env.E2E_TRACE_HTTP ?? "0", E2E_TRACE_FILE: process.env.E2E_TRACE_FILE ?? "" } },
    { command: "node scripts/e2e-production-server.mjs", url: baseURL, reuseExistingServer: false, timeout: 240_000, env: {
      NODE_ENV: "production",
      PLAYWRIGHT_TEST: "1",
      PLAYWRIGHT_DIST_DIR: process.env.PLAYWRIGHT_DIST_DIR ?? ".next-e2e-production",
      NEXT_PUBLIC_SUPABASE_URL: supabaseURL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-test-publishable-key",
      NEXT_PUBLIC_SITE_URL: baseURL,
      SUPABASE_SECRET_KEY: "e2e-test-server-only-secret",
      // Production-mode requests use only the local test Redis adapter.
      UPSTASH_REDIS_REST_URL: `${supabaseURL}/redis`,
      UPSTASH_REDIS_REST_TOKEN: "e2e-only",
      PAYMONGO_SECRET_KEY: "sk_test_e2e-only",
      PAYMONGO_TEST_MODE_ENABLED: "true",
      RESEND_API_KEY: "e2e-only",
      RESEND_FROM_EMAIL: "bookings@example.test",
      E2E_RESEND_URL: `${supabaseURL}/emails`,
    } },
  ],
});
