import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

const serviceUrl = "/book?service=consultation";
const stub = "http://127.0.0.1:54322";
const futureDate = (days = 3) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

test.beforeEach(async ({ request }) => {
  await setScenario(request, { reset: true, guest: true, registration: true, availability: "normal" });
});

async function setScenario(request: APIRequestContext, value: Record<string, unknown>) {
  await request.put(`${stub}/__e2e/state`, { data: value });
}

async function reachTimeStep(page: Page, browseCatalog = false) {
  if (browseCatalog) {
    await page.goto("/");
    await page.getByRole("link", { name: "Services", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Consultation", exact: true })).toBeVisible();
    const fixtureLink = page.locator('a[href="/book?service=consultation"]');
    await expect(fixtureLink).toHaveCount(1);
    await fixtureLink.click();
  } else {
    await page.goto(serviceUrl);
  }
  await page.getByRole("heading", { name: "Choose a service" }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Choose a professional" }).waitFor();
  await page.locator('input[name="staffChoice"]').first().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Appointment date").fill(futureDate());
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "Choose a time" }).waitFor();
}

async function completeGuestRequest(page: Page) {
  await page.getByRole("button", { name: "10:00" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill("Guest E2E Customer");
  const email = page.getByLabel("Email address");
  if (await email.isEditable()) await email.fill("guest-e2e@example.test");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review your request" })).toBeVisible();
  await expect(page.getByText(/submitting does not reserve this time/i)).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/book\/confirmation\?id=/),
    page.locator('button[type="submit"]').evaluate(button => (button as HTMLButtonElement).click()),
  ]);
}

test("guest browses services and submits a pending request with private management access", async ({ page, browser }) => {
  await reachTimeStep(page, true);
  await completeGuestRequest(page);
  await expect(page.getByRole("heading", { name: "Booking request submitted" })).toBeVisible();
  await expect(page.getByText("This request is waiting for approval. The time is not reserved yet.")).toBeVisible();
  const reference = await page.locator(".font-mono").textContent();
  expect(reference).toMatch(/^BK-[A-F0-9]{16}$/);
  await page.getByRole("link", { name: "View booking" }).click();
  await expect(page.getByRole("heading", { name: "Your appointment" })).toBeVisible();

  const uuid = new URL(page.url()).searchParams.get("id");
  expect(uuid).toBeTruthy();
  const isolated = await browser.newPage();
  await isolated.goto(`/booking/manage?id=${uuid}`);
  await expect(isolated.getByText(/A reference alone cannot open a booking/i)).toBeVisible();
  await isolated.close();
});

test("registered customer can book and see only their own appointment", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("customer@example.test");
  await page.locator('input[name="password"]').fill("e2e-customer-passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account/);
  await reachTimeStep(page);
  await completeGuestRequest(page);
  await page.getByRole("link", { name: "View booking" }).click();
  await expect(page.getByRole("heading", { name: "Consultation" })).toBeVisible();
  const id = page.url().split("/").at(-1);
  await page.goto(`/account/appointments/${id}`);
  await expect(page.getByRole("heading", { name: "Consultation" })).toBeVisible();
  await page.goto("/account/appointments/dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("guest retries reuse the request key and do not create another appointment", async ({ page, request }) => {
  await reachTimeStep(page);
  await completeGuestRequest(page);
  const firstId = new URL(page.url()).searchParams.get("id");
  await page.goto(serviceUrl);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[name="staffChoice"]').first().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Appointment date").fill(futureDate());
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "10:00" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill("Guest E2E Customer");
  await page.getByLabel("Email address").fill("guest-e2e@example.test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('button[type="submit"]').evaluate(button => (button as HTMLButtonElement).click());
  await expect(page.locator('p[role="alert"]')).toContainText(/retry does not create new guest access/i);
  expect(new URL(page.url()).searchParams.get("id")).not.toBe(firstId);
  const stats = await (await request.get(`${stub}/__e2e/stats`)).json();
  expect(stats).toEqual({ appointments: 1, requestKeys: 1 });
});

test("guest and registration settings and availability empty/error states have clear responses", async ({ page, request }) => {
  await setScenario(request, { guest: false, registration: false, availability: "empty" });
  await page.goto("/book");
  await expect(page.getByText("Guest booking is disabled for this business.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveCount(0);
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Account registration is unavailable" })).toBeVisible();

  await setScenario(request, { guest: true, registration: true, availability: "empty" });
  await reachTimeStep(page);
  await expect(page.getByText("There are no available times on this date.")).toBeVisible();

  await setScenario(request, { availability: "normal" });
  await page.route("**/api/availability?*", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Availability could not be loaded." }) }));
  await page.reload();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[name="staffChoice"]').first().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Appointment date").fill(futureDate(4));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Availability could not be loaded.", { exact: true })).toBeVisible();
});

test("changing date clears a previously selected slot and contact validation is field-specific", async ({ page }) => {
  await reachTimeStep(page);
  await page.getByRole("button", { name: "10:00" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByLabel("Appointment date").fill(futureDate(4));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "10:00" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "10:00" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter your full name.")).toBeVisible();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
});

test("keyboard activation advances the wizard and moves focus to the new step", async ({ page }) => {
  await page.goto(serviceUrl);
  const continueButton = page.getByRole("button", { name: "Continue" });
  await continueButton.focus();
  await page.keyboard.press("Enter");
  const heading = page.getByRole("heading", { name: "Choose a professional" });
  await expect(heading).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator('input[name="staffChoice"]').first()).toBeFocused();
});

test("public pages and booking controls fit mobile, tablet, and desktop viewports", async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const route of ["/", "/services", "/team", "/book"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
      expect(dimensions.scrollWidth, `${route} overflows at ${viewport.width}px`).toBeLessThanOrEqual(dimensions.width);
    }
    await page.goto(serviceUrl);
    const continueButton = page.getByRole("button", { name: "Continue" });
    const height = await continueButton.evaluate(element => element.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(44);
  }
});
