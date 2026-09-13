/**
 * How far back a lead list reaches.
 *
 * Shared by `/leads` and `/admin` so the two screens can never disagree about
 * what "today" means. It lives here rather than in either component because
 * both need it and because the day boundary is the part worth testing.
 *
 * Every caller runs this in the browser, which is the point: `setHours(0,0,0,0)`
 * is then midnight where the person is standing. The admin list used to compute
 * its cutoff on the server instead, so "today" was Hostinger's day — leads
 * captured before 05:30 IST dropped off a day early.
 */

export const RANGES = [
  { key: "today", label: "Today" },
  { key: "7", label: "7 days" },
  { key: "all", label: "All" },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The epoch millisecond a range begins at, or null for everything.
 *
 * `/leads` defaults to "all" on purpose, even though it is last here: that
 * screen exists because leads appeared to have gone missing, and a default that
 * quietly hid anything older would look like exactly that bug. `/admin` defaults
 * to "today", because during an event that is the question being asked.
 */
export function startOf(range: RangeKey, now: number = Date.now()): number | null {
  if (range === "all") return null;
  if (range === "today") {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    return midnight.getTime();
  }
  return now - Number(range) * DAY_MS;
}
