import Dexie, { type EntityTable } from "dexie";
import type { LeadFields, LeadSubmit, LeadsResponse, SalesforceResult } from "../schemas";
import { nextAction } from "./next-action";

/**
 * The phone's queue. A lead is written here before any network call, so
 * closing the app, losing signal or a flat battery cannot lose it.
 *
 * Browser only — everything here touches IndexedDB.
 */

export type OutboxItem = {
  clientId: string;
  payload: LeadSubmit;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastResult?: LeadsResponse;
  /** Salesforce has it; only the Phase 2 backup is missing. */
  backupOnly?: boolean;
  salesforceLeadId?: string;
};

export type HistoryItem = {
  clientId: string;
  fields: LeadFields;
  createdAt: number;
  /**
   * Absent until the server has answered. PLAN-1 types this as required, but a
   * lead that is still queued genuinely has no Salesforce result, and /leads
   * should show it rather than hide it.
   */
  salesforce?: SalesforceResult;
};

type SnapCardDb = Dexie & {
  outbox: EntityTable<OutboxItem, "clientId">;
  history: EntityTable<HistoryItem, "clientId">;
};

let cached: SnapCardDb | undefined;

/**
 * Opened lazily. This module is imported by client components, which Next also
 * evaluates on the server while rendering them — constructing Dexie at module
 * scope would run where IndexedDB does not exist.
 */
function db(): SnapCardDb {
  if (!cached) {
    const instance = new Dexie("snapcard") as SnapCardDb;
    instance.version(1).stores({
      outbox: "clientId, nextAttemptAt, createdAt",
      history: "clientId, createdAt",
    });
    cached = instance;
  }
  return cached;
}

export function outboxDb(): SnapCardDb {
  return db();
}

/**
 * Called before the first network attempt. Once this resolves the lead is safe.
 */
export async function addToOutbox(payload: LeadSubmit): Promise<void> {
  const now = Date.now();
  await db().transaction("rw", db().outbox, db().history, async () => {
    await db().outbox.put({
      clientId: payload.clientId,
      payload,
      createdAt: now,
      attempts: 0,
      // Due immediately; processOutbox is started right after this returns.
      nextAttemptAt: now,
    });
    await db().history.put({
      clientId: payload.clientId,
      fields: payload.fields,
      createdAt: now,
    });
  });
}

/*
 * One drain at a time, process-wide. Without this, the app-start, `online` and
 * `visibilitychange` listeners can all fire within a second of each other —
 * reconnecting does exactly that — and the same item would be in flight three
 * times.
 */
let running = false;

/**
 * `force` ignores the backoff schedule. It is what the "Sync now" button does:
 * the rep has just asked, so making them wait out a timer they cannot see
 * would look broken. The automatic triggers never force.
 */
export async function processOutbox({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (running) return;
  if (!force && typeof navigator !== "undefined" && navigator.onLine === false) return;

  running = true;
  try {
    const now = Date.now();
    const due = force
      ? await db().outbox.toArray()
      : await db().outbox.where("nextAttemptAt").belowOrEqual(now).toArray();

    // Oldest first: the rep expects the queue to drain in the order they scanned.
    due.sort((a, b) => a.createdAt - b.createdAt);

    for (const item of due) {
      // Sequential on purpose. A booth shares one slow uplink, and parallel
      // uploads of several card photos make every one of them slower.
      await send(item);
    }
  } finally {
    running = false;
  }
}

async function send(item: OutboxItem): Promise<void> {
  const response = await post(item);
  const action = nextAction(item, response);

  if (response) {
    await db().history.update(item.clientId, { salesforce: response.salesforce });
  }

  if (action.kind === "delete") {
    await db().outbox.delete(item.clientId);
    return;
  }

  if (action.kind === "backup-only") {
    await db().outbox.update(item.clientId, {
      backupOnly: true,
      salesforceLeadId: action.salesforceLeadId,
      lastResult: response ?? undefined,
      // Phase 2 adds /api/leads/backup; until then this item simply waits.
      nextAttemptAt: Date.now() + 15 * 60_000,
    });
    return;
  }

  await db().outbox.update(item.clientId, {
    attempts: action.attempts,
    nextAttemptAt: action.nextAttemptAt,
    lastResult: response ?? undefined,
  });
}

async function post(item: OutboxItem): Promise<LeadsResponse | null> {
  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.payload),
    });

    /*
     * A 4xx is the server saying this request will never work: expired session,
     * a payload it rejects, or rate limiting. Treated as no answer so the item
     * stays queued and backs off, rather than being dropped — the rep can sign
     * in again and the lead is still there.
     */
    if (!response.ok) return null;

    return (await response.json()) as LeadsResponse;
  } catch {
    // Offline or the socket died. Indistinguishable from never arriving.
    return null;
  }
}

/**
 * Registers the triggers from CLAUDE.md: app start, coming back online, and
 * the tab becoming visible again. Returns a cleanup function.
 */
export function startOutbox(): () => void {
  const drain = () => void processOutbox();

  const onVisible = () => {
    if (document.visibilityState === "visible") drain();
  };

  window.addEventListener("online", drain);
  document.addEventListener("visibilitychange", onVisible);
  drain();

  return () => {
    window.removeEventListener("online", drain);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
