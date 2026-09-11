import type { LeadsResponse } from "../schemas";

/**
 * What the phone does with an outbox item once the server has answered.
 *
 * This is the table in CLAUDE.md under "Phone outbox rules", as a pure
 * function. It is separated from the Dexie code because getting it wrong is
 * how leads disappear: delete an item the server never stored and the lead is
 * gone, keep one the server did store and the rep sees it retry forever.
 */

export type OutboxItemState = {
  /** How many times this item has already been sent and failed. */
  attempts: number;
};

export type NextAction =
  /** The server holds it. Drop it from the queue. */
  | { kind: "delete"; reason: "synced" | "duplicate" | "needs_review" | "server-will-retry" }
  /**
   * Salesforce took it but the backup did not. Keep the item so the phone can
   * push it to /api/leads/backup, which never touches Salesforce (Phase 2).
   */
  | { kind: "backup-only"; salesforceLeadId?: string }
  /** Nobody has it. Send the whole thing again after the wait. */
  | { kind: "retry"; attempts: number; nextAttemptAt: number };

/**
 * 30s, 1m, 5m, 15m, then every 15m.
 *
 * The first wait is short because the commonest failure at an event is a few
 * seconds of no signal while the rep walks between stands.
 */
export const BACKOFF_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000] as const;

export function backoffFor(attempts: number): number {
  const index = Math.min(Math.max(attempts, 0), BACKOFF_MS.length - 1);
  return BACKOFF_MS[index];
}

/**
 * `response` is null when the request never got an answer — offline, a dead
 * socket, a timeout. That is indistinguishable from "the server never saw it",
 * so the only safe move is to keep the item and try again.
 */
export function nextAction(
  item: OutboxItemState,
  response: LeadsResponse | null,
  now: number = Date.now(),
): NextAction {
  if (!response) return retry(item, now);

  const salesforce = response.salesforce.status;
  const backup = response.backup.status;

  /*
   * Checked before the Salesforce outcome: Salesforce has refused this lead for
   * a reason no retry will change — a validation rule, a picklist value the org
   * does not have. Retrying forever would hide a configuration problem behind a
   * queue that never drains, so it leaves the outbox and shows as needing an
   * admin.
   */
  if (salesforce === "needs_review") return { kind: "delete", reason: "needs_review" };

  if (salesforce === "synced" || salesforce === "duplicate") {
    // The lead is in Salesforce, which is the system of record. If the backup
    // also has it, or was never attempted (Phase 1), there is nothing left.
    if (backup === "saved" || backup === "skipped") {
      return { kind: "delete", reason: salesforce };
    }
    // Salesforce has it; only the mirror is missing.
    return { kind: "backup-only", salesforceLeadId: response.salesforce.leadId };
  }

  // salesforce === "failed"
  if (backup === "saved") {
    /*
     * The server holds the lead and its own cron owns the Salesforce retry
     * (PLAN-2 Task 4). The phone retrying as well would be two writers racing
     * on the same record for no benefit.
     */
    return { kind: "delete", reason: "server-will-retry" };
  }

  // Nothing anywhere. This is the case the outbox exists for.
  return retry(item, now);
}

function retry(item: OutboxItemState, now: number): NextAction {
  return {
    kind: "retry",
    attempts: item.attempts + 1,
    nextAttemptAt: now + backoffFor(item.attempts),
  };
}
