import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const stub = "http://127.0.0.1:54322";
const futureDate = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 4);
  return date.toISOString().slice(0, 10);
};

async function book(page: Page, email = "guest-e2e@example.test") {
  await page.goto("/book?service=consultation");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[name="staffChoice"]').first().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Appointment date").fill(futureDate());
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "10:00" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill("Guest E2E Customer");
  const emailField = page.getByLabel("Email address");
  if (await emailField.isEditable()) await emailField.fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await Promise.all([
    page.waitForURL(/\/book\/confirmation\?id=/),
    page.locator('button[type="submit"]').evaluate(button => (button as HTMLButtonElement).click()),
  ]);
  return {
    id: new URL(page.url()).searchParams.get("id")!,
    reference: (await page.locator(".font-mono").textContent())!.trim(),
  };
}

async function emailedLink(request: APIRequestContext) {
  await expect.poll(async () => (await (await request.get(`${stub}/__e2e/mailbox`)).json()).emails.some((email: { text?: string }) => String(email.text).includes("/booking/access#token="))).toBeTruthy();
  const mailbox = await (await request.get(`${stub}/__e2e/mailbox`)).json();
  const message = mailbox.emails.findLast((email: { text?: string }) => String(email.text).includes("/booking/access#token="));
  expect(String(message.text)).toMatch(/Booking reference is BK-[A-F0-9]{16}/i);
  const link = String(message.text).match(/http:\/\/127\.0\.0\.1:3100\/booking\/access#token=[A-Za-z0-9_-]+/)?.[0];
  expect(link).toBeTruthy();
  return link!;
}

test.beforeEach(async ({ request }) => {
  await request.put(`${stub}/__e2e/state`, { data: { reset: true, guest: true, registration: true, approvalMode: "ADMIN_APPROVAL" } });
});

test("guest booking stays account optional and opens a scoped pending portal", async ({ page, browser, request }) => {
  await request.put(`${stub}/__e2e/state`, { data: { failOutboxClaim: true } });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Book now" }).first()).toBeVisible();
  const { id, reference } = await book(page);
  expect(reference).toMatch(/^BK-[A-F0-9]{16}$/);
  await expect(page.getByRole("heading", { name: "Booking request submitted" })).toBeVisible();
  await expect(page.getByText(/private access link is queued/i)).toBeVisible();
  await page.getByRole("link", { name: "View booking" }).click();
  await expect(page.getByText(reference)).toBeVisible();
  await expect(page.getByText("Waiting for approval")).toBeVisible();
  const fresh = await browser.newPage();
  await fresh.goto(`/booking/manage?id=${id}`);
  await expect(fresh.getByRole("heading", { name: "Manage a guest booking" })).toBeVisible();
  await expect(fresh.getByText(reference)).toHaveCount(0);
  await fresh.close();
  const stats = await (await request.get(`${stub}/__e2e/stats`)).json();
  expect(stats.appointments).toBe(1);
  await expect.poll(async () => (await (await request.get(`${stub}/__e2e/stats`)).json()).outboxDispatches).toBe(1);
});

test("a committed guest booking is immediately emailed through the outbox and acknowledged", async ({ page, browser, request }) => {
  const { id, reference } = await book(page);
  await expect(page.getByRole("heading", { name: "Booking request submitted" })).toBeVisible();
  const mailbox = await (await request.get(`${stub}/__e2e/mailbox`)).json();
  expect(mailbox.emails).toHaveLength(2);
  expect(mailbox.emails.some((email: { to?: string[]; text?: string }) => email.to?.includes("guest-e2e@example.test") && String(email.text).includes("/booking/access#token="))).toBe(true);
  expect(mailbox.emails.some((email: { to?: string[]; text?: string }) => email.to?.includes("owner@example.test") && String(email.text).includes(`/auth/continue?next=%2Fadmin%2Fappointments%2F${id}`))).toBe(true);
  const ownerMail = mailbox.emails.find((email: { to?: string[] }) => email.to?.includes("owner@example.test"));
  const ownerLink = String(ownerMail.text).match(/http:\/\/127\.0\.0\.1:3100\/auth\/continue\?next=%2Fadmin%2Fappointments%2F[0-9a-f-]+/)?.[0];
  expect(ownerLink).toBeTruthy();
  const owner = await browser.newPage();
  await owner.goto(ownerLink!);
  await expect(owner).toHaveURL(/\/login\?next=/);
  await owner.getByLabel("Email address").fill("owner@example.test");
  await owner.locator('input[name="password"]').fill("e2e-owner-passphrase");
  await owner.getByRole("button", { name: "Sign in" }).click();
  await expect(owner).toHaveURL(new RegExp(`/admin/appointments/${id}`));
  await expect(owner.getByRole("heading", { name: "Appointment details" })).toBeVisible();
  await owner.close();
  const stats = await (await request.get(`${stub}/__e2e/stats`)).json();
  expect(stats.outbox).toEqual([{ state: "DELIVERED", attempts: 1, last_error: null }]);
  expect(stats.receipts).toBe(2);
  expect(reference).toMatch(/^BK-[A-F0-9]{16}$/);
});

test("staff operational email requires sign-in and returns to its assigned request", async ({ page, browser, request }) => {
  await request.put(`${stub}/__e2e/state`, { data: { approvalMode: "STAFF_APPROVAL" } });
  const { id } = await book(page);
  const mailbox = await (await request.get(`${stub}/__e2e/mailbox`)).json();
  const message = mailbox.emails.find((email: { to?: string[]; text?: string }) => email.to?.includes("staff@example.test"));
  expect(message).toBeTruthy();
  const destination = `/staff/appointments?focus=${id}#appointment-${id}`;
  expect(String(message.text)).toContain(`/auth/continue?next=${encodeURIComponent(destination)}`);
  const fresh = await browser.newPage();
  await fresh.goto(`http://127.0.0.1:3100/auth/continue?next=${encodeURIComponent(destination)}`);
  await expect(fresh).toHaveURL(/\/login\?next=/);
  await fresh.getByLabel("Email address").fill("staff@example.test");
  await fresh.locator('input[name="password"]').fill("e2e-staff-passphrase");
  await fresh.getByRole("button", { name: "Sign in" }).click();
  await expect(fresh).toHaveURL(new RegExp(`/staff/appointments\\?focus=${id}#appointment-${id}`));
  await expect(fresh.locator(`#appointment-${id}`)).toBeVisible();
  await fresh.close();
});

test("recovery response is generic, email exchange restores access, and replay fails", async ({ page, browser, request }) => {
  const { id, reference } = await book(page);
  const fresh = await browser.newPage();
  await fresh.goto("/booking/manage");
  await fresh.getByLabel("Booking email").fill("wrong@example.test");
  await fresh.getByLabel("Booking reference").fill(reference);
  await fresh.getByRole("button", { name: "Send me a new secure link" }).click();
  const generic = fresh.getByRole("status");
  await expect(generic).toContainText(/If those details match/i);
  const before = (await (await request.get(`${stub}/__e2e/mailbox`)).json()).emails.length;
  await fresh.getByLabel("Booking email").fill("guest-e2e@example.test");
  await fresh.getByLabel("Booking reference").fill(reference);
  await expect(fresh.getByRole("button", { name: "Send me a new secure link" })).toBeEnabled();
  await fresh.getByRole("button", { name: "Send me a new secure link" }).click();
  await expect(generic).toContainText(/If those details match/i);
  await expect.poll(async () => (await (await request.get(`${stub}/__e2e/mailbox`)).json()).emails.length, { timeout: 15_000 }).toBe(before + 1);
  const link = await emailedLink(request);
  await fresh.goto(link);
  await expect(fresh).toHaveURL(new RegExp(`/booking/manage\\?id=${id}`));
  await expect(fresh.getByText(reference)).toBeVisible();
  const replay = await browser.newPage();
  await replay.goto(link);
  await expect(replay.getByText(/invalid.*expired|already used/i)).toBeVisible();
  await replay.close();
  await fresh.close();
});

test("guest payment state is available without an account", async ({ page, request }) => {
  await request.put(`${stub}/__e2e/state`, { data: { approvalMode: "AUTO_CONFIRM" } });
  await book(page);
  await expect(page.getByRole("heading", { name: "Payment required" })).toBeVisible();
  await page.getByRole("link", { name: "View booking" }).click();
  await expect(page.getByText("Payment required").first()).toBeVisible();
  await expect(page.getByText(/payment deadline/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Pay online/i })).toBeEnabled();
});

