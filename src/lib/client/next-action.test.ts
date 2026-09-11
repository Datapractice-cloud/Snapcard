import { describe, expect, it } from "vitest";
import type { BackupResult, LeadsResponse, SalesforceResult } from "../schemas";
import { BACKOFF_MS, backoffFor, nextAction } from "./next-action";

const NOW = 1_700_000_000_000;

function response(
  salesforce: SalesforceResult["status"],
  backup: BackupResult["status"],
  extra: Partial<SalesforceResult> = {},
): LeadsResponse {
  return {
    clientId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    salesforce: { status: salesforce, ...extra },
    backup: { status: backup },
  };
}

/*
 * Every row of the "Phone outbox rules" table in CLAUDE.md, in the order it is
 * written there. If that table changes, these fail first.
 */
describe("nextAction — the outbox rules table", () => {
  it("synced + saved → delete", () => {
    expect(nextAction({ attempts: 0 }, response("synced", "saved"), NOW)).toEqual({
      kind: "delete",
      reason: "synced",
    });
  });

  it("synced + skipped (Phase 1) → delete", () => {
    expect(nextAction({ attempts: 0 }, response("synced", "skipped"), NOW)).toEqual({
      kind: "delete",
      reason: "synced",
    });
  });

  it("duplicate + saved → delete", () => {
    expect(nextAction({ attempts: 0 }, response("duplicate", "saved"), NOW)).toEqual({
      kind: "delete",
      reason: "duplicate",
    });
  });

  it("duplicate + skipped → delete", () => {
    expect(nextAction({ attempts: 0 }, response("duplicate", "skipped"), NOW)).toEqual({
      kind: "delete",
      reason: "duplicate",
    });
  });

  it("synced + backup failed → keep, backup only, carrying the lead id", () => {
    expect(
      nextAction({ attempts: 0 }, response("synced", "failed", { leadId: "00Q5g00000AbCdEAAV" }), NOW),
    ).toEqual({ kind: "backup-only", salesforceLeadId: "00Q5g00000AbCdEAAV" });
  });

  it("duplicate + backup failed → keep, backup only", () => {
    expect(nextAction({ attempts: 0 }, response("duplicate", "failed"), NOW)).toEqual({
      kind: "backup-only",
      salesforceLeadId: undefined,
    });
  });

  it("failed + saved → delete, because the server owns the retry", () => {
    expect(nextAction({ attempts: 0 }, response("failed", "saved"), NOW)).toEqual({
      kind: "delete",
      reason: "server-will-retry",
    });
  });

  it("failed + skipped → retry with backoff", () => {
    expect(nextAction({ attempts: 0 }, response("failed", "skipped"), NOW)).toEqual({
      kind: "retry",
      attempts: 1,
      nextAttemptAt: NOW + 30_000,
    });
  });

  it("failed + backup failed → retry with backoff", () => {
    expect(nextAction({ attempts: 0 }, response("failed", "failed"), NOW)).toEqual({
      kind: "retry",
      attempts: 1,
      nextAttemptAt: NOW + 30_000,
    });
  });

  it("needs_review → delete, whatever the backup did", () => {
    for (const backup of ["saved", "skipped", "failed"] as const) {
      expect(nextAction({ attempts: 0 }, response("needs_review", backup), NOW)).toEqual({
        kind: "delete",
        reason: "needs_review",
      });
    }
  });
});

describe("nextAction — no answer at all", () => {
  it("retries, because offline is indistinguishable from never received", () => {
    expect(nextAction({ attempts: 0 }, null, NOW)).toEqual({
      kind: "retry",
      attempts: 1,
      nextAttemptAt: NOW + 30_000,
    });
  });

  it("keeps counting attempts across failures", () => {
    expect(nextAction({ attempts: 2 }, null, NOW)).toMatchObject({ attempts: 3 });
  });
});

describe("backoff", () => {
  it("walks 30s, 1m, 5m, 15m", () => {
    expect(BACKOFF_MS).toEqual([30_000, 60_000, 300_000, 900_000]);
    expect(backoffFor(0)).toBe(30_000);
    expect(backoffFor(1)).toBe(60_000);
    expect(backoffFor(2)).toBe(300_000);
    expect(backoffFor(3)).toBe(900_000);
  });

  it("then stays at 15m forever rather than growing without bound", () => {
    // A lead must not end up scheduled days out because the venue wifi was bad
    // for an hour.
    expect(backoffFor(4)).toBe(900_000);
    expect(backoffFor(50)).toBe(900_000);
  });

  it("is defensive about a corrupt attempt count", () => {
    expect(backoffFor(-1)).toBe(30_000);
  });

  it("schedules each retry from the moment of the failure", () => {
    const action = nextAction({ attempts: 3 }, response("failed", "skipped"), NOW);
    expect(action).toEqual({ kind: "retry", attempts: 4, nextAttemptAt: NOW + 900_000 });
  });
});
