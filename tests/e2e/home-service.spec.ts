import { expect, test } from "./fixtures";

const stub = "http://127.0.0.1:54322";
function futureDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 4);
  return date.toISOString().slice(0, 10);
}

test("registered customer can request Home Service with reviewed location and fee", async ({ page, request, browser }) => {
  test.setTimeout(60_000);
  await request.put(`${stub}/__e2e/state`, { data: { reset: true, guest: true, registration: true, availability: "normal", approvalMode: "ADMIN_APPROVAL" } });
  await page.goto("/login");
  await page.getByLabel("Email address").fill("customer@example.test");
  await page.locator('input[name="password"]').fill("e2e-customer-passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account/);

  await page.goto("/book?service=consultation");
  await page.getByLabel("Home Service").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[name="staffChoice"]').first().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Appointment date").fill(futureDate());
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "10:00" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.locator("#home-address").fill("12 Test Street, Demo Barangay");
  await page.locator("#home-area").fill("Test City");
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 14.5995, longitude: 120.9842, accuracy: 500 });
  await page.getByRole("button", { name: "Use my current location" }).click();
  await expect(page.getByRole("status")).toContainText("Approximate location");
  await expect(page.getByTitle("Map preview of the selected service destination")).toBeVisible();
  // Adjust the pin manually and review the exact map position before submitting.
  await page.locator("#home-latitude").fill("14.600001");
  await page.locator("#home-longitude").fill("120.984201");
  await page.locator("#home-landmark").fill("Blue gate");
  await page.locator("#home-instructions").fill("Second floor, ring the bell");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Review your request" })).toBeVisible();
  const review = page.getByRole("region", { name: "Review your request" });
  await expect(review.getByText("Home Service · 12 Test Street, Demo Barangay")).toBeVisible();
  await expect(review.getByText("Home Service fee", { exact: true }).locator(".." )).toContainText("₱7.00");
  await expect(review.getByText("Total", { exact: true }).locator(".." )).toContainText("₱42.00");
  await expect(review.getByText("Payment", { exact: true }).locator(".." )).toContainText("₱5.00");
  await Promise.all([
    page.waitForURL(/\/account\/appointments\/[^/]+$/),
    page.locator('button[type="submit"]').evaluate(button => (button as HTMLButtonElement).click()),
  ]);
  await expect(page.getByRole("heading", { name: "Consultation" })).toBeVisible();
  await expect(page.getByText("Waiting for approval", { exact: true })).toBeVisible();
  await expect(page.getByText("Home Service destination")).toBeVisible();
  await expect(page.getByText("12 Test Street, Demo Barangay")).toBeVisible();
  await expect(page.getByText("No payment taken")).toBeVisible();

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto("/owner/login");
  await ownerPage.getByLabel("Account email").fill("owner@example.test");
  await ownerPage.locator('input[name="password"]').fill("e2e-owner-passphrase");
  await ownerPage.getByRole("button", { name: "Sign in" }).click();
  await expect(ownerPage).not.toHaveURL(/\/login/);
  const id = page.url().match(/\/account\/appointments\/([^/]+)$/)?.[1];
  expect(id).toBeTruthy();
  await ownerPage.goto(`/admin/appointments/${id}`);
  await expect(ownerPage.getByText("Home Service · Test City")).toBeVisible();
  await expect(ownerPage.getByText("12 Test Street, Demo Barangay")).toBeVisible();
  await expect(ownerPage.getByText("Landmark: Blue gate")).toBeVisible();
  await expect(ownerPage.getByText("Instructions: Second floor, ring the bell")).toBeVisible();
  await expect(ownerPage.getByRole("link", { name: "Open in Maps" })).toBeVisible();
  await ownerPage.goto("/admin");
  await expect(ownerPage.getByText("Setup required").first()).toBeVisible();
  await expect(ownerPage.getByText("Add the business service-area map pin to finish setup.")).toBeVisible();
  await ownerPage.goto("/admin/services");
  await expect(ownerPage.getByRole("link", { name: "Consultation" })).toBeVisible();
  await ownerPage.getByRole("link", { name: "Edit service" }).click();
  await expect(ownerPage.locator('input[name="supports_home_service"]')).toBeChecked();
  await ownerContext.close();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminPage.goto("/admin/login");
  await adminPage.getByLabel("Account email").fill("admin@example.test");
  await adminPage.locator('input[name="password"]').fill("e2e-admin-passphrase");
  await adminPage.getByRole("button", { name: "Sign in" }).click();
  await expect(adminPage).not.toHaveURL(/\/login/);
  await adminPage.goto("/admin/settings");
  await expect(adminPage.getByText("Setup required").first()).toBeVisible();
  await expect(adminPage.getByText("Add the business service-area map pin to finish setup.")).toBeVisible();
  await adminPage.getByLabel("Latitude").fill("14.600001");
  await adminPage.getByLabel("Longitude").fill("120.984201");
  await adminPage.getByRole("button", { name: "Save service area" }).click();
  await expect(adminPage.getByText("Home Service area saved.")).toBeVisible();
  await adminPage.goto("/admin");
  await expect(adminPage.getByText("Active", { exact: true }).first()).toBeVisible();
  await expect(adminPage.getByText("1 service available for Home Service.")).toBeVisible();
  await adminPage.goto(`/admin/appointments/${id}`);
  await expect(adminPage.getByText("12 Test Street, Demo Barangay")).toBeVisible();
  await expect(adminPage.getByText("Landmark: Blue gate")).toBeVisible();
  await expect(adminPage.getByText("Instructions: Second floor, ring the bell")).toBeVisible();
  await expect(adminPage.getByRole("link", { name: "Open in Maps" })).toBeVisible();
  await adminContext.close();
});

test("guest cannot continue through Home Service without an authenticated customer account", async ({ page, request }) => {
  await request.put(`${stub}/__e2e/state`, { data: { reset: true, guest: true, registration: true, availability: "normal", approvalMode: "ADMIN_APPROVAL" } });
  await page.goto("/book?service=consultation");
  await page.getByLabel("Home Service").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[name="staffChoice"]').first().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Appointment date").fill(futureDate());
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "10:00" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Home Service requires an account")).toBeVisible();
  await page.locator("#home-address").fill("12 Test Street, Demo Barangay");
  await page.locator("#home-area").fill("Test City");
  await page.locator("#home-latitude").fill("14.600001");
  await page.locator("#home-longitude").fill("120.984201");
  await page.getByRole("button", { name: "Continue" }).click();
  const details = page.getByRole("region", { name: "Your details and service address" });
  await expect(details.getByRole("alert")).toContainText("Sign in to continue with Home Service");
  await expect(details.getByRole("heading", { name: "Your details and service address" })).toBeVisible();
});