test("a signed-in customer can use guest token access without claiming ownership", async ({ page }) => {
  const { id, reference } = await book(page);
  await page.goto("/login");
  await page.getByLabel("Email address").fill("customer@example.test");
  await page.locator('input[name="password"]').fill("e2e-customer-passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.goto(`/book/confirmation?id=${id}`);
  await expect(page.getByText(reference)).toBeVisible();
  await page.getByRole("link", { name: "View booking" }).click();
  await expect(page).toHaveURL(new RegExp(`/booking/manage\\?id=${id}`));
  await page.goto(`/account/appointments/${id}`);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("registered customer appointment email returns through login to the owned appointment", async ({ page, browser, request }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("customer@example.test");
  await page.locator('input[name="password"]').fill("e2e-customer-passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account/);
  const { id, reference } = await book(page);
  await expect(page.getByText(reference)).toBeVisible();
  const mailbox = await (await request.get(`${stub}/__e2e/mailbox`)).json();
  const customerEmail = mailbox.emails.find((email: { to?: string[]; text?: string }) => email.to?.includes("customer@example.test") && String(email.text).includes("%2Faccount%2Fappointments%2F"));
  expect(customerEmail).toBeTruthy();
  await page.getByRole("button", { name: "Sign out" }).click();
  const fresh = await browser.newPage();
  const customerLink = String(customerEmail.text).match(/http:\/\/127\.0\.0\.1:3100\/auth\/continue\?next=%2Faccount%2Fappointments%2F[0-9a-f-]+/)?.[0];
  expect(customerLink).toBeTruthy();
  await fresh.goto(customerLink!);
  await expect(fresh).toHaveURL(/\/login\?next=/);
  await fresh.getByLabel("Email address").fill("customer@example.test");
  await fresh.locator('input[name="password"]').fill("e2e-customer-passphrase");
  await fresh.getByRole("button", { name: "Sign in" }).click();
  await expect(fresh).toHaveURL(new RegExp(`/account/appointments/${id}`));
  await expect(fresh.getByText(reference)).toBeVisible();
  await fresh.close();
});

test("signed-in booking explains identity, locks verified email, and sign-out returns to guest", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("customer@example.test");
  await page.locator('input[name="password"]').fill("e2e-customer-passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.goto("/book?service=consultation");
  await expect(page.getByRole("link", { name: "My account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Workspace" })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[name="staffChoice"]').first().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Appointment date").fill(futureDate());
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "10:00" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Booking as")).toBeVisible();
  await expect(page.getByText("customer@example.test").first()).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveAttribute("readonly", "");
  await expect(page.getByText(/verified account email is locked/i)).toBeVisible();
  await page.getByRole("button", { name: /Not you\? Sign out/i }).click();
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.goto("/account/payments");
  await expect(page).toHaveURL(/\/login/);
});

test("customer payments has a customer-facing empty state", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("customer@example.test");
  await page.locator('input[name="password"]').fill("e2e-customer-passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.goto("/account/payments");
  await expect(page.getByRole("heading", { name: "No payments yet" })).toBeVisible();
  await expect(page.getByText(/future phase/i)).toHaveCount(0);
});
