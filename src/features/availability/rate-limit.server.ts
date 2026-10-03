import "server-only";
import { createHash } from "node:crypto";

export type RateLimitPolicy = "availability" | "booking" | "recovery" | "checkout" | "guestAccess" | "paymentVerify";
export type RateLimitDecision = { allowed: boolean; retryAfterSeconds: number; unavailable?: boolean };

const policies: Record<RateLimitPolicy, { windowMs: number; limit: number }> = {
  availability: { windowMs: 60_000, limit: 60 },
  booking: { windowMs: 15 * 60_000, limit: 8 },
  recovery: { windowMs: 15 * 60_000, limit: 4 },
  guestAccess: { windowMs: 15 * 60_000, limit: 16 },
  checkout: { windowMs: 15 * 60_000, limit: 8 },
  paymentVerify: { windowMs: 60_000, limit: 12 },
};
const localWindows = new Map<string, { start: number; count: number }>();
const MAX_LOCAL_KEYS = 10_000;

/** Atomically increments a short-lived, endpoint-specific Redis counter. */
const redisScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('PTTL', KEYS[1]) }
`;

function localDecision(policy: RateLimitPolicy, key: string, now: number): RateLimitDecision {
  const { windowMs, limit } = policies[policy];
  // The Playwright server shares one loopback address across all isolated cases.
  // Keep the real limits in development and production.
  const effectiveLimit = process.env.PLAYWRIGHT_TEST === "1" ? 1_000 : limit;
  const storageKey = `${policy}:${key}`;
  let entry = localWindows.get(storageKey);
  if (!entry || now - entry.start >= windowMs) {
    entry = { start: now, count: 0 };
    localWindows.set(storageKey, entry);
  }
  entry.count += 1;
  if (localWindows.size > MAX_LOCAL_KEYS) {
    for (const [candidate, value] of localWindows) if (now - value.start >= windowMs) localWindows.delete(candidate);
    if (localWindows.size > MAX_LOCAL_KEYS) localWindows.delete(localWindows.keys().next().value!);
  }
  return { allowed: entry.count <= effectiveLimit, retryAfterSeconds: Math.max(1, Math.ceil((entry.start + windowMs - now) / 1000)) };
}

function digestKey(policy: RateLimitPolicy, identifier: string) {
  const digest = createHash("sha256").update(identifier).digest("hex");
  return `rate:v1:${policy}:${digest}`;
}

async function distributedDecision(policy: RateLimitPolicy, identifier: string): Promise<RateLimitDecision> {
  const endpoint = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!endpoint || !token) {
    if (process.env.NODE_ENV === "production") return { allowed: false, retryAfterSeconds: 60, unavailable: true };
    return localDecision(policy, identifier, Date.now());
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", redisScript, "1", digestKey(policy, identifier), String(policies[policy].windowMs)]),
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) return { allowed: false, retryAfterSeconds: 30, unavailable: true };
    const body = await response.json() as { result?: unknown; error?: unknown };
    if (body.error || !Array.isArray(body.result) || !Number.isFinite(Number(body.result[0]))) {
      return { allowed: false, retryAfterSeconds: 30, unavailable: true };
    }
    const count = Number(body.result[0]);
    const ttl = Number(body.result[1]);
    return {
      allowed: count <= policies[policy].limit,
      retryAfterSeconds: Math.max(1, Math.ceil((Number.isFinite(ttl) && ttl > 0 ? ttl : policies[policy].windowMs) / 1000)),
    };
  } catch {
    // Fail closed if the shared limiter is unavailable; callers receive no provider details.
    return { allowed: false, retryAfterSeconds: 30, unavailable: true };
  }
}

/** Production uses shared Redis; development and tests use a bounded in-process adapter. */
export function consumeRateLimit(policy: RateLimitPolicy, identifier: string, now = Date.now()) {
  if (process.env.NODE_ENV !== "production" && !process.env.UPSTASH_REDIS_REST_URL) {
    return Promise.resolve(localDecision(policy, identifier, now));
  }
  return distributedDecision(policy, identifier);
}

/** x-real-ip is supplied by the hosting proxy. Never key on email, phone, or form data. */
export function trustedClientIdentifier(headers: Headers) {
  const ip = headers.get("x-real-ip")?.trim();
  return ip && ip.length <= 128 ? `ip:${ip}` : "ip:unavailable";
}
