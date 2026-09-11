/**
 * A sliding-window limiter held in process memory.
 *
 * Deliberately not shared between instances: the Hostinger app is a single
 * long-lived Node process, and the point here is to stop one phone with a stuck
 * retry loop from burning the Gemini quota for the whole booth — not to enforce
 * a billing limit. If this ever runs on more than one instance, each gets its
 * own allowance, which is the safe direction to be wrong in.
 */

/** Hit timestamps per key, oldest first. */
const hits = new Map<string, number[]>();

/** Above this many tracked keys, sweep the ones that have gone quiet. */
const SWEEP_THRESHOLD = 1_000;

export type RateLimitResult = {
  ok: boolean;
  /** How long until the oldest hit falls out of the window. Zero when allowed. */
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  if (hits.size > SWEEP_THRESHOLD) sweep(now, windowMs);

  const cutoff = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((at) => at > cutoff);

  if (recent.length >= limit) {
    // Rejected requests are not recorded, so a caller that keeps hammering
    // cannot push its own window further out.
    hits.set(key, recent);
    const oldest = recent[0];
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfterSeconds: 0 };
}

function sweep(now: number, windowMs: number) {
  const cutoff = now - windowMs;
  for (const [key, timestamps] of hits) {
    if (timestamps.every((at) => at <= cutoff)) hits.delete(key);
  }
}

/** Tests only. */
export function resetRateLimits() {
  hits.clear();
}
