import { expect, test } from "./fixtures";

const stub = "http://127.0.0.1:54322";

test("public landing page lists eligible business locations", async ({ page, request }) => {
  await request.put(`${stub}/__e2e/state`, { data: { reset: true, multiBranch: true } });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Our locations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E Test Studio" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "North Branch" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Book at this location/ }).first()).toHaveAttribute("href", /\/book\?branch=/);
});

test("public booking hides a single-location picker and selects an eligible branch when several exist", async ({ page, request }) => {
  await request.put(`${stub}/__e2e/state`, { data: { reset: true, multiBranch: false } });
  await page.goto("/book?service=consultation");
  await expect(page.getByRole("heading", { name: "Let’s plan your visit." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where would you like to visit?" })).toHaveCount(0);

  await request.put(`${stub}/__e2e/state`, { data: { reset: true, multiBranch: true } });
  await page.goto("/book?service=consultation");
  await expect(page.getByRole("heading", { name: "Where would you like to visit?" })).toBeVisible();
  await expect(page.getByRole("link", { name: /1 service E2E Test Studio/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /North Branch/ })).toBeVisible();

  await page.getByRole("link", { name: /North Branch/ }).click();
  await expect(page).toHaveURL(/\/book\?branch=north-branch&service=consultation/);
  await expect(page.getByRole("heading", { name: "Let’s plan your visit." })).toBeVisible();
  await expect(page.getByText("Request an appointment · North Branch", { exact: true })).toBeVisible();
});
