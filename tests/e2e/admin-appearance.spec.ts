import sharp from "sharp";
import { expect, test, type Page, type APIRequestContext } from "./fixtures";

const stub = "http://127.0.0.1:54322";
const png = () => sharp(Buffer.from('<svg width="48" height="32" xmlns="http://www.w3.org/2000/svg"><rect width="48" height="32" fill="#2457d6"/></svg>')).png().toBuffer();

async function signIn(page: Page, email: string, password: string, route: string) {
  await page.goto(route);
  await page.getByLabel("Account email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/(owner|admin)\/login/, { timeout: 15_000 });
}

async function appearanceState(request: APIRequestContext) {
  const response = await request.get(`${stub}/__e2e/appearance`);
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ settings: { logo_path: string | null; hero_image_path: string | null; published: boolean }; objectPaths: string[] }>;
}

test.beforeEach(async ({ request }) => {
  await request.put(`${stub}/__e2e/state`, { data: { reset: true } });
});

test("OWNER and ADMIN upload, preview, save, replace, and publish appearance images", async ({ page, browser, request }) => {
  const roles = [
    { email: "owner@example.test", password: "e2e-owner-passphrase", login: "/owner/login" },
    { email: "admin@example.test", password: "e2e-admin-passphrase", login: "/admin/login" },
  ];
  let replacedPaths: string[] = [];

  for (const [index, role] of roles.entries()) {
    const context = index === 0 ? page.context() : await browser.newContext();
    const actor = index === 0 ? page : await context.newPage();
    try {
      await signIn(actor, role.email, role.password, role.login);
      await actor.goto("/admin/appearance");
      await expect(actor.getByRole("heading", { name: "Appearance", exact: true })).toBeVisible();
      await actor.locator('input[name="logo_image"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: await png() });
      await actor.locator('input[name="hero_image"]').setInputFiles({ name: "hero.png", mimeType: "image/png", buffer: await png() });
      await expect(actor.getByAltText("Website logo preview")).toBeVisible();
      await expect(actor.getByAltText("Hero image preview").first()).toBeVisible();
      await actor.getByRole("button", { name: "Save appearance" }).click();
      await expect(actor.getByRole("status")).toContainText("Appearance saved and published");

      const saved = await appearanceState(request);
      expect(saved.settings.published).toBe(true);
      expect(saved.settings.logo_path).toMatch(/^appearance\/logo\/[0-9a-f-]{36}\.webp$/);
      expect(saved.settings.hero_image_path).toMatch(/^appearance\/hero\/[0-9a-f-]{36}\.webp$/);
      expect(saved.objectPaths).toHaveLength(2);
      if (replacedPaths.length) expect(saved.objectPaths.some(path => replacedPaths.includes(path))).toBe(false);

      await actor.reload();
      await expect(actor.getByAltText("Website logo preview")).toBeVisible();
      await expect(actor.getByAltText("Hero image preview").first()).toBeVisible();
      await actor.goto("/");
      const publicHero = actor.locator('img[alt="E2E Test Studio studio"]');
      await expect(publicHero).toBeVisible();
      expect(await publicHero.getAttribute("src")).toContain(saved.settings.hero_image_path!);
      const publicObject = await request.get(`${stub}/storage/v1/object/public/catalog-images/${saved.settings.hero_image_path}`);
      expect(publicObject.ok()).toBeTruthy();
      expect((await publicObject.body()).byteLength).toBeGreaterThan(0);
      replacedPaths = saved.objectPaths;
    } finally {
      if (index !== 0) await context.close();
    }
  }
});

test("failed image upload shows an error and re-enables the appearance form", async ({ page, request }) => {
  await signIn(page, "owner@example.test", "e2e-owner-passphrase", "/owner/login");
  await page.goto("/admin/appearance");
  await page.locator('input[name="logo_image"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: await png() });
  await request.put(`${stub}/__e2e/state`, { data: { failStorageUploads: true } });
  await page.getByRole("button", { name: "Save appearance" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Image upload failed");
  await expect(page.getByRole("button", { name: "Save appearance" })).toBeEnabled();
  const failed = await appearanceState(request);
  expect(failed.objectPaths).toHaveLength(0);
  expect(failed.settings.logo_path).toBeNull();
});
