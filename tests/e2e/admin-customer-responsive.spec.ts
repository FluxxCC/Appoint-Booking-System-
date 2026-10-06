import { expect, test, type Page } from "./fixtures";

const stub = "http://127.0.0.1:54322";

async function signIn(page: Page, email: string, password: string, path: string) {
  await page.goto(path);
  await page.getByLabel("Account email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

test("forensic admin customer directory responsive route uses the stubbed RPC", async ({ browser, request }) => {
  test.setTimeout(60_000);
  await request.put(`${stub}/__e2e/state`, { data: { reset: true } });
  for (const actor of [
    { email: "owner@example.test", password: "e2e-owner-passphrase", login: "/owner/login" },
    { email: "admin@example.test", password: "e2e-admin-passphrase", login: "/admin/login" },
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, actor.email, actor.password, actor.login);
    for (const width of [1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/admin/customers");
      await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
      await expect(page.getByText("Customer records could not be loaded.")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    }
    await context.close();
  }
});
