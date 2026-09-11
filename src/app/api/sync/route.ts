import { timingSafeEqual } from "node:crypto";
import { runSync } from "@/lib/backup/sync";
import { env } from "@/lib/env";
import { json, jsonError } from "@/lib/http";

/**
 * The server-side Salesforce retry, called by cron.
 *
 * Authenticated with SYNC_SECRET rather than a session — there is no user here.
 * Excluded from the auth middleware for the same reason.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!env.SYNC_SECRET) return jsonError("sync_not_configured", 503);

  const offered = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!matches(offered, env.SYNC_SECRET)) return jsonError("unauthorized", 401);

  // Nothing to retry into when the integration is off.
  if (!env.SALESFORCE_ENABLED) {
    return json({ processed: 0, synced: 0, failed: 0, needsReview: 0, skipped: "salesforce_disabled" });
  }

  if (!env.MONGODB_URI) return jsonError("backup_not_configured", 503);

  try {
    return json(await runSync());
  } catch (error) {
    console.error("sync_failed", { message: (error as Error).message.slice(0, 200) });
    return jsonError("sync_failed", 500);
  }
}

/** Constant-time, so the secret cannot be guessed a character at a time. */
function matches(offered: string, expected: string): boolean {
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
