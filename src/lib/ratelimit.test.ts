import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "./ratelimit";

const MINUTE = 60_000;
const T0 = 1_700_000_000_000;

beforeEach(() => {
  resetRateLimits();
});

describe("rateLimit", () => {
  it("allows up to the limit and rejects the next one", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(rateLimit("rep", 20, MINUTE, T0 + i).ok).toBe(true);
    }
    expect(rateLimit("rep", 20, MINUTE, T0 + 20).ok).toBe(false);
  });

  it("keeps each key in its own window", () => {
    for (let i = 0; i < 20; i += 1) rateLimit("rep-a", 20, MINUTE, T0);
    expect(rateLimit("rep-a", 20, MINUTE, T0).ok).toBe(false);
    expect(rateLimit("rep-b", 20, MINUTE, T0).ok).toBe(true);
  });

  it("slides: the earliest hit expiring frees exactly one slot", () => {
    for (let i = 0; i < 20; i += 1) rateLimit("rep", 20, MINUTE, T0 + i * 100);
    expect(rateLimit("rep", 20, MINUTE, T0 + 19 * 100).ok).toBe(false);

    // Just past the moment the first hit leaves the window.
    const afterFirstExpires = T0 + MINUTE + 1;
    expect(rateLimit("rep", 20, MINUTE, afterFirstExpires).ok).toBe(true);
    expect(rateLimit("rep", 20, MINUTE, afterFirstExpires).ok).toBe(false);
  });

  it("reports how long to wait, rounded up and never zero", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("rep", 3, MINUTE, T0);
    const rejected = rateLimit("rep", 3, MINUTE, T0 + 30_000);
    expect(rejected.ok).toBe(false);
    expect(rejected.retryAfterSeconds).toBe(30);

    // One millisecond of window left still means "wait a second".
    const almostOver = rateLimit("rep", 3, MINUTE, T0 + MINUTE - 1);
    expect(almostOver.retryAfterSeconds).toBe(1);
  });

  it("does not record rejected requests, so hammering cannot extend the block", () => {
    for (let i = 0; i < 3; i += 1) rateLimit("rep", 3, MINUTE, T0);
    for (let i = 0; i < 50; i += 1) rateLimit("rep", 3, MINUTE, T0 + 10_000);

    // The window is still measured from the three real hits at T0.
    expect(rateLimit("rep", 3, MINUTE, T0 + MINUTE + 1).ok).toBe(true);
  });

  it("returns zero retry time when it allows the request", () => {
    expect(rateLimit("rep", 20, MINUTE, T0)).toEqual({ ok: true, retryAfterSeconds: 0 });
  });
});
