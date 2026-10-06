import { expect, test as base } from "@playwright/test";

type BrowserDiagnostic = {
  kind: "console-error" | "console-warning" | "page-error" | "request-failed" | "http-error";
  detail: string;
};

/** Collect browser runtime/network diagnostics without changing test behavior. */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const diagnostics: BrowserDiagnostic[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        diagnostics.push({
          kind: message.type() === "error" ? "console-error" : "console-warning",
          detail: message.text(),
        });
      }
    });
    page.on("pageerror", (error) => diagnostics.push({ kind: "page-error", detail: error.message }));
    page.on("requestfailed", (request) => diagnostics.push({
      kind: "request-failed",
      detail: `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "request failed"}`,
    }));
    page.on("response", (response) => {
      if (response.status() === 404 || response.status() >= 500) {
        diagnostics.push({ kind: "http-error", detail: `${response.status()} ${response.url()}` });
      }
    });

    // Playwright's fixture callback is not a React component or Hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);

    const body = JSON.stringify(diagnostics, null, 2);
    await testInfo.attach("browser-diagnostics", {
      body: Buffer.from(body),
      contentType: "application/json",
    });
    if (diagnostics.length > 0) {
      console.log(`[browser diagnostics] ${testInfo.title}\n${body}`);
    }
  },
});

export { expect };
export type { APIRequestContext, Browser, Page } from "@playwright/test";
