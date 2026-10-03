import { expect, test } from "@playwright/test";

test("public journey keeps imagery and navigation usable across viewports", async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
  await request.put("http://127.0.0.1:54322/__e2e/state", { data: { reset: true, approvalMode: "ADMIN_APPROVAL" } });
  for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/services", "/book?service=consultation"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(1);
    }
    await page.goto("/");
    const hero = page.locator("main section img").first();
    await expect(hero).toBeVisible();
    await expect.poll(() => hero.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: testInfo.outputPath(`home-${width}-viewport.png`), caret: "initial" });
      await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true, caret: "initial" });
    }
    if (width === 390) {
      await page.goto("/services");
      await expect(page.getByRole("heading", { name: "Find what feels right." })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("services-mobile.png"), fullPage: true, caret: "initial" });
      await page.goto("/book?service=consultation");
      await expect(page.getByRole("heading", { name: "Let’s plan your visit." })).toBeVisible();
      const serviceImage = page.locator("main label img").first();
      await expect.poll(() => serviceImage.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("booking-mobile.png"), fullPage: true, caret: "initial" });
      await page.goto("/login");
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("login-mobile.png"), fullPage: true, caret: "initial" });
    }
  }
  await page.setViewportSize({ width: 320, height: 800 });
  for (const route of ["/about", "/contact", "/team", "/services/consultation", "/login", "/register"]) {
    await page.goto(route);
    await expect(page.locator("main h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${route} at 320px`).toBeLessThanOrEqual(1);
  }
});

test("management views remain navigable on a narrow screen", async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
  await request.put("http://127.0.0.1:54322/__e2e/state", { data: { reset: true } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("Email address").fill("owner@example.test");
  await page.locator('input[name="password"]').fill("e2e-owner-passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  for (const width of [320, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [route, heading] of [["/admin", "E2E Test Studio overview"], ["/admin/appointments", "Appointments"], ["/admin/calendar", "Calendar"], ["/admin/services", "Services"], ["/admin/staff", "Staff"], ["/admin/settings", "Business settings"], ["/admin/access", "Administrator access"], ["/admin/staff/accounts", "Staff login access"]]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: heading, exact: true, level: 1 })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "admin quick navigation" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(1);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "E2E Test Studio overview", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("owner-mobile.png"), fullPage: true, caret: "initial" });
  await page.goto("/admin/appointments");
  await expect(page.getByRole("heading", { name: "Appointments", exact: true, level: 1 })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("owner-appointments-mobile.png"), fullPage: true, caret: "initial" });
  await page.goto("/admin/access");
  await expect(page.getByRole("heading", { name: "Administrator access", level: 1 })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("owner-access-mobile.png"), fullPage: true, caret: "initial" });
  await page.goto("/admin/staff/accounts");
  await expect(page.getByRole("heading", { name: "Staff login access", level: 1 })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("staff-login-access-mobile.png"), fullPage: true, caret: "initial" });
});

test("staff and customer pages stay usable on phones", async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
  await request.put("http://127.0.0.1:54322/__e2e/state", { data: { reset: true } });
  await page.setViewportSize({ width: 390, height: 844 });
  async function signIn(email: string, password: string) {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  }
  await signIn("staff@example.test", "e2e-staff-passphrase");
  for (const width of [320, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ["/staff", "/staff/calendar", "/staff/appointments", "/staff/availability"]) {
      await page.goto(route);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.getByRole("navigation", { name: "staff quick navigation" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${route} at ${width}px`).toBeLessThanOrEqual(1);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/staff");
  await expect(page.getByRole("heading", { name: "Your day" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("staff-mobile.png"), fullPage: true, caret: "initial" });
  await page.goto("/staff/appointments");
  await expect(page.getByRole("heading", { name: "Appointments", level: 1 })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("staff-appointments-mobile.png"), fullPage: true, caret: "initial" });
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn("customer@example.test", "e2e-customer-passphrase");
  for (const width of [320, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ["/account", "/account/appointments", "/account/payments", "/account/profile"]) {
      await page.goto(route);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.getByRole("navigation", { name: "account quick navigation" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${route} at ${width}px`).toBeLessThanOrEqual(1);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account");
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("customer-mobile.png"), fullPage: true, caret: "initial" });
});
