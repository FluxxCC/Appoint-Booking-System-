import { expect, test, type Page, type APIRequestContext, type Browser } from "./fixtures";

const stub = "http://127.0.0.1:54322";
function futureDate() { const date = new Date(); date.setUTCDate(date.getUTCDate() + 4); return date.toISOString().slice(0, 10); }
async function scenario(request: APIRequestContext, approvalMode: string) {
  await request.put(`${stub}/__e2e/state`, { data: { reset: true, guest: true, registration: true, availability: "normal", approvalMode } });
}
async function bookAsGuest(page: Page) {
  await page.goto("/book?service=consultation");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[name="staffChoice"]').last().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Appointment date").fill(futureDate());
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "10:00" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill("Phase Eight Guest");
  await page.getByLabel("Email address").fill("phase8@example.test");
  await page.getByRole("button", { name: "Continue" }).click();
  await Promise.all([page.waitForURL(/\/book\/confirmation\?id=/),page.locator('button[type="submit"]').evaluate(button=>(button as HTMLButtonElement).click())]);
  return new URL(page.url()).searchParams.get("id")!;
}
async function login(page: Page, email: string, password: string, portal: "/owner/login" | "/staff/login") {
  await page.goto(portal);
  await page.getByLabel("Account email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}
async function actorPage(browser: Browser, email: string, password: string, portal: "/owner/login" | "/staff/login") {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email, password, portal);
  return { page, context };
}

test("guest checkout fetch sends only the appointment ID and navigates to the validated hosted URL", async ({ page, browser, request }) => {
  await scenario(request, "ADMIN_APPROVAL");
  const id=await bookAsGuest(page);
  await expect(page.getByRole("heading",{name:"Booking request submitted"})).toBeVisible();
  const owner=await actorPage(browser,"owner@example.test","e2e-owner-passphrase","/owner/login");
  await owner.page.goto("/admin/appointments?status=PENDING");
  await expect(owner.page.getByText("Phase Eight Guest").first()).toBeVisible();
  await owner.page.getByRole("button",{name:"Accept request",exact:true}).first().click();
  await expect(owner.page.getByText("No requests are waiting for review.")).toBeVisible();
  await page.goto(`/booking/manage?id=${id}`);
  await expect(page.getByRole("heading",{name:"Payment required"})).toBeVisible();
  await expect(page.getByText(/Pay by .* to keep this time reserved/i)).toBeVisible();
  const payButton = page.getByRole("button", { name: "Pay online" });
  await expect(payButton).toBeEnabled();
  let submittedFields: string[] = [];
  await page.route("https://checkout.paymongo.com/cs_test_e2e", async route => {
    await route.fulfill({ status: 200, contentType: "text/html", body: "Hosted checkout test" });
  });
  await page.route("**/api/payments/checkout", async route => {
    const body = route.request().postDataBuffer()?.toString() ?? "";
    submittedFields = [...body.matchAll(/name="([^"]+)"/g)].map(match => match[1]);
    expect(body).toContain(id);
    expect(route.request().headers()["accept"]).toContain("application/json");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ checkoutUrl: "https://checkout.paymongo.com/cs_test_e2e" }) });
  });
  await payButton.click();
  await expect(page).toHaveURL("https://checkout.paymongo.com/cs_test_e2e");
  await expect(page.getByText("Hosted checkout test")).toBeVisible();
  expect(submittedFields).toEqual(["appointmentId"]);
  await owner.context.close();
});

test("owner declines a pending request and guest sees declined status", async ({ page, browser, request }) => {
  await scenario(request, "ADMIN_APPROVAL");
  const id=await bookAsGuest(page);
  const owner=await actorPage(browser,"owner@example.test","e2e-owner-passphrase","/owner/login");
  await owner.page.goto("/admin/appointments?status=PENDING");
  await owner.page.getByRole("button",{name:"Decline",exact:true}).first().click();
  await owner.page.getByLabel("Reason for declining").first().fill("The professional is unavailable");
  await owner.page.getByRole("button",{name:"Confirm decline",exact:true}).first().click();
  await expect(owner.page.getByText("No requests are waiting for review.")).toBeVisible();
  await page.goto(`/booking/manage?id=${id}`);
  await expect(page.getByText("Declined",{exact:true})).toBeVisible();
  await owner.context.close();
});

test("assigned staff approves in staff mode", async ({ page, browser, request }) => {
  await scenario(request, "STAFF_APPROVAL");
  const id=await bookAsGuest(page);
  const staff=await actorPage(browser,"staff@example.test","e2e-staff-passphrase","/staff/login");
  await staff.page.goto("/staff");
  await expect(staff.page.getByText("Your pending requests")).toBeVisible();
  await staff.page.getByRole("button",{name:"Accept request"}).click();
  await expect(staff.page.getByText("No requests assigned to you.")).toBeVisible();
  await page.goto(`/booking/manage?id=${id}`);
  await expect(page.getByRole("heading",{name:"Payment required"})).toBeVisible();
  await staff.context.close();
});

test("auto confirmation acquires the slot during submission", async ({ page, request }) => {
  await scenario(request, "AUTO_CONFIRM");
  await page.goto("/book?service=consultation");
  await expect(page.getByText(/booking will be reserved immediately/)).toBeVisible();
  const id=await bookAsGuest(page);
  await expect(page.getByRole("heading",{name:"Payment required"})).toBeVisible();
  await page.goto(`/booking/manage?id=${id}`);
  await expect(page.getByRole("heading",{name:"Payment required"})).toBeVisible();
});

test("expired payment is visible to owner and guest without another checkout", async ({ page, browser, request }) => {
  await scenario(request, "AUTO_CONFIRM");
  const id = await bookAsGuest(page);
  await expect(page.getByRole("heading", { name: "Payment required" })).toBeVisible();
  expect((await request.post(`${stub}/__e2e/expire`, { data: { appointmentId: id } })).ok()).toBe(true);
  await page.goto(`/booking/manage?id=${id}`);
  await expect(page.getByText("Payment window expired; time released")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay online" })).toHaveCount(0);
  const owner = await actorPage(browser, "owner@example.test", "e2e-owner-passphrase", "/owner/login");
  await owner.page.goto("/admin/appointments?status=PAYMENT_EXPIRED");
  await expect(owner.page.getByRole("table").getByText("Payment Expired")).toBeVisible();
  await owner.page.goto(`/admin/appointments/${id}`);
  await expect(owner.page.getByText("Payment window expired").first()).toBeVisible();
  await expect(owner.page.getByText("Payment deadline", { exact: true })).toBeVisible();
  await expect(owner.page.getByText("Payment expired", { exact: true })).toBeVisible();
  await owner.context.close();
});
