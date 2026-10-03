import { afterEach, describe, expect, it } from "vitest";
import { siteUrl } from "@/lib/auth/site-url.server";

const original = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

describe("trusted email and Auth site URL", () => {
  it("uses the configured HTTPS origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://appointmentdemo.zentra.surf/some/path";
    expect(siteUrl()).toBe("https://appointmentdemo.zentra.surf");
  });

  it("allows HTTP only for local development", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    expect(siteUrl()).toBe("http://localhost:3000");
    process.env.NEXT_PUBLIC_SITE_URL = "http://appointments.example.test";
    expect(() => siteUrl()).toThrow(/HTTPS/);
  });
});
