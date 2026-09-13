import { describe, expect, it } from "vitest";
import { RANGES, startOf, type RangeKey } from "./lead-range";

/**
 * A fixed "now" so these never depend on when they run. Local time on purpose:
 * the whole point of this module is that the day boundary follows the viewer,
 * not UTC.
 */
const NOW = new Date(2026, 8, 13, 14, 30).getTime(); // 13 Sep 2026, 14:30 local

/** Local-time helper, so the tests read as dates rather than epoch arithmetic. */
function at(day: number, hours: number, minutes = 0) {
  return new Date(2026, 8, day, hours, minutes).getTime();
}

describe("RANGES", () => {
  it("offers exactly today, 7 days and all", () => {
    expect(RANGES.map((r) => r.key)).toEqual(["today", "7", "all"]);
  });

  it("every key is one startOf understands", () => {
    for (const range of RANGES) {
      expect(() => startOf(range.key, NOW)).not.toThrow();
    }
  });
});

describe("startOf", () => {
  it("returns null for all, so nothing is filtered out", () => {
    expect(startOf("all", NOW)).toBeNull();
  });

  it("starts today at local midnight, not UTC midnight", () => {
    // The bug this module exists to prevent: computed on a UTC server, this
    // boundary lands 5.5 hours late for an IST viewer and hides the early
    // morning's leads.
    const midnight = startOf("today", NOW);
    expect(midnight).toBe(at(13, 0, 0));
    expect(new Date(midnight!).getHours()).toBe(0);
  });

  it("includes the whole of the local day, both ends", () => {
    const from = startOf("today", NOW)!;
    expect(at(13, 0, 1)).toBeGreaterThanOrEqual(from); // 00:01 today
    expect(at(13, 23, 59)).toBeGreaterThanOrEqual(from); // 23:59 today
  });

  it("excludes yesterday, including the last minute of it", () => {
    const from = startOf("today", NOW)!;
    expect(at(12, 23, 59)).toBeLessThan(from);
    // The 9 leads captured on 12 Sep are exactly this case — the report that
    // started all this was them vanishing at midnight.
    expect(at(12, 18, 0)).toBeLessThan(from);
  });

  it("rolls 7 days back from the moment, not from midnight", () => {
    expect(startOf("7", NOW)).toBe(NOW - 7 * 24 * 60 * 60 * 1000);
  });

  it("reaches further back for 7 days than for today", () => {
    expect(startOf("7", NOW)!).toBeLessThan(startOf("today", NOW)!);
  });

  it("defaults now to the clock, so callers need not pass one", () => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(startOf("today")).toBe(midnight.getTime());
  });
});

describe("filtering a list", () => {
  const leads = [
    { id: "today-morning", createdAt: at(13, 9, 15) },
    { id: "yesterday-evening", createdAt: at(12, 18, 0) },
    { id: "last-week", createdAt: at(4, 11, 0) },
  ];

  function inRange(range: RangeKey) {
    const from = startOf(range, NOW);
    return (from === null ? leads : leads.filter((l) => l.createdAt >= from)).map((l) => l.id);
  }

  it("today shows only today", () => {
    expect(inRange("today")).toEqual(["today-morning"]);
  });

  it("7 days reaches back past yesterday", () => {
    expect(inRange("7")).toEqual(["today-morning", "yesterday-evening"]);
  });

  it("all shows everything", () => {
    expect(inRange("all")).toEqual(["today-morning", "yesterday-evening", "last-week"]);
  });
});
