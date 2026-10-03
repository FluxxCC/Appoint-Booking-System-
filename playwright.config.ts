import { defineConfig, devices } from "@playwright/test";

// Dedicated ports ensure Playwright never reuses or writes through the normal
// development app and never talks to the linked development Supabase project.
const baseURL = "http://127.0.0.1:3100";
const supabaseURL = "http://127.0.0.1:54322";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "node scripts/e2e-supabase-stub.mjs", url: `${supabaseURL}/health`, reuseExistingServer: false, timeout: 15_000, env: { E2E_SUPABASE_PORT: "54322" } },
    { command: "npm run dev -- --hostname 127.0.0.1 --port 3100", url: baseURL, reuseExistingServer: false, timeout: 120_000, env: {
      NODE_ENV: "development",
      PLAYWRIGHT_TEST: "1",
      NEXT_PUBLIC_SUPABASE_URL: supabaseURL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-test-publishable-key",
      NEXT_PUBLIC_SITE_URL: baseURL,
      SUPABASE_SECRET_KEY: "e2e-test-server-only-secret",
      // Keep isolated browser tests off the developer's real shared Redis counters.
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      PAYMONGO_SECRET_KEY: "sk_test_e2e-only",
      RESEND_API_KEY: "e2e-only",
      RESEND_FROM_EMAIL: "bookings@example.test",
      E2E_RESEND_URL: `${supabaseURL}/emails`,
    } },
  ],
});
