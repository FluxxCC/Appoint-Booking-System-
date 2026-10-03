import "server-only";
import { z } from "zod";

export function siteUrl() {
  const url = new URL(z.url().parse(process.env.NEXT_PUBLIC_SITE_URL));
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("Configure a trusted HTTPS site URL (HTTP is allowed only for local development).");
  }
  return url.origin;
}
