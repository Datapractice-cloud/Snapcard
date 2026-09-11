import { env } from "../env";
import type { BackupResult } from "../schemas";
import { noopBackupStore } from "./noop";
import type { BackupStore } from "./types";

export type { BackupStore } from "./types";

/**
 * Runs the backup so that it can never change the Salesforce result.
 *
 * A function rather than an inline try/catch because this is the rule the save
 * flow exists to protect — Salesforce is the system of record, and a broken
 * mirror must not turn a saved lead into a failed one. Worth a test of its own.
 */
export async function saveLeadSafely(
  store: BackupStore,
  input: Parameters<BackupStore["saveLead"]>[0],
): Promise<BackupResult> {
  try {
    return await store.saveLead(input);
  } catch {
    // Deliberately swallowed. The clientId is logged by the caller; the reason
    // is not, because a backup error can quote the record it choked on.
    return { status: "failed" };
  }
}

let warned = false;

/**
 * The only place that decides which backup implementation is in play.
 *
 * Phase 2 adds the Mongo branch here and nothing else in the save flow
 * changes.
 */
export function getBackupStore(): BackupStore {
  if (!env.MONGODB_URI) return noopBackupStore;

  // MONGODB_URI is set but Phase 2 has not landed. Say so once, rather than
  // letting someone believe leads are being mirrored when they are not.
  if (!warned) {
    warned = true;
    console.warn("backup_store_not_implemented", { reason: "MONGODB_URI is set but Phase 2 is not built" });
  }
  return noopBackupStore;
}
