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
  await page.locator("#home-address").fill("12 Test Street, Demo Barangay");
  await page.locator("#home-area").fill("Test City");
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 14.5995, longitude: 120.9842, accuracy: 500 });
  await page.getByRole("button", { name: "Share my current location" }).click();
  await expect(page.getByRole("status")).toContainText("Approximate location");
  await expect(page.getByLabel("Interactive service location map")).toBeVisible();
  await expect(page.locator('input[name="latitude"]')).toHaveValue("14.599500");
  await page.getByRole("button", { name: "Confirm destination" }).click();
  await expect(page.getByText("Destination confirmed").first()).toBeVisible();
  // Coordinates are captured automatically; customers never type them.
  await page.getByText("Add directions for the team", { exact: false }).click();
  await page.locator("#home-landmark").fill("Blue gate");
  await page.locator("#home-instructions").fill("Second floor, ring the bell");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[name="staffChoice"]').first().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Appointment date").fill(futureDate());
  await expect(page.getByRole("button", { name: "10:00 AM" })).toBeVisible();
  await page.getByRole("button", { name: "10:00 AM" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

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
  await expect(ownerPage.getByRole("link", { name: "Get Directions" })).toBeVisible();
  await ownerPage.goto("/admin/home-service");
  await expect(ownerPage.getByRole("heading", { name: "Home Service" })).toBeVisible();
  await expect(ownerPage.getByText("12 Test Street, Demo Barangay")).toBeVisible();
  await expect(ownerPage.getByText("Active bookings requiring attention")).toBeVisible();
  await expect(ownerPage.getByRole("link", { name: "Navigate to Customer" })).toHaveAttribute("href", /google\.com\/maps\/dir/);
  await ownerPage.goto("/admin/appointments");
  await ownerPage.getByRole("button", { name: "Accept request", exact: true }).first().click();
  const staffContext = await browser.newContext({ permissions: ["geolocation"], geolocation: { latitude: 14.6001, longitude: 120.9843 } });
  const staffPage = await staffContext.newPage();
  staffPage.on("dialog", dialog => { void dialog.accept(); });
  await staffPage.goto("/staff/login");
  await staffPage.getByLabel("Account email").fill("staff@example.test");
  await staffPage.locator('input[name="password"]').fill("e2e-staff-passphrase");
  await staffPage.getByRole("button", { name: "Sign in" }).click();
  await expect(staffPage).toHaveURL(/\/staff(?!\/login)/);
  await staffPage.goto("/staff/home-service");
  await expect(staffPage.getByRole("button", { name: "Start Trip" })).toBeVisible();
  await staffPage.getByRole("button", { name: "Start Trip" }).click();
  await expect(staffPage.getByText(/Trip: Live/)).toBeVisible();
  await staffPage.getByRole("button", { name: "Stop Sharing / End Trip" }).click();
  await expect(staffPage.getByText("Location sharing ended.")).toBeVisible();
  await staffContext.close();
  await ownerPage.goto("/admin");
  await expect(ownerPage.getByText("Active", { exact: true }).first()).toBeVisible();
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
  await adminPage.goto("/admin/settings/home-service");
  await expect(adminPage.getByText("Customers enter the visit address and map pin when booking.")).toBeVisible();
  await adminPage.goto("/admin");
  await expect(adminPage.getByText("Active", { exact: true }).first()).toBeVisible();
  await expect(adminPage.getByText("1 service available for Home Service.")).toBeVisible();
  await adminPage.goto(`/admin/appointments/${id}`);
  await expect(adminPage.getByText("12 Test Street, Demo Barangay")).toBeVisible();
  await expect(adminPage.getByText("Landmark: Blue gate")).toBeVisible();
  await expect(adminPage.getByText("Instructions: Second floor, ring the bell")).toBeVisible();
  await expect(adminPage.getByRole("link", { name: "Get Directions" })).toBeVisible();
  await adminContext.close();
});

test("guest is offered sign in and returns to Home Service booking", async ({ page, request }) => {
  await request.put(`${stub}/__e2e/state`, { data: { reset: true, guest: true, registration: true, availability: "normal", approvalMode: "ADMIN_APPROVAL" } });
  await page.goto("/book?service=consultation");
  await page.getByLabel("Home Service").check();
  await expect(page.getByText("A customer account is required for Home Service.")).toBeVisible();
  await page.getByRole("link", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Email address").fill("customer@example.test");
  await page.locator('input[name="password"]').fill("e2e-customer-passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account\/book\?branch=e2e-branch.*home=1/);
  await expect(page.getByLabel("Home Service")).toBeChecked();
  await expect(page.getByLabel("Interactive service location map")).toBeVisible();
});

test("branch toggle hides Home Service and a phone-sized customer can confirm a dropped pin", async ({ page, request }) => {
  await request.put(`${stub}/__e2e/state`, { data: { reset: true, homeEnabled: false } });
  await page.goto("/book?service=consultation");
  await expect(page.getByLabel("Home Service")).toHaveCount(0);

  await request.put(`${stub}/__e2e/state`, { data: { reset: true, homeEnabled: true } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://nominatim.openstreetmap.org/reverse**", route => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ display_name: "12 Test Street, Demo Barangay", address: { city: "Test City" } }) }));
  await page.goto("/login");
  await page.getByLabel("Email address").fill("customer@example.test");
  await page.locator('input[name="password"]').fill("e2e-customer-passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.goto("/account/book?branch=e2e-branch&service=consultation&home=1");
  const map = page.getByLabel("Interactive service location map");
  await expect(map).toBeVisible();
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 14.5995, longitude: 120.9842, accuracy: 100 });
  await page.getByRole("button", { name: "Share my current location" }).click();
  await map.click({ position: { x: 160, y: 130 } });
  await expect(page.locator('input[name="latitude"]')).not.toHaveValue("");
  await page.locator("#home-address").fill("12 Test Street, Demo Barangay");
  await page.locator("#home-area").fill("Test City");
  await page.getByRole("button", { name: "Confirm destination" }).click();
  await expect(page.getByText("Destination confirmed").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
